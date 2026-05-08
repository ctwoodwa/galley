import { Outlet, NavLink } from 'react-router-dom'

const STUDIO_ROUTES = [
  { path: '/studio/voices',    label: 'Voices' },
  { path: '/studio/stt-qc',   label: 'STT QC' },
  { path: '/studio/cover-art', label: 'Cover Art' },
  { path: '/studio/music',     label: 'Music' },
]

export default function StudioLayout() {
  return (
    <div className="studio-layout">
      <nav className="studio-subnav">
        {STUDIO_ROUTES.map(r => (
          <NavLink
            key={r.path}
            to={r.path}
            className={({ isActive }) => `studio-subnav-link${isActive ? ' active' : ''}`}
          >
            {r.label}
          </NavLink>
        ))}
      </nav>
      <div className="studio-content">
        <Outlet />
      </div>
    </div>
  )
}
