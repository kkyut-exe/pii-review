# server/router/evals.py
"""LLM 평가 (run) 엔드포인트.

POST   /evals/runs             run 생성 + 백그라운드 실행
GET    /evals/runs             run 리스트 (필터·정렬)
GET    /evals/runs/{id}        run 상세 (메타 + DB 메트릭)
GET    /evals/runs/{id}/details per-doc diff·worst·Normalized
DELETE /evals/runs/{id}        run 삭제 (artifact_dir 포함)
POST   /evals/golden/upload    Golden Set 업로드 (임시 보관)
"""
from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, selectinload

from server.database import get_db
from server.eval_golden import (
    EVAL_UPLOADS_DIR,
    extract_gold_label,
    read_jsonl,
    run_artifact_dir,
    save_uploaded_golden,
)
from server.eval_metrics import (
    BASE_KEYS,
    aggregate,
    aggregate_normalized,
    doc_diff,
    eval_pair,
    normalize_obj,
)
from server.eval_runner import execute_run
from server.models import DatasetVersion, EvalMetric, EvalRun, User
from server.router.auth import get_current_user
from server.schemas import (
    EvalDocDiff,
    EvalGoldenUploadResponse,
    EvalMetricOut,
    EvalRunCreate,
    EvalRunDetailOut,
    EvalRunDetailsOut,
    EvalRunSummaryOut,
)


router = APIRouter()


# ── helpers ────────────────────────────────────────

def _to_summary(run: EvalRun) -> EvalRunSummaryOut:
    overall = next(
        (m for m in run.metrics if m.scope == "overall" and m.key == "ALL"),
        None,
    )
    return EvalRunSummaryOut(
        id=run.id,
        name=run.name,
        model_name=run.model_name,
        server_url=run.server_url,
        chunk_chars=run.chunk_chars,
        overlap=run.overlap,
        golden_source=run.golden_source,
        status=run.status,
        progress=run.progress,
        total_docs=run.total_docs,
        matched_docs=run.matched_docs,
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
        created_by=run.created_by,
        creator_username=run.creator.username if run.creator else None,
        overall_f1=overall.f1 if overall else None,
        overall_precision=overall.precision if overall else None,
        overall_recall=overall.recall if overall else None,
    )


def _to_detail(run: EvalRun) -> EvalRunDetailOut:
    summary = _to_summary(run)
    return EvalRunDetailOut(
        **summary.model_dump(),
        golden_set_hash=run.golden_set_hash,
        artifact_dir=run.artifact_dir,
        error_msg=run.error_msg,
        metrics=[
            EvalMetricOut.model_validate(m, from_attributes=True) for m in run.metrics
        ],
    )


# ── endpoints ──────────────────────────────────────

