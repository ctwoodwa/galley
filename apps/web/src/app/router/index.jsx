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
])
