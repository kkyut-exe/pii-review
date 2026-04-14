// web/src/context/FileContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const FileContext = createContext(null)

export const PII_CATEGORIES = [
  'NAME', 'ADDRESS', 'POSTAL', 'RESIDENT', 'CONTACT',
  'EMAIL', 'BIRTHDATE', 'GENDER', 'AGE',
]

function resolveApiBase() {
  const envBase = import.meta.env.VITE_API_BASE?.trim()
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return 'http://localhost:8000'
}

const API_BASE = resolveApiBase()

function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).then(async res => {
    if (res.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.hash = '#/login'
      throw Object.assign(new Error('Unauthorized'), { status: 401 })
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    if (res.status === 204) {
      return null
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return null
    }
    return res.json()
  })
}

export function FileProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [records, setRecords] = useState([])
  const [datasets, setDatasets] = useState([])

  const fetchRecords = useCallback(() => {
    if (!currentUser) return
    apiFetch('/records?limit=500')
      .then(data => setRecords(data.items))
      .catch(() => {})
  }, [currentUser])

  const fetchDatasets = useCallback(() => {
    if (!currentUser) return
    apiFetch('/datasets')
      .then(data => setDatasets(data))
      .catch(() => {})
  }, [currentUser])

  useEffect(() => {
    fetchRecords()
    fetchDatasets()
  }, [fetchRecords, fetchDatasets])

  async function login(username, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setCurrentUser(data.user)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setCurrentUser(null)
    setRecords([])
    setDatasets([])
  }

  async function setRecordStatus(id, status) {
    const updated = await apiFetch(`/records/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
  }

  async function saveReview(id, reviewedPiiDict, complexity) {
    const updated = await apiFetch(`/records/${id}/review`, {
      method: 'PUT',
      body: JSON.stringify({ reviewed_pii_dict: reviewedPiiDict, complexity }),
    })
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    return updated
  }

  async function uploadLog(file) {
    const token = localStorage.getItem('token')
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/logs/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    const result = await res.json()
    await fetchRecords()  // 새 레코드 반영
    return result
  }

  async function bulkUpdateStatus(ids, newStatus) {
    await apiFetch('/records/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status: newStatus }),
    })
    await fetchRecords()
  }

  async function updateDocText(id, doc_text) {
    const updated = await apiFetch(`/records/${id}/doctext`, {
      method: 'PATCH',
      body: JSON.stringify({ doc_text }),
    })
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    return updated
  }

  async function renameRecord(id, source_filename) {
    const updated = await apiFetch(`/records/${id}/filename`, {
      method: 'PATCH',
      body: JSON.stringify({ source_filename }),
    })
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    return updated
  }

  async function bulkDelete(ids) {
    await apiFetch('/records/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
    await fetchRecords()
  }

  async function exportReviewed() {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/records/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reviewed_dataset.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function createManualRecord({ docText, sourceFilename, piiDict }) {
    const created = await apiFetch('/records/manual', {
      method: 'POST',
      body: JSON.stringify({
        doc_text: docText,
        source_filename: sourceFilename || null,
        pii_dict: piiDict || null,
      }),
    })
    await fetchRecords()
    return created
  }

  async function uploadDatasetVersion({ name, kind, version, filenameColumn, file }) {
    const token = localStorage.getItem('token')
    const formData = new FormData()
    formData.append('name', name)
    formData.append('kind', kind)
    formData.append('version', version)
    if (filenameColumn?.trim()) {
      formData.append('filename_column', filenameColumn.trim())
    }
    formData.append('file', file)

    const res = await fetch(`${API_BASE}/datasets/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    const result = await res.json()
    await fetchDatasets()
    return result
  }

  async function getDatasetVersion(versionId) {
    return apiFetch(`/datasets/versions/${versionId}`)
  }

  async function exportDatasetVersion(versionId, filename = 'dataset_export.jsonl') {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/datasets/versions/${versionId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    const data = await res.text()
    const blob = new Blob([data], { type: 'application/x-ndjson;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function deleteDataset(datasetId) {
    await apiFetch(`/datasets/${datasetId}`, {
      method: 'DELETE',
    })
    await fetchDatasets()
  }

  async function deleteDatasetVersion(versionId) {
    await apiFetch(`/datasets/versions/${versionId}`, {
      method: 'DELETE',
    })
    await fetchDatasets()
  }

  return (
    <FileContext.Provider value={{
      currentUser,
      records,
      datasets,
      login,
      logout,
      setRecordStatus,
      saveReview,
      uploadLog,
      exportReviewed,
      createManualRecord,
      fetchRecords,
      bulkUpdateStatus,
      bulkDelete,
      renameRecord,
      updateDocText,
      fetchDatasets,
      uploadDatasetVersion,
      getDatasetVersion,
      exportDatasetVersion,
      deleteDataset,
      deleteDatasetVersion,
    }}>
      {children}
    </FileContext.Provider>
  )
}

export function useFile() {
  return useContext(FileContext)
}
