// web/src/components/MainLayout.jsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function MainLayout() {
  return (
    <div className="flex items-start bg-surface">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
