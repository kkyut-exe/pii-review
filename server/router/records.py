# server/router/records.py
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import Record, User
from server.schemas import RecordOut, RecordListOut, StatusUpdate, ReviewUpdate
from server.router.auth import get_current_user

router = APIRouter()

VALID_COMPLEXITY = {"low", "medium", "high"}


def _to_record_out(record: Record) -> RecordOut:
    out = RecordOut.model_validate(record)
    if record.reviewer:
        out.reviewer_username = record.reviewer.username
    return out


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

    # reviewed → reviewing 되돌리기는 admin만 가능
    if record.status == "reviewed" and body.status == "reviewing":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only")

    record.status = body.status
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

    record.reviewed_pii_dict = body.reviewed_pii_dict
    record.complexity = body.complexity
    record.status = "reviewed"
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(record)
    return _to_record_out(record)
