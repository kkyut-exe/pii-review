# server/eval_golden.py
"""Golden Set 스냅샷 유틸.

- DB(reviewed records) → jsonl 직렬화
- 업로드 jsonl → 임시 보관 후 run 생성 시 artifact_dir 로 복사
- sha256 해시 계산 (재현성 검증용)
"""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from server.eval_metrics import BASE_KEYS
from server.models import Record


EVAL_RUNS_DIR = Path("data/eval_runs")
EVAL_UPLOADS_DIR = Path("data/eval_uploads")


# ── DB → jsonl ────────────────────────────────────

def _record_to_golden_row(r: Record) -> dict:
    """검수 완료된 Record → golden jsonl 한 row."""
    label_src = r.reviewed_pii_dict or {}
    label = {k: [str(x) for x in (label_src.get(k) or [])] for k in BASE_KEYS}
    return {
        "id": r.id,
        "input": r.doc_text or "",
        "label": label,
        # 진단·worst 표시용 메타 (옵션)
        "source": r.source,
        "doc_type": None,
    }


def export_db_golden(
    db: Session,
    *,
    dataset_version_id: Optional[int] = None,
) -> list[dict]:
    """검수 완료(reviewed) records 를 golden row 리스트로 반환.

    dataset_version_id 가 주어지면 해당 dataset 의 matched_record 만 사용.
    """
    if dataset_version_id is not None:
        # dataset_items.matched_record_id JOIN
        from server.models import DatasetItem
        rows = (
            db.query(Record)
            .join(DatasetItem, DatasetItem.matched_record_id == Record.id)
            .filter(DatasetItem.dataset_version_id == dataset_version_id)
            .filter(Record.status == "reviewed")
            .all()
        )
    else:
        rows = db.query(Record).filter(Record.status == "reviewed").all()
    return [_record_to_golden_row(r) for r in rows]


# ── jsonl I/O ─────────────────────────────────────

def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def read_jsonl(path: Path) -> list[dict]:
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


# ── 업로드 ────────────────────────────────────────

def save_uploaded_golden(content: bytes, original_filename: str) -> dict:
    """업로드된 jsonl 을 data/eval_uploads/{upload_id}.jsonl 로 저장.

    검증: 각 라인이 JSON dict 이고, id/input/(label|label_values) 키가 있어야 함.
    반환: {upload_id, filename, total_docs}
    """
    EVAL_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = str(uuid.uuid4())
    target = EVAL_UPLOADS_DIR / f"{upload_id}.jsonl"

    with open(target, "wb") as f:
        f.write(content)

    # 검증 (실패 시 파일 삭제)
    try:
        rows = read_jsonl(target)
        if not rows:
            raise ValueError("빈 파일")
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValueError(f"row {i}: dict 가 아님")
            if "id" not in row or "input" not in row:
                raise ValueError(f"row {i}: id/input 필수")
            if "label" not in row and "label_values" not in row:
                raise ValueError(f"row {i}: label 또는 label_values 필수")
    except Exception:
        target.unlink(missing_ok=True)
        raise

    return {
        "upload_id": upload_id,
        "filename": original_filename,
        "total_docs": len(rows),
    }


# ── run artifact ──────────────────────────────────

def run_artifact_dir(run_id: str) -> Path:
    return EVAL_RUNS_DIR / run_id


def snapshot_golden_to_run(
    run_id: str,
    *,
    source: str,                          # 'db' | 'upload'
    db: Optional[Session] = None,
    upload_id: Optional[str] = None,
    dataset_version_id: Optional[int] = None,
) -> tuple[Path, str, int]:
    """run 디렉터리에 golden.jsonl 을 만든다.

    반환: (golden_path, sha256, total_docs)
    """
    art = run_artifact_dir(run_id)
    art.mkdir(parents=True, exist_ok=True)
    target = art / "golden.jsonl"

    if source == "db":
        if db is None:
            raise ValueError("db 모드에는 Session 이 필요")
        rows = export_db_golden(db, dataset_version_id=dataset_version_id)
        n = write_jsonl(target, rows)
    elif source == "upload":
        if not upload_id:
            raise ValueError("upload 모드에는 upload_id 가 필요")
        src = EVAL_UPLOADS_DIR / f"{upload_id}.jsonl"
        if not src.exists():
            raise FileNotFoundError(f"upload 파일 없음: {src}")
        # 그대로 복사 (해시 일관성)
        with open(src, "rb") as rf, open(target, "wb") as wf:
            wf.write(rf.read())
        n = sum(1 for _ in open(target, "r", encoding="utf-8") if _.strip())
    else:
        raise ValueError(f"unknown source: {source}")

    return target, file_sha256(target), n


def extract_gold_label(row: dict) -> dict:
    """label vs label_values 자동 감지."""
    if "label" in row:
        return row["label"] or {}
    if "label_values" in row:
        return row["label_values"] or {}
    return {}
