import { useOutletContext } from 'react-router-dom'
import QueuePanel from '../../features/render-queue/QueuePanel.jsx'

export default function QueuePage() {
  const { bookId, chapters, queue } = useOutletContext()
  return (
    <div className="page-full">
      <QueuePanel
        chapters={chapters}
        queue={queue}
        onClose={null}
        inline
      />
    </div>
  )
}
