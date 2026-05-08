import { useOutletContext } from 'react-router-dom'
import ReviewPanel from '../../features/review-sessions/ReviewPanel.jsx'

export default function ReviewPage() {
  const { bookId, reviewSession, fetchReviewSession } = useOutletContext()
  return (
    <div className="page-full">
      <ReviewPanel
        bookId={bookId}
        session={reviewSession}
        onClose={null}
        onSessionUpdate={fetchReviewSession}
        inline
      />
    </div>
  )
}
