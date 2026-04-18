# tests/test_evals.py
"""evals 라우터 + eval_runner 통합 테스트.

추론 서버는 monkeypatch 로 mock 한다.
"""
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import pytest

from server import eval_runner
from server.eval_golden import EVAL_RUNS_DIR, EVAL_UPLOADS_DIR
from server.eval_metrics import BASE_KEYS
from server.models import EvalRun, Record
from tests.conftest import auth_headers, make_user


# ── helpers ────────────────────────────────────────

def _make_reviewed_record(db, *, doc_id, text, label):
    full_label = {k: label.get(k, []) for k in BASE_KEYS}
    r = Record(
        id=doc_id,
        path=f"/tmp/{doc_id}.json",
        source_filename=f"{doc_id}.txt",
        source="text",
        service_started_at=datetime(2026, 4, 10),
        doc_text=text,
        pii_dict=full_label,
        status="reviewed",
        reviewed_pii_dict=full_label,
        complexity="low",
    )
    db.add(r)
    db.commit()
    return r


def _mock_inference_to_match_label(monkeypatch):
    """추론 호출이 항상 input 텍스트의 첫 두 글자를 NAME 으로 반환하도록 mock.

    더 단순하게는 정답을 그대로 돌려주도록 monkeypatch 함 — 정답 페이로드 환경 격리를 위해
    sys-level 변수가 아닌 closure 변수로 보관한다.
    """
    expected = {}

    async def _fake_call(client, base_url, model, content):
        # content (input) 에 들어있는 doc_id 마커로 lookup
        for doc_id, payload in expected.items():
            if doc_id in content:
                return json.dumps(payload, ensure_ascii=False)
        return json.dumps({k: [] for k in BASE_KEYS}, ensure_ascii=False)

    monkeypatch.setattr(eval_runner, "_call_infer", _fake_call)
    return expected


# ── /evals/golden/upload ──────────────────────────

def test_upload_golden_validates_schema(client, db_session, tmp_path):
    user = make_user(db_session)
    headers = auth_headers(user.id, user.username, user.role)

    rows = [
        {"id": "x1", "input": "텍스트1", "label": {"NAME": ["A"]}},
        {"id": "x2", "input": "텍스트2", "label": {"NAME": ["B"]}},
    ]
    body = "\n".join(json.dumps(r, ensure_ascii=False) for r in rows).encode()

    resp = client.post(
        "/evals/golden/upload",
        files={"file": ("g.jsonl", body, "application/jsonl")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_docs"] == 2
    upl_path = EVAL_UPLOADS_DIR / f"{data['upload_id']}.jsonl"
    assert upl_path.exists()
    upl_path.unlink()


def test_upload_golden_rejects_missing_keys(client, db_session):
    user = make_user(db_session)
    headers = auth_headers(user.id, user.username, user.role)
    bad = json.dumps({"input": "text only"}).encode()
    resp = client.post(
        "/evals/golden/upload",
        files={"file": ("bad.jsonl", bad, "application/jsonl")},
        headers=headers,
    )
    assert resp.status_code == 400


# ── /evals/runs (DB golden 모드, 추론 mock) ──────────

def test_create_run_db_golden_end_to_end(client, db_session, monkeypatch):
    user = make_user(db_session, role="admin")
    headers = auth_headers(user.id, user.username, user.role)

    # reviewed records 2개
    _make_reviewed_record(
        db_session,
        doc_id="DOC-A",
        text="DOC-A 텍스트 with 홍길동",
        label={"NAME": ["홍길동"]},
    )
    _make_reviewed_record(
        db_session,
        doc_id="DOC-B",
        text="DOC-B 텍스트 with 김영수",
        label={"NAME": ["김영수"]},
    )

    expected = _mock_inference_to_match_label(monkeypatch)
    expected["DOC-A"] = {k: [] for k in BASE_KEYS} | {"NAME": ["홍길동"]}
    expected["DOC-B"] = {k: [] for k in BASE_KEYS} | {"NAME": ["박지은"]}  # 일부러 mismatch

    resp = client.post(
        "/evals/runs",
        json={
            "name": "t1",
            "model_name": "mock_model",
            "server_url": "http://mock",
            "chunk_chars": None,
            "overlap": 0,
            "golden_source": "db",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    runs = resp.json()
    assert isinstance(runs, list) and len(runs) == 1
    run_id = runs[0]["id"]

    # BackgroundTasks 는 TestClient 가 응답 후 동기 실행 → 이미 완료 상태
    resp2 = client.get(f"/evals/runs/{run_id}", headers=headers)
    assert resp2.status_code == 200
    detail = resp2.json()
    assert detail["status"] == "done", detail
    assert detail["total_docs"] == 2
    assert detail["matched_docs"] == 2
    # NAME tp=1 (홍길동 일치), fp=1 (박지은 잘못 예측), fn=1 (김영수 누락)
    name_metric = next(m for m in detail["metrics"] if m["scope"] == "field" and m["key"] == "NAME")
    assert name_metric["tp"] == 1
    assert name_metric["fp"] == 1
    assert name_metric["fn"] == 1

    # /details — worst docs
    resp3 = client.get(f"/evals/runs/{run_id}/details", headers=headers)
    assert resp3.status_code == 200
    details = resp3.json()
    assert "strict" in details
    assert details["strict"]["fields"]["NAME"]["tp"] == 1
    assert len(details["worst_docs"]) >= 1
    worst = details["worst_docs"][0]
    assert worst["id"] == "DOC-B"
    assert worst["field_diffs"]["NAME"]["miss"] == ["김영수"]
    assert worst["field_diffs"]["NAME"]["extra"] == ["박지은"]

    # cleanup
    art = Path(detail["artifact_dir"])
    if art.exists():
        shutil.rmtree(art)


def test_list_and_delete_run(client, db_session, monkeypatch):
    user = make_user(db_session, role="admin")
    headers = auth_headers(user.id, user.username, user.role)

    _make_reviewed_record(
        db_session, doc_id="DOC-X", text="텍스트 X", label={"NAME": ["X"]},
    )
    expected = _mock_inference_to_match_label(monkeypatch)
    expected["DOC-X"] = {k: [] for k in BASE_KEYS} | {"NAME": ["X"]}

    resp = client.post(
        "/evals/runs",
        json={
            "name": "del-test", "model_name": "m",
            "server_url": "http://x", "overlap": 0,
            "golden_source": "db",
        },
        headers=headers,
    )
    run_id = resp.json()[0]["id"]

    resp = client.get("/evals/runs", headers=headers)
    assert resp.status_code == 200
    assert any(r["id"] == run_id for r in resp.json())

    resp = client.delete(f"/evals/runs/{run_id}", headers=headers)
    assert resp.status_code == 204

    resp = client.get(f"/evals/runs/{run_id}", headers=headers)
    assert resp.status_code == 404
