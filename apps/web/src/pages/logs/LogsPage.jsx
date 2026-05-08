import { useOutletContext } from 'react-router-dom'
import LogPanel from '../../features/build-logs/LogPanel.jsx'

export default function LogsPage() {
  const { bookId } = useOutletContext()
  return (
    <div className="page-full">
      <LogPanel bookId={bookId} onClose={null} inline />
    </div>
  )
}
