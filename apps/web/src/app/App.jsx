import { RouterProvider } from 'react-router-dom'
import { router } from './router/index.jsx'
import { ThemeProvider } from './ThemeProvider.tsx'

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
