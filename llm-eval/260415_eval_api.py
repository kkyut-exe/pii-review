import os
import json
import asyncio
import httpx
from typing import Optional, Dict, Any, List


# =============================
# 0) Chunking
# =============================
def make_chunks(text: str, *, chunk_chars: Optional[int], overlap: int = 200) -> List[str]:
    """
    chunk_chars:
      - None  : 청킹 안 함(원문 전체 1개)
      - int   : 해당 글자수로 청킹
    """
    if chunk_chars is None:
        return [text or ""]

    if not text:
        return [""]

    out = []
    i = 0
    n = len(text)
    while i < n:
        j = min(n, i + chunk_chars)
        out.append(text[i:j])
        if j == n:
            break
        i = max(0, j - overlap)
    return out


# =============================
# 1) Schema / keys
# =============================
BASE_KEYS = ["NAME", "ADDRESS", "POSTAL", "RESIDENT", "CONTACT", "EMAIL", "BIRTHDATE", "GENDER", "AGE"]


# =============================
# 2) API 요청
# =============================
async def call_infer_api(
    client: httpx.AsyncClient,
    base_url: str,
    model: str,
    content: str,
) -> str:
    """
    POST {base_url}/v1/responses 호출 후 choices[0].message.content(str) 반환.
    응답 스키마(OpenAI chat-completions 호환):
      {"id": ..., "object": "response", "choices": [{"message": {"role": "assistant", "content": "<json string>"}, "finish_reason": ...}], ...}
    """
    payload = {
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "model": model,
        "stream": False,
    }
    resp = await client.post(f"{base_url}/v1/responses", json=payload)
    resp.raise_for_status()
    data = resp.json()

    choices = data.get("choices") or []
    if not choices:
        raise KeyError(f"empty choices in response: {json.dumps(data, ensure_ascii=False)[:300]}")

    message = choices[0].get("message") or {}
    content_text = message.get("content")
    if content_text is None:
        raise KeyError(f"missing choices[0].message.content: {json.dumps(data, ensure_ascii=False)[:300]}")

    return content_text


# =============================
# 3) Parse / Merge
# =============================
def parse_json_response(text: str) -> Dict[str, Any]:
    """
    모델 출력이 JSON 문자열이라고 가정.
    실패하면 _parse_error 포함 dict로 반환.
    """
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            for k in BASE_KEYS:
                obj.setdefault(k, [])
            return obj
        return {"_parse_error": "response is not a dict", "_raw": text}
    except Exception as e:
        return {"_parse_error": str(e), "_raw": text}


def merge_values_keep_order(pred_dicts: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """
    청크 결과들을 문서 단위로 merge.
    - 타입별 concat 후, 중복 제거 + 최초 등장 순서 유지
    """
    seen = {k: set() for k in BASE_KEYS}
    merged = {k: [] for k in BASE_KEYS}

    for d in pred_dicts:
        for k in BASE_KEYS:
            for v in (d.get(k) or []):
                v = str(v)
                if v not in seen[k]:
                    seen[k].add(v)
                    merged[k].append(v)

    return merged


# =============================
# 4) JSONL I/O + run
# =============================
def iter_jsonl(path: str):
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


async def run_and_save(
    gt_jsonl_path: str,
    pred_jsonl_path: str,
    *,
    base_url: str,
    model: str,
    chunk_chars: Optional[int] = None,
    overlap: int = 200,
    save_chunk_responses: bool = True,
    timeout: float = 120.0,
):
    os.makedirs(os.path.dirname(pred_jsonl_path), exist_ok=True)

    async with httpx.AsyncClient(timeout=timeout) as client:
        with open(pred_jsonl_path, "w", encoding="utf-8") as wf:
            for i, row in enumerate(iter_jsonl(gt_jsonl_path), start=1):
                doc_id = row.get("id")
                input_text = row.get("input", "")

                chunks = make_chunks(input_text, chunk_chars=chunk_chars, overlap=overlap)

                chunk_objs: List[Dict[str, Any]] = []
                chunk_responses: List[Dict[str, Any]] = []

                for ch_idx, ch in enumerate(chunks):
                    try:
                        resp_text = await call_infer_api(client, base_url, model, ch)
                        print(f"[doc={doc_id}] chunk#{ch_idx+1}/{len(chunks)} -> len={len(resp_text)}")
                        resp_obj = parse_json_response(resp_text)
                    except Exception as e:
                        print(f"[doc={doc_id}] chunk#{ch_idx+1} ERROR: {e}")
                        resp_obj = {"_error": str(e)}

                    if save_chunk_responses:
                        chunk_responses.append(resp_obj)

                    if isinstance(resp_obj, dict) and all(k in resp_obj for k in BASE_KEYS):
                        chunk_objs.append(resp_obj)

                merged = merge_values_keep_order(chunk_objs)

                out = {
                    "id": doc_id,
                    "input": input_text,
                    "response": merged,
                    "chunking": {"chunk_chars": chunk_chars, "overlap": overlap},
                }
                if save_chunk_responses:
                    out["chunk_responses"] = chunk_responses

                wf.write(json.dumps(out, ensure_ascii=False) + "\n")

                if i % 5 == 0:
                    print(f"[saved] {i} docs")

    print(f"done -> {pred_jsonl_path}")


# =============================
# 5) 실행
# =============================
SERVER_URL = "http://192.168.5.11:8000"   # 추론 서버 주소
MODEL_NAME = "lora_extract"             # 서버에 등록된 모델명

CHUNK_SIZE = None  # None이면 전체 1청크, 정수면 해당 글자수로 청킹 (예: 3000)

gt_jsonl_path   = "data/golden/golden_260401_golden_set_v0.1.jsonl"
pred_jsonl_path = f"data/golden/pred/golden_v0.1_{MODEL_NAME}_{CHUNK_SIZE}.jsonl"

if __name__ == "__main__":
    asyncio.run(
        run_and_save(
            gt_jsonl_path,
            pred_jsonl_path,
            base_url=SERVER_URL,
            model=MODEL_NAME,
            chunk_chars=CHUNK_SIZE,
            overlap=0,
            save_chunk_responses=True,
            timeout=120.0,
        )
    )
