# server/schemas.py
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ── 요청 스키마 ──────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class StatusUpdate(BaseModel):
    status: str  # 'reviewing' (일반) | 'reviewing' (admin이 reviewed에서 되돌리기)


class ReviewUpdate(BaseModel):
    reviewed_pii_dict: dict
    complexity: str  # 'low' | 'medium' | 'high'


class BulkStatusUpdate(BaseModel):
    ids: list[str]
    status: str


class BulkDelete(BaseModel):
    ids: list[str]


# ── 응답 스키마 ──────────────────────────────────────

class UserOut(BaseModel):
    id: int
    username: str
    role: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RecordOut(BaseModel):
    id: str
    path: str
    source_filename: Optional[str]
    source: Optional[str]
    service_started_at: Optional[datetime]
    doc_text: Optional[str]
    pii_dict: Optional[dict]
    status: str
    prev_status: Optional[str] = None
    reviewed_pii_dict: Optional[dict]
    complexity: Optional[str]
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]
    reviewer_username: Optional[str] = None

    model_config = {"from_attributes": True}


class RecordListOut(BaseModel):
    total: int
    items: list[RecordOut]


class LogUploadOut(BaseModel):
    id: int
    original_filename: Optional[str]
    records_inserted: int
    last_service_started_at: Optional[datetime]
    uploaded_by: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}
