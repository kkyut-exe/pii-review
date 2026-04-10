import { createHashRouter, RouterProvider } from 'react-router-dom'
import { FileProvider } from './context/FileContext'
import ListPage from './pages/ListPage'
import ReviewPage from './pages/ReviewPage'

const router = createHashRouter([
  { path: '/', element: <ListPage /> },
  { path: '/review/:id', element: <ReviewPage /> },
])

export default function App() {
  return (
    <FileProvider>
      <RouterProvider router={router} />
    </FileProvider>
  )
}
