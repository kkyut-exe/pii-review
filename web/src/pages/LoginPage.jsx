// web/src/pages/LoginPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import { useTheme } from '../context/ThemeContext'

export default function LoginPage() {
  const { login } = useFile()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 relative overflow-hidden">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 text-xs text-ink-base border border-stroke bg-card rounded-full px-3 py-2 hover:bg-primary-light transition-colors"
      >
        {isDark ? '🌙 다크' : '☀️ 라이트'}
      </button>
      <div className="bg-card rounded-2xl shadow-md border border-stroke p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏷️</div>
          <h1 className="text-2xl font-bold text-primary">PII 검수</h1>
          <p className="text-sm text-ink-muted mt-1">개인정보 라벨링 검수 시스템</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ink-base mb-1.5">아이디</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full border border-stroke rounded-lg px-3 py-2.5 text-sm text-ink-strong outline-none focus:ring-2 focus:ring-primary bg-card"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-base mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-stroke rounded-lg px-3 py-2.5 text-sm text-ink-strong outline-none focus:ring-2 focus:ring-primary bg-card"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-white text-sm py-2.5 rounded-lg font-semibold disabled:opacity-50 transition-colors mt-2"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
