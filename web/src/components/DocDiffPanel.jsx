// web/src/components/DocDiffPanel.jsx
export default function DocDiffPanel({ doc }) {
  if (!doc) return null
  const fieldKeys = Object.keys(doc.field_diffs || {})
  return (
    <div className="bg-card rounded-xl border border-stroke p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-muted">문서 ID</p>
          <p className="text-sm text-ink-strong break-all">{doc.id}</p>
        </div>
        <div className="text-right text-xs space-y-0.5">
          <div>
            <span className="text-ink-muted">Strict F1: </span>
            <span className="text-ink-strong">{(doc.strict_f1 * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-ink-muted">Norm F1: </span>
            <span className="text-ink-strong">{(doc.normalized_f1 * 100).toFixed(1)}%</span>
          </div>
        </div>
      </header>

      {fieldKeys.length === 0 && (
        <p className="text-xs text-ink-muted">차이 없음 (완전일치)</p>
      )}

      <div className="space-y-2">
        {fieldKeys.map(k => {
          const d = doc.field_diffs[k]
          return (
            <div key={k} className="border border-stroke rounded-lg overflow-hidden text-xs">
              <div className="px-3 py-1.5 bg-surface font-semibold text-ink-base">{k}</div>
              <div className="grid grid-cols-2 divide-x divide-stroke">
                <div className="p-2">
                  <p className="text-[10px] uppercase text-red-600 mb-1">Miss (정답에는 있음)</p>
                  {d.miss?.length ? (
                    <ul className="space-y-0.5">
                      {d.miss.map((v, i) => (
                        <li key={i} className="text-ink-base bg-red-50 px-1.5 py-0.5 rounded">{v}</li>
                      ))}
                    </ul>
                  ) : <span className="text-ink-muted">-</span>}
                </div>
                <div className="p-2">
                  <p className="text-[10px] uppercase text-amber-600 mb-1">Extra (예측 잉여)</p>
                  {d.extra?.length ? (
                    <ul className="space-y-0.5">
                      {d.extra.map((v, i) => (
                        <li key={i} className="text-ink-base bg-amber-50 px-1.5 py-0.5 rounded">{v}</li>
                      ))}
                    </ul>
                  ) : <span className="text-ink-muted">-</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
