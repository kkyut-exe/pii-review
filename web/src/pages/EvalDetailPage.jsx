// web/src/pages/EvalDetailPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useEvalsApi } from '../context/EvalContext'
import MetricsTable from '../components/MetricsTable'
import FieldBarChart from '../components/FieldBarChart'
import DocDiffPanel from '../components/DocDiffPanel'

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

function fmt(x, nd = 1) { return (typeof x === 'number') ? `${(x * 100).toFixed(nd)}%` : '-' }

export default function EvalDetailPage() {
  const { id } = useParams()
  const api = useEvalsApi()
  const navigate = useNavigate()
  const outletCtx = useOutletContext()
  const [run, setRun] = useState(null)
  const [details, setDetails] = useState(null)
  const [mode, setMode] = useState('strict')
  const [worstK, setWorstK] = useState(10)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [error, setError] = useState(null)

  const loadRun = useCallback(() => {
    api.getRun(id).then(setRun).catch(e => setError(e.message))
  }, [id, api])

  const loadDetails = useCallback(() => {
    api.getRunDetails(id, worstK).then(d => {
      setDetails(d)
      setSelectedDoc(d.worst_docs?.[0] || null)
    }).catch(e => setError(e.message))
  }, [id, api, worstK])

  useEffect(() => { loadRun() }, [loadRun])

  // run 이 done 되면 details 도 같이 fetch
  useEffect(() => {
    if (run?.status === 'done') loadDetails()
  }, [run?.status, loadDetails])

  // running 동안 폴링
  useEffect(() => {
    if (!run || (run.status !== 'running' && run.status !== 'pending')) return
    const t = setInterval(loadRun, 3000)
    return () => clearInterval(t)
  }, [run, loadRun])

  if (error) {
    return <div className="p-8 text-red-600 text-sm">에러: {error}</div>
  }
  if (!run) {
    return <div className="p-8 text-ink-muted">로딩 중...</div>
  }

  const overallMetric = run.metrics?.find(m => m.scope === 'overall' && m.key === 'ALL')
  const fieldsByKey = {}
  for (const m of (run.metrics || [])) {
    if (m.scope === 'field') fieldsByKey[m.key] = m
  }

  const activeStrict = mode === 'strict'
  const view = details && (activeStrict ? details.strict : details.normalized)

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-strong truncate">{run.name}</h1>
          <p className="text-xs text-ink-muted mt-1 truncate">{run.id}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right space-y-1">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[run.status]}`}>
              {run.status}
            </span>
            <p className="text-xs text-ink-muted">
              모델: <span>{run.model_name}</span>
            </p>
          </div>
          <button
            onClick={async () => {
              if (!confirm(`"${run.name}" run 을 삭제할까요? (artifact 폴더도 삭제됩니다)`)) return
              try {
                await api.deleteRun(run.id)
                outletCtx?.reloadRuns?.()
                navigate('/evals')
              } catch (e) {
                alert(`삭제 실패: ${e.message}`)
              }
            }}
            className="text-xs text-red-500 border border-red-200 rounded px-2.5 py-1 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      </header>

      {/* 진행률 */}
      {(run.status === 'running' || run.status === 'pending') && (
        <div className="bg-card rounded-xl border border-stroke px-5 py-4">
          <p className="text-sm font-semibold text-ink-base mb-2">진행률</p>
          <div className="bg-surface rounded-full h-3 overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-primary to-purple-400 transition-all duration-500"
              style={{ width: `${Math.round((run.progress || 0) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-ink-muted">{Math.round((run.progress || 0) * 100)}%</p>
        </div>
      )}

      {/* 실패 사유 */}
      {run.status === 'failed' && run.error_msg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
          {run.error_msg}
        </div>
      )}

      {/* Hero 요약 */}
      {run.status === 'done' && (
        <HeroOverall
          overall={view?.overall || overallMetric}
          docsMatched={run.matched_docs}
          docsTotal={run.total_docs}
          docExactMatch={details?.doc_exact_match}
        />
      )}

      {/* Strict / Normalized 토글 + 상세 */}
      {run.status === 'done' && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">메트릭 모드:</span>
            <div className="inline-flex rounded-lg border border-stroke overflow-hidden text-xs">
              <button
                onClick={() => setMode('strict')}
                className={`px-3 py-1.5 ${activeStrict ? 'bg-primary text-white' : 'bg-card hover:bg-surface'}`}
              >
                Strict (공식)
              </button>
              <button
                onClick={() => setMode('normalized')}
                className={`px-3 py-1.5 ${!activeStrict ? 'bg-primary text-white' : 'bg-card hover:bg-surface'}`}
              >
                Normalized (진단)
              </button>
            </div>
          </div>

          {!details ? (
            <div className="text-xs text-ink-muted">상세 로딩 중...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <MetricsTable
                  overall={view.overall}
                  fields={view.fields}
                  title={`${activeStrict ? 'Strict' : 'Normalized'} 지표`}
                />
                <FieldBarChart
                  fields={view.fields}
                  title={`필드별 TP/FP/FN 구성 (${activeStrict ? 'Strict' : 'Normalized'})`}
                />
              </div>

              {/* Worst F1 docs */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink-strong">Worst F1 문서</h2>
                  <select
                    value={worstK}
                    onChange={e => setWorstK(Number(e.target.value))}
                    className="text-xs border border-stroke rounded px-2 py-1 bg-card"
                  >
                    {[5, 10, 20, 50].map(k => <option key={k} value={k}>Top {k}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <ul className="bg-card rounded-xl border border-stroke divide-y divide-stroke max-h-96 overflow-y-auto">
                    {details.worst_docs.map(d => (
                      <li
                        key={d.id}
                        onClick={() => setSelectedDoc(d)}
                        className={`px-3 py-2 cursor-pointer text-xs ${
                          selectedDoc?.id === d.id ? 'bg-primary-light' : 'hover:bg-surface/50'
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{d.id}</span>
                          <span className="text-ink-muted">{(d.strict_f1 * 100).toFixed(1)}%</span>
                        </div>
                      </li>
                    ))}
                    {details.worst_docs.length === 0 && (
                      <li className="px-3 py-6 text-center text-xs text-ink-muted">완전일치 100%</li>
                    )}
                  </ul>
                  <div className="col-span-2">
                    <DocDiffPanel doc={selectedDoc} />
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* 메타 */}
      <details className="bg-card rounded-xl border border-stroke text-xs">
        <summary className="px-4 py-2 cursor-pointer text-ink-muted">Run 메타</summary>
        <dl className="px-4 py-3 grid grid-cols-2 gap-y-1.5 gap-x-4">
          <dt className="text-ink-muted">server_url</dt><dd>{run.server_url}</dd>
          <dt className="text-ink-muted">chunk_chars</dt><dd>{run.chunk_chars ?? 'None'}</dd>
          <dt className="text-ink-muted">overlap</dt><dd>{run.overlap}</dd>
          <dt className="text-ink-muted">golden_source</dt><dd>{run.golden_source}</dd>
          <dt className="text-ink-muted">golden_set_hash</dt><dd className="truncate">{run.golden_set_hash}</dd>
          <dt className="text-ink-muted">artifact_dir</dt><dd className="break-all">{run.artifact_dir}</dd>
          <dt className="text-ink-muted">started_at</dt><dd>{run.started_at ?? '-'}</dd>
          <dt className="text-ink-muted">finished_at</dt><dd>{run.finished_at ?? '-'}</dd>
        </dl>
      </details>
    </div>
  )
}

