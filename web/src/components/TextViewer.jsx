import { useState, useRef, useEffect } from 'react'

const CATEGORY_COLORS = {
  NAME:      'bg-yellow-200 text-yellow-900',
  ADDRESS:   'bg-blue-200 text-blue-900',
  POSTAL:    'bg-purple-200 text-purple-900',
  RESIDENT:  'bg-red-200 text-red-900',
  CONTACT:   'bg-green-200 text-green-900',
  EMAIL:     'bg-pink-200 text-pink-900',
  BIRTHDATE: 'bg-orange-200 text-orange-900',
  GENDER:    'bg-teal-200 text-teal-900',
  AGE:       'bg-indigo-200 text-indigo-900',
}

export default function TextViewer({ text, piiDict }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [matchIndex, setMatchIndex] = useState(0)
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  const segments = buildSegments(text, piiDict, searchQuery)
  const totalMatches = searchQuery
    ? segments.filter(s => s.type === 'search').length
    : 0

  useEffect(() => { setMatchIndex(0) }, [searchQuery])

  useEffect(() => {
    if (!searchQuery || totalMatches === 0) return
    const el = containerRef.current?.querySelector(`[data-match="${matchIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [matchIndex, searchQuery, totalMatches])

  function prevMatch() { setMatchIndex(i => (i - 1 + totalMatches) % totalMatches) }
  function nextMatch() { setMatchIndex(i => (i + 1) % totalMatches) }

  let searchMatchCounter = 0

  return (
    <div className="flex flex-col h-full" ref={containerRef} tabIndex={-1}>
      {searchOpen && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') e.shiftKey ? prevMatch() : nextMatch()
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') }
            }}
            placeholder="텍스트 검색..."
            className="flex-1 text-sm outline-none border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-400"
          />
          {searchQuery && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {totalMatches > 0 ? `${matchIndex + 1} / ${totalMatches}` : '없음'}
            </span>
          )}
          <button onClick={prevMatch} disabled={totalMatches === 0} className="text-gray-500 hover:text-gray-700 disabled:opacity-30 px-1 text-sm">↑</button>
          <button onClick={nextMatch} disabled={totalMatches === 0} className="text-gray-500 hover:text-gray-700 disabled:opacity-30 px-1 text-sm">↓</button>
          <button onClick={() => { setSearchOpen(false); setSearchQuery('') }} className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
          {segments.map((seg, i) => {
            if (seg.type === 'text') return <span key={i}>{seg.value}</span>
            if (seg.type === 'pii') {
              const colorClass = CATEGORY_COLORS[seg.category] ?? 'bg-gray-200 text-gray-800'
              return <mark key={i} title={seg.category} className={`rounded px-0.5 ${colorClass}`}>{seg.value}</mark>
            }
            if (seg.type === 'search') {
              const idx = searchMatchCounter++
              const isCurrent = idx === matchIndex
              return (
                <mark key={i} data-match={idx} className={`rounded px-0.5 ${isCurrent ? 'bg-orange-400 text-white' : 'bg-yellow-200 text-yellow-900'}`}>
                  {seg.value}
                </mark>
              )
            }
            return null
          })}
        </div>
      </div>
    </div>
  )
}

function buildSegments(text, piiDict, searchQuery) {
  if (!text) return []

  const piiRanges = []
  for (const [category, values] of Object.entries(piiDict ?? {})) {
    for (const val of values ?? []) {
      if (!val) continue
      let idx = 0
      while (idx < text.length) {
        const found = text.indexOf(val, idx)
        if (found === -1) break
        piiRanges.push({ start: found, end: found + val.length, category, value: val })
        idx = found + val.length
      }
    }
  }

  piiRanges.sort((a, b) => a.start - b.start || b.value.length - a.value.length)
  const filteredPii = []
  let lastEnd = 0
  for (const r of piiRanges) {
    if (r.start >= lastEnd) { filteredPii.push(r); lastEnd = r.end }
  }

  const rawSegments = []
  let cursor = 0
  for (const r of filteredPii) {
    if (cursor < r.start) rawSegments.push({ type: 'text', value: text.slice(cursor, r.start) })
    rawSegments.push({ type: 'pii', value: r.value, category: r.category })
    cursor = r.end
  }
  if (cursor < text.length) rawSegments.push({ type: 'text', value: text.slice(cursor) })

  if (!searchQuery) return rawSegments

  const result = []
  const qLower = searchQuery.toLowerCase()
  for (const seg of rawSegments) {
    if (seg.type !== 'text') { result.push(seg); continue }
    let i = 0
    const segLower = seg.value.toLowerCase()
    while (i < seg.value.length) {
      const found = segLower.indexOf(qLower, i)
      if (found === -1) { result.push({ type: 'text', value: seg.value.slice(i) }); break }
      if (found > i) result.push({ type: 'text', value: seg.value.slice(i, found) })
      result.push({ type: 'search', value: seg.value.slice(found, found + searchQuery.length) })
      i = found + searchQuery.length
    }
  }
  return result
}
