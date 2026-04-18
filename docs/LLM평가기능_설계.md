# LLM 평가 기능 설계

## 1. 목적

`llm-eval/` 폴더의 노트북 기반 평가 워크플로를 pii-review 웹 앱의 기능으로 통합한다.

- 입력: Golden Set (pii-review에서 검수 완료된 데이터)
- 처리: LLM 추론 서버 호출 → PII 추출 → 정답 대비 지표 계산
- 출력: 웹 UI에서 run별 지표·시각화 조회

## 2. 현재 워크플로 (이전)

1. **Golden Set 입력** (`llm-eval/data/golden/golden_*.jsonl`)
   - row: `{id, input, label: {NAME:[], ADDRESS:[], ...}}`
   - 9개 PII 카테고리 고정: `NAME ADDRESS POSTAL RESIDENT CONTACT EMAIL BIRTHDATE GENDER AGE`

2. **LLM 추론** (`llm-eval/260415_eval_api.py`)
   - `POST {server}/v1/responses` 호출 → JSON 응답 파싱
   - `make_chunks` 로 선택적 청킹, `merge_values_keep_order` 로 병합
   - 저장: `data/golden/pred/golden_v0.1_{MODEL}_{CHUNK}.jsonl`

3. **평가** (`labeling_new copy.ipynb`)
   - Strict micro P/R/F1 (필드별 + 전체) — 공식 지표
   - Normalized P/R/F1 — 진단용 (숫자만/소문자화 등 표기 차이 제거)
   - Doc Exact Match, worst F1 문서 리스트, GT 라벨 분포

## 3. 통합 후 아키텍처

### 3.1 단일 파이프라인 엔드포인트

`POST /evals/runs` 요청 한 번으로 스냅샷 → 추론 → 지표 계산까지 실행한다.
FastAPI `BackgroundTasks` 로 비동기 실행, 프론트는 `GET /evals/runs/{id}` 폴링으로 진행률 확인.

### 3.2 데이터 모델

#### `eval_runs`
run 메타 및 집계 정보.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `name` | str | 사용자 지정 run 이름 |
| `model_name` | str | 추론 서버에 등록된 모델명 |
| `server_url` | str | 추론 서버 base URL |
| `chunk_chars` | int? | 청크 크기 (None=청킹 안 함) |
| `overlap` | int | 청크 오버랩 |
| `golden_source` | enum | `db` \| `upload` |
| `golden_set_hash` | str | 골든셋 sha256 (재현성·비교용) |
| `artifact_dir` | str | `data/eval_runs/{run_id}/` 경로 |
| `status` | enum | `pending` \| `running` \| `done` \| `failed` |
| `progress` | float | 0.0 ~ 1.0 |
| `error_msg` | str? | 실패시 메시지 |
| `total_docs` | int | 전체 문서 수 |
| `matched_docs` | int | GT·Pred id 매칭된 수 |
| `started_at` / `finished_at` | datetime | |
| `created_by` | FK users | |

#### `eval_metrics`
run 단위 집계 지표 (Strict만 저장, Normalized는 on-the-fly).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | int | PK |
| `run_id` | FK | |
| `scope` | enum | `overall` \| `field` |
| `key` | str | `ALL` \| `NAME` \| `ADDRESS` \| ... |
| `tp` / `fp` / `fn` | int | |
| `precision` / `recall` / `f1` | float | |

> per-doc 지표는 DB에 저장하지 않음. 상세 페이지 진입 시 `predictions.jsonl` + `golden.jsonl` 을 읽어 계산.

### 3.3 파일 레이아웃

```
data/eval_runs/{run_id}/
  golden.jsonl        ← Golden 스냅샷 (DB export or 업로드 파일)
  predictions.jsonl   ← {id, response, chunk_responses} per doc
  meta.json           ← run 파라미터 백업 (디버그·재현용)
```

- **예측 결과는 무조건 파일**. DB는 `artifact_dir`만 보유.
- Golden도 run 시점에 스냅샷으로 고정 → records가 변경돼도 run 재현 가능.

### 3.4 지표 정의

평가 지표는 **TP, FP, FN, P, R, F1** 6종을 고정으로 사용.

- **Strict**: 원문 완전일치 집합 연산 (공식 지표, DB 저장)
- **Normalized**: 전화/주민/우편 → 숫자만, 이메일 → 소문자, 이름 → `"성명:"` prefix 제거 (진단용, 상세 페이지에서만 계산)

