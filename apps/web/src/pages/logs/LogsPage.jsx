import { useOutletContext, useNavigate } from 'react-router-dom'
import LogPanel from '../../features/build-logs/LogPanel.jsx'

export default function LogsPage() {
  const { bookId } = useOutletContext()
  const navigate = useNavigate()
  return (
    <div className="page-full">
      <LogPanel
        bookId={bookId}
        onClose={() => navigate(`/read/${bookId}`)}
        inline
      />
    </div>
  )
}
