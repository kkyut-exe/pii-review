// web/src/App.jsx
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { FileProvider, useFile } from './context/FileContext'
import ListPage from './pages/ListPage'
import ReviewPage from './pages/ReviewPage'
import LoginPage from './pages/LoginPage'

function RequireAuth({ children }) {
  const { currentUser } = useFile()
  if (!currentUser) return <Navigate to="/login" replace />
  return children
}

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth><ListPage /></RequireAuth>,
  },
  {
    path: '/review/:id',
    element: <RequireAuth><ReviewPage /></RequireAuth>,
  },
])

export default function App() {
  return (
    <FileProvider>
      <RouterProvider router={router} />
    </FileProvider>
  )
}
