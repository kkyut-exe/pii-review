import os
import json
import asyncio
from uuid import uuid4
from typing import Optional, Dict, Any, List

from vllm.engine.arg_utils import AsyncEngineArgs
from vllm.engine.async_llm_engine import AsyncLLMEngine
from vllm import SamplingParams
from vllm.sampling_params import GuidedDecodingParams  # vLLM 버전에 따라 경로가 다를 수 있음


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
    # end if

    if not text:
        return [""]
    # end if

    out = []
    i = 0
    n = len(text)
    while i < n:
        j = min(n, i + chunk_chars)
        out.append(text[i:j])
        if j == n:
            break
        # end if
        i = max(0, j - overlap)
    # end while
    return out
# end def

# =============================
# 1) Prompt
# =============================
### 26.02.26 학습 프롬프트
EXTRACT_PROMPT_TEMPLATE = """
<bos><start_of_turn>user
다음 텍스트에서 개인정보(PII)를 추출해 JSON만 반환하세요.

규칙:
- 키는 [NAME, ADDRESS, POSTAL, RESIDENT, CONTACT, EMAIL, BIRTHDATE, GENDER, AGE]만 사용합니다.
- 각 값은 문자열 리스트입니다. 없으면 빈 리스트 [].
- 텍스트에 명시된 것만 추출하세요. 추정/계산/보완(예: 나이 계산, 성별 추정) 금지.
- 주민번호/연락처/이메일 등은 원문 그대로(마스킹 포함) 추출하세요.
- 같은 값이 여러 번 나오면 1번만 포함하고, 등장 순서를 유지하세요.
- 가능한 한 “부분”이 아니라 “완전한 항목”으로 추출하세요(예: 이메일 전체, 전화번호 전체, 주소는 원문 단위).
- 결과는 유효한 JSON 객체 1개만 출력하고, 코드블록/설명/추가 텍스트는 절대 출력하지 마세요.
{text}
<end_of_turn>
<start_of_turn>model

""".strip()

def build_prompt(input_text: str) -> str:
    return EXTRACT_PROMPT_TEMPLATE.format(text=input_text)
# end def

# =============================
# 2) Load LLM
# =============================


def load_llm(model_dir: str, gpu_id: int) -> AsyncLLMEngine:
    os.environ["CUDA_VISIBLE_DEVICES"] = str(gpu_id)
    engine_args = AsyncEngineArgs(
        model=model_dir,
        tokenizer=model_dir,
        dtype="bfloat16",
        tensor_parallel_size=1,
        max_num_batched_tokens=(8192 * 4),
        max_model_len=8192,
        gpu_memory_utilization=0.5,
        max_num_seqs=4,
        enforce_eager=False,
    )
    return AsyncLLMEngine.from_engine_args(engine_args)


# =============================
# 3) Sampling params
# =============================
BASE_KEYS = ["NAME", "ADDRESS", "POSTAL", "RESIDENT", "CONTACT", "EMAIL", "BIRTHDATE", "GENDER", "AGE"]

PII_STR_SCHEMA = {
    "type": "object",
    "properties": {k: {"type": "array", "items": {"type": "string"}} for k in BASE_KEYS},
    "required": BASE_KEYS,
    "additionalProperties": False,
}

def make_sampling_params():
    return SamplingParams(
        temperature=0,
        max_tokens=4096,
        stop=["<end_of_turn>"],
        guided_decoding=GuidedDecodingParams(json=PII_STR_SCHEMA),
    )


# =============================
# 4) vLLM async generate helper
# =============================
# async def generate_one(engine: AsyncLLMEngine, prompt: str, sampling_params: SamplingParams) -> str:
#     request_id = str(uuid4())
#     final_text = ""

#     async for req_out in engine.generate(prompt, sampling_params, request_id):
#         if req_out.outputs:
#             final_text = req_out.outputs[0].text

#     return (final_text or "").strip()

