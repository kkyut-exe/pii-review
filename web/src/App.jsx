// web/src/App.jsx
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { FileProvider, useFile } from './context/FileContext'
import MainLayout from './components/MainLayout'
import ListPage from './pages/ListPage'
import ReviewPage from './pages/ReviewPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DeletionQueuePage from './pages/DeletionQueuePage'
import DatasetsPage from './pages/DatasetsPage'
import DatasetRegisterPage from './pages/DatasetRegisterPage'
import EvalNewPage from './pages/EvalNewPage'
import EvalDetailPage from './pages/EvalDetailPage'
import EvalLayout, { EvalEmptyState } from './components/EvalLayout'
import { ThemeProvider } from './context/ThemeContext'

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
      { path: 'datasets', element: <DatasetsPage /> },
      { path: 'datasets/register', element: <DatasetRegisterPage /> },
      { path: 'datasets/version/:versionId', element: <DatasetsPage /> },
      { path: 'evals/new', element: <EvalNewPage /> },
      {
        path: 'evals',
        element: <EvalLayout />,
        children: [
          { index: true, element: <EvalEmptyState /> },
          { path: ':id', element: <EvalDetailPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider>
      <FileProvider>
        <RouterProvider router={router} />
      </FileProvider>
    </ThemeProvider>
  )
}
