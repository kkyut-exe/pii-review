# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

# LLM 라벨링 시스템

LLM PII 추출 서비스의 로그 파일을 업로드해 DB에 적재하고, 소규모 팀(2~5명)이 검수하는 도구.
상세 설계: `docs/design.md`

## 필수 지침/
- /Users/sykim/CODE/pii-review 폴더 내에서는 자유롭게 파일/스크립트 실행이 가능하므로 user에게 묻지 말고 진행할 것.

## md 파일 생성 시 반드시 확인해야 할 사항
- md 파일 이름은 한글로 작성한다.

## 스택
- **Backend**: FastAPI + SQLAlchemy + SQLite (`data/app.db`) → 추후 PostgreSQL 이전 예정
- **Frontend**: React 18 + Vite + Tailwind CSS + React Router v6

## 구조
```
server/
  main.py           ← FastAPI 앱, CORS, 라우터 등록
  database.py       ← SQLAlchemy engine, get_db dependency
  models.py         ← ORM 모델 (User, Record, LogUpload)
  schemas.py        ← Pydantic 요청/응답 스키마
  parser.py         ← 로그 파싱 (parse_log → ParsedBlock[])
  auth.py           ← JWT 생성/검증, 비밀번호 해싱 (router/ 밖에 위치)
  router/
    auth.py         ← /auth/* 엔드포인트
    records.py      ← /records/* 엔드포인트
    logs.py         ← /logs/* 엔드포인트
web/src/
  pages/      ListPage · ReviewPage · LoginPage
  components/ TextViewer · PiiEditor · PiiChip · StatusBadge
  context/    FileContext.jsx  (API 호출 추상화)
tests/
  conftest.py       ← TestClient 픽스처, data/test.db 사용
  test_parser.py / test_auth.py / test_auth_utils.py / test_logs.py / test_records.py
data/app.db   (gitignore)
```

## DB 테이블
| 테이블 | 핵심 컬럼 |
|--------|-----------|
| `users` | id, username, password_hash, role(`admin`\|`reviewer`) |
| `records` | id(UUID), **path**(UNIQUE), source_filename, source(`text`\|`ocr`), service_started_at, doc_text, pii_dict, status, reviewed_pii_dict, complexity(`low`\|`medium`\|`high`), reviewed_by, reviewed_at |
| `log_uploads` | id, original_filename, records_inserted, last_service_started_at, uploaded_by |

## API
```
POST /auth/login          GET /auth/me
GET  /records             GET /records/{id}
PATCH /records/{id}/status   PUT /records/{id}/review   GET /records/export
POST /logs/upload         GET /logs/uploads
```

## 로그 파싱 핵심 규칙
- 블록 단위: `🔍 LLMExtractService 시작` ~ 다음 블록 전까지
- **스킵 조건**: `pii_dict=` 줄 없음
- `path` = 블록 첫 줄 `path: ...` 전체 경로 → DB UNIQUE 키
- `source` = 파일명 패턴으로 자동 판별 (`*ocr_chunked*` → `ocr`, 나머지 → `text`)
- `pii_dict` = Python dict literal → `ast.literal_eval` 파싱
- **재업로드 중복 처리**: `service_started_at > MAX(DB)` 인 것만 INSERT

## 기타
- PII 카테고리 9개 고정: `NAME ADDRESS POSTAL RESIDENT CONTACT EMAIL BIRTHDATE GENDER AGE`
- 상태 흐름: `pending → reviewing → reviewed` (admin만 되돌리기 가능)
- JWT는 `localStorage` 저장, 비인증 시 `/login` 리다이렉트

## 실행
```bash
# backend
uvicorn server.main:app --reload --port 8000
# frontend
cd web && npm run dev
```

## 테스트
```bash
# 전체 테스트
pytest

# 특정 파일
pytest tests/test_parser.py

# 특정 테스트 함수
pytest tests/test_parser.py::test_parse_single_block

# 테스트 DB는 data/test.db 에 생성되고 각 테스트 후 자동 삭제됨
```
