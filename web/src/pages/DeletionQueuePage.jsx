// web/src/pages/DeletionQueuePage.jsx
import { useState } from 'react'
import { useFile } from '../context/FileContext'

function ConfirmModal({ count, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl border border-stroke p-6 w-80 shadow-xl">
        <h3 className="text-base font-bold text-ink-strong mb-2">영구 삭제 확인</h3>
        <p className="text-sm text-ink-base mb-6">
          {count}건을 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm text-ink-muted px-4 py-2 rounded-lg hover:bg-primary-light transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="text-sm bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeletionQueuePage() {
  const { currentUser, records, setRecordStatus, bulkDelete } = useFile()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showModal, setShowModal] = useState(false)

  const trashRecords = records.filter(r => r.status === 'pending_delete')
  const allSelected = trashRecords.length > 0 && trashRecords.every(r => selectedIds.has(r.id))

  function toggleSelectAll(checked) {
    setSelectedIds(checked ? new Set(trashRecords.map(r => r.id)) : new Set())
  }

  function toggleSelectOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRestore() {
    if (selectedIds.size === 0) return
    try {
      // 레코드마다 prev_status가 다를 수 있어 순차 호출 (race condition 방지)
      const selected = trashRecords.filter(r => selectedIds.has(r.id))
      for (const r of selected) {
        await setRecordStatus(r.id, r.prev_status ?? 'pending')
      }
      setSelectedIds(new Set())
    } catch (err) {
      alert(`복원 실패: ${err.message}`)
    }
  }

  async function handleDeleteConfirm() {
    try {
      await bulkDelete([...selectedIds])
      setSelectedIds(new Set())
    } catch (err) {
      alert(`삭제 실패: ${err.message}`)
    } finally {
      setShowModal(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-ink-strong">삭제 대기 목록</h1>
            <p className="text-sm text-ink-muted mt-1">전체 {trashRecords.length}건</p>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">{selectedIds.size}건 선택</span>
              <button
                onClick={handleRestore}
                className="text-sm border border-stroke text-ink-base px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
              >
                ↩ 복원
              </button>
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setShowModal(true)}
                  className="text-sm bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  🗑️ 영구 삭제
                </button>
              )}
            </div>
          )}
        </div>

        {/* 테이블 */}
        <div className="bg-card rounded-xl border border-stroke shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface border-b border-stroke">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => toggleSelectAll(e.target.checked)}
                    className="w-3 h-3 accent-primary cursor-pointer"
                  />
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">파일명</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">소스</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">이전 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {trashRecords.map(record => (
                <tr key={record.id} className="hover:bg-primary-light transition-colors">
                  <td
                    className="px-4 py-3.5"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelectOne(record.id)}
                      className="w-3 h-3 accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-ink-strong">📄 {record.source_filename}</td>
                  <td className="px-5 py-3.5 text-xs text-ink-muted">{record.source}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-ink-muted bg-surface px-2 py-0.5 rounded-full">
                      {record.prev_status ?? 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trashRecords.length === 0 && (
            <div className="text-center py-12 text-sm text-ink-muted">
              삭제 대기 중인 항목이 없습니다.
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ConfirmModal
          count={selectedIds.size}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
