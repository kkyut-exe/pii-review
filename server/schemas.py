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


class RenameRecord(BaseModel):
    source_filename: str


class UpdateDocText(BaseModel):
    doc_text: str


class ManualRecordCreate(BaseModel):
    doc_text: str
    source_filename: Optional[str] = None
    pii_dict: Optional[dict | str] = None


class DatasetUploadResponse(BaseModel):
    version_id: int


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


class DatasetItemOut(BaseModel):
    id: int
    row_index: int
    original_filename: str
    normalized_basename: str
    raw_row: dict
    match_status: str
    matched_record_id: Optional[str] = None
    matched_record_source_filename: Optional[str] = None
    matched_record_status: Optional[str] = None
    reviewed_pii_dict: Optional[dict] = None
    reviewed_at: Optional[datetime] = None
    reviewer_username: Optional[str] = None


class DatasetVersionSummaryOut(BaseModel):
    id: int
    version: str
    source_csv_filename: str
    filename_column: Optional[str] = None
    uploaded_at: datetime
    uploaded_by: int
    uploader_username: Optional[str] = None
    total_items: int
    matched_reviewed_count: int
    matched_not_reviewed_count: int
    unmatched_count: int
    ambiguous_count: int


class DatasetOut(BaseModel):
    id: int
    name: str
    kind: str
    created_at: datetime
    versions: list[DatasetVersionSummaryOut]


class DatasetVersionDetailOut(BaseModel):
    id: int
    dataset_id: int
    dataset_name: str
    dataset_kind: str
    version: str
    source_csv_filename: str
    filename_column: Optional[str] = None
    uploaded_at: datetime
    uploaded_by: int
    uploader_username: Optional[str] = None
    total_items: int
    matched_reviewed_count: int
    matched_not_reviewed_count: int
    unmatched_count: int
    ambiguous_count: int
    items: list[DatasetItemOut]
