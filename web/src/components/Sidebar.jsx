// web/src/components/Sidebar.jsx
import { useMemo, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useFile } from '../context/FileContext'
import { useTheme } from '../context/ThemeContext'
import logoImage from '../../../asset/images/logo.jpeg'

const NAV_ITEMS = [
  { to: '/',      end: true,  icon: '📊', label: '대시보드' },
  { to: '/list',  end: false, icon: '📋', label: '검수 목록' },
  { to: '/trash', end: false, icon: '🗑️', label: '삭제 대기' },
  { to: '/datasets', end: false, icon: '🗂️', label: '데이터셋 목록' },
  { to: '/datasets/register', end: false, icon: '➕', label: '데이터셋 등록' },
]

const KIND_LABELS = {
  golden: 'Golden Set',
  scenario: 'Scenario Set',
}

export default function Sidebar() {
  const { currentUser, records, datasets, logout } = useFile()
  const { isDark, toggleTheme } = useTheme()
  const location = useLocation()
  const [datasetsOpen, setDatasetsOpen] = useState(true)
  const [kindOpen, setKindOpen] = useState({ golden: true, scenario: true })
  const pendingDeleteCount = records.filter(r => r.status === 'pending_delete').length
  const groupedDatasets = useMemo(() => ({
    golden: datasets.filter(dataset => dataset.kind === 'golden'),
    scenario: datasets.filter(dataset => dataset.kind === 'scenario'),
  }), [datasets])

  return (
    <aside className="sticky top-0 w-60 h-screen bg-card border-r border-stroke flex flex-col shrink-0">
      {/* 로고 */}
      <div className="px-5 py-3.5 border-b border-stroke">
        <img
          src={logoImage}
          alt="PII Review"
          className="w-full h-10 object-contain object-left"
        />
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map(({ to, end, icon, label }) => {
          const badge = to === '/trash' ? pendingDeleteCount : 0
          const isDatasetRoot = to === '/datasets'
          return (
            <div key={to} className="block">
              <NavLink to={to} end={end} className="block">
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
                    {isDatasetRoot && (
                      <button
                        type="button"
                        onClick={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDatasetsOpen(open => !open)
                        }}
                        className="ml-auto text-xs text-ink-muted hover:text-ink-base"
                      >
                        {datasetsOpen ? '▾' : '▸'}
                      </button>
                    )}
                  </div>
                )}
              </NavLink>

              {isDatasetRoot && datasetsOpen && (
                <div className="px-3 py-2 space-y-1">
                  {(['golden', 'scenario']).map(kind => (
                    <div key={kind} className="rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setKindOpen(prev => ({ ...prev, [kind]: !prev[kind] }))}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-ink-base hover:bg-primary-light transition-colors"
                      >
                        <span className="text-[10px]">{kindOpen[kind] ? '▾' : '▸'}</span>
                        <span>{KIND_LABELS[kind]}</span>
                        <span className="ml-auto text-[10px] text-ink-muted">{groupedDatasets[kind].length}</span>
                      </button>
                      {kindOpen[kind] && (
                        <div className="px-2 pb-2 space-y-1">
                          {groupedDatasets[kind].length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-ink-muted">등록된 항목 없음</div>
                          )}
                          {groupedDatasets[kind].map(dataset => (
                            <div key={dataset.id} className="rounded-lg">
                              <div className="px-3 py-1.5 text-[11px] font-semibold text-ink-base truncate">
                                {dataset.name}
                              </div>
                              <div className="space-y-1">
                                {dataset.versions.map(version => {
                                  const active = location.pathname === `/datasets/version/${version.id}`
                                  return (
                                    <Link
                                      key={version.id}
                                      to={`/datasets/version/${version.id}`}
                                      className={`ml-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] transition-colors ${
                                        active ? 'bg-primary-light text-primary font-semibold' : 'text-ink-muted hover:bg-primary-light hover:text-ink-base'
                                      }`}
                                    >
                                      <span>v{version.version}</span>
                                      <span className="ml-auto text-[10px]">
                                        {version.matched_reviewed_count}/{version.total_items}
                                      </span>
                                    </Link>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* 유저 / 로그아웃 */}
      <div className="px-5 py-3 border-t border-stroke space-y-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center justify-between text-xs text-ink-base border border-stroke rounded-xl px-3 py-2 hover:bg-primary-light transition-colors"
        >
          <span>{isDark ? '다크모드' : '라이트모드'}</span>
          <span className="text-base leading-none">{isDark ? '🌙' : '☀️'}</span>
        </button>
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
