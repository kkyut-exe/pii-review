// web/src/components/FieldBarChart.jsx
// 필드별 TP/FP/FN 구성 스택 바.
import { PII_FIELDS } from '../context/EvalContext'

export default function FieldBarChart({ fields, title }) {
  return (
    <div className="bg-card rounded-xl border border-stroke p-4">
      {title && <h3 className="text-sm font-semibold text-ink-strong mb-3">{title}</h3>}
      <div className="space-y-2">
        {PII_FIELDS.map(k => {
          const m = fields?.[k] || {}
          const tp = m.tp ?? 0
          const fp = m.fp ?? 0
          const fn = m.fn ?? 0
          const total = tp + fp + fn
          const tpPct = total ? (tp / total) * 100 : 0
          const fpPct = total ? (fp / total) * 100 : 0
          const fnPct = total ? (fn / total) * 100 : 0
          return (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-ink-muted">{k}</span>
              <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-surface">
                <div className="bg-violet-500 transition-all duration-500" style={{ width: `${tpPct}%` }} />
                <div className="bg-amber-400 transition-all duration-500" style={{ width: `${fpPct}%` }} />
                <div className="bg-rose-400 transition-all duration-500" style={{ width: `${fnPct}%` }} />
              </div>
              <span className="w-24 text-right text-[11px]">
                <span className="text-violet-600">{tp}</span>
                <span className="text-ink-muted"> · </span>
                <span className="text-amber-600">{fp}</span>
                <span className="text-ink-muted"> · </span>
                <span className="text-rose-600">{fn}</span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-[11px] mt-3 pt-3 border-t border-stroke text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-violet-500 rounded-sm" />TP</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-amber-400 rounded-sm" />FP</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-rose-400 rounded-sm" />FN</span>
      </div>
    </div>
  )
}
