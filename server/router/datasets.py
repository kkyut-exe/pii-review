import csv
import io
import json
import os
import re
import unicodedata
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session, selectinload

from server.database import get_db
from server.models import Dataset, DatasetVersion, DatasetItem, Record, User
from server.router.auth import get_current_user
from server.schemas import DatasetOut, DatasetUploadResponse, DatasetVersionDetailOut, DatasetItemOut, DatasetVersionSummaryOut

router = APIRouter()

VALID_DATASET_KINDS = {"golden", "scenario"}
MATCHED_REVIEWED = "matched_reviewed"
MATCHED_NOT_REVIEWED = "matched_not_reviewed"
UNMATCHED = "unmatched"
AMBIGUOUS = "ambiguous"
COMPLEXITY_MAP = {
    "low": "easy",
    "medium": "medium",
    "high": "hard",
}

HEADER_CANDIDATES = {
    "filename",
    "file_name",
    "source_filename",
    "file",
    "name",
    "파일명",
    "문서명",
}


def _normalize_header(value: str) -> str:
    return re.sub(r"[\s\-]+", "_", (value or "").strip().lower())


def _normalize_basename(filename: str) -> str:
    normalized = unicodedata.normalize("NFC", (filename or "").strip())
    base = os.path.basename(normalized)
    stem, _ = os.path.splitext(base)
    return re.sub(r"\s+", " ", stem).strip().lower()


