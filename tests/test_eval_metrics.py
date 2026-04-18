# tests/test_eval_metrics.py
"""eval_metrics 모듈 단위 테스트."""
from server.eval_metrics import (
    BASE_KEYS,
    aggregate,
    aggregate_normalized,
    doc_diff,
    eval_pair,
    norm_value,
    normalize_for_diag,
    normalize_obj,
    prf,
    to_set_dict,
)


def test_normalize_obj_fills_all_keys():
    out = normalize_obj({"NAME": ["홍길동"]})
    for k in BASE_KEYS:
        assert k in out
    assert out["NAME"] == ["홍길동"]
    assert out["ADDRESS"] == []


def test_normalize_obj_accepts_json_string():
    out = normalize_obj('{"NAME": ["A"]}')
    assert out["NAME"] == ["A"]


def test_normalize_obj_handles_none_and_garbage():
    assert normalize_obj(None)["NAME"] == []
    assert normalize_obj("not json")["NAME"] == []
    # 비정상 단일 값 → list 로 강제 변환
    assert normalize_obj({"NAME": "솔로"})["NAME"] == ["솔로"]


def test_prf_zero_division():
    assert prf(0, 0, 0) == (0.0, 0.0, 0.0)
    assert prf(1, 0, 0) == (1.0, 1.0, 1.0)
    p, r, f1 = prf(1, 1, 1)
    assert p == 0.5 and r == 0.5 and f1 == 0.5


def test_eval_pair_perfect_match():
    g = normalize_obj({"NAME": ["A"], "EMAIL": ["a@b.com"]})
    p = normalize_obj({"NAME": ["A"], "EMAIL": ["a@b.com"]})
    by_field, overall = eval_pair(g, p)
    assert overall["f1"] == 1.0
    assert by_field["NAME"]["tp"] == 1
    assert by_field["ADDRESS"]["tp"] == 0   # 빈 필드


def test_aggregate_strict_micro():
    g = [normalize_obj({"NAME": ["A", "B"]}), normalize_obj({"NAME": ["C"]})]
    p = [normalize_obj({"NAME": ["A"]}),       normalize_obj({"NAME": ["C", "D"]})]
    agg = aggregate(g, p)
    # tp=2 (A, C), fp=1 (D), fn=1 (B)
    assert agg["fields"]["NAME"]["tp"] == 2
    assert agg["fields"]["NAME"]["fp"] == 1
    assert agg["fields"]["NAME"]["fn"] == 1
    assert agg["overall"]["tp"] == 2
    assert agg["doc_exact_match"] == 0.0
    assert agg["total_docs"] == 2


def test_aggregate_doc_exact_match():
    g = [normalize_obj({"NAME": ["A"]}), normalize_obj({"NAME": ["B"]})]
    p = [normalize_obj({"NAME": ["A"]}), normalize_obj({"NAME": ["B"]})]
    agg = aggregate(g, p)
    assert agg["doc_exact_match"] == 1.0


def test_normalized_strips_phone_punctuation():
    assert norm_value("CONTACT", "010-1234-5678") == "01012345678"
    assert norm_value("RESIDENT", "900101-1234567") == "9001011234567"
    assert norm_value("POSTAL", "12-345") == "12345"


def test_normalized_lowercases_email():
    assert norm_value("EMAIL", "Foo@BAR.com") == "foo@bar.com"


def test_normalized_strips_name_prefix():
    assert norm_value("NAME", "성명: 홍길동") == "홍길동"
    assert norm_value("NAME", "이름:김영수") == "김영수"


def test_normalized_aggregate_collapses_format_diff():
    g = [normalize_obj({"CONTACT": ["010-1111-2222"], "EMAIL": ["A@B.COM"]})]
    p = [normalize_obj({"CONTACT": ["01011112222"],   "EMAIL": ["a@b.com"]})]
    strict = aggregate(g, p)
    norm = aggregate_normalized(g, p)
    assert strict["overall"]["f1"] == 0.0     # 표기 차이로 모두 miss/extra
    assert norm["overall"]["f1"] == 1.0


def test_doc_diff_returns_miss_extra():
    g = normalize_obj({"NAME": ["A", "B"]})
    p = normalize_obj({"NAME": ["A", "C"]})
    d = doc_diff(g, p)
    assert d["NAME"]["miss"] == ["B"]
    assert d["NAME"]["extra"] == ["C"]
    assert d["NAME"]["gt"] == ["A", "B"]