## 4. API 설계

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/evals/runs` | run 생성 + 백그라운드 실행 |
| `GET` | `/evals/runs` | run 리스트 (필터: 모델·상태·기간, 정렬: F1·날짜) |
| `GET` | `/evals/runs/{id}` | run 메타 + `eval_metrics` 조인 |
| `GET` | `/evals/runs/{id}/details` | 파일 읽어 per-doc diff·worst·Normalized 계산 |
| `DELETE` | `/evals/runs/{id}` | run 삭제 (artifact_dir도 제거) |
| `POST` | `/evals/golden/upload` | Golden Set 파일 업로드 (임시 저장 → run 생성 시 스냅샷) |

### `POST /evals/runs` 요청 예
```json
{
  "name": "v0.1 baseline",
  "model_name": "lora_extract",
  "server_url": "http://192.168.5.11:8000",
  "chunk_chars": null,
  "overlap": 0,
  "golden_source": "db",               // or "upload"
  "golden_upload_id": null             // upload 모드일 때만
}
```

## 5. 프론트엔드 페이지

| 경로 | 내용 |
|---|---|
| `/evals` | run 리스트 테이블 (이름·모델·F1·상태·생성일) |
| `/evals/new` | 폼: 이름, 모델, 서버URL, 청크 설정, Golden 소스 (DB / 업로드) |
| `/evals/:id` | run 진행률 또는 결과 대시보드 |

### `/evals/:id` 대시보드 구성
1. **상단 요약 카드** — Overall P/R/F1, TP/FP/FN, matched docs, Doc Exact Match
2. **필드별 지표 테이블 + 막대차트** — NAME/ADDRESS/... 9개
3. **Strict vs Normalized 토글** — 상세 페이지 API로 동적 재계산
4. **Worst F1 문서 리스트** — 클릭 시 diff (miss / extra) 패널
5. **개별 문서 diff 뷰어** — GT ↔ Pred 좌우 비교, 필드별 집합 차이 표시

## 6. 구현 파일 구성

### 서버 추가
```
server/
  models.py            ← EvalRun, EvalMetric 추가
  schemas.py           ← EvalRun* Pydantic 스키마 추가
  eval_runner.py       ← 260415_eval_api.py 포팅 (백그라운드 실행)
  eval_metrics.py      ← 노트북 셀 4–6 로직 (Strict/Normalized PRF 계산)
  router/
    evals.py           ← /evals/* 엔드포인트
```

### 프론트 추가
```
web/src/
  pages/
    EvalListPage.jsx
    EvalNewPage.jsx
    EvalDetailPage.jsx
  components/
    MetricsTable.jsx
    FieldBarChart.jsx
    DocDiffPanel.jsx
  context/
    EvalContext.jsx    ← /evals API 추상화
```

### 데이터 디렉터리
```
data/
  app.db
  eval_runs/           ← run별 폴더 (신규)
  eval_uploads/        ← 업로드된 Golden 임시 저장소 (신규)
```

## 7. 구현 순서

1. **스키마** — `models.py`에 `EvalRun`, `EvalMetric` 추가, 테이블 생성
2. **Golden 스냅샷 유틸** — DB records → jsonl export 재사용, 업로드 파일은 `/evals/golden/upload` 로 저장
3. **추론 러너** — `260415_eval_api.py` 의 `run_and_save` 를 `eval_runner.py` 로 포팅, `BackgroundTasks` 로 실행, `progress` 갱신
4. **메트릭 계산기** — `eval_metrics.py` 에 Strict/Normalized PRF 함수, diff 함수 구현
5. **라우터** — `router/evals.py` 5개 엔드포인트
6. **테스트** — `tests/test_evals.py` (러너 단위 테스트는 추론 서버 mock)
7. **프론트** — 3개 페이지 + 차트 컴포넌트

## 8. 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 평가 실행 | 한 번에 요청하는 단일 엔드포인트 |
| 다중 모델 비교 | 이번 단계는 단일 모델, `golden_set_hash` 로 향후 확장 여지 확보 |
| run 메타 저장 | DB (`eval_runs`, `eval_metrics`) |
| 예측 결과 저장 | 파일 (`predictions.jsonl`), DB는 폴더 경로만 |
| Golden Set 소스 | DB(reviewed records) / 파일 업로드 모두 지원 |
| Normalized 지표 | DB 저장 안 함, 상세 페이지에서 동적 계산 |
| 기본 지표 | TP, FP, FN, P, R, F1 (6종 고정) |
