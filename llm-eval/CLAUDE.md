# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a research/evaluation workspace for a **PII (Personal Identifiable Information) extraction** system. The system fine-tunes a Gemma3 model (via LoRA) to extract PII from Korean documents and evaluates extraction quality.

## Running Inference

The primary eval script is designed to run on a remote GPU server (`/home/llm-ai-server/...`):

```bash
# Run full eval (single chunk, no splitting)
python 260415_eval.py

# Key config variables at the bottom of 260415_eval.py:
# MODEL_FOLDER - which merged checkpoint to use
# GPU_ID       - which GPU (0-indexed)
# CHUNK_SIZE   - None = full doc, int = chunk by N characters
# gt_jsonl_path / pred_jsonl_path - input/output paths
```

The notebook `labeling_new copy.ipynb` contains evaluation and analysis cells — run them top-to-bottom after setting `GT_PATH` and `PRED_PATH` at the top of each section.

## Architecture

### Inference Pipeline (`260415_eval.py`)

1. **Input**: JSONL where each row has `id` and `input` (Korean text)
2. **Chunking** (`make_chunks`): Optionally splits long documents with overlap
3. **Prompt**: Gemma3 chat-format prompt instructing JSON-only PII extraction
4. **LLM**: vLLM `AsyncLLMEngine` with `GuidedDecodingParams(json=...)` to enforce output schema
5. **Schema enforcement**: Output must match `{NAME: [], ADDRESS: [], POSTAL: [], RESIDENT: [], CONTACT: [], EMAIL: [], BIRTHDATE: [], GENDER: [], AGE: []}` — all keys required, values are string lists
6. **Merge**: Multiple chunk responses are deduplicated and merged in order (`merge_values_keep_order`)
7. **Output**: JSONL with `id`, `input`, `response` (merged dict), and optional `chunk_responses`

### Evaluation Notebook (`labeling_new copy.ipynb`)

Cells are organized as independent analysis blocks that share `BASE_KEYS` and utility functions. Each block sets its own `GT_PATH`/`PRED_PATH`. Key metrics:
- **Strict micro P/R/F1** per field and overall — primary metric
- **Normalized** variant (strips punctuation from phone/ID numbers, lowercases emails) — diagnostic only, not the official score
- **Document exact match** — all fields must match exactly
- **Segment breakdown** by `source` and `doc_type` fields in the GT

### Inference Server API (`docs/요청 서버 api.md`)

A separate FastAPI server (source in `app/`) serves the model. Entry point: `POST /v1/responses`. Task type is determined by `tools[0].type`:
- `pii_extract` → `LLMEngine`: sends `input.content` as user message to internal LLM server at `{llm_base_url}/v1/responses`
- `inference` → `OCREngine`: reads files from `dataset_base_dir/{input.dataset}`, base64-encodes them, sends to `{ocr_base_url}/v1/responses`

Key config in `app/core/config.py`: `llm_base_url`, `ocr_base_url`, `eval_base_dir`, `dataset_base_dir`.

## PII Field Schema

All 9 keys are always present in outputs, values are `list[str]`:

| Key | Meaning |
|---|---|
| `NAME` | Person names |
| `ADDRESS` | Full addresses |
| `POSTAL` | Postal codes |
| `RESIDENT` | Korean resident registration numbers (주민번호) |
| `CONTACT` | Phone numbers |
| `EMAIL` | Email addresses |
| `BIRTHDATE` | Birth dates |
| `GENDER` | Gender |
| `AGE` | Age values |

## Data Format

**GT JSONL** rows: `{id, input, label: {NAME: [], ...}}` — some files use `label_values` instead of `label` (auto-detected in notebook).

**Pred JSONL** rows: `{id, input, response: {NAME: [], ...}, chunking: {...}}`.

The eval code matches rows by `id` and only scores the intersection.

## vLLM Notes

- Engine is initialized with `gpu_memory_utilization=0.5`, `max_model_len=8192`, `tensor_parallel_size=1`
- `GuidedDecodingParams(json=PII_STR_SCHEMA)` enforces valid JSON output — if changing schema, update `PII_STR_SCHEMA` and `BASE_KEYS` together
- `temperature=0`, `stop=["<end_of_turn>"]` (Gemma chat format)
- The `generate_one` function streams chunks and logs per-chunk debug info; `final_text` accumulates the full decoded string
