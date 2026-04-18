// web/src/context/EvalContext.jsx
// /evals API 호출을 한 군데서 묶기 위한 가벼운 hook 모음.
// FileContext 처럼 전역 상태를 두지 않고, 각 페이지가 mount 시 fetch 하는 방식.
import { useCallback, useMemo } from 'react'

function resolveApiBase() {
  const envBase = import.meta.env.VITE_API_BASE?.trim()
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return 'http://localhost:8000'
}

const API_BASE = resolveApiBase()

function authHeader() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.hash = '#/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function useEvalsApi() {
  const listRuns = useCallback((params = {}) => {
    const q = new URLSearchParams(params).toString()
    return jsonFetch(`/evals/runs${q ? `?${q}` : ''}`)
  }, [])

  const getRun = useCallback((id) => jsonFetch(`/evals/runs/${id}`), [])

  const getRunDetails = useCallback((id, worstK = 10) =>
    jsonFetch(`/evals/runs/${id}/details?worst_top_k=${worstK}`), [])

  const createRun = useCallback((body) =>
    jsonFetch('/evals/runs', {
      method: 'POST',
      body: JSON.stringify(body),
    }), [])

  const deleteRun = useCallback((id) =>
    jsonFetch(`/evals/runs/${id}`, { method: 'DELETE' }), [])

  const uploadGolden = useCallback(async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_BASE}/evals/golden/upload`, {
      method: 'POST',
      headers: authHeader(),
      body: fd,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    return res.json()
  }, [])

  // 매 render 마다 새 객체가 리턴되면 호출자 useEffect deps 가 매번 바뀌어
  // 무한 루프가 발생함 → useMemo 로 객체 reference 를 고정.
  return useMemo(
    () => ({ listRuns, getRun, getRunDetails, createRun, deleteRun, uploadGolden }),
    [listRuns, getRun, getRunDetails, createRun, deleteRun, uploadGolden],
  )
}

export const PII_FIELDS = [
  'NAME', 'ADDRESS', 'POSTAL', 'RESIDENT', 'CONTACT',
  'EMAIL', 'BIRTHDATE', 'GENDER', 'AGE',
]
