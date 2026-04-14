# server/parser.py
import ast
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}")
BLOCK_START = "🔍 LLMExtractService 시작"


@dataclass
class ParsedBlock:
    path: str
    source_filename: str
    source: str          # 'text' | 'ocr'
    service_started_at: datetime
    doc_text: str
    pii_dict: dict


def _detect_source(path: str) -> str:
    filename = path.rsplit("/", 1)[-1]
    if "ocr_chunked" in filename:
        return "ocr"
    return "text"


def _collect_multiline(lines: list[str], start_idx: int) -> tuple[str, int]:
    """다음 타임스탬프 줄이 나올 때까지 줄을 수집한다."""
    result = []
    i = start_idx
    while i < len(lines):
        if TIMESTAMP_RE.match(lines[i]):
            break
        result.append(lines[i])
        i += 1
    return "\n".join(result).strip(), i


def _parse_block(lines: list[str]) -> Optional[ParsedBlock]:
    if not lines:
        return None

    # 첫 줄: 타임스탬프 + BLOCK_START + path
    first = lines[0]
    ts_match = TIMESTAMP_RE.match(first)
    if not ts_match:
        return None

    service_started_at = datetime.strptime(first[:19], "%Y-%m-%d %H:%M:%S")

    path_match = re.search(r"path:\s*(\S+)", first)
    if not path_match:
        return None
    path = path_match.group(1).rstrip(",")
    source = _detect_source(path)

    source_filename = ""
    doc_text = ""
    pii_dict = None
    has_preprocess = False

    i = 1
    while i < len(lines):
        line = lines[i]

        if "[Source] source_filename=" in line:
            # 값은 다음 줄에 있음
            if i + 1 < len(lines) and not TIMESTAMP_RE.match(lines[i + 1]):
                source_filename = lines[i + 1].strip()
                i += 2
            else:
                source_filename = line.split("source_filename=", 1)[1].strip()
                i += 1

        elif "[preprocess]" in line and "text_len=" in line:
            has_preprocess = True
            i += 1

        elif "[run_pipeline] doc_text=" in line:
            doc_text, i = _collect_multiline(lines, i + 1)

        elif "[inference]" in line and "pii_dict=" in line:
            raw, i = _collect_multiline(lines, i + 1)
            try:
                pii_dict = ast.literal_eval(raw)
            except (ValueError, SyntaxError):
                return None
            if not isinstance(pii_dict, dict):
                return None

        else:
            i += 1

    if not has_preprocess or not doc_text.strip() or pii_dict is None:
        return None

    return ParsedBlock(
        path=path,
        source_filename=source_filename,
        source=source,
        service_started_at=service_started_at,
        doc_text=doc_text,
        pii_dict=pii_dict,
    )


def parse_log(text: str) -> list[ParsedBlock]:
    """로그 텍스트를 파싱하여 ParsedBlock 목록을 반환한다. pii_dict 없는 블록은 제외."""
    lines = text.splitlines()
    block_starts = [i for i, line in enumerate(lines) if BLOCK_START in line]

    blocks = []
    for bi, start in enumerate(block_starts):
        end = block_starts[bi + 1] if bi + 1 < len(block_starts) else len(lines)
        block = _parse_block(lines[start:end])
        if block:
            blocks.append(block)

    return blocks
