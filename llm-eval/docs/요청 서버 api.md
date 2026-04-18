# 추론 API 기능 정의 및 명세서

## 1. 문서 목적

본 문서는 현재 프로젝트에 구현된 추론 API의 기능 정의, 요청/응답 스키마, 내부 처리 흐름, 호출 예시를 정리한 문서이다.  
기준 코드는 `app/api/routes/inference.py`, `app/schemas/*.py`, `app/orchestrator/job_orchestrator.py`, `app/tasks/*/*_engine.py` 이다.

## 2. 기능 개요

- 목적: 클라이언트 요청을 받아 작업 유형에 맞는 추론 엔진으로 전달하고 결과를 표준 응답 형식으로 반환한다.
- 지원 엔드포인트: `POST /v1/responses`
- 지원 작업:
  - LLM 기반 개인정보 추출/치환 계열 추론
  - OCR 기반 이미지 추론
- 내부 처리 방식:
  1. 요청 수신
  2. `tools[0].type` 기준으로 작업 유형 판별
  3. 작업 유형에 맞는 엔진 선택
  4. 내부 모델 서버로 요청 변환 및 전달
  5. 표준 응답 스키마로 재구성 후 반환

## 3. 엔드포인트 명세

### 3.1 추론 요청

- Method: `POST`
- Path: `/v1/responses`
- Content-Type: `application/json`

### 3.2 성공 응답

- Status: `200 OK`

### 3.3 오류 응답

- Status: `400 Bad Request`
- 조건:
  - `tools[0].type` 값이 유효하지 않은 경우
  - 지원하지 않는 작업 유형인 경우
  - `model` 누락 또는 내부 검증 실패 시

오류 응답 예시:

```json
{
  "detail": "invalid task: ocr"
}
```

## 4. 요청 스키마

루트 요청 객체는 `InferRequest` 기준이다.

```json
{
  "model": "string",
  "input": {},
  "tools": [
    {
      "type": "string",
      "metrics": [],
      "iou_thresh": 0.5
    }
  ]
}
```

### 4.1 공통 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `model` | `string` | Y | 호출 대상 모델명 |
| `input` | `object` | Y | 작업 유형에 따라 LLM 또는 OCR 입력 스키마 사용 |
| `tools` | `array<object>` | Y | 작업 정의 목록 |

### 4.2 `tools` 객체

현재 구현에서 실제로 사용하는 값은 `tools[0]` 하나이며, 첫 번째 항목의 `type` 값으로 작업이 결정된다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `type` | `string` | Y | 작업 유형 |
| `metrics` | `string[]` | N | 평가용 확장 필드, 추론 호출에서는 미사용 |
| `iou_thresh` | `float` | N | 평가용 확장 필드, 추론 호출에서는 미사용 |

### 4.3 작업 유형 값

코드 기준 유효 enum 값은 아래와 같다.

| 값 | 의미 | 추론 API 지원 여부 |
|---|---|---:|
| `pii_extract` | LLM 기반 개인정보 추출 계열 작업 | Y |
| `pii_pseudo` | LLM 기반 개인정보 치환 계열 작업 | N |
| `inference` | OCR 추론 작업 | Y |
| `eval` | OCR 평가 작업 | N |

## 5. 작업별 입력 스키마

## 5.1 LLM 추론 입력

`tools[0].type = "pii_extract"` 인 경우 사용한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `mode` | `"extract" \| "pseudo"` | Y | 추론 모드 |
| `content` | `string` | Y | 입력 텍스트 |

예시:

```json
{
  "model": "pii-llm-v1",
  "input": {
    "mode": "extract",
    "content": "홍길동의 전화번호는 010-1234-5678 입니다."
  },
  "tools": [
    {
      "type": "pii_extract"
    }
  ]
}
```

### 5.2 OCR 추론 입력

`tools[0].type = "inference"` 인 경우 사용한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `version` | `string` | Y | OCR 모델 버전 |
| `dataset` | `string` | Y | `dataset_base_dir` 하위 데이터셋 경로 |
| `img_size` | `integer` | N | 입력 이미지 크기, 기본값 `960`, 범위 `32~1024` |
| `img_format` | `string` | N | 이미지 포맷, 기본값 `bgr` |

예시:

```json
{
  "model": "paddleocr-v1",
  "input": {
    "version": "v1",
    "dataset": "ocr/sample_set",
    "img_size": 960,
    "img_format": "bgr"
  },
  "tools": [
    {
      "type": "inference"
    }
  ]
}
```

## 6. 응답 스키마

루트 응답 객체는 `InferResponse` 기준이다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `id` | `string` | Y | 응답 ID |
| `object` | `"response"` | Y | 객체 타입 |
| `created_at` | `integer` | Y | 생성 시각(epoch) |
| `model` | `string` | Y | 모델명 |
| `output` | `object` | Y | 작업 유형별 결과 |

### 6.1 LLM 추론 응답

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `output.content` | `string` | Y | 모델이 반환한 텍스트 |

예시:

