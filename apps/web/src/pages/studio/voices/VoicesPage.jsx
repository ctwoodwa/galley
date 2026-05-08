import { useOutletContext } from 'react-router-dom'
import GeneratePanel from '../../../features/tts/GeneratePanel.jsx'

export default function VoicesPage() {
  const { selected } = useOutletContext()
  return (
    <div className="studio-page">
      {selected
        ? <GeneratePanel chapter={selected} />
        : <p className="studio-placeholder">Select a chapter from the sidebar to configure voices.</p>
      }
    </div>
  )
}
