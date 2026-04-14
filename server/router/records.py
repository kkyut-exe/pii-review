# server/router/records.py
import ast
import json
import uuid
from datetime import datetime, UTC
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import Record, User
from server.schemas import RecordOut, RecordListOut, StatusUpdate, ReviewUpdate, BulkStatusUpdate, BulkDelete, RenameRecord, UpdateDocText, ManualRecordCreate
from server.router.auth import get_current_user

router = APIRouter()

VALID_COMPLEXITY = {"low", "medium", "high"}
VALID_STATUSES = {"pending", "reviewing", "reviewed", "pending_delete"}
PII_CATEGORIES = ("NAME", "ADDRESS", "POSTAL", "RESIDENT", "CONTACT", "EMAIL", "BIRTHDATE", "GENDER", "AGE")


def _assert_status_transition(record: Record, new_status: str, current_user: User) -> None:
    if new_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {new_status}")

    if new_status == record.status:
        return

    if new_status == "pending_delete":
        return

    if record.status == "pending" and new_status == "reviewing":
        return

    if record.status == "reviewed" and new_status == "reviewing":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        return

    if record.status == "pending_delete":
        restore_status = record.prev_status or "pending"
        if new_status == restore_status:
            return

    raise HTTPException(
        status_code=422,
        detail=f"Invalid status transition: {record.status} -> {new_status}",
    )


def _to_record_out(record: Record) -> RecordOut:
    out = RecordOut.model_validate(record)
    if record.reviewer:
        out.reviewer_username = record.reviewer.username
    return out


def _empty_pii_dict() -> dict[str, list[str]]:
    return {category: [] for category in PII_CATEGORIES}


def _parse_manual_pii_dict(raw_value: dict | str | None) -> dict[str, list[str]]:
    if raw_value in (None, ""):
        return _empty_pii_dict()

    parsed = raw_value
    if isinstance(raw_value, str):
        text = raw_value.strip()
        if not text:
            return _empty_pii_dict()
        try:
            parsed = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=422, detail="pii_dict 문자열 파싱에 실패했습니다.") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="pii_dict는 dict 또는 dict 문자열이어야 합니다.")

    normalized = _empty_pii_dict()
    for key, value in parsed.items():
        if key not in PII_CATEGORIES:
            raise HTTPException(status_code=422, detail=f"Invalid PII category: {key}")
        if value is None:
            normalized[key] = []
        elif isinstance(value, list):
            normalized[key] = [str(item).strip() for item in value if str(item).strip()]
        elif isinstance(value, str):
            stripped = value.strip()
            normalized[key] = [stripped] if stripped else []
        else:
            raise HTTPException(status_code=422, detail=f"Invalid value type for category: {key}")
    return normalized


@router.post("/bulk-status")
def bulk_update_status(
    body: BulkStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.status != "pending_delete":
        raise HTTPException(status_code=422, detail="bulk-status only supports pending_delete")

    records = db.query(Record).filter(Record.id.in_(body.ids)).all()
    for record in records:
        _assert_status_transition(record, body.status, current_user)
        record.prev_status = record.status
        record.status = body.status

    db.commit()
    return {"updated": len(records)}


@router.post("/manual", response_model=RecordOut, status_code=status.HTTP_201_CREATED)
def create_manual_record(
    body: ManualRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    doc_text = body.doc_text.strip()
    if not doc_text:
        raise HTTPException(status_code=422, detail="doc_text is required")

    pii_dict = _parse_manual_pii_dict(body.pii_dict)
    source_filename = (body.source_filename or "").strip()
    if not source_filename:
        source_filename = f"manual-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.txt"

    record = Record(
        id=str(uuid.uuid4()),
        path=f"/manual/{uuid.uuid4()}",
        source_filename=source_filename,
        source="text",
        service_started_at=datetime.now(UTC),
        doc_text=doc_text,
        pii_dict=pii_dict,
        status="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_record_out(record)


@router.delete("/bulk", status_code=204)
def bulk_delete_records(
    body: BulkDelete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db.query(Record).filter(Record.id.in_(body.ids)).delete(synchronize_session=False)
    db.commit()


@router.delete("/{record_id}", status_code=204)
def delete_record(
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()


# IMPORTANT: /export 라우트를 /{id} 보다 먼저 정의해야 함
@router.get("/export")
def export_reviewed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = db.query(Record).filter_by(status="reviewed").all()
    return [_to_record_out(r) for r in records]


@router.get("", response_model=RecordListOut)
def list_records(
    skip: int = 0,
    limit: int = 500,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Record)
    if status:
        q = q.filter(Record.status == status)
    total = q.count()
    items = q.order_by(Record.service_started_at.desc()).offset(skip).limit(limit).all()
    return RecordListOut(total=total, items=[_to_record_out(r) for r in items])


@router.get("/{record_id}", response_model=RecordOut)
def get_record(
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return _to_record_out(record)


@router.patch("/{record_id}/status", response_model=RecordOut)
def update_status(
    record_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    _assert_status_transition(record, body.status, current_user)

    if body.status == "pending_delete":
        record.prev_status = record.status

    record.status = body.status
    db.commit()
    db.refresh(record)
    return _to_record_out(record)


@router.patch("/{record_id}/filename", response_model=RecordOut)
def rename_record(
    record_id: str,
    body: RenameRecord,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.source_filename = body.source_filename.strip() or record.source_filename
    db.commit()
    db.refresh(record)
    return _to_record_out(record)


@router.patch("/{record_id}/doctext", response_model=RecordOut)
def update_doc_text(
    record_id: str,
    body: UpdateDocText,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.doc_text = body.doc_text
    db.commit()
    db.refresh(record)
    return _to_record_out(record)


@router.put("/{record_id}/review", response_model=RecordOut)
def save_review(
    record_id: str,
    body: ReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.complexity not in VALID_COMPLEXITY:
        raise HTTPException(status_code=422, detail="complexity must be low, medium, or high")

    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.status != "reviewing":
        raise HTTPException(status_code=422, detail="Record must be reviewing before review is saved")

    record.reviewed_pii_dict = body.reviewed_pii_dict
    record.complexity = body.complexity
    record.status = "reviewed"
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now(UTC)
    db.commit()
    db.refresh(record)
    return _to_record_out(record)