def _decode_csv(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp949"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=400, detail="CSV 인코딩 오류 (utf-8 또는 cp949 필요)")


def _detect_filename_column(fieldnames: list[str], requested: str | None) -> str:
    if requested:
        if requested not in fieldnames:
            raise HTTPException(status_code=422, detail=f"CSV column not found: {requested}")
        return requested

    for field in fieldnames:
        if _normalize_header(field) in HEADER_CANDIDATES:
            return field
    raise HTTPException(status_code=422, detail="CSV에서 파일명 컬럼을 찾지 못했습니다.")


def _first_non_empty(row: dict, candidates: list[str], default: str = "") -> str:
    normalized_map = {_normalize_header(key): value for key, value in row.items()}
    for candidate in candidates:
        value = normalized_map.get(_normalize_header(candidate))
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def _summarize_items(items: list[DatasetItem]) -> dict:
    counts = {
        "total_items": len(items),
        "matched_reviewed_count": 0,
        "matched_not_reviewed_count": 0,
        "unmatched_count": 0,
        "ambiguous_count": 0,
    }
    for item in items:
        if item.match_status == MATCHED_REVIEWED:
            counts["matched_reviewed_count"] += 1
        elif item.match_status == MATCHED_NOT_REVIEWED:
            counts["matched_not_reviewed_count"] += 1
        elif item.match_status == AMBIGUOUS:
            counts["ambiguous_count"] += 1
        else:
            counts["unmatched_count"] += 1
    return counts


def _to_item_out(item: DatasetItem) -> DatasetItemOut:
    record = item.matched_record
    reviewer_username = None
    if record and record.reviewer:
        reviewer_username = record.reviewer.username
    return DatasetItemOut(
        id=item.id,
        row_index=item.row_index,
        original_filename=item.original_filename,
        normalized_basename=item.normalized_basename,
        raw_row=item.raw_row,
        match_status=item.match_status,
        matched_record_id=item.matched_record_id,
        matched_record_source_filename=record.source_filename if record else None,
        matched_record_status=record.status if record else None,
        reviewed_pii_dict=record.reviewed_pii_dict if record else None,
        reviewed_at=record.reviewed_at if record else None,
        reviewer_username=reviewer_username,
    )


def _to_version_summary(version: DatasetVersion) -> DatasetVersionSummaryOut:
    counts = _summarize_items(version.items)
    return DatasetVersionSummaryOut(
        id=version.id,
        version=version.version,
        source_csv_filename=version.source_csv_filename,
        filename_column=version.filename_column,
        uploaded_at=version.uploaded_at,
        uploaded_by=version.uploaded_by,
        uploader_username=version.uploader.username if version.uploader else None,
        **counts,
    )


def _to_version_detail(version: DatasetVersion) -> DatasetVersionDetailOut:
    counts = _summarize_items(version.items)
    return DatasetVersionDetailOut(
        id=version.id,
        dataset_id=version.dataset_id,
        dataset_name=version.dataset.name,
        dataset_kind=version.dataset.kind,
        version=version.version,
        source_csv_filename=version.source_csv_filename,
        filename_column=version.filename_column,
        uploaded_at=version.uploaded_at,
        uploaded_by=version.uploaded_by,
        uploader_username=version.uploader.username if version.uploader else None,
        items=[_to_item_out(item) for item in version.items],
        **counts,
    )


def _get_version_or_404(db: Session, version_id: int) -> DatasetVersion:
    version = (
        db.query(DatasetVersion)
        .options(
            selectinload(DatasetVersion.dataset),
            selectinload(DatasetVersion.uploader),
            selectinload(DatasetVersion.items)
            .selectinload(DatasetItem.matched_record)
            .selectinload(Record.reviewer),
        )
        .filter_by(id=version_id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")
    return version


@router.get("", response_model=list[DatasetOut])
def list_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    datasets = (
        db.query(Dataset)
        .options(
            selectinload(Dataset.versions).selectinload(DatasetVersion.items),
            selectinload(Dataset.versions).selectinload(DatasetVersion.uploader),
        )
        .order_by(Dataset.kind.asc(), Dataset.name.asc())
        .all()
    )
    result = []
    for dataset in datasets:
        versions = sorted(dataset.versions, key=lambda version: version.uploaded_at, reverse=True)
        result.append(
            DatasetOut(
                id=dataset.id,
                name=dataset.name,
                kind=dataset.kind,
                created_at=dataset.created_at,
                versions=[_to_version_summary(version) for version in versions],
            )
        )
    return result


@router.post("/upload", response_model=DatasetUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset_version(
    name: str = Form(...),
    kind: str = Form(...),
    version: str = Form(...),
    filename_column: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    normalized_kind = kind.strip().lower()
    if normalized_kind not in VALID_DATASET_KINDS:
        raise HTTPException(status_code=422, detail=f"Invalid dataset kind: {kind}")

    dataset_name = name.strip()
    version_name = version.strip()
    if not dataset_name or not version_name:
        raise HTTPException(status_code=422, detail="Dataset name and version are required")

    content = await file.read()
    text = _decode_csv(content)
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV 헤더를 읽지 못했습니다.")

    detected_filename_column = _detect_filename_column(reader.fieldnames, filename_column.strip() if filename_column else None)
    rows = list(reader)

    dataset = db.query(Dataset).filter_by(name=dataset_name, kind=normalized_kind).first()
    if not dataset:
        dataset = Dataset(name=dataset_name, kind=normalized_kind)
        db.add(dataset)
        db.flush()

    existing_version = db.query(DatasetVersion).filter_by(dataset_id=dataset.id, version=version_name).first()
    if existing_version:
        raise HTTPException(status_code=409, detail="이미 같은 버전이 존재합니다.")

    record_map: dict[str, list[Record]] = {}
    records = (
        db.query(Record)
        .options(selectinload(Record.reviewer))
        .filter(Record.source_filename.isnot(None))
        .all()
    )
    for record in records:
        key = _normalize_basename(record.source_filename or "")
        if not key:
            continue
        record_map.setdefault(key, []).append(record)

    dataset_version = DatasetVersion(
        dataset_id=dataset.id,
        version=version_name,
        source_csv_filename=file.filename or "dataset.csv",
        filename_column=detected_filename_column,
        uploaded_by=current_user.id,
        uploaded_at=datetime.now(UTC),
    )
    db.add(dataset_version)
    db.flush()

    for index, row in enumerate(rows, start=1):
        original_filename = (row.get(detected_filename_column) or "").strip()
        normalized_basename = _normalize_basename(original_filename)
        matched_record_id = None
        match_status = UNMATCHED

        matches = record_map.get(normalized_basename, []) if normalized_basename else []
        if len(matches) == 1:
            matched = matches[0]
            matched_record_id = matched.id
            match_status = MATCHED_REVIEWED if matched.status == "reviewed" else MATCHED_NOT_REVIEWED
        elif len(matches) > 1:
            match_status = AMBIGUOUS

        db.add(
            DatasetItem(
                dataset_version_id=dataset_version.id,
                row_index=index,
                original_filename=original_filename,
                normalized_basename=normalized_basename,
                raw_row=dict(row),
                match_status=match_status,
                matched_record_id=matched_record_id,
                created_at=datetime.now(UTC),
            )
        )

    db.commit()
    return DatasetUploadResponse(version_id=dataset_version.id)


@router.get("/versions/{version_id}", response_model=DatasetVersionDetailOut)
def get_dataset_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _get_version_or_404(db, version_id)
    return _to_version_detail(version)


@router.get("/versions/{version_id}/export", response_class=PlainTextResponse)
def export_dataset_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _get_version_or_404(db, version_id)
    lines: list[str] = []
    for item in version.items:
        record = item.matched_record
        if item.match_status != MATCHED_REVIEWED or not record:
            continue
        payload = {
            "id": _first_non_empty(item.raw_row, ["번호", "id", "ID"], default=str(item.row_index).zfill(4)),
            "input": record.doc_text or "",
            "char_len": len(record.doc_text or ""),
            "label": record.reviewed_pii_dict or {},
            "source": record.source,
            "doc_type": _first_non_empty(item.raw_row, ["doc_type", "타입", "문서유형", "문서 종류"]),
            "complexity": COMPLEXITY_MAP.get(record.complexity, record.complexity or ""),
        }
        lines.append(json.dumps(payload, ensure_ascii=False))

    return PlainTextResponse("\n".join(lines), media_type="application/x-ndjson; charset=utf-8")


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    dataset = db.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    db.delete(dataset)
    db.commit()


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    version = (
        db.query(DatasetVersion)
        .options(selectinload(DatasetVersion.dataset))
        .filter_by(id=version_id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    dataset_id = version.dataset_id
    db.delete(version)
    db.flush()

    remaining = db.query(DatasetVersion).filter_by(dataset_id=dataset_id).count()
    if remaining == 0:
        dataset = db.query(Dataset).filter_by(id=dataset_id).first()
        if dataset:
            db.delete(dataset)

    db.commit()
