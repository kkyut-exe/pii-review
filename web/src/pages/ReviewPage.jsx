import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import PiiEditor from '../components/PiiEditor'
import StatusBadge from '../components/StatusBadge'
import TextViewer from '../components/TextViewer'

export default function ReviewPage() {
  const { id } = useParams()
  const { records, saveReview, setRecordStatus } = useFile()
  const navigate = useNavigate()

  const currentIndex = records.findIndex(r => r.id === id)
  const record = currentIndex !== -1 ? records[currentIndex] : null

  const [piiDict, setPiiDict] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    if (record) {
      setPiiDict(record.reviewed_pii_dict ?? record.pii_dict)
      if (record.status === 'pending') {
        setRecordStatus(record.id, 'reviewing').catch(() => {})
      }
    }
  }, [record?.id])

  const handleSave = useCallback(async () => {
    if (!piiDict || saving) return
    setSaving(true)
    try {
      await saveReview(id, piiDict)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } catch (err) {
      if (err.name !== 'NotAllowedError') alert(`저장 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }, [id, piiDict, saving, saveReview])

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  function goTo(index) {
    if (index >= 0 && index < records.length) {
      navigate(`/review/${records[index].id}`)
    }
  }

  if (!record || !piiDict) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        레코드를 찾을 수 없습니다.{' '}
        <button onClick={() => navigate('/')} className="ml-2 underline hover:text-gray-600">목록으로</button>
      </div>
    )
  }

  return (
    <div className="h-screen bg-white flex flex-col">
      <header className="shrink-0 border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0">
            ← 목록으로
          </button>
          <span className="text-gray-200 shrink-0">|</span>
          <span className="text-sm text-gray-700 font-medium truncate">📄 {record.source_filename}</span>
          <StatusBadge status={record.status} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex <= 0}
              className="text-sm text-gray-400 hover:text-gray-700 disabled:opacity-30 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              ‹ 이전
            </button>
            <span className="text-xs text-gray-300">{currentIndex + 1} / {records.length}</span>
            <button
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= records.length - 1}
              className="text-sm text-gray-400 hover:text-gray-700 disabled:opacity-30 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              다음 ›
            </button>
          </div>

          <span className="text-gray-200">|</span>

          {savedMsg && <span className="text-xs text-green-500 font-medium">저장됨 ✓</span>}
          {record.status === 'reviewed' && (
            <button
              onClick={() => setRecordStatus(record.id, 'reviewing').catch(() => {})}
              className="text-sm text-blue-500 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              검수중으로 변경
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gray-900 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            title="저장 (Ctrl+S)"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌: 원문 텍스트 */}
        <div className="w-1/2 border-r border-gray-100 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 pb-2 shrink-0 flex items-center gap-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">원문 텍스트</h2>
            <span className="text-xs text-gray-300">— Ctrl+F로 검색</span>
          </div>
          <TextViewer
            text={record.doc_text}
            piiDict={piiDict}
            onAddPii={(category, value) =>
              setPiiDict(prev => ({ ...prev, [category]: [...(prev[category] ?? []), value] }))
            }
          />
        </div>

        {/* 우: PII 검수 */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 pb-2 shrink-0">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">PII 검수</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <PiiEditor piiDict={piiDict} onChange={setPiiDict} docText={record.doc_text} />
          </div>
        </div>
      </div>
    </div>
  )
}