```json
{
  "id": "resp_123",
  "object": "response",
  "created_at": 1710000000,
  "model": "pii-llm-v1",
  "output": {
    "content": "{\"NAME\":\"홍길동\",\"CONTACT\":\"010-1234-5678\"}"
  }
}
```

### 6.2 OCR 추론 응답

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `output.mode` | `string` | Y | 현재 구현상 `"inference"` 고정 |
| `output.content` | `array` | Y | OCR 서버 응답 목록과 처리한 파일 경로 목록 |

예시:

```json
{
  "id": "23k2o3k32",
  "object": "response",
  "created_at": 1710000000,
  "model": "paddleocr-v1",
  "output": {
    "mode": "inference",
    "content": [
      [
        {
          "id": "task_001",
          "created_at": "2026-04-14T00:00:00",
          "version": "v1",
          "content": {}
        }
      ],
      [
        "/data/dataset/sample1.jpg"
      ]
    ]
  }
}
```

## 7. 내부 처리 흐름

### 7.1 공통 흐름

1. 클라이언트가 `POST /v1/responses` 호출
2. `JobOrchestrator.infer()` 실행
3. `ModelResolver.resolve()` 에서 작업 유형 검증
4. 작업 유형에 따라 엔진 로드
   - `pii_extract` -> `LLMEngine`
   - `inference` -> `OCREngine`
5. 엔진이 내부 모델 서버 호출
6. 프로젝트 표준 응답(`InferResponse`)으로 반환

### 7.2 LLM 내부 변환 규격

외부 요청:

```json
{
  "model": "pii-llm-v1",
  "input": {
    "mode": "extract",
    "content": "..."
  },
  "tools": [
    {
      "type": "pii_extract"
    }
  ]
}
```

내부 LLM 서버 전달 형식:

```json
{
  "model": "pii-llm-v1",
  "messages": [
    {
      "role": "user",
      "content": "..."
    }
  ],
  "stream": false
}
```

호출 대상 URL:

- `{llm_base_url}/v1/responses`

### 7.3 OCR 내부 변환 규격

외부 요청의 `input.dataset` 은 `dataset_base_dir` 하위 경로로 해석된다.  
엔진은 해당 경로 내 파일 목록을 읽고, 각 파일을 base64 문자열로 변환해 OCR 서버에 개별 요청한다.

내부 OCR 서버 전달 형식:

```json
{
  "version": "v1",
  "image": "<base64-encoded-image>"
}
```

호출 대상 URL:

- `{ocr_base_url}/v1/responses`

## 8. 환경 변수

`app/core/config.py` 기준 주요 설정값은 아래와 같다.

| 변수명 | 설명 |
|---|---|
| `llm_base_url` | LLM 추론 서버 Base URL |
| `ocr_base_url` | OCR 추론 서버 Base URL |
| `eval_base_dir` | 평가 결과 저장/조회 기준 경로 |
| `dataset_base_dir` | OCR 데이터셋 기준 경로 |

## 9. 호출 예시

### 9.1 cURL 예시: LLM 추론

```bash
curl -X POST http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pii-llm-v1",
    "input": {
      "mode": "extract",
      "content": "홍길동의 주민등록번호는 900101-1234567 입니다."
    },
    "tools": [
      {
        "type": "pii_extract"
      }
    ]
  }'
```

### 9.2 cURL 예시: OCR 추론

```bash
curl -X POST http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "paddleocr-v1",
    "input": {
      "version": "v1",
      "dataset": "ocr/sample_set",
      "img_size": 960,
      "img_format": "bgr"
    },
    "tools": [
      {
        "type": "inference"
      }
    ]
  }'
```

## 10. 구현상 주의사항

현재 코드 기준으로 아래 사항을 함께 인지하고 사용하는 것이 좋다.

1. `tools` 배열 전체를 사용하지 않고 `tools[0]` 만 참조한다.
2. OCR 추론의 작업 타입은 예제 파일에 있는 `ocr` 가 아니라, 실제 enum 기준으로는 `inference` 여야 한다.
3. `pii_pseudo` 는 enum 에 존재하지만 추론 엔진 매핑에는 직접 연결되어 있지 않다.
4. OCR 응답의 `id` 는 현재 고정값 `"23k2o3k32"` 로 설정되어 있다.
5. OCR 응답의 `output.content` 는 정형 필드가 아니라 `[응답목록, 파일경로목록]` 구조의 리스트다.
6. 모델 검증 로직은 현재 구현상 OCR 계열에서 실질적으로 우회될 수 있으므로, 운영 시 별도 검증 보완이 필요할 수 있다.

## 11. 관련 소스

- `app/main.py`
- `app/api/routes/inference.py`
- `app/orchestrator/job_orchestrator.py`
- `app/resolvers/model_resolver.py`
- `app/schemas/inference.py`
- `app/schemas/common.py`
- `app/schemas/llm.py`
- `app/schemas/ocr.py`
- `app/tasks/llm/llm_engine.py`
- `app/tasks/ocr/ocr_engine.py`