async def generate_one(engine: AsyncLLMEngine, prompt: str, sampling_params: SamplingParams) -> str:
    request_id = str(uuid4())
    final_text = ""
    last_finish_reason: Optional[str] = None
    last_stop_reason: Optional[str] = None
    last_num_tokens: Optional[int] = None

    i = 0
    async for req_out in engine.generate(prompt, sampling_params, request_id):
        i += 1

        if not getattr(req_out, "outputs", None):
            print(f"[{request_id}] chunk#{i}: outputs=None/empty")
            continue

        out0 = req_out.outputs[0]
        text = getattr(out0, "text", "") or ""
        final_text = text  # vLLM은 보통 누적 텍스트를 여기 넣어줌

        # --- 디버깅 메타 ---
        fr = getattr(out0, "finish_reason", None)
        sr = getattr(out0, "stop_reason", None)
        token_ids = getattr(out0, "token_ids", None)

        if token_ids is not None:
            try:
                last_num_tokens = len(token_ids)
            except Exception:
                last_num_tokens = None

        # 마지막 chunk에서만 값이 채워지는 경우가 많아서, 최신 값을 저장
        if fr is not None:
            last_finish_reason = fr
        if sr is not None:
            last_stop_reason = sr

        # --- 진행 로그 (너무 시끄러우면 조건을 더 타이트하게) ---
        tail = text[-80:].replace("\n", "\\n")
        print(
            f"[{request_id}] chunk#{i} "
            f"len={len(text)} endswith}}={text.rstrip().endswith('}')} "
            f"finish_reason={fr} stop_reason={sr} "
            f"tokens={last_num_tokens} tail='{tail}'"
        )

    # --- 최종 요약 로그 ---
    print(
        f"[{request_id}] FINAL "
        f"chunks={i} len={len(final_text)} endswith}}={final_text.rstrip().endswith('}')} "
        f"finish_reason={last_finish_reason} stop_reason={last_stop_reason} "
        f"tokens={last_num_tokens}"
    )

    return (final_text or "").strip()


def parse_json_response(text: str) -> Dict[str, Any]:
    """
    모델 출력이 JSON 문자열이라고 가정.
    실패하면 _parse_error 포함 dict로 반환.
    """
    try:
        obj = json.loads(text)
        # 스키마 키 누락 대비(안전빵)
        if isinstance(obj, dict):
            for k in BASE_KEYS:
                obj.setdefault(k, [])
            # 키 초과는 남겨두되, merge에서는 BASE_KEYS만 사용
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
# 5) jsonl I/O + run
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
    chunk_chars: Optional[int] = None,  # ✅ None이면 전체 1청크
    overlap: int = 200,
    save_chunk_responses: bool = True,  # ✅ 크면 False로 꺼도 됨
):
    engine = load_llm(MODEL_DIR, GPU_ID)
    sp = make_sampling_params()

    os.makedirs(os.path.dirname(pred_jsonl_path), exist_ok=True)

    with open(pred_jsonl_path, "w", encoding="utf-8") as wf:
        for i, row in enumerate(iter_jsonl(gt_jsonl_path), start=1):
            doc_id = row.get("id")
            input_text = row.get("input", "")

            chunks = make_chunks(input_text, chunk_chars=chunk_chars, overlap=overlap)

            chunk_objs: List[Dict[str, Any]] = []
            chunk_responses: List[Dict[str, Any]] = []

            for ch in chunks:
                prompt = build_prompt(ch)
                try:
                    resp_text = await generate_one(engine, prompt, sp)
                    resp_obj = parse_json_response(resp_text)
                except Exception as e:
                    resp_obj = {"_error": str(e)}

                # 디버그/검수용 저장
                if save_chunk_responses:
                    chunk_responses.append(resp_obj)

                # merge 대상으로 쓸 수 있는 응답만 수집
                if isinstance(resp_obj, dict) and all(k in resp_obj for k in BASE_KEYS):
                    chunk_objs.append(resp_obj)

            merged = merge_values_keep_order(chunk_objs)

            out = {
                "id": doc_id,
                "input": input_text,
                "response": merged,  # ✅ 문서 최종 예측(dict)
                "chunking": {"chunk_chars": chunk_chars, "overlap": overlap},
            }
            if save_chunk_responses:
                out["chunk_responses"] = chunk_responses

            wf.write(json.dumps(out, ensure_ascii=False) + "\n")

            if i % 5 == 0:
                print(f"[saved] {i} docs")

    print(f"done -> {pred_jsonl_path}")


