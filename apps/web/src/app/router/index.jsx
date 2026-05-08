import { createBrowserRouter, Navigate } from 'react-router-dom'
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
import InferenceLayout from '../../pages/inference/InferenceLayout.tsx'
import InferenceVoicesPage from '../../pages/inference/VoicesPage.tsx'
import InferenceSttPage from '../../pages/inference/SttPage.tsx'
import InferenceImagePage from '../../pages/inference/ImagePage.tsx'
import InferenceMusicPage from '../../pages/inference/MusicPage.tsx'

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
    path: '/inference',
    element: <InferenceLayout />,
    children: [
      { index: true, element: <Navigate to="voices" replace /> },
      { path: 'voices', element: <InferenceVoicesPage /> },
      { path: 'stt', element: <InferenceSttPage /> },
      { path: 'image', element: <InferenceImagePage /> },
      { path: 'music', element: <InferenceMusicPage /> },
    ],
  },
])
