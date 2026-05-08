import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import LibraryPage from '../../pages/library/LibraryPage.jsx'
import AppLayout from '../layouts/AppLayout.jsx'
import ReadPage from '../../pages/read/ReadPage.jsx'
import ReviewPage from '../../pages/review/ReviewPage.jsx'
import QueuePage from '../../pages/queue/QueuePage.jsx'
import LogsPage from '../../pages/logs/LogsPage.jsx'
import StudioLayout from '../../pages/studio/StudioLayout.jsx'
import VoicesPage from '../../pages/studio/voices/VoicesPage.jsx'
import SttQcPage from '../../pages/studio/stt-qc/SttQcPage.jsx'
import CoverArtPage from '../../pages/studio/cover-art/CoverArtPage.jsx'
import MusicPage from '../../pages/studio/music/MusicPage.jsx'

// Inference Studio (raw API exploration) is lazy-loaded — separate chunk
// keeps the editorial bundle small. Only loaded when /inference/* is visited.
const InferenceLayout = lazy(() => import('../../pages/inference/InferenceLayout.tsx'))
const InferenceVoicesPage = lazy(() => import('../../pages/inference/VoicesPage.tsx'))
const InferenceSttPage = lazy(() => import('../../pages/inference/SttPage.tsx'))
const InferenceImagePage = lazy(() => import('../../pages/inference/ImagePage.tsx'))
const InferenceMusicPage = lazy(() => import('../../pages/inference/MusicPage.tsx'))

const inferenceFallback = (
  <div className="flex items-center justify-center h-screen bg-bg text-text-dim text-sm">
    Loading Inference Studio…
  </div>
)
const wrap = (el) => <Suspense fallback={inferenceFallback}>{el}</Suspense>

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LibraryPage />,
  },
  {
    path: '/read/:bookId',
    element: <AppLayout />,
    children: [
      { index: true, element: <ReadPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'queue', element: <QueuePage /> },
      { path: 'logs', element: <LogsPage /> },
      {
        path: 'studio',
        element: <StudioLayout />,
        children: [
          { index: true, element: <Navigate to="voices" replace /> },
          { path: 'voices', element: <VoicesPage /> },
          { path: 'stt-qc', element: <SttQcPage /> },
          { path: 'cover-art', element: <CoverArtPage /> },
          { path: 'music', element: <MusicPage /> },
        ],
      },
    ],
  },
  {
    // Top-level inference studio (raw API exploration; not chapter-aware).
    // Distinct from /read/:bookId/studio/* which is editorial.
    // Lazy-loaded — its bundle (panels + wavesurfer + dnd-kit + etc.) only
    // downloads when the user navigates here.
    path: '/inference',
    element: wrap(<InferenceLayout />),
    children: [
      { index: true, element: <Navigate to="voices" replace /> },
      { path: 'voices', element: wrap(<InferenceVoicesPage />) },
      { path: 'stt', element: wrap(<InferenceSttPage />) },
      { path: 'image', element: wrap(<InferenceImagePage />) },
      { path: 'music', element: wrap(<InferenceMusicPage />) },
    ],
  },
])