# =============================
# 6) 실행
# =============================
MODEL_FOLDER = "260226_gemma3_stage2_lora_ep5_merged_ckpt-4000"
MODEL_DIR = f"/home/llm-ai-server/weights/merge/{MODEL_FOLDER}"
GPU_ID = 7

CHUNK_SIZE = None


gt_jsonl_path = "/home/llm-ai-server/260415_eval/datasets/golden_260401_golden_set_v0.1.jsonl"
# gt_jsonl_path = "/home/llm-ai-server/data/260128_eval/test_datasets/260203_stage1_test_id.jsonl"
pred_jsonl_path = f"/home/llm-ai-server/260415_eval/pred_results/golden_v0.1_{MODEL_FOLDER}_{CHUNK_SIZE}.jsonl"
# pred_jsonl_path = f"/home/llm-ai-server/data/260128_eval/260206_gemma3_stage1_lora_ep5_merged_ckpt-20_{CHUNK_SIZE}.jsonl"

if __name__ == "__main__":
    # ✅ chunk_chars=None이면 전체 1청크 (긴 문서에서 에러나면 숫자로 바꿔)
    # 예: chunk_chars=3000, overlap=200
    asyncio.run(
        run_and_save(
            gt_jsonl_path,
            pred_jsonl_path,
            chunk_chars=CHUNK_SIZE,
            overlap=0,
            save_chunk_responses=True,
        )
    )





# import os
# import asyncio

# BASE_TRAIN_DIR = "/home/llm-ai-server/weights/train/260205_transformer_stage1/checkpoint-492"  # train 상위 폴더
# PRED_OUT_DIR   = "/home/llm-ai-server/data/260128_eval/stage1_testset_pred/train"  # pred 저장 폴더

# GT_JSONL_PATH  = "/home/llm-ai-server/data/260128_eval/test_datasets/260203_stage1_test_id.jsonl"
# GPU_ID = 2
# CHUNK_SIZE = 500

# def list_merge_model_dirs(base_dir: str):
#     """base_dir 하위 폴더 중 이름에 'merge' 포함된 폴더만 반환(정렬 포함)"""
#     dirs = []
#     for name in os.listdir(base_dir):
#         full = os.path.join(base_dir, name)
#         if os.path.isdir(full) and ("merge" in name.lower()):
#             dirs.append(full)
#     dirs.sort()
#     return dirs

# async def run_all_merged_models():
#     model_dirs = list_merge_model_dirs(BASE_TRAIN_DIR)

#     if not model_dirs:
#         raise RuntimeError(f"'merge' 포함 폴더가 없음: {BASE_TRAIN_DIR}")

#     os.makedirs(PRED_OUT_DIR, exist_ok=True)

#     for model_dir in model_dirs:
#         folder_name = os.path.basename(model_dir.rstrip("/"))
#         pred_jsonl_path = os.path.join(PRED_OUT_DIR, f"260205_transformer_stage1_ckpt-492_{CHUNK_SIZE}.jsonl")

#         print("\n==============================")
#         print(f"MODEL_DIR : {model_dir}")
#         print(f"GT        : {GT_JSONL_PATH}")
#         print(f"PRED_OUT  : {pred_jsonl_path}")
#         print("==============================")

#         # run_and_save 내부에서 참조하는 MODEL_DIR 방식이면 전역으로 덮어쓰기
#         # (네 코드가 MODEL_DIR을 상단에 두는 스타일이라 이게 제일 덜 건드림)
#         global MODEL_DIR
#         MODEL_DIR = model_dir

#         await run_and_save(
#             GT_JSONL_PATH,
#             pred_jsonl_path,
#             chunk_chars=CHUNK_SIZE,
#             overlap=0,
#             save_chunk_responses=True,
#         )

# if __name__ == "__main__":
#     asyncio.run(run_all_merged_models())