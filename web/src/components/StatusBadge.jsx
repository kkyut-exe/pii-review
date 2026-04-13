export default function StatusBadge({ status }) {
  const styles = {
    pending:   'bg-[#fff4e6] text-[#c17d11]',
    reviewing: 'bg-[#e8f0fe] text-[#2956b2]',
    reviewed:  'bg-[#e6f4ea] text-[#1e7e34]',
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
