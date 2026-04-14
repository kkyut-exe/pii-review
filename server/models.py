# server/models.py
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey
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
