// web/src/pages/DashboardPage.jsx
import { useFile } from '../context/FileContext'

const CARDS = [
  { key: 'all',            label: '전체',     color: 'text-ink-strong' },
  { key: 'pending',        label: '검수전',   color: 'text-status-pending-fg' },
  { key: 'reviewing',      label: '검수중',   color: 'text-status-reviewing-fg' },
  { key: 'reviewed',       label: '완료',     color: 'text-status-reviewed-fg' },
  { key: 'pending_delete', label: '삭제 대기', color: 'text-red-500' },
]

export default function DashboardPage() {
  const { records } = useFile()

  const counts = {
    all:            records.length,
    pending:        records.filter(r => r.status === 'pending').length,
    reviewing:      records.filter(r => r.status === 'reviewing').length,
    reviewed:       records.filter(r => r.status === 'reviewed').length,
    pending_delete: records.filter(r => r.status === 'pending_delete').length,
  }

  const progress = counts.all > 0
    ? Math.round((counts.reviewed / counts.all) * 100)
    : 0

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-ink-strong mb-6">대시보드</h1>

      {/* 상태 카드 */}
      <div className="flex gap-4 mb-6">
        {CARDS.map(({ key, label, color }) => (
          <div key={key} className="flex-1 bg-card rounded-xl border border-stroke px-5 py-4">
            <p className="text-xs text-ink-muted mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{counts[key]}</p>
          </div>
        ))}
      </div>

      {/* 진행률 */}
      <div className="bg-card rounded-xl border border-stroke px-5 py-4">
        <p className="text-sm font-semibold text-ink-base mb-3">전체 검수 진행률</p>
        <div className="bg-surface rounded-full h-3 overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-primary to-purple-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-ink-muted">
          {counts.reviewed} / {counts.all} 완료 · {progress}%
        </p>
      </div>
    </div>
  )
}
