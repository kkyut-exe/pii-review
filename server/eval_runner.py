# server/eval_runner.py
"""평가 run 의 백그라운드 실행 로직.

흐름:
  1. golden.jsonl 스냅샷 (eval_golden.snapshot_golden_to_run)
  2. 추론 서버 호출 → predictions.jsonl 생성
  3. (gold ↔ pred) 매칭 → Strict 메트릭 집계 → DB 저장
  4. status / progress / finished_at 갱신
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, UTC
from pathlib import Path
from typing import Any, Optional

import httpx

from server.database import SessionLocal as _DefaultSessionLocal


# 테스트에서 monkeypatch 로 다른 sessionmaker 를 주입할 수 있도록 모듈 변수.
_session_factory = _DefaultSessionLocal
from server.eval_golden import (
    extract_gold_label,
    read_jsonl,
    run_artifact_dir,
    snapshot_golden_to_run,
    write_jsonl,
)
from server.eval_metrics import (
    BASE_KEYS,
    aggregate,
    normalize_obj,
)
from server.models import EvalMetric, EvalRun


log = logging.getLogger("eval_runner")


# ── 추론 서버 호출 ─────────────────────────────────

def _make_chunks(text: str, *, chunk_chars: Optional[int], overlap: int) -> list[str]:
    if chunk_chars is None:
        return [text or ""]
    if not text:
        return [""]
    out = []
    i, n = 0, len(text)
    while i < n:
        j = min(n, i + chunk_chars)
        out.append(text[i:j])
        if j == n:
            break
        i = max(0, j - overlap)
    return out


async def _call_infer(
    client: httpx.AsyncClient,
    base_url: str,
    model: str,
    content: str,
) -> str:
    payload = {
        "messages": [{"role": "user", "content": content}],
        "model": model,
        "stream": False,
    }
    resp = await client.post(f"{base_url.rstrip('/')}/v1/responses", json=payload)
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise KeyError("empty choices")
    msg = choices[0].get("message") or {}
    content_text = msg.get("content")
    if content_text is None:
        raise KeyError("missing message.content")
    return content_text


def _parse_response_json(text: str) -> dict[str, Any]:
    try:
        obj = json.loads(text)
        if not isinstance(obj, dict):
            return {"_parse_error": "not a dict", "_raw": text}
        for k in BASE_KEYS:
            obj.setdefault(k, [])
        return obj
    except Exception as e:
        return {"_parse_error": str(e), "_raw": text}


def _merge_chunk_outputs(chunk_objs: list[dict[str, Any]]) -> dict[str, list[str]]:
    seen = {k: set() for k in BASE_KEYS}
    merged = {k: [] for k in BASE_KEYS}
    for d in chunk_objs:
        for k in BASE_KEYS:
            for v in (d.get(k) or []):
                v = str(v)
                if v not in seen[k]:
                    seen[k].add(v)
                    merged[k].append(v)
    return merged


# ── 메인 실행 ──────────────────────────────────────

async def _run_inference(
    *,
    golden_rows: list[dict],
    out_path: Path,
    base_url: str,
    model: str,
    chunk_chars: Optional[int],
    overlap: int,
    timeout: float,
    on_progress,        # callable(done, total) -> None
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    total = len(golden_rows)

    async with httpx.AsyncClient(timeout=timeout) as client:
        with open(out_path, "w", encoding="utf-8") as wf:
            for i, row in enumerate(golden_rows, start=1):
                doc_id = row.get("id")
                input_text = row.get("input", "") or ""

                chunks = _make_chunks(input_text, chunk_chars=chunk_chars, overlap=overlap)
                chunk_objs: list[dict] = []
                chunk_responses: list[dict] = []

                for ch in chunks:
                    try:
                        resp_text = await _call_infer(client, base_url, model, ch)
                        resp_obj = _parse_response_json(resp_text)
                    except Exception as e:
                        log.warning("[doc=%s] inference error: %s", doc_id, e)
                        resp_obj = {"_error": str(e)}
                    chunk_responses.append(resp_obj)
                    if isinstance(resp_obj, dict) and all(k in resp_obj for k in BASE_KEYS):
                        chunk_objs.append(resp_obj)

                merged = _merge_chunk_outputs(chunk_objs)
                wf.write(json.dumps({
                    "id": doc_id,
                    "input": input_text,
                    "response": merged,
                    "chunk_responses": chunk_responses,
                    "chunking": {"chunk_chars": chunk_chars, "overlap": overlap},
                }, ensure_ascii=False) + "\n")
                wf.flush()

                on_progress(i, total)


def _persist_metrics(db, run_id: str, agg: dict) -> None:
    """Strict 집계 결과를 EvalMetric 으로 INSERT (overall + 9 fields)."""
    overall = agg["overall"]
    db.add(EvalMetric(
        run_id=run_id, scope="overall", key="ALL",
        tp=overall["tp"], fp=overall["fp"], fn=overall["fn"],
        precision=overall["precision"], recall=overall["recall"], f1=overall["f1"],
    ))
    for k, m in agg["fields"].items():
        db.add(EvalMetric(
            run_id=run_id, scope="field", key=k,
            tp=m["tp"], fp=m["fp"], fn=m["fn"],
            precision=m["precision"], recall=m["recall"], f1=m["f1"],
        ))


def _write_meta(art_dir: Path, payload: dict) -> None:
    with open(art_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _set_status(db, run_id: str, **fields) -> None:
    run = db.query(EvalRun).filter_by(id=run_id).first()
    if not run:
        return
    for k, v in fields.items():
        setattr(run, k, v)
    db.commit()


def execute_run(
    run_id: str,
    *,
    upload_id: Optional[str] = None,
    dataset_version_id: Optional[int] = None,
) -> None:
    """BackgroundTasks 에서 호출되는 동기 진입점.

    내부에서 asyncio.run 으로 추론 코루틴을 실행한다.
    """
    db = _session_factory()
    try:
        run = db.query(EvalRun).filter_by(id=run_id).first()
        if not run:
            log.error("run not found: %s", run_id)
            return

        run.status = "running"
        run.started_at = datetime.now(UTC)
        run.progress = 0.0
        db.commit()

        art = run_artifact_dir(run_id)
        art.mkdir(parents=True, exist_ok=True)

        # 1) Golden 스냅샷
        golden_path, golden_hash, total = snapshot_golden_to_run(
            run_id,
            source=run.golden_source,
            db=db,
            upload_id=upload_id,
            dataset_version_id=dataset_version_id,
        )
        run.golden_set_hash = golden_hash
        run.total_docs = total
        db.commit()

        if total == 0:
            raise ValueError("Golden Set 이 비어 있음")

        golden_rows = read_jsonl(golden_path)

        # 2) 추론
        pred_path = art / "predictions.jsonl"

        def _progress(done, tot):
            # 진행률 50%까지는 추론 단계
            run.progress = 0.5 * (done / tot)
            db.commit()

        asyncio.run(_run_inference(
            golden_rows=golden_rows,
            out_path=pred_path,
            base_url=run.server_url,
            model=run.model_name,
            chunk_chars=run.chunk_chars,
            overlap=run.overlap or 0,
            timeout=120.0,
            on_progress=_progress,
        ))

        # 3) 메트릭 집계
        run.progress = 0.6
        db.commit()

        pred_rows = read_jsonl(pred_path)
        gt_map = {r["id"]: r for r in golden_rows if "id" in r}
        pred_map = {r["id"]: r for r in pred_rows if "id" in r}
        ids = sorted(set(gt_map) & set(pred_map))

        golds = [normalize_obj(extract_gold_label(gt_map[i])) for i in ids]
        preds = [normalize_obj(pred_map[i].get("response", {})) for i in ids]
        agg = aggregate(golds, preds)

        run.matched_docs = len(ids)
        _persist_metrics(db, run_id, agg)

        # 4) 메타·완료
        _write_meta(art, {
            "run_id": run_id,
            "name": run.name,
            "model_name": run.model_name,
            "server_url": run.server_url,
            "chunk_chars": run.chunk_chars,
            "overlap": run.overlap,
            "golden_source": run.golden_source,
            "golden_set_hash": golden_hash,
            "total_docs": run.total_docs,
            "matched_docs": run.matched_docs,
            "doc_exact_match": agg["doc_exact_match"],
            "finished_at": datetime.now(UTC).isoformat(),
        })

        run.status = "done"
        run.progress = 1.0
        run.finished_at = datetime.now(UTC)
        db.commit()
        log.info("run %s done: F1=%.3f", run_id, agg["overall"]["f1"])

    except Exception as e:
        log.exception("run %s failed", run_id)
        try:
            _set_status(
                db, run_id,
                status="failed",
                error_msg=str(e)[:1000],
                finished_at=datetime.now(UTC),
            )
        except Exception:
            pass
    finally:
        db.close()
