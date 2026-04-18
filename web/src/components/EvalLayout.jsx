// web/src/components/EvalLayout.jsx
// LLM 평가 페이지의 좌측 Run 목록 + 우측 상세 split layout.
import { useEffect, useState, useCallback } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useEvalsApi } from '../context/EvalContext'

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

function fmt(x) { return (typeof x === 'number') ? `${(x * 100).toFixed(1)}%` : '-' }

export default function EvalLayout() {
  const api = useEvalsApi()
  const navigate = useNavigate()
  const { id } = useParams()
  const [runs, setRuns] = useState([])
  const [sort, setSort] = useState('created_at')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = { sort }
    if (statusFilter) params.status = statusFilter
    api.listRuns(params)
      .then(setRuns)
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [api, sort, statusFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!runs.some(r => r.status === 'running' || r.status === 'pending')) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [runs, load])

  return (
    <div className="flex h-screen">
      <aside className="w-80 shrink-0 border-r border-stroke bg-card flex flex-col">
        <div className="px-4 py-4 border-b border-stroke space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">LLM Eval</p>
              <h1 className="text-base font-bold text-ink-strong mt-0.5">평가 Run</h1>
            </div>
            <Link
              to="/evals/new"
              className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90"
            >
              + 평가 생성
            </Link>
          </div>
          <div className="flex gap-1.5">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 text-[11px] border border-stroke rounded px-2 py-1 bg-surface"
            >
              <option value="">전체 상태</option>
              <option value="pending">pending</option>
              <option value="running">running</option>
              <option value="done">done</option>
              <option value="failed">failed</option>
            </select>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="flex-1 text-[11px] border border-stroke rounded px-2 py-1 bg-surface"
            >
              <option value="created_at">최신순</option>
              <option value="f1">F1순</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && runs.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-ink-muted">로딩 중...</div>
          )}
          {!loading && runs.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-ink-muted">아직 run 이 없습니다.</div>
          )}
          <ul className="divide-y divide-stroke">
            {runs.map(r => {
              const active = r.id === id
              return (
                <li key={r.id}>
                  <button
                    onClick={() => navigate(`/evals/${r.id}`)}
                    className={`w-full text-left px-4 py-3 transition ${active ? 'bg-primary-light' : 'hover:bg-surface/50'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-ink-strong truncate">{r.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${STATUS_COLORS[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                      <span className="truncate">{r.model_name}</span>
                      <span className="shrink-0">F1 {fmt(r.overall_f1)}</span>
                    </div>
                    {(r.status === 'running' || r.status === 'pending') && (
                      <div className="mt-1.5 h-1 rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.round((r.progress || 0) * 100)}%` }}
                        />
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet context={{ reloadRuns: load }} />
      </main>
    </div>
  )
}

export function EvalEmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center text-2xl mb-4">
        🧪
      </div>
      <p className="text-sm font-semibold text-ink-strong mb-1">Run 을 선택하세요</p>
      <p className="text-xs text-ink-muted">좌측 목록에서 평가 Run 을 선택하면 상세 결과가 여기에 표시됩니다.</p>
    </div>
  )
}
