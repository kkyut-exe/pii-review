# server/eval_metrics.py
"""Golden/Pred PII set을 받아 Strict/Normalized P/R/F1 및 diff를 계산한다.

노트북 `llm-eval/labeling_new copy.ipynb` 의 평가 로직 포팅.
- Strict: 원문 완전일치 집합 연산 (공식 지표)
- Normalized: 전화/주민/우편번호는 숫자만, 이메일은 lowercase,
             이름은 "성명:" 같은 prefix 제거 (진단용)
"""
from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any


BASE_KEYS: list[str] = [
    "NAME", "ADDRESS", "POSTAL", "RESIDENT",
    "CONTACT", "EMAIL", "BIRTHDATE", "GENDER", "AGE",
]


# ── 입력 정규화 ─────────────────────────────────────

def _safe_json_loads(s: str):
    try:
        return json.loads(s)
    except Exception:
        return None


def normalize_obj(obj: Any) -> dict[str, list[str]]:
    """dict | json-str | None -> {BASE_KEY: list[str]} (모든 키 존재, 값은 str list)."""
    if obj is None:
        obj = {}
    if isinstance(obj, str):
        t = obj.strip()
        obj = _safe_json_loads(t) if t else {}
        if not isinstance(obj, dict):
            obj = {}
    if not isinstance(obj, dict):
        obj = {}

    out: dict[str, list[str]] = {k: [] for k in BASE_KEYS}
    for k in BASE_KEYS:
        v = obj.get(k, [])
        if v is None:
            v = []
        if isinstance(v, list):
            out[k] = [str(x) for x in v if x is not None]
        else:
            out[k] = [str(v)]
    return out


def to_set_dict(d: dict[str, list[str]]) -> dict[str, set[str]]:
    return {k: set(d.get(k, []) or []) for k in BASE_KEYS}


# ── Normalized (진단용) ────────────────────────────

_non_digit = re.compile(r"[^0-9]")
_space = re.compile(r"\s+")
_name_prefix = re.compile(
    r"^(이름|성명|대표자|의사명|국문성명|영문성명)\s*[:：]?\s*"
)


def norm_value(field: str, s: str) -> str:
    if s is None:
        return ""
    s = str(s).strip()

    if field in ("CONTACT", "RESIDENT", "POSTAL"):
        return _non_digit.sub("", s)
    if field == "EMAIL":
        return _space.sub("", s).lower()
    if field == "NAME":
        s = _name_prefix.sub("", s)
        return _space.sub(" ", s).strip()
    if field == "ADDRESS":
        return _space.sub(" ", s).strip()
    return s


def normalize_for_diag(d: dict[str, list[str]]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for k in BASE_KEYS:
        vals = d.get(k, []) or []
        out[k] = [norm_value(k, v) for v in vals if str(v).strip() != ""]
    return out


# ── P/R/F1 ─────────────────────────────────────────

def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * p * r / (p + r)) if (p + r) else 0.0
    return p, r, f1


def eval_pair(gold: dict[str, list[str]], pred: dict[str, list[str]]):
    """한 문서의 (by_field, overall) 메트릭."""
    g = to_set_dict(gold)
    p = to_set_dict(pred)

    by_field: dict[str, dict] = {}
    tp_all = fp_all = fn_all = 0
    for k in BASE_KEYS:
        tp = len(g[k] & p[k])
        fp = len(p[k] - g[k])
        fn = len(g[k] - p[k])
        P, R, F1 = prf(tp, fp, fn)
        by_field[k] = {"tp": tp, "fp": fp, "fn": fn,
                       "precision": P, "recall": R, "f1": F1}
        tp_all += tp
        fp_all += fp
        fn_all += fn

    P, R, F1 = prf(tp_all, fp_all, fn_all)
    overall = {"tp": tp_all, "fp": fp_all, "fn": fn_all,
               "precision": P, "recall": R, "f1": F1}
    return by_field, overall


def aggregate(
    golds: list[dict[str, list[str]]],
    preds: list[dict[str, list[str]]],
) -> dict:
    """Strict micro 집계. 반환:
      {
        "overall": {tp, fp, fn, precision, recall, f1},
        "fields":  {FIELD: {tp, fp, fn, precision, recall, f1}},
        "doc_exact_match": float,
        "total_docs": int,
      }
    """
    assert len(golds) == len(preds)
    agg: dict[str, Counter] = {k: Counter() for k in BASE_KEYS}
    exact = 0
    n = len(golds)

    for gold, pred in zip(golds, preds):
        g = to_set_dict(gold)
        p = to_set_dict(pred)
        if all(g[k] == p[k] for k in BASE_KEYS):
            exact += 1
        for k in BASE_KEYS:
            agg[k]["tp"] += len(g[k] & p[k])
            agg[k]["fp"] += len(p[k] - g[k])
            agg[k]["fn"] += len(g[k] - p[k])

    fields: dict[str, dict] = {}
    tp_total = fp_total = fn_total = 0
    for k in BASE_KEYS:
        tp = int(agg[k]["tp"])
        fp = int(agg[k]["fp"])
        fn = int(agg[k]["fn"])
        P, R, F1 = prf(tp, fp, fn)
        fields[k] = {"tp": tp, "fp": fp, "fn": fn,
                     "precision": P, "recall": R, "f1": F1}
        tp_total += tp
        fp_total += fp
        fn_total += fn

    P, R, F1 = prf(tp_total, fp_total, fn_total)
    return {
        "overall": {"tp": tp_total, "fp": fp_total, "fn": fn_total,
                    "precision": P, "recall": R, "f1": F1},
        "fields": fields,
        "doc_exact_match": (exact / n) if n else 0.0,
        "total_docs": n,
    }


def aggregate_normalized(
    golds: list[dict[str, list[str]]],
    preds: list[dict[str, list[str]]],
) -> dict:
    g_norm = [normalize_for_diag(g) for g in golds]
    p_norm = [normalize_for_diag(p) for p in preds]
    return aggregate(g_norm, p_norm)


# ── per-doc diff ─────────────────────────────────

def doc_diff(gold: dict[str, list[str]], pred: dict[str, list[str]]) -> dict:
    """한 문서에 대해 필드별 gt/pred/miss/extra 반환."""
    g = to_set_dict(gold)
    p = to_set_dict(pred)
    out: dict[str, dict] = {}
    for k in BASE_KEYS:
        miss = sorted(g[k] - p[k])
        extra = sorted(p[k] - g[k])
        out[k] = {
            "gt": sorted(g[k]),
            "pred": sorted(p[k]),
            "miss": miss,
            "extra": extra,
        }
    return out
