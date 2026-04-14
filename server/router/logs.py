# server/router/logs.py
from datetime import datetime, UTC
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import Record, LogUpload, User
from server.parser import parse_log
from server.schemas import LogUploadOut
from server.router.auth import get_current_user

router = APIRouter()


@router.post("/upload", response_model=LogUploadOut)
async def upload_log(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="파일 인코딩 오류 (UTF-8 필요)")

    blocks = parse_log(text)

    # 재업로드 중복 처리: DB에서 MAX(service_started_at) 이후만 INSERT
    max_ts = db.query(func.max(Record.service_started_at)).scalar()

    inserted = 0
    last_ts = None
    for block in blocks:
        if max_ts and block.service_started_at <= max_ts:
            continue
        # path UNIQUE 충돌 방지 (혹시 동일 path가 이미 있으면 skip)
        exists = db.query(Record).filter_by(path=block.path).first()
        if exists:
            continue

        record = Record(
            path=block.path,
            source_filename=block.source_filename,
            source=block.source,
            service_started_at=block.service_started_at,
            doc_text=block.doc_text,
            pii_dict=block.pii_dict,
            status="pending",
        )
        db.add(record)
        inserted += 1
        if last_ts is None or block.service_started_at > last_ts:
            last_ts = block.service_started_at

    db.flush()

    log_entry = LogUpload(
        original_filename=file.filename,
        records_inserted=inserted,
        last_service_started_at=last_ts,
        uploaded_by=current_user.id,
        uploaded_at=datetime.now(UTC),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return LogUploadOut.model_validate(log_entry)


@router.get("/uploads", response_model=list[LogUploadOut])
def get_uploads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uploads = db.query(LogUpload).order_by(LogUpload.uploaded_at.desc()).all()
    return [LogUploadOut.model_validate(u) for u in uploads]