@router.post("/golden/upload", response_model=EvalGoldenUploadResponse)
async def upload_golden(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일")
    try:
        info = save_uploaded_golden(content, file.filename or "golden.jsonl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"파일 검증 실패: {e}")
    return EvalGoldenUploadResponse(**info)


def _spawn_run(
    db: Session,
    background: BackgroundTasks,
    current_user: User,
    *,
    name: str,
    body: EvalRunCreate,
    upload_id: Optional[str],
    dataset_version_id: Optional[int],
) -> EvalRun:
    run = EvalRun(
        name=name,
        model_name=body.model_name,
        server_url=body.server_url,
        chunk_chars=body.chunk_chars,
        overlap=body.overlap or 0,
        golden_source=body.golden_source,
        golden_set_hash="",
        artifact_dir="",
        status="pending",
        progress=0.0,
        total_docs=0,
        matched_docs=0,
        created_by=current_user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    run.artifact_dir = str(run_artifact_dir(run.id))
    db.commit()
    db.refresh(run)

    background.add_task(
        execute_run,
        run.id,
        upload_id=upload_id,
        dataset_version_id=dataset_version_id,
    )
    return run


@router.post("/runs", response_model=list[EvalRunDetailOut], status_code=status.HTTP_201_CREATED)
def create_run(
    body: EvalRunCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.golden_source not in ("db", "upload"):
        raise HTTPException(status_code=400, detail="golden_source 는 'db' | 'upload'")

    # ── upload 모드: run 1개 ─────────────────────────
    if body.golden_source == "upload":
        if not body.golden_upload_id:
            raise HTTPException(status_code=400, detail="upload 모드에는 golden_upload_id 필수")
        upl = EVAL_UPLOADS_DIR / f"{body.golden_upload_id}.jsonl"
        if not upl.exists():
            raise HTTPException(status_code=404, detail="upload_id 파일 없음 (만료/잘못됨)")
        run = _spawn_run(
            db, background, current_user,
            name=body.name, body=body,
            upload_id=body.golden_upload_id,
            dataset_version_id=None,
        )
        return [_to_detail(run)]

    # ── db 모드 ──────────────────────────────────────
    version_ids = body.golden_dataset_version_ids or []
    if not version_ids:
        # 하위호환: 버전 미지정 → 전체 reviewed records 1개 run
        run = _spawn_run(
            db, background, current_user,
            name=body.name, body=body,
            upload_id=None, dataset_version_id=None,
        )
        return [_to_detail(run)]

    versions = (
        db.query(DatasetVersion)
        .options(selectinload(DatasetVersion.dataset))
        .filter(DatasetVersion.id.in_(version_ids))
        .all()
    )
    if len(versions) != len(version_ids):
        raise HTTPException(status_code=404, detail="일부 dataset_version_id 를 찾지 못함")

    multi = len(versions) > 1
    out = []
    for v in versions:
        run_name = f"{body.name} · {v.dataset.name} v{v.version}" if multi else body.name
        run = _spawn_run(
            db, background, current_user,
            name=run_name, body=body,
            upload_id=None, dataset_version_id=v.id,
        )
        out.append(_to_detail(run))
    return out


@router.get("/runs", response_model=list[EvalRunSummaryOut])
def list_runs(
    model_name: Optional[str] = None,
    status: Optional[str] = Query(None, description="pending|running|done|failed"),
    sort: str = Query("created_at", description="created_at | f1"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EvalRun)
    if model_name:
        q = q.filter(EvalRun.model_name == model_name)
    if status:
        q = q.filter(EvalRun.status == status)
    runs = q.order_by(EvalRun.created_at.desc()).all()

    summaries = [_to_summary(r) for r in runs]
    if sort == "f1":
        summaries.sort(key=lambda s: (s.overall_f1 or -1.0), reverse=True)
    return summaries


@router.get("/runs/{run_id}", response_model=EvalRunDetailOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(EvalRun).filter_by(id=run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return _to_detail(run)


@router.get("/runs/{run_id}/details", response_model=EvalRunDetailsOut)
def get_run_details(
    run_id: str,
    worst_top_k: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(EvalRun).filter_by(id=run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    if run.status != "done":
        raise HTTPException(status_code=409, detail=f"run status={run.status}")

    art = Path(run.artifact_dir)
    gold_path = art / "golden.jsonl"
    pred_path = art / "predictions.jsonl"
    if not gold_path.exists() or not pred_path.exists():
        raise HTTPException(status_code=410, detail="artifact 파일 없음")

    gt_rows = read_jsonl(gold_path)
    pred_rows = read_jsonl(pred_path)
    gt_map = {r["id"]: r for r in gt_rows if "id" in r}
    pred_map = {r["id"]: r for r in pred_rows if "id" in r}
    ids = sorted(set(gt_map) & set(pred_map))

    golds = [normalize_obj(extract_gold_label(gt_map[i])) for i in ids]
    preds = [normalize_obj(pred_map[i].get("response", {})) for i in ids]

    strict = aggregate(golds, preds)
    norm = aggregate_normalized(golds, preds)

    # per-doc diff + F1 → worst_top_k
    docs = []
    for doc_id, g, p in zip(ids, golds, preds):
        _, micro_strict = eval_pair(g, p)
        from server.eval_metrics import normalize_for_diag
        _, micro_norm = eval_pair(normalize_for_diag(g), normalize_for_diag(p))
        diffs = doc_diff(g, p)
        # 비어있는 필드는 잘라냄
        field_diffs = {
            k: v for k, v in diffs.items()
            if v["miss"] or v["extra"]
        }
        docs.append((micro_strict["f1"], EvalDocDiff(
            id=doc_id,
            field_diffs=field_diffs,
            strict_f1=micro_strict["f1"],
            normalized_f1=micro_norm["f1"],
        )))
    docs.sort(key=lambda x: x[0])
    worst = [d for _, d in docs[:worst_top_k]]

    return EvalRunDetailsOut(
        run_id=run_id,
        strict={"overall": strict["overall"], "fields": strict["fields"]},
        normalized={"overall": norm["overall"], "fields": norm["fields"]},
        doc_exact_match=strict["doc_exact_match"],
        worst_docs=worst,
    )


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(EvalRun).filter_by(id=run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    art = Path(run.artifact_dir) if run.artifact_dir else None
    db.delete(run)
    db.commit()
    if art and art.exists():
        shutil.rmtree(art, ignore_errors=True)
    return None
