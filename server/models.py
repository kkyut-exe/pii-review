# server/models.py
import uuid
from datetime import datetime, UTC
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from server.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="reviewer")  # 'admin' | 'reviewer'


class Record(Base):
    __tablename__ = "records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    path = Column(String, unique=True, nullable=False)
    source_filename = Column(String)
    source = Column(String)          # 'text' | 'ocr'
    service_started_at = Column(DateTime)
    doc_text = Column(Text)
    pii_dict = Column(JSON)
    status = Column(String, default="pending")  # 'pending' | 'reviewing' | 'reviewed' | 'pending_delete'
    prev_status = Column(String, nullable=True)  # pending_delete 이동 전 상태 보존
    reviewed_pii_dict = Column(JSON)
    complexity = Column(String)      # 'low' | 'medium' | 'high' — required at review time
    reviewed_by = Column(Integer, ForeignKey("users.id"))
    reviewed_at = Column(DateTime)

    reviewer = relationship("User", foreign_keys=[reviewed_by])


class LogUpload(Base):
    __tablename__ = "log_uploads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    original_filename = Column(String)
    records_inserted = Column(Integer)
    last_service_started_at = Column(DateTime)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    uploader = relationship("User", foreign_keys=[uploaded_by])


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (UniqueConstraint("name", "kind", name="uq_dataset_name_kind"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False)  # 'golden' | 'scenario'
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    versions = relationship(
        "DatasetVersion",
        back_populates="dataset",
        cascade="all, delete-orphan",
        order_by="DatasetVersion.uploaded_at.desc()",
    )


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"
    __table_args__ = (UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    version = Column(String, nullable=False)
    source_csv_filename = Column(String, nullable=False)
    filename_column = Column(String, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(UTC))

    dataset = relationship("Dataset", back_populates="versions")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    items = relationship(
        "DatasetItem",
        back_populates="dataset_version",
        cascade="all, delete-orphan",
        order_by="DatasetItem.row_index.asc()",
    )


class DatasetItem(Base):
    __tablename__ = "dataset_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_version_id = Column(Integer, ForeignKey("dataset_versions.id"), nullable=False)
    row_index = Column(Integer, nullable=False)
    original_filename = Column(String, nullable=False, default="")
    normalized_basename = Column(String, nullable=False, default="")
    raw_row = Column(JSON, nullable=False)
    match_status = Column(String, nullable=False)  # reviewed | not_reviewed | unmatched | ambiguous
    matched_record_id = Column(String, ForeignKey("records.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))

    dataset_version = relationship("DatasetVersion", back_populates="items")
    matched_record = relationship("Record", foreign_keys=[matched_record_id])
