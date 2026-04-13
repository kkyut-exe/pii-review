// web/src/pages/ListPage.jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import StatusBadge from '../components/StatusBadge'

function totalPiiCount(record) {
  const dict = record.reviewed_pii_dict ?? record.pii_dict ?? {}
  return Object.values(dict).reduce((sum, arr) => sum + (arr?.length ?? 0), 0)
}

export default function ListPage() {
  const { currentUser, records, exportReviewed, uploadLog, logout } = useFile()
  const [filter, setFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const pendingCount = records.filter(r => r.status === 'pending').length
  const reviewingCount = records.filter(r => r.status === 'reviewing').length
  const reviewedCount = records.filter(r => r.status === 'reviewed').length
  const filtered = records.filter(r => filter === 'all' || r.status === filter)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const result = await uploadLog(file)
      setUploadMsg(`업로드 완료: ${result.records_inserted}건 추가`)
    } catch (err) {
      setUploadMsg(`업로드 실패: ${err.message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="w-56 bg-gray-50 border-r border-gray-100 p-4 flex flex-col gap-6 shrink-0">
        <div>
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">필터</div>
          <div className="space-y-0.5">
            {[
              { key: 'all', label: '전체', count: records.length },
              { key: 'pending', label: '검수전', count: pendingCount },
              { key: 'reviewing', label: '검수중', count: reviewingCount },
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

        <div className="mt-auto space-y-1">
          {currentUser?.role === 'admin' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".log,.txt"
                className="hidden"
                onChange={handleUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {uploading ? '업로드 중...' : '+ 로그 업로드'}
              </button>
              {uploadMsg && (
                <p className="text-xs text-gray-400 px-2.5">{uploadMsg}</p>
              )}
            </>
          )}
          {reviewedCount > 0 && (
            <button
              onClick={exportReviewed}
              className="w-full text-left text-sm text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              검수 완료 Export
            </button>
          )}
          <button
            onClick={logout}
            className="w-full text-left text-sm text-gray-400 hover:text-gray-600 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900">검수 목록</h1>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>전체 {records.length}건</span>
              <span className="text-orange-500">● 검수전 {pendingCount}</span>
              {reviewingCount > 0 && <span className="text-blue-500">● 검수중 {reviewingCount}</span>}
              <span className="text-green-500">✓ 검수완료 {reviewedCount}</span>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">파일명</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">소스</th>
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
                    <td className="px-5 py-3.5 text-xs text-gray-400">{record.source}</td>
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
              <div className="text-center py-12 text-sm text-gray-400">
                {records.length === 0 ? '로그를 업로드하면 레코드가 나타납니다.' : '해당하는 항목이 없습니다.'}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
