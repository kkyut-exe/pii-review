import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import StatusBadge from '../components/StatusBadge'

function totalPiiCount(record) {
  const dict = record.reviewed_pii_dict ?? record.pii_dict ?? {}
  return Object.values(dict).reduce((sum, arr) => sum + (arr?.length ?? 0), 0)
}

export default function ListPage() {
  const { files, activeFileId, setActiveFileId, records, openFile, addFile, exportReviewed } = useFile()
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()

  const pendingCount = records.filter(r => r.status === 'pending').length
  const reviewedCount = records.filter(r => r.status === 'reviewed').length
  const filtered = records.filter(r => filter === 'all' || r.status === filter)

  if (!files.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🏷️</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">LLM 라벨링 검수</h1>
          <p className="text-sm text-gray-500 mb-6">파싱된 JSON 파일을 열어 검수를 시작하세요.</p>
          <button
            onClick={openFile}
            className="bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            JSON 파일 열기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="w-56 bg-gray-50 border-r border-gray-100 p-4 flex flex-col gap-6 shrink-0">
        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">데이터셋</div>
          <div className="space-y-1">
            {files.map(file => {
              const filePending = file.records.filter(r => r.status === 'pending').length
              const fileReviewed = file.records.filter(r => r.status === 'reviewed').length
              const isActive = file.id === activeFileId
              return (
                <button
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                    isActive ? 'bg-gray-200' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 truncate mb-1" title={file.name}>
                    <span>📁</span>
                    <span className="truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs pl-0.5">
                    <span className="text-orange-500">● {filePending}</span>
                    <span className="text-green-500">✓ {fileReviewed}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">필터</div>
          <div className="space-y-0.5">
            {[
              { key: 'all', label: '전체', count: records.length },
              { key: 'pending', label: '미검수', count: pendingCount },
              { key: 'reviewed', label: '검수완료', count: reviewedCount },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  filter === key ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{label}</span>
                <span className="text-xs text-gray-400">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-0.5">
          <button
            onClick={addFile}
            className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            + 파일 추가
          </button>
          {reviewedCount > 0 && (
            <button
              onClick={exportReviewed}
              className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              검수 완료 Export
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 p-8">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900">검수 목록</h1>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>전체 {records.length}건</span>
              <span className="text-orange-500">● 미검수 {pendingCount}</span>
              <span className="text-green-500">✓ 검수완료 {reviewedCount}</span>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">파일명</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">상태</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">PII</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">검수일</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(record => (
                  <tr
                    key={record.id}
                    onClick={() => navigate(`/review/${record.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3.5 text-sm text-gray-800 font-medium">📄 {record.source_filename}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={record.status} /></td>
                    <td className="px-5 py-3.5 text-sm">
                      {totalPiiCount(record) > 0 ? (
                        <span className="bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 text-xs font-medium">
                          {totalPiiCount(record)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">
                      {record.reviewed_at
                        ? new Date(record.reviewed_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                        : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-300 group-hover:text-gray-400 text-right transition-colors">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-400">해당하는 항목이 없습니다.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
