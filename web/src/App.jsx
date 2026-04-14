// web/src/App.jsx
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { FileProvider, useFile } from './context/FileContext'
import MainLayout from './components/MainLayout'
import ListPage from './pages/ListPage'
import ReviewPage from './pages/ReviewPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DeletionQueuePage from './pages/DeletionQueuePage'

function RequireAuth({ children }) {
  const { currentUser } = useFile()
  if (!currentUser) return <Navigate to="/login" replace />
  return children
}

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/review/:id',
    element: <RequireAuth><ReviewPage /></RequireAuth>,
  },
  {
    path: '/',
    element: <RequireAuth><MainLayout /></RequireAuth>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'list', element: <ListPage /> },
      { path: 'trash', element: <DeletionQueuePage /> },
    ],
  },
])

export default function App() {
  return (
    <FileProvider>
      <RouterProvider router={router} />
    </FileProvider>
  )
}
