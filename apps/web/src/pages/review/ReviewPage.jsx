import { useOutletContext, useNavigate } from 'react-router-dom'
import ReviewPanel from '../../features/review-sessions/ReviewPanel.jsx'

export default function ReviewPage() {
  const { bookId, reviewSession, fetchReviewSession } = useOutletContext()
  const navigate = useNavigate()
  return (
    <div className="page-full">
      <ReviewPanel
        bookId={bookId}
        session={reviewSession}
        onClose={() => navigate(`/read/${bookId}`)}
        onSessionUpdate={fetchReviewSession}
        inline
      />
    </div>
  )
}
