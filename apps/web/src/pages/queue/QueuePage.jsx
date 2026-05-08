import { useOutletContext, useNavigate } from 'react-router-dom'
import QueuePanel from '../../features/render-queue/QueuePanel.jsx'

export default function QueuePage() {
  const { bookId, chapters, queue } = useOutletContext()
  const navigate = useNavigate()
  return (
    <div className="page-full">
      <QueuePanel
        chapters={chapters}
        queue={queue}
        onClose={() => navigate(`/read/${bookId}`)}
        inline
      />
    </div>
  )
}
