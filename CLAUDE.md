# LLM 라벨링 시스템

LLM PII 추출 서비스의 로그 파일을 업로드해 DB에 적재하고, 소규모 팀(2~5명)이 검수하는 도구.
상세 설계: `docs/design.md`

## 스택
- **Backend**: FastAPI + SQLAlchemy + SQLite (`data/app.db`) → 추후 PostgreSQL 이전 예정
- **Frontend**: React 18 + Vite + Tailwind CSS + React Router v6

## 구조
```
server/
  main.py / database.py / models.py / schemas.py / parser.py
  router/  auth.py · records.py · logs.py
web/src/
  pages/      ListPage · ReviewPage · LoginPage
  components/ TextViewer · PiiEditor · PiiChip · StatusBadge
  context/    FileContext.jsx  (API 호출 추상화)
data/app.db   (gitignore)
```

## DB 테이블
| 테이블 | 핵심 컬럼 |
|--------|-----------|
| `users` | id, username, password_hash, role(`admin`\|`reviewer`) |
| `records` | id(UUID), **job_id**(UNIQUE), source_filename, service_started_at, doc_text, pii_dict, status, reviewed_pii_dict, reviewed_by |
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
- **스킵 조건**: `[preprocess]` 줄 없음 (텍스트 없는 docx 등)
- `job_id` = `/tmp/{job_id}/` 폴더명 → DB UNIQUE 키
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
