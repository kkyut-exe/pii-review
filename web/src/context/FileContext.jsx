import { createContext, useContext, useState } from 'react'

const FileContext = createContext(null)

export const PII_CATEGORIES = [
  'NAME', 'ADDRESS', 'POSTAL', 'RESIDENT', 'CONTACT',
  'EMAIL', 'BIRTHDATE', 'GENDER', 'AGE',
]

let nextFileId = 1

export function FileProvider({ children }) {
  // files: [{ id, handle, name, records }]
  const [files, setFiles] = useState([])
  const [activeFileId, setActiveFileId] = useState(null)

  const activeFile = files.find(f => f.id === activeFileId) ?? null
  const records = activeFile?.records ?? []
  const fileName = activeFile?.name ?? ''

  async function openFile() {
    const file = await _pickAndLoadFile()
    if (!file) return
    const id = nextFileId++
    setFiles(prev => [...prev, { ...file, id }])
    setActiveFileId(id)
  }

  async function addFile() {
    const file = await _pickAndLoadFile()
    if (!file) return
    const id = nextFileId++
    setFiles(prev => [...prev, { ...file, id }])
  }

  async function _pickAndLoadFile() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })
      const file = await handle.getFile()
      const text = await file.text()
      return { handle, name: file.name, records: JSON.parse(text) }
    } catch (err) {
      if (err.name !== 'AbortError') throw err
      return null
    }
  }

  async function saveReview(id, reviewedPiiDict) {
    const updated = records.map(r =>
      r.id === id
        ? {
            ...r,
            reviewed_pii_dict: reviewedPiiDict,
            status: 'reviewed',
            reviewed_at: new Date().toISOString(),
          }
        : r
    )
    setFiles(prev =>
      prev.map(f => f.id === activeFileId ? { ...f, records: updated } : f)
    )
    await _writeToFile(activeFile.handle, updated)
    return updated.find(r => r.id === id)
  }

  async function _writeToFile(handle, data) {
    if (!handle) throw new Error('파일이 열려있지 않습니다.')
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  async function exportReviewed() {
    const reviewed = records
      .filter(r => r.status === 'reviewed')
      .map(({ id, source_filename, doc_text, reviewed_pii_dict, reviewed_at }) => ({
        id,
        source_filename,
        doc_text,
        pii_dict: reviewed_pii_dict,
        reviewed_at,
      }))

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'reviewed_dataset.json',
        types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(reviewed, null, 2))
      await writable.close()
    } catch (err) {
      if (err.name !== 'AbortError') throw err
    }
  }

  return (
    <FileContext.Provider
      value={{
        files,
        activeFileId,
        setActiveFileId,
        records,
        fileName,
        openFile,
        addFile,
        saveReview,
        exportReviewed,
      }}
    >
      {children}
    </FileContext.Provider>
  )
}

export function useFile() {
  return useContext(FileContext)
}
