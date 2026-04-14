// web/src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { useFile } from '../context/FileContext'

const NAV_ITEMS = [
  { to: '/',      end: true,  icon: '📊', label: '대시보드' },
  { to: '/list',  end: false, icon: '📋', label: '검수 목록' },
  { to: '/trash', end: false, icon: '🗑️', label: '삭제 대기' },
]

export default function Sidebar() {
  const { currentUser, records, logout } = useFile()
  const pendingDeleteCount = records.filter(r => r.status === 'pending_delete').length

  return (
    <aside className="w-60 min-h-screen bg-card border-r border-stroke flex flex-col shrink-0">
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-stroke">
        <span className="text-sm font-bold text-ink-strong">
          PII <span className="text-primary">Review</span>
        </span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map(({ to, end, icon, label }) => {
          const badge = to === '/trash' ? pendingDeleteCount : 0
          return (
            <NavLink key={to} to={to} end={end} className="block">
              {({ isActive }) => (
                <div className={`relative flex items-center gap-3 px-5 py-2.5 text-sm cursor-pointer transition-colors
                  ${isActive
                    ? 'bg-primary-light text-primary font-semibold'
                    : 'text-ink-base hover:bg-primary-light'}`}>
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-r" />
                  )}
                  <span>{icon}</span>
                  <span>{label}</span>
                  {badge > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-px leading-none">
                      {badge}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* 유저 / 로그아웃 */}
      <div className="px-5 py-3 border-t border-stroke">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary-light text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
            {currentUser?.username?.[0]?.toUpperCase()}
          </div>
          <span className="text-xs text-ink-muted flex-1 truncate">{currentUser?.username}</span>
          <button
            onClick={logout}
            className="text-xs text-ink-muted hover:text-ink-base px-1.5 py-0.5 rounded hover:bg-primary-light transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  )
}
