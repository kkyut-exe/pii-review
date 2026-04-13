import { useState } from 'react'
import { PII_CATEGORIES } from '../context/FileContext'
import PiiChip from './PiiChip'

const CATEGORY_LABELS = {
  NAME: '이름', ADDRESS: '주소', POSTAL: '우편번호', RESIDENT: '주민등록번호',
  CONTACT: '연락처', EMAIL: '이메일', BIRTHDATE: '생년월일', GENDER: '성별', AGE: '나이',
}

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

const BORDER_COLORS = {
  NAME:      'border-l-yellow-400',
  ADDRESS:   'border-l-blue-400',
  POSTAL:    'border-l-purple-400',
  RESIDENT:  'border-l-red-400',
  CONTACT:   'border-l-green-400',
  EMAIL:     'border-l-pink-400',
  BIRTHDATE: 'border-l-orange-400',
  GENDER:    'border-l-teal-400',
  AGE:       'border-l-indigo-400',
}

export default function PiiEditor({ piiDict, onChange, docText }) {
  const [addingTo, setAddingTo] = useState(null)
  const [newValue, setNewValue] = useState('')
  const [dragItem, setDragItem] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function handleAdd(category) {
    const trimmed = newValue.trim()
    if (trimmed) {
      if (docText && !docText.includes(trimmed)) {
        const ok = window.confirm(`"${trimmed}"이(가) 원문 텍스트에 없습니다. 그래도 추가하시겠습니까?`)
        if (!ok) {
          setNewValue('')
          setAddingTo(null)
          return
        }
      }
      onChange({ ...piiDict, [category]: [...(piiDict[category] ?? []), trimmed] })
    }
    setNewValue('')
    setAddingTo(null)
  }

  function handleDelete(category, index) {
    onChange({ ...piiDict, [category]: piiDict[category].filter((_, i) => i !== index) })
  }

  function handleEdit(category, index, newVal) {
    onChange({ ...piiDict, [category]: piiDict[category].map((v, i) => (i === index ? newVal : v)) })
  }

  function handleDragStart(category, index) {
    setDragItem({ category, index, value: piiDict[category][index] })
  }

  function handleDrop(toCategory) {
    if (!dragItem || dragItem.category === toCategory) {
      setDragItem(null)
      setDragOver(null)
      return
    }
    onChange({
      ...piiDict,
      [dragItem.category]: piiDict[dragItem.category].filter((_, i) => i !== dragItem.index),
      [toCategory]: [...(piiDict[toCategory] ?? []), dragItem.value],
    })
    setDragItem(null)
    setDragOver(null)
  }

  function renderCategory(category) {
    const values = piiDict[category] ?? []
    const isDropTarget = dragOver === category && dragItem?.category !== category

    return (
      <div
        key={category}
        onDragOver={e => { e.preventDefault(); setDragOver(category) }}
        onDragLeave={() => setDragOver(null)}
        onDrop={() => handleDrop(category)}
        className={`border border-l-4 ${BORDER_COLORS[category]} rounded-xl p-3 transition-colors ${
          isDropTarget ? 'border-primary bg-primary-light' : 'border-stroke'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${CATEGORY_COLORS[category]}`}>
            {category}
          </span>
          <span className="text-xs text-ink-muted">{CATEGORY_LABELS[category]}</span>
          {values.length > 0 && (
            <span className="text-xs bg-primary-light text-primary rounded-full px-1.5 py-0.5 ml-auto font-semibold">
              {values.length}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {values.map((v, i) => (
            <PiiChip
              key={`${v}-${i}`}
              value={v}
              category={category}
              onDelete={() => handleDelete(category, i)}
              onEdit={newVal => handleEdit(category, i, newVal)}
              onDragStart={() => handleDragStart(category, i)}
            />
          ))}

          {values.length > 0 && addingTo !== category && (
            <button
              onClick={() => { setAddingTo(category); setNewValue('') }}
              className="text-xs text-ink-muted hover:text-ink-base hover:bg-primary-light rounded-md px-2 py-1 transition-colors"
            >
              +
            </button>
          )}
        </div>

        {addingTo === category ? (
          <input
            autoFocus
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd(category)
              if (e.key === 'Escape') setAddingTo(null)
            }}
            onBlur={() => handleAdd(category)}
            placeholder="입력 후 Enter"
            className="mt-2 w-full text-sm border border-primary rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary text-ink-strong"
          />
        ) : values.length === 0 && (
          <button
            onClick={() => { setAddingTo(category); setNewValue('') }}
            className="mt-1 w-full text-left text-xs text-ink-muted italic hover:text-ink-base hover:bg-primary-light rounded-md px-2 py-1 transition-colors"
          >
            + 추가
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {PII_CATEGORIES.map(renderCategory)}
    </div>
  )
}
