# Backend + Frontend API Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FastAPI 백엔드를 구축하고 프론트엔드를 File System API에서 REST API 연동으로 교체한다.

**Architecture:** FastAPI + SQLAlchemy(SQLite) 백엔드, JWT 인증. 프론트엔드는 FileContext.jsx를 전면 교체해 fetch 기반으로 동작하며 LoginPage + Protected Route를 추가한다.

**Tech Stack:** Python(FastAPI, SQLAlchemy, python-jose, passlib), React 18 + Vite + Tailwind + React Router v6

---

## 파일 맵

### 신규 생성
| 파일 | 역할 |
|------|------|
| `server/__init__.py` | 패키지 |
| `server/main.py` | FastAPI 앱, CORS, 라우터 등록 |
| `server/database.py` | SQLAlchemy engine + SessionLocal + Base |
| `server/models.py` | ORM 모델(User, Record, LogUpload) |
| `server/schemas.py` | Pydantic 요청/응답 스키마 |
| `server/deps.py` | JWT 인증 의존성(get_current_user) |
| `server/parser.py` | 로그 파일 파싱 로직 |
| `server/router/__init__.py` | 패키지 |
| `server/router/auth.py` | POST /auth/login, GET /auth/me |
| `server/router/records.py` | GET/PATCH/PUT /records/* |
| `server/router/logs.py` | POST /logs/upload, GET /logs/uploads |
| `server/seed.py` | 초기 admin 계정 생성 스크립트 |
| `.env` | SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES |
| `web/src/pages/LoginPage.jsx` | 로그인 폼 |

### 수정
| 파일 | 변경 내용 |
|------|-----------|
| `web/src/context/FileContext.jsx` | File System API → fetch API 전면 교체 |
| `web/src/App.jsx` | Protected Route + LoginPage 라우트 추가 |
| `web/src/pages/ListPage.jsx` | 로그 업로드 버튼/UI 추가 |

---

## Task 1: 프로젝트 환경 세팅

**Files:**
- Create: `server/__init__.py`
- Create: `.env`
- Create: `data/` (디렉토리)

- [ ] **Step 1: uv로 가상환경 생성 및 의존성 설치**

```bash
cd /Users/sykim/CODE/pii-review
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

Expected: `.venv/` 생성, 패키지 설치 완료

- [ ] **Step 2: 환경변수 파일 생성**

`.env` 내용:
```
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

- [ ] **Step 3: 빈 패키지 파일 생성**

```bash
mkdir -p server/router data
touch server/__init__.py server/router/__init__.py
```

- [ ] **Step 4: Commit**

```bash
git add .env.example server/__init__.py server/router/__init__.py requirements.txt
git commit -m "chore: setup server package structure and venv"
```

---

## Task 2: DB 모델 + 데이터베이스 설정

**Files:**
- Create: `server/database.py`
- Create: `server/models.py`

- [ ] **Step 1: database.py 작성**

```python
# server/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: models.py 작성**

```python
# server/models.py
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from server.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="reviewer")  # admin | reviewer
    created_at = Column(DateTime, default=datetime.utcnow)

class Record(Base):
    __tablename__ = "records"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String, unique=True, nullable=False)
    source_filename = Column(String, nullable=False)
    service_started_at = Column(DateTime, nullable=False)
    text_len = Column(Integer)
    doc_text = Column(Text, nullable=False)
    pii_dict = Column(JSON, nullable=False)
    status = Column(String, default="pending")  # pending | reviewing | reviewed
    reviewed_pii_dict = Column(JSON)
    reviewed_at = Column(DateTime)
    reviewed_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

class LogUpload(Base):
    __tablename__ = "log_uploads"
    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String, nullable=False)
    records_inserted = Column(Integer)
    last_service_started_at = Column(DateTime)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
```

- [ ] **Step 3: 테이블 생성 확인**

```bash
python -c "from server.database import engine, Base; from server import models; Base.metadata.create_all(bind=engine); print('OK')"
```

Expected: `data/app.db` 생성, `OK` 출력

- [ ] **Step 4: Commit**

```bash
git add server/database.py server/models.py
git commit -m "feat: add SQLAlchemy models (User, Record, LogUpload)"
```

---

## Task 3: Pydantic 스키마 + JWT 인증 의존성

**Files:**
- Create: `server/schemas.py`
- Create: `server/deps.py`

- [ ] **Step 1: schemas.py 작성**

```python
# server/schemas.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, List, Any

class Token(BaseModel):
    access_token: str
    token_type: str

class UserOut(BaseModel):
    id: int
    username: str
    role: str
    class Config:
        from_attributes = True

class RecordOut(BaseModel):
    id: str
    job_id: str
    source_filename: str
    service_started_at: datetime
    text_len: Optional[int]
    doc_text: str
    pii_dict: Dict[str, List[str]]
    status: str
    reviewed_pii_dict: Optional[Dict[str, List[str]]]
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[int]
    created_at: datetime
    class Config:
        from_attributes = True

class StatusUpdate(BaseModel):
    status: str  # pending | reviewing | reviewed

class ReviewUpdate(BaseModel):
    reviewed_pii_dict: Dict[str, List[str]]

class LogUploadOut(BaseModel):
    id: int
    original_filename: str
    records_inserted: int
    last_service_started_at: Optional[datetime]
    uploaded_at: datetime
    class Config:
        from_attributes = True
```

- [ ] **Step 2: deps.py 작성**

```python
# server/deps.py
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from server.database import get_db
from server import models

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증 실패",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user
```

- [ ] **Step 3: Commit**

```bash
git add server/schemas.py server/deps.py
git commit -m "feat: add Pydantic schemas and JWT auth dependency"
```

---

## Task 4: 로그 파서

**Files:**
- Create: `server/parser.py`

- [ ] **Step 1: parser.py 작성**

```python
# server/parser.py
import ast
import re
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

TIMESTAMP_RE = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})')
JOB_ID_RE = re.compile(r'/tmp/([^/]+)/')

@dataclass
class ParsedRecord:
    job_id: str
    source_filename: str
    service_started_at: datetime
    text_len: Optional[int]
    doc_text: str
    pii_dict: dict

def _parse_timestamp(line: str) -> Optional[datetime]:
    m = TIMESTAMP_RE.match(line)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S,%f")

def parse_log(content: str) -> list[ParsedRecord]:
    lines = content.splitlines()
    blocks = []
    current = []
    for line in lines:
        if '🔍 LLMExtractService 시작' in line:
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            current.append(line)
    if current:
        blocks.append(current)

    records = []
    for block in blocks:
        record = _parse_block(block)
        if record:
            records.append(record)
    return records

def _parse_block(lines: list[str]) -> Optional[ParsedRecord]:
    start_line = lines[0]
    ts = _parse_timestamp(start_line)
    if not ts:
        return None
    jm = JOB_ID_RE.search(start_line)
    if not jm:
        return None
    job_id = jm.group(1)

    source_filename = text_len = doc_text = pii_dict = None
    i = 1
    while i < len(lines):
        line = lines[i]
        if '[Source] source_filename=' in line:
            if i + 1 < len(lines):
                source_filename = lines[i + 1].strip()
                i += 2
                continue
        if '[preprocess] text_len=' in line:
            m = re.search(r'text_len=(\d+)', line)
            if m:
                text_len = int(m.group(1))
        if '[run_pipeline] doc_text=' in line:
            parts = []
            i += 1
            while i < len(lines) and not TIMESTAMP_RE.match(lines[i]):
                parts.append(lines[i])
                i += 1
            doc_text = '\n'.join(parts).strip()
            continue
        if '[inference] [1/1] pii_dict=' in line:
            if i + 1 < len(lines):
                try:
                    pii_dict = ast.literal_eval(lines[i + 1].strip())
                except Exception:
                    return None
                i += 2
                continue
        i += 1

    # 유효성 검사
    if text_len is None or not doc_text or pii_dict is None or not source_filename:
        return None

    return ParsedRecord(
        job_id=job_id,
        source_filename=source_filename,
        service_started_at=ts,
        text_len=text_len,
        doc_text=doc_text,
        pii_dict=pii_dict,
    )
```

- [ ] **Step 2: 파서 수동 확인 (샘플 로그가 있는 경우)**

```bash
python -c "
from server.parser import parse_log
sample = '''2026-04-10 21:19:56,769 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/test-job-001/file.json
2026-04-10 21:19:56,770 [INFO] [Source] source_filename=
test_document.pdf
2026-04-10 21:19:56,771 [INFO] [preprocess] text_len=100, chunks=1
2026-04-10 21:19:56,772 [INFO] [run_pipeline] doc_text=
홍길동은 서울시 강남구에 삽니다.
2026-04-10 21:19:56,773 [INFO] [inference] [1/1] pii_dict=
{\"NAME\": [\"홍길동\"], \"ADDRESS\": [\"서울시 강남구\"]}
'''
result = parse_log(sample)
print(result)
"
```

Expected: `ParsedRecord` 1개 포함 리스트 출력

- [ ] **Step 3: Commit**

```bash
git add server/parser.py
git commit -m "feat: add log file parser"
```

---

## Task 5: 인증 라우터

**Files:**
- Create: `server/router/auth.py`
- Create: `server/seed.py`

- [ ] **Step 1: auth.py 작성**

```python
# server/router/auth.py
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from server.database import get_db
from server import models, schemas
from server.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

@router.post("/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form.username).first()
    if not user or not pwd_context.verify(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="아이디 또는 비밀번호가 틀렸습니다.")
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = jwt.encode({"sub": user.username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me", response_model=schemas.UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user
```

- [ ] **Step 2: seed.py 작성 (admin 계정 생성)**

```python
# server/seed.py
from passlib.context import CryptContext
from server.database import SessionLocal, engine, Base
from server import models

Base.metadata.create_all(bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

db = SessionLocal()
if not db.query(models.User).filter_by(username="admin").first():
    db.add(models.User(
        username="admin",
        password_hash=pwd_context.hash("admin1234"),
        role="admin"
    ))
    db.commit()
    print("admin 계정 생성 완료 (비밀번호: admin1234)")
else:
    print("admin 계정 이미 존재")
db.close()
```

- [ ] **Step 3: seed 실행**

```bash
python server/seed.py
```

Expected: `admin 계정 생성 완료`

- [ ] **Step 4: Commit**

```bash
git add server/router/auth.py server/seed.py
git commit -m "feat: add auth router and seed script"
```

---

## Task 6: Records 라우터

**Files:**
- Create: `server/router/records.py`

- [ ] **Step 1: records.py 작성**

```python
# server/router/records.py
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from server.database import get_db
from server import models, schemas
from server.deps import get_current_user

router = APIRouter(prefix="/records", tags=["records"])

@router.get("", response_model=list[schemas.RecordOut])
def list_records(
    status: str = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.Record)
    if status:
        q = q.filter(models.Record.status == status)
    if search:
        q = q.filter(models.Record.source_filename.contains(search))
    return q.order_by(models.Record.service_started_at.desc()).all()

@router.get("/export")
def export_reviewed(db: Session = Depends(get_db), _=Depends(get_current_user)):
    records = db.query(models.Record).filter(models.Record.status == "reviewed").all()
    data = [
        {
            "id": r.id,
            "source_filename": r.source_filename,
            "doc_text": r.doc_text,
            "pii_dict": r.reviewed_pii_dict,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        }
        for r in records
    ]
    return JSONResponse(content=data, headers={
        "Content-Disposition": "attachment; filename=reviewed_dataset.json"
    })

@router.get("/{record_id}", response_model=schemas.RecordOut)
def get_record(record_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    record = db.query(models.Record).filter(models.Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="레코드를 찾을 수 없습니다.")
    return record

@router.patch("/{record_id}/status", response_model=schemas.RecordOut)
def update_status(
    record_id: str,
    body: schemas.StatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = db.query(models.Record).filter(models.Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="레코드를 찾을 수 없습니다.")
    if body.status == "pending" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="admin만 pending으로 되돌릴 수 있습니다.")
    record.status = body.status
    db.commit()
    db.refresh(record)
    return record

@router.put("/{record_id}/review", response_model=schemas.RecordOut)
def save_review(
    record_id: str,
    body: schemas.ReviewUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = db.query(models.Record).filter(models.Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="레코드를 찾을 수 없습니다.")
    record.reviewed_pii_dict = body.reviewed_pii_dict
    record.status = "reviewed"
    record.reviewed_at = datetime.utcnow()
    record.reviewed_by = current_user.id
    db.commit()
    db.refresh(record)
    return record
```

- [ ] **Step 2: Commit**

```bash
git add server/router/records.py
git commit -m "feat: add records router (list, get, status, review, export)"
```

---

## Task 7: Logs 라우터

**Files:**
- Create: `server/router/logs.py`

- [ ] **Step 1: logs.py 작성**

```python
# server/router/logs.py
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from server.database import get_db
from server import models, schemas
from server.deps import get_current_user
from server.parser import parse_log

router = APIRouter(prefix="/logs", tags=["logs"])

@router.post("/upload", response_model=schemas.LogUploadOut)
async def upload_log(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    content = (await file.read()).decode("utf-8", errors="replace")
    parsed = parse_log(content)

    max_ts = db.query(func.max(models.Record.service_started_at)).scalar()

    inserted = 0
    last_ts = None
    for p in parsed:
        if max_ts and p.service_started_at <= max_ts:
            continue
        existing = db.query(models.Record).filter_by(job_id=p.job_id).first()
        if existing:
            continue
        db.add(models.Record(
            job_id=p.job_id,
            source_filename=p.source_filename,
            service_started_at=p.service_started_at,
            text_len=p.text_len,
            doc_text=p.doc_text,
            pii_dict=p.pii_dict,
        ))
        inserted += 1
        if last_ts is None or p.service_started_at > last_ts:
            last_ts = p.service_started_at

    log_entry = models.LogUpload(
        original_filename=file.filename,
        records_inserted=inserted,
        last_service_started_at=last_ts,
        uploaded_by=current_user.id,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry

@router.get("/uploads", response_model=list[schemas.LogUploadOut])
def list_uploads(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.LogUpload).order_by(models.LogUpload.uploaded_at.desc()).all()
```

- [ ] **Step 2: Commit**

```bash
git add server/router/logs.py
git commit -m "feat: add logs router (upload, list)"
```

---

## Task 8: FastAPI 메인 앱

**Files:**
- Create: `server/main.py`

- [ ] **Step 1: main.py 작성**

```python
# server/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.database import engine, Base
from server import models  # noqa: F401 — ensures models are registered
from server.router import auth, records, logs

Base.metadata.create_all(bind=engine)

app = FastAPI(title="LLM 라벨링 검수 시스템")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(records.router)
app.include_router(logs.router)
```

- [ ] **Step 2: 서버 기동 테스트**

```bash
uvicorn server.main:app --reload --port 8000
```

브라우저에서 `http://localhost:8000/docs` 열어 Swagger UI 확인.
`POST /auth/login`에서 `admin` / `admin1234`로 로그인 → 토큰 반환 확인.

- [ ] **Step 3: Commit**

```bash
git add server/main.py
git commit -m "feat: add FastAPI main app with CORS and routers"
```

---

## Task 9: 프론트엔드 — LoginPage 신규 작성

**Files:**
- Create: `web/src/pages/LoginPage.jsx`

- [ ] **Step 1: LoginPage.jsx 작성**

```jsx
// web/src/pages/LoginPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || '로그인 실패')
      }
      const { access_token } = await res.json()
      localStorage.setItem('token', access_token)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏷️</div>
          <h1 className="text-xl font-semibold text-gray-800">LLM 라벨링 검수</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="아이디"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/LoginPage.jsx
git commit -m "feat: add LoginPage"
```

---

## Task 10: 프론트엔드 — FileContext를 API 연동으로 교체

**Files:**
- Modify: `web/src/context/FileContext.jsx`

- [ ] **Step 1: FileContext.jsx 전면 교체**

기존 File System Access API 방식을 제거하고 fetch 기반으로 교체한다.

```jsx
// web/src/context/FileContext.jsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const FileContext = createContext(null)

export const PII_CATEGORIES = [
  'NAME', 'ADDRESS', 'POSTAL', 'RESIDENT', 'CONTACT',
  'EMAIL', 'BIRTHDATE', 'GENDER', 'AGE',
]

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers ?? {}) },
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.hash = '#/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function FileProvider({ children }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchRecords = useCallback(async (status = null) => {
    setLoading(true)
    try {
      const qs = status ? `?status=${status}` : ''
      const data = await apiFetch(`/records${qs}`)
      setRecords(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  async function setRecordStatus(id, status) {
    const updated = await apiFetch(`/records/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setRecords(prev => prev.map(r => r.id === id ? updated : r))
  }

  async function saveReview(id, reviewedPiiDict) {
    const updated = await apiFetch(`/records/${id}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_pii_dict: reviewedPiiDict }),
    })
    setRecords(prev => prev.map(r => r.id === id ? updated : r))
    return updated
  }

  async function uploadLog(file) {
    const form = new FormData()
    form.append('file', file)
    const result = await apiFetch('/logs/upload', { method: 'POST', body: form })
    await fetchRecords()
    return result
  }

  async function exportReviewed() {
    const res = await fetch('/api/records/export', { headers: authHeaders() })
    if (!res.ok) throw new Error('Export 실패')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reviewed_dataset.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <FileContext.Provider value={{
      records,
      loading,
      fetchRecords,
      setRecordStatus,
      saveReview,
      uploadLog,
      exportReviewed,
    }}>
      {children}
    </FileContext.Provider>
  )
}

export function useFile() {
  return useContext(FileContext)
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/context/FileContext.jsx
git commit -m "feat: replace FileContext with API-based implementation"
```

---

## Task 11: 프론트엔드 — App.jsx Protected Route + 라우터 수정

**Files:**
- Modify: `web/src/App.jsx`

- [ ] **Step 1: App.jsx 수정**

```jsx
// web/src/App.jsx
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { FileProvider } from './context/FileContext'
import ListPage from './pages/ListPage'
import ReviewPage from './pages/ReviewPage'
import LoginPage from './pages/LoginPage'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <ProtectedRoute><ListPage /></ProtectedRoute>,
  },
  {
    path: '/review/:id',
    element: <ProtectedRoute><ReviewPage /></ProtectedRoute>,
  },
])

export default function App() {
  return (
    <FileProvider>
      <RouterProvider router={router} />
    </FileProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/App.jsx
git commit -m "feat: add protected routes and login redirect"
```

---

## Task 12: 프론트엔드 — ListPage 수정 (로그 업로드 UI + 파일/필터 사이드바 제거)

**Files:**
- Modify: `web/src/pages/ListPage.jsx`

- [ ] **Step 1: ListPage.jsx 수정**

기존 `files`, `activeFileId`, `openFile`, `addFile` 관련 코드를 제거하고, 로그 업로드 버튼과 로딩 상태를 추가한다. 필터 사이드바는 유지.

```jsx
// web/src/pages/ListPage.jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import StatusBadge from '../components/StatusBadge'

function totalPiiCount(record) {
  const dict = record.reviewed_pii_dict ?? record.pii_dict ?? {}
  return Object.values(dict).reduce((sum, arr) => sum + (arr?.length ?? 0), 0)
}

export default function ListPage() {
  const { records, loading, uploadLog, exportReviewed } = useFile()
  const [filter, setFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const pendingCount = records.filter(r => r.status === 'pending').length
  const reviewingCount = records.filter(r => r.status === 'reviewing').length
  const reviewedCount = records.filter(r => r.status === 'reviewed').length
  const filtered = records.filter(r => filter === 'all' || r.status === filter)

  async function handleLogUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadLog(file)
      alert(`${result.records_inserted}건 추가됨`)
    } catch (err) {
      alert(`업로드 실패: ${err.message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loading && records.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        불러오는 중...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="w-56 bg-gray-50 border-r border-gray-100 p-4 flex flex-col gap-6 shrink-0">
        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">필터</div>
          <div className="space-y-0.5">
            {[
              { key: 'all', label: '전체', count: records.length },
              { key: 'pending', label: '미검수', count: pendingCount },
              { key: 'reviewing', label: '검수중', count: reviewingCount },
              { key: 'reviewed', label: '검수완료', count: reviewedCount },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  filter === key ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{label}</span>
                <span className="text-xs text-gray-400">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-0.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt"
            className="hidden"
            onChange={handleLogUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : '+ 로그 업로드'}
          </button>
          {reviewedCount > 0 && (
            <button
              onClick={exportReviewed}
              className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              검수 완료 Export
            </button>
          )}
          <button
            onClick={() => { localStorage.removeItem('token'); navigate('/login') }}
            className="w-full text-left text-sm text-gray-400 hover:text-gray-600 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900">검수 목록</h1>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>전체 {records.length}건</span>
              <span className="text-orange-500">● 미검수 {pendingCount}</span>
              {reviewingCount > 0 && <span className="text-blue-500">● 검수중 {reviewingCount}</span>}
              <span className="text-green-500">✓ 검수완료 {reviewedCount}</span>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">파일명</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">상태</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">PII</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">검수일</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(record => (
                  <tr
                    key={record.id}
                    onClick={() => navigate(`/review/${record.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3.5 text-sm text-gray-800 font-medium">📄 {record.source_filename}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={record.status} /></td>
                    <td className="px-5 py-3.5 text-sm">
                      {totalPiiCount(record) > 0 ? (
                        <span className="bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 text-xs font-medium">
                          {totalPiiCount(record)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">
                      {record.reviewed_at
                        ? new Date(record.reviewed_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                        : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-300 group-hover:text-gray-400 text-right transition-colors">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-400">해당하는 항목이 없습니다.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/ListPage.jsx
git commit -m "feat: update ListPage for API integration and log upload"
```

---

## Task 13: Vite 프록시 설정

**Files:**
- Modify: `web/vite.config.js`

- [ ] **Step 1: vite.config.js에 프록시 추가**

`/api` 경로를 백엔드로 프록시해 CORS 없이 개발한다.

```js
// web/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add web/vite.config.js
git commit -m "chore: add Vite proxy for /api -> localhost:8000"
```

---

## Task 14: 통합 테스트

- [ ] **Step 1: 백엔드 기동**

```bash
source .venv/bin/activate
uvicorn server.main:app --reload --port 8000
```

- [ ] **Step 2: 프론트엔드 기동**

```bash
cd web && npm run dev
```

- [ ] **Step 3: 엔드투엔드 흐름 확인**

1. `http://localhost:5173` 접속 → `/login` 리다이렉트 확인
2. `admin` / `admin1234` 로그인 → 목록 페이지 진입
3. 사이드바 **로그 업로드** → `.log` 파일 선택 → "N건 추가됨" alert 확인
4. 목록에서 레코드 클릭 → 검수 페이지 진입, 상태 `reviewing` 자동 변경 확인
5. PII 편집 후 저장(Ctrl+S) → `reviewed` 상태 변경 확인
6. **검수 완료 Export** → `reviewed_dataset.json` 다운로드 확인
7. 로그아웃 → `/login` 리다이렉트 확인
