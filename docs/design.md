# LLM 라벨링 시스템 설계 문서

> 최초 작성: 2026-04-10

---

## 1. 프로젝트 개요

기존 LLM PII 추출 서비스의 로그 파일을 기반으로,
소규모 팀이 함께 PII 라벨링을 검수하는 웹 도구.

---

## 2. 시스템 결정 사항

### 2.1 사용자 환경
- **소규모 팀 (2~5명)**
- 역할: `admin` (관리자 1명, 최종 검수 확정) / `reviewer` (검수자)
- 검수자 정보를 라벨링 결과에 기록

### 2.2 데이터 유입 방식
- 기존 LLM 추출 서비스가 생성하는 **로그 파일(.log)을 업로드**
- 파싱 후 DB에 적재. 이 시스템은 LLM 호출 없이 **검수만** 담당
- 동일 로그 파일 재업로드 시: `service_started_at` 기준으로 신규 레코드만 추가

### 2.3 검수 방식
- 검수자 1명이 검수 → admin이 최종 확인 후 완료
- 향후 inter-annotator agreement 도입 가능성은 열어둠 (현재는 구현 안 함)

### 2.4 인프라
- **FastAPI + SQLite** (로컬/소규모 팀)
- 추후 PostgreSQL 이전 용이하도록 SQLAlchemy ORM 사용
- Docker 없이 로컬 실행 가능하게 설계

### 2.5 PII 카테고리
고정 9개:
`NAME`, `ADDRESS`, `POSTAL`, `RESIDENT`, `CONTACT`, `EMAIL`, `BIRTHDATE`, `GENDER`, `AGE`

### 2.6 인증
- **ID/PW + JWT** (SSO 불필요)
- 로그인 페이지 추가, 비인증 접근 시 리다이렉트

---

## 3. 로그 파일 파싱 스펙

### 3.1 로그 블록 구조

한 레코드 = `🔍 LLMExtractService 시작` 으로 시작하는 블록

```
{timestamp} [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/{job_id}/{file}.json
{timestamp} [INFO] [Source] source_filename=
{source_filename}                               ← 다음 줄에 값 (strip 필요)
{timestamp} [INFO] [preprocess] text_len={N}, chunks={N}   ← 없으면 스킵
{timestamp} [INFO] [run_pipeline] doc_text=
{doc_text...}                                   ← 다음 줄~다음 타임스탬프 전까지
{timestamp} [INFO] [inference] [1/1] pii_dict=
{python_dict}                                   ← Python dict literal (ast.literal_eval)
```

### 3.2 파싱 대상 필드

| 필드 | 추출 위치 |
|------|-----------|
| `service_started_at` | `시작` 줄 타임스탬프 (`2026-04-10 21:19:56,769`) |
| `job_id` | path의 폴더명 (`pdf-260410-B4iwM2eb1xtHZROa6J9tDxm5`) |
| `source_filename` | `[Source] source_filename=` 다음 줄 |
| `text_len` | `[preprocess] text_len=N` |
| `doc_text` | `[run_pipeline] doc_text=` 다음 줄부터 멀티라인 |
| `pii_dict` | `[inference] [1/1] pii_dict=` 다음 줄 |

### 3.3 유효 레코드 조건

모두 만족해야 DB 저장:
1. `text_len` 줄 존재 (`[preprocess]` 있음)
2. `doc_text` 비어있지 않음
3. `pii_dict` 파싱 성공

> docx 파일의 `texts_chunked.json` 요청처럼 파일명만 찍고 바로 리턴되는 경우 → 스킵

### 3.4 중복 처리

- DB에서 `MAX(service_started_at)` 조회
- 파싱된 레코드 중 `service_started_at > max` 인 것만 INSERT
- `job_id` UNIQUE 제약으로 이중 안전장치

---

## 4. 시스템 아키텍처

### 4.1 디렉토리 구조

```
llm-labeling/
  web/                ← React 앱 (API 호출 방식으로 교체)
  server/
    main.py           ← FastAPI 앱, CORS, 라우터
    database.py       ← SQLAlchemy engine, session
    models.py         ← DB ORM 모델
    schemas.py        ← Pydantic 스키마
    parser.py         ← 로그 파싱 로직
    router/
      auth.py
      records.py
      logs.py
  data/
    app.db            ← SQLite DB
  requirements.txt
  docs/
    design.md         ← 이 문서
```

### 4.2 DB 스키마

**users**
```sql
id            INTEGER PK
username      TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
role          TEXT NOT NULL DEFAULT 'reviewer'  -- 'admin' | 'reviewer'
created_at    TIMESTAMP
```

**records**
```sql
id                  TEXT PK         -- UUID
job_id              TEXT UNIQUE NOT NULL
source_filename     TEXT NOT NULL
service_started_at  TIMESTAMP NOT NULL
text_len            INTEGER
doc_text            TEXT NOT NULL
pii_dict            JSON NOT NULL
status              TEXT DEFAULT 'pending'  -- pending / reviewing / reviewed
reviewed_pii_dict   JSON
reviewed_at         TIMESTAMP
reviewed_by         INTEGER FK → users.id
created_at          TIMESTAMP
```

**log_uploads**
```sql
id                       INTEGER PK
original_filename        TEXT NOT NULL
records_inserted         INTEGER
last_service_started_at  TIMESTAMP
uploaded_at              TIMESTAMP
uploaded_by              INTEGER FK → users.id
```

### 4.3 API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/login` | 로그인 → JWT |
| GET  | `/auth/me` | 현재 유저 |
| GET  | `/records` | 목록 (status/search 필터) |
| GET  | `/records/{id}` | 단건 조회 |
| PATCH | `/records/{id}/status` | 상태 변경 |
| PUT  | `/records/{id}/review` | 검수 저장 |
| GET  | `/records/export` | 검수완료 JSON 다운로드 |
| POST | `/logs/upload` | 로그 파일 업로드 + 파싱 |
| GET  | `/logs/uploads` | 업로드 이력 |

---

## 5. 프론트엔드 변경 사항

| 컴포넌트 | 변경 여부 | 내용 |
|----------|-----------|------|
| `FileContext.jsx` | **전면 교체** | File System API → fetch API |
| `App.jsx` | **수정** | Protected Route + LoginPage 추가 |
| `LoginPage.jsx` | **신규** | ID/PW 입력, JWT 저장 |
| `ListPage.jsx` | 최소 수정 | 로그 업로드 UI 추가 |
| `ReviewPage.jsx` | 유지 | - |
| `TextViewer.jsx` | 유지 | - |
| `PiiEditor.jsx` | 유지 | - |
| `PiiChip.jsx` | 유지 | - |
| `StatusBadge.jsx` | 유지 | - |

---

## 6. 구현 순서

1. `server/` 초기 세팅 (FastAPI, SQLAlchemy, requirements.txt)
2. DB 모델 + 테이블 생성 (models.py, database.py)
3. 로그 파서 (parser.py)
4. API 라우터: logs → records → auth
5. 프론트엔드: FileContext API 연동 교체
6. 프론트엔드: LoginPage + Protected Route
7. 환경변수 (.env) 및 CORS 정리
8. 통합 테스트 (test.log 업로드 → 검수 → export)
