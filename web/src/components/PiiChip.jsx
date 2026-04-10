import { useState, useRef, useEffect } from 'react'

export default function PiiChip({ value, category, onEdit, onDelete, onDragStart }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  function submitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== value) onEdit(trimmed)
    else setEditValue(value)
    setIsEditing(false)
  }

  function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.()
  }

  return (
    <div
      draggable={!isEditing}
      onDragStart={handleDragStart}
      className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 rounded-md px-2 py-1 text-sm transition-colors cursor-grab active:cursor-grabbing select-none"
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={submitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') submitEdit()
            if (e.key === 'Escape') { setEditValue(value); setIsEditing(false) }
          }}
          className="bg-transparent outline-none min-w-[4rem] cursor-text"
          style={{ width: `${Math.max(editValue.length, 4)}ch` }}
        />
      ) : (
        <span
          onClick={() => setIsEditing(true)}
          className="cursor-text"
          title="클릭하여 수정"
        >
          {value}
        </span>
      )}

      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={onDelete}
        className="text-gray-400 hover:text-red-500 text-xs leading-none"
        title="삭제"
      >
        ✕
      </button>
    </div>
  )
}
