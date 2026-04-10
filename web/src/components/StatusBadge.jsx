export default function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-orange-100 text-orange-600',
    reviewed: 'bg-green-100 text-green-600',
  }
  const labels = {
    pending: '미검수',
    reviewed: '검수완료',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? styles.pending
      }`}
    >
      {labels[status] ?? status}
    </span>
  )
}
