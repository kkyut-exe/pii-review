// web/src/components/MetricsTable.jsx
import { PII_FIELDS } from '../context/EvalContext'

function fmt(x, nd = 1) {
  return (typeof x === 'number') ? `${(x * 100).toFixed(nd)}%` : '-'
}

export default function MetricsTable({ overall, fields, title }) {
  return (
    <div className="bg-card rounded-xl border border-stroke overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-stroke">
          <h3 className="text-sm font-semibold text-ink-strong">{title}</h3>
        </div>
      )}
      <table className="w-full text-xs">
        <thead className="bg-surface text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left font-medium">필드</th>
            <th className="px-4 py-2 text-right font-medium">TP</th>
            <th className="px-4 py-2 text-right font-medium">FP</th>
            <th className="px-4 py-2 text-right font-medium">FN</th>
            <th className="px-4 py-2 text-right font-medium">P</th>
            <th className="px-4 py-2 text-right font-medium">R</th>
            <th className="px-4 py-2 text-right font-medium">F1</th>
          </tr>
        </thead>
        <tbody>
          {overall && (
            <tr className="border-t border-stroke bg-primary-light/30 font-semibold">
              <td className="px-4 py-2 text-ink-strong">ALL</td>
              <td className="px-4 py-2 text-right">{overall.tp}</td>
              <td className="px-4 py-2 text-right">{overall.fp}</td>
              <td className="px-4 py-2 text-right">{overall.fn}</td>
              <td className="px-4 py-2 text-right">{fmt(overall.precision)}</td>
              <td className="px-4 py-2 text-right">{fmt(overall.recall)}</td>
              <td className="px-4 py-2 text-right">{fmt(overall.f1)}</td>
            </tr>
          )}
          {PII_FIELDS.map(k => {
            const m = fields?.[k] || {}
            return (
              <tr key={k} className="border-t border-stroke hover:bg-surface/50">
                <td className="px-4 py-2 text-ink-base">{k}</td>
                <td className="px-4 py-2 text-right">{m.tp ?? 0}</td>
                <td className="px-4 py-2 text-right">{m.fp ?? 0}</td>
                <td className="px-4 py-2 text-right">{m.fn ?? 0}</td>
                <td className="px-4 py-2 text-right">{fmt(m.precision)}</td>
                <td className="px-4 py-2 text-right">{fmt(m.recall)}</td>
                <td className="px-4 py-2 text-right">{fmt(m.f1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
