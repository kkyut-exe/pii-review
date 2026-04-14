// web/src/pages/ListPage.jsx
import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import StatusBadge from '../components/StatusBadge'

function normalizeText(value) {
  return (value ?? '').normalize('NFC').toLowerCase()
}

function totalPiiCount(record) {
  const dict = record.reviewed_pii_dict ?? record.pii_dict ?? {}
  return Object.values(dict).reduce((sum, arr) => sum + (arr?.length ?? 0), 0)
}

const ITEMS_PER_PAGE = 20

const FILTER_TABS = [
  { key: 'all',       label: '전체' },
  { key: 'pending',   label: '검수전' },
  { key: 'reviewing', label: '검수중' },
  { key: 'reviewed',  label: '검수완료' },
]

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <span className="text-ink-muted ml-1 text-xs">↕</span>
  return <span className="text-primary ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function ManualRecordModal({ onClose, onSubmit, submitting }) {
  const [sourceFilename, setSourceFilename] = useState('')
  const [docText, setDocText] = useState('')
  const [piiText, setPiiText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit({ sourceFilename, docText, piiText })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-2xl bg-card rounded-2xl border border-stroke shadow-xl">
        <div className="px-6 py-4 border-b border-stroke">
          <h2 className="text-lg font-bold text-ink-strong">단일 레코드 추가</h2>
          <p className="text-sm text-ink-muted mt-1">원문 텍스트는 필수이고, `pii_dict`는 dict 문자열로 넣어도 자동 파싱됩니다.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink-base">파일명</span>
            <input
              value={sourceFilename}
              onChange={e => setSourceFilename(e.target.value)}
              placeholder="비우면 자동 생성"
              className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-base">원문 텍스트</span>
            <textarea
              value={docText}
              onChange={e => setDocText(e.target.value)}
              required
              rows={8}
              placeholder="검수할 원문 텍스트를 입력하세요"
              className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-base">PII Dict</span>
            <textarea
              value={piiText}
              onChange={e => setPiiText(e.target.value)}
              rows={5}
              placeholder="예: {'NAME': ['홍길동'], 'EMAIL': ['test@example.com']}"
              className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary resize-y font-mono"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-ink-muted px-4 py-2 rounded-lg hover:bg-primary-light transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary-hover text-white text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-40 transition-colors"
            >
              {submitting ? '추가 중...' : '레코드 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ListPage() {
  const { currentUser, records, exportReviewed, uploadLog, logout, bulkUpdateStatus, createManualRecord } = useFile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState(searchParams.get('filter') ?? 'all')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('source_filename')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const pendingCount   = records.filter(r => r.status === 'pending').length
  const reviewingCount = records.filter(r => r.status === 'reviewing').length
  const reviewedCount  = records.filter(r => r.status === 'reviewed').length

  const filteredSorted = useMemo(() => {
    let result = records.filter(r => r.status !== 'pending_delete')
    if (filter !== 'all') result = result.filter(r => r.status === filter)
    if (search.trim()) {
      const q = normalizeText(search.trim())
      result = result.filter(r => normalizeText(r.source_filename).includes(q))
    }
    result = [...result].sort((a, b) => {
      let av, bv
      if (sortField === 'source_filename') {
        av = a.source_filename ?? ''; bv = b.source_filename ?? ''
      } else if (sortField === 'status') {
        av = a.status; bv = b.status
      } else if (sortField === 'pii') {
        av = totalPiiCount(a); bv = totalPiiCount(b)
      } else if (sortField === 'reviewed_at') {
        av = a.reviewed_at ?? ''; bv = b.reviewed_at ?? ''
      } else {
        av = ''; bv = ''
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [records, filter, search, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / ITEMS_PER_PAGE))
  const pageRecords = filteredSorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  useEffect(() => {
    setPage(p => Math.min(p, totalPages))
  }, [totalPages])

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(1)
  }

  function handleFilterChange(key) {
    setFilter(key)
    setSearchParams(key !== 'all' ? { filter: key } : {}, { replace: true })
    setPage(1)
  }

  function handleSearch(e) {
    setSearch(e.target.value)
    setPage(1)
  }

  const allPageSelected = pageRecords.length > 0 && pageRecords.every(r => selectedIds.has(r.id))

  function toggleSelectAll(checked) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) pageRecords.forEach(r => next.add(r.id))
      else pageRecords.forEach(r => next.delete(r.id))
      return next
    })
  }

  function toggleSelectOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleMoveToTrash() {
    try {
      await bulkUpdateStatus([...selectedIds], 'pending_delete')
      setSelectedIds(new Set())
    } catch (err) {
      alert(`실패: ${err.message}`)
    }
  }

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

  async function handleCreateManualRecord({ sourceFilename, docText, piiText }) {
    setManualSubmitting(true)
    try {
      const created = await createManualRecord({
        sourceFilename,
        docText,
        piiDict: piiText,
      })
      setManualModalOpen(false)
      navigate(`/review/${created.id}`)
    } catch (err) {
      alert(`추가 실패: ${err.message}`)
    } finally {
      setManualSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* 헤더 */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-ink-strong">검수 목록</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-ink-muted">
              <span>전체 {records.length}건</span>
              <span className="text-status-pending-fg">● 검수전 {pendingCount}</span>
              {reviewingCount > 0 && <span className="text-status-reviewing-fg">● 검수중 {reviewingCount}</span>}
              <span className="text-status-reviewed-fg">✓ 완료 {reviewedCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {reviewedCount > 0 && (
              <button
                onClick={exportReviewed}
                className="text-sm text-ink-base border border-stroke px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
              >
                Export
              </button>
            )}
            {currentUser?.role === 'admin' && (
              <>
                <button
                  onClick={() => setManualModalOpen(true)}
                  className="text-sm text-ink-base border border-stroke px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
                >
                  + 단일 레코드 추가
                </button>
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
                  className="text-sm text-ink-base border border-stroke px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {uploading ? '업로드 중...' : '+ 로그 업로드'}
                </button>
              </>
            )}
            <button
              onClick={logout}
              className="text-sm text-ink-muted px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        {uploadMsg && (
          <p className="text-sm text-ink-muted mb-4">{uploadMsg}</p>
        )}

        {/* 필터 탭 + 검색 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            {FILTER_TABS.map(({ key, label }) => {
              const count = key === 'all' ? records.length
                : key === 'pending' ? pendingCount
                : key === 'reviewing' ? reviewingCount
                : reviewedCount
              return (
                <button
                  key={key}
                  onClick={() => handleFilterChange(key)}
                  className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
                    filter === key
                      ? 'bg-primary text-white font-semibold'
                      : 'text-ink-base hover:bg-primary-light'
                  }`}
                >
                  {label} <span className={filter === key ? 'opacity-70' : 'text-ink-muted'}>{count}</span>
                </button>
              )
            })}
          </div>
          <input
            value={search}
            onChange={handleSearch}
            placeholder="파일명 검색..."
            className="text-sm border border-stroke rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary bg-card w-48 text-ink-strong placeholder:text-ink-muted"
          />
        </div>

        {/* 테이블 */}
        <div className="bg-card rounded-xl border border-stroke shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface border-b border-stroke">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={e => toggleSelectAll(e.target.checked)}
                    className="w-3 h-3 accent-primary cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSort('source_filename')}
                  className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide cursor-pointer hover:text-ink-strong select-none"
                >
                  파일명<SortIcon field="source_filename" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">소스</th>
                <th
                  onClick={() => handleSort('status')}
                  className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide cursor-pointer hover:text-ink-strong select-none"
                >
                  상태<SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  onClick={() => handleSort('pii')}
                  className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide cursor-pointer hover:text-ink-strong select-none"
                >
                  PII<SortIcon field="pii" sortField={sortField} sortDir={sortDir} />
                </th>
                <th
                  onClick={() => handleSort('reviewed_at')}
                  className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide cursor-pointer hover:text-ink-strong select-none"
                >
                  검수일<SortIcon field="reviewed_at" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {pageRecords.map(record => (
                <tr
                  key={record.id}
                  onClick={() => navigate(`/review/${record.id}`)}
                  className="hover:bg-primary-light cursor-pointer transition-colors group"
                >
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
                  <td className="px-5 py-3.5"><StatusBadge status={record.status} /></td>
                  <td className="px-5 py-3.5 text-sm">
                    {totalPiiCount(record) > 0 ? (
                      <span className="bg-primary-light text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
                        {totalPiiCount(record)}
                      </span>
                    ) : (
                      <span className="text-ink-muted">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-ink-muted">
                    {record.reviewed_at
                      ? new Date(record.reviewed_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                      : '-'}
                  </td>
                  <td className="px-5 py-3.5 text-ink-muted group-hover:text-ink-base text-right transition-colors">→</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSorted.length === 0 && (
            <div className="text-center py-12 text-sm text-ink-muted">
              {records.length === 0 ? '로그를 업로드하면 레코드가 나타납니다.' : '해당하는 항목이 없습니다.'}
            </div>
          )}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-ink-strong text-white px-5 py-3 rounded-b-xl -mt-px">
              <span className="text-sm font-bold text-purple-300">{selectedIds.size}건</span>
              <span className="text-sm text-white/70">선택됨</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-white/50 border border-white/20 rounded-lg px-3 py-1 hover:text-white hover:border-white/40 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleMoveToTrash}
                className="ml-auto text-sm bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg px-4 py-1.5 transition-colors"
              >
                🗑️ 삭제 대기로 이동
              </button>
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-1 mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm text-ink-muted px-2.5 py-1 rounded-lg hover:bg-primary-light disabled:opacity-30 transition-colors"
            >
              이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`text-sm px-2.5 py-1 rounded-lg transition-colors ${
                  p === page ? 'bg-primary text-white' : 'text-ink-base hover:bg-primary-light'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-sm text-ink-muted px-2.5 py-1 rounded-lg hover:bg-primary-light disabled:opacity-30 transition-colors"
            >
              다음
            </button>
          </div>
        )}

      </div>
      {manualModalOpen && (
        <ManualRecordModal
          onClose={() => setManualModalOpen(false)}
          onSubmit={handleCreateManualRecord}
          submitting={manualSubmitting}
        />
      )}
    </div>
  )
}
