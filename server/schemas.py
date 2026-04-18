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


# ── Eval 스키마 ───────────────────────────────────────

class EvalRunCreate(BaseModel):
    name: str
    model_name: str
    server_url: str
    chunk_chars: Optional[int] = None
    overlap: int = 0
    golden_source: str  # 'db' | 'upload'
    golden_upload_id: Optional[str] = None  # upload 모드일 때만
    # db 모드: 선택된 dataset_version 들 — 버전당 run 1개씩 생성.
    # 비어있으면 전체 reviewed records 로 run 1개.
    golden_dataset_version_ids: Optional[list[int]] = None


class EvalMetricOut(BaseModel):
    scope: str
    key: str
    tp: int
    fp: int
    fn: int
    precision: float
    recall: float
    f1: float

    model_config = {"from_attributes": True}


class EvalRunSummaryOut(BaseModel):
    id: str
    name: str
    model_name: str
    server_url: str
    chunk_chars: Optional[int]
    overlap: int
    golden_source: str
    status: str
    progress: float
    total_docs: int
    matched_docs: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_at: datetime
    created_by: int
    creator_username: Optional[str] = None
    overall_f1: Optional[float] = None
    overall_precision: Optional[float] = None
    overall_recall: Optional[float] = None

    model_config = {"from_attributes": True}


class EvalRunDetailOut(EvalRunSummaryOut):
    golden_set_hash: str
    artifact_dir: str
    error_msg: Optional[str] = None
    metrics: list[EvalMetricOut] = []


class EvalGoldenUploadResponse(BaseModel):
    upload_id: str
    filename: str
    total_docs: int


class EvalDocDiff(BaseModel):
    id: str
    field_diffs: dict  # {field: {"gt": [...], "pred": [...], "miss": [...], "extra": [...]}}
    strict_f1: float
    normalized_f1: float


class EvalRunDetailsOut(BaseModel):
    run_id: str
    strict: dict   # {overall: {...}, fields: {FIELD: {...}}}
    normalized: dict
    doc_exact_match: float
    worst_docs: list[EvalDocDiff]
