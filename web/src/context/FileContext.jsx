// web/src/context/FileContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const FileContext = createContext(null)

export const PII_CATEGORIES = [
  'NAME', 'ADDRESS', 'POSTAL', 'RESIDENT', 'CONTACT',
  'EMAIL', 'BIRTHDATE', 'GENDER', 'AGE',
]

const API_BASE = 'http://localhost:8000'

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
    return res.json()
  })
}

export function FileProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [records, setRecords] = useState([])

  const fetchRecords = useCallback(() => {
    if (!currentUser) return
    apiFetch('/records?limit=500')
      .then(data => setRecords(data.items))
      .catch(() => {})
  }, [currentUser])

  useEffect(() => { fetchRecords() }, [fetchRecords])

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

  return (
    <FileContext.Provider value={{
      currentUser,
      records,
      login,
      logout,
      setRecordStatus,
      saveReview,
      uploadLog,
      exportReviewed,
      fetchRecords,
    }}>
      {children}
    </FileContext.Provider>
  )
}

export function useFile() {
  return useContext(FileContext)
}
