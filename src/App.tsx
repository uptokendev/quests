import { Navigate, Route, Routes } from 'react-router-dom'
import WarMissionsPage from './pages/WarMissionsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WarMissionsPage />} />
      <Route path="/missions" element={<WarMissionsPage />} />
      <Route path="/missions/:section" element={<WarMissionsPage />} />
      <Route path="/profile/missions" element={<WarMissionsPage />} />
      <Route path="/profile/squad" element={<WarMissionsPage />} />
      <Route path="/recruiter/apply" element={<WarMissionsPage />} />
      <Route path="/recruiter/portal" element={<WarMissionsPage />} />
      <Route path="/admin/missions" element={<WarMissionsPage />} />
      <Route path="/admin/missions/:section" element={<WarMissionsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
