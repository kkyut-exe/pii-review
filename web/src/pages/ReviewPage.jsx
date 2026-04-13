// web/src/pages/ReviewPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import PiiEditor from '../components/PiiEditor'
import StatusBadge from '../components/StatusBadge'
import TextViewer from '../components/TextViewer'

const COMPLEXITY_OPTIONS = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
]

export default function ReviewPage() {
  const { id } = useParams()
  const { records, saveReview, setRecordStatus } = useFile()
  const navigate = useNavigate()

  const currentIndex = records.findIndex(r => r.id === id)
  const record = currentIndex !== -1 ? records[currentIndex] : null

  const [piiDict, setPiiDict] = useState(null)
  const [complexity, setComplexity] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    if (record) {
      setPiiDict(record.reviewed_pii_dict ?? record.pii_dict)
      setComplexity(record.complexity ?? null)
      if (record.status === 'pending') {
        setRecordStatus(record.id, 'reviewing').catch(() => {})
      }
    }
  }, [record?.id])

  const handleSave = useCallback(async () => {
    if (!piiDict || !complexity || saving) return
    setSaving(true)
    try {
      await saveReview(id, piiDict, complexity)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } catch (err) {
      alert(`저장 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }, [id, piiDict, complexity, saving, saveReview])

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
      <div className="min-h-screen bg-surface flex items-center justify-center text-ink-muted text-sm">
        레코드를 찾을 수 없습니다.{' '}
        <button onClick={() => navigate('/')} className="ml-2 underline hover:text-ink-strong">목록으로</button>
      </div>
    )
  }

  const canSave = !!complexity && !saving

  return (
    <div className="h-screen bg-surface flex flex-col">
      <header className="shrink-0 bg-card border-b border-stroke shadow-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-ink-muted hover:text-ink-strong transition-colors shrink-0"
          >
            ← 목록으로
          </button>
          <span className="text-stroke shrink-0">|</span>
          <span className="text-sm text-ink-strong font-semibold truncate">📄 {record.source_filename}</span>
          <StatusBadge status={record.status} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* 복잡도 선택 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-muted">복잡도</span>
            {COMPLEXITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setComplexity(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  complexity === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'text-ink-base border-stroke hover:border-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="text-stroke">|</span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex <= 0}
              className="text-sm text-ink-muted hover:text-ink-strong disabled:opacity-30 px-2 py-1 rounded hover:bg-primary-light transition-colors"
            >
              ‹ 이전
            </button>
            <span className="text-xs text-ink-muted">{currentIndex + 1} / {records.length}</span>
            <button
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= records.length - 1}
              className="text-sm text-ink-muted hover:text-ink-strong disabled:opacity-30 px-2 py-1 rounded hover:bg-primary-light transition-colors"
            >
              다음 ›
            </button>
          </div>

          <span className="text-stroke">|</span>

          {savedMsg && <span className="text-xs text-[#1e7e34] font-semibold">저장됨 ✓</span>}
          {record.status === 'reviewed' && (
            <button
              onClick={() => setRecordStatus(record.id, 'reviewing').catch(() => {})}
              className="text-sm text-primary border border-primary px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
            >
              검수중으로 변경
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-primary hover:bg-primary-hover text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
            title={!complexity ? '복잡도를 선택하세요' : '저장 (Ctrl+S)'}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌: 원문 텍스트 */}
        <div className="w-1/2 border-r border-stroke flex flex-col overflow-hidden">
          <div className="px-6 pt-4 pb-2 shrink-0 flex items-center gap-2">
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">원문 텍스트</h2>
            <span className="text-xs text-ink-muted">— Ctrl+F로 검색</span>
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
            <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">PII 검수</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <PiiEditor piiDict={piiDict} onChange={setPiiDict} docText={record.doc_text} />
          </div>
        </div>
      </div>
    </div>
  )
}
