export default function StatusBadge({ status }) {
  const styles = {
    pending:   'bg-status-pending-bg text-status-pending-fg',
    reviewing: 'bg-status-reviewing-bg text-status-reviewing-fg',
    reviewed:  'bg-status-reviewed-bg text-status-reviewed-fg',
  }
  const labels = {
    pending:   '검수전',
    reviewing: '검수중',
    reviewed:  '검수완료',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
        styles[status] ?? styles.pending
      }`}
    >
      {labels[status] ?? status}
    </span>
  )
}
