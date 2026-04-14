# tests/test_parser.py
from datetime import datetime
from server.parser import parse_log, ParsedBlock

SIMPLE_LOG = """\
2026-04-10 21:19:56,769 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/pdf-260410-abc/texts_chunked.json
2026-04-10 21:19:56,843 [INFO] [Source] source_filename=
test.pdf

2026-04-10 21:19:56,907 [INFO] [preprocess] text_len=100, chunks=1
2026-04-10 21:19:56,907 [INFO] [run_pipeline] doc_text=
Hello world

2026-04-10 21:19:59,623 [INFO] [inference] [1/1] pii_dict=
{'NAME': ['홍길동'], 'ADDRESS': [], 'POSTAL': [], 'RESIDENT': [], 'CONTACT': [], 'EMAIL': [], 'BIRTHDATE': [], 'GENDER': [], 'AGE': []}

"""

SKIP_LOG = """\
2026-04-10 21:20:00,000 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/docx-260410-xyz/texts_chunked.json
2026-04-10 21:20:00,100 [INFO] [Source] source_filename=
empty.docx

"""

NO_PREPROCESS_LOG = """\
2026-04-10 21:19:56,769 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/pdf-260410-abc/texts_chunked.json
2026-04-10 21:19:56,843 [INFO] [Source] source_filename=
test.pdf

2026-04-10 21:19:56,907 [INFO] [run_pipeline] doc_text=
Hello world

2026-04-10 21:19:59,623 [INFO] [inference] [1/1] pii_dict=
{'NAME': ['홍길동'], 'ADDRESS': [], 'POSTAL': [], 'RESIDENT': [], 'CONTACT': [], 'EMAIL': [], 'BIRTHDATE': [], 'GENDER': [], 'AGE': []}

"""

EMPTY_DOC_TEXT_LOG = """\
2026-04-10 21:19:56,769 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/pdf-260410-empty/texts_chunked.json
2026-04-10 21:19:56,843 [INFO] [Source] source_filename=
test.pdf

2026-04-10 21:19:56,907 [INFO] [preprocess] text_len=100, chunks=1
2026-04-10 21:19:56,907 [INFO] [run_pipeline] doc_text=

2026-04-10 21:19:59,623 [INFO] [inference] [1/1] pii_dict=
{'NAME': ['홍길동'], 'ADDRESS': [], 'POSTAL': [], 'RESIDENT': [], 'CONTACT': [], 'EMAIL': [], 'BIRTHDATE': [], 'GENDER': [], 'AGE': []}

"""

OCR_LOG = """\
2026-04-10 21:20:33,671 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/docx-260410-xyz/images_update_lp_ocr_chunked.json
2026-04-10 21:20:33,739 [INFO] [Source] source_filename=
doc.docx

2026-04-10 21:20:33,800 [INFO] [preprocess] text_len=50, chunks=1
2026-04-10 21:20:33,800 [INFO] [run_pipeline] doc_text=
OCR 텍스트

2026-04-10 21:20:34,848 [INFO] [inference] [1/1] pii_dict=
{'NAME': [], 'ADDRESS': [], 'POSTAL': [], 'RESIDENT': [], 'CONTACT': [], 'EMAIL': [], 'BIRTHDATE': [], 'GENDER': [], 'AGE': []}

"""


def test_parse_single_block():
    blocks = parse_log(SIMPLE_LOG)
    assert len(blocks) == 1
    b = blocks[0]
    assert isinstance(b, ParsedBlock)
    assert b.path == "/tmp/pdf-260410-abc/texts_chunked.json"
    assert b.source_filename == "test.pdf"
    assert b.source == "text"
    assert b.service_started_at == datetime(2026, 4, 10, 21, 19, 56)
    assert b.doc_text == "Hello world"
    assert b.pii_dict["NAME"] == ["홍길동"]
    assert b.pii_dict["ADDRESS"] == []


def test_skip_block_without_pii_dict():
    blocks = parse_log(SKIP_LOG)
    assert len(blocks) == 0


def test_skip_block_without_preprocess():
    blocks = parse_log(NO_PREPROCESS_LOG)
    assert len(blocks) == 0


def test_skip_block_with_empty_doc_text():
    blocks = parse_log(EMPTY_DOC_TEXT_LOG)
    assert len(blocks) == 0


def test_ocr_source_detection():
    blocks = parse_log(OCR_LOG)
    assert len(blocks) == 1
    assert blocks[0].source == "ocr"
    assert blocks[0].path == "/tmp/docx-260410-xyz/images_update_lp_ocr_chunked.json"


def test_multi_block_log():
    combined = SIMPLE_LOG + SKIP_LOG + OCR_LOG
    blocks = parse_log(combined)
    assert len(blocks) == 2
    paths = [b.path for b in blocks]
    assert "/tmp/pdf-260410-abc/texts_chunked.json" in paths
    assert "/tmp/docx-260410-xyz/images_update_lp_ocr_chunked.json" in paths