function HeroOverall({ overall, docsMatched, docsTotal, docExactMatch }) {
  if (!overall) return null
  const f1 = overall.f1 ?? 0
  const p = overall.precision ?? 0
  const r = overall.recall ?? 0
  const tp = overall.tp ?? 0
  const fp = overall.fp ?? 0
  const fn = overall.fn ?? 0
  const total = tp + fp + fn || 1
  const size = 176
  const stroke = 16
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const dash = Math.max(0, Math.min(1, f1)) * circ

  return (
    <div className="bg-card rounded-2xl border border-stroke p-6">
      <div className="grid grid-cols-[auto_1fr] gap-8 items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
              className="stroke-surface" />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
              className="stroke-primary transition-all duration-500" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-muted">F1</p>
            <p className="text-3xl font-bold text-ink-strong mt-0.5">{fmt(f1)}</p>
          </div>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-6">
            <MiniStat label="Precision" value={fmt(p)} />
            <MiniStat label="Recall" value={fmt(r)} />
            <MiniStat label="Doc Exact" value={docExactMatch != null ? fmt(docExactMatch) : '—'} />
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="uppercase tracking-[0.15em] text-ink-muted">예측 구성</span>
              <span className="text-ink-base">
                TP {tp} · FP {fp} · FN {fn}
              </span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface">
              <div className="bg-violet-500 transition-all duration-500" style={{ width: `${(tp / total) * 100}%` }} />
              <div className="bg-amber-400 transition-all duration-500" style={{ width: `${(fp / total) * 100}%` }} />
              <div className="bg-rose-400 transition-all duration-500" style={{ width: `${(fn / total) * 100}%` }} />
            </div>
            <div className="flex items-center gap-4 text-[11px] mt-2 text-ink-muted">
              <LegendDot color="bg-violet-500" label="TP" />
              <LegendDot color="bg-amber-400" label="FP" />
              <LegendDot color="bg-rose-400" label="FN" />
              <span className="ml-auto">
                Docs <span className="text-ink-base">{docsMatched}/{docsTotal}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-ink-muted mb-1">{label}</p>
      <p className="text-xl font-bold text-ink-strong">{value}</p>
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-sm ${color}`} />
      {label}
    </span>
  )
}
