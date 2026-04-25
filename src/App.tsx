import { Navigate, Route, Routes } from 'react-router-dom'
import WarAdminPage from './pages/WarAdminPage'
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
      <Route path="/admin/missions" element={<WarAdminPage />} />
      <Route path="/admin/missions/:section" element={<WarAdminPage />} />
      <Route path="/admin/notifications" element={<WarAdminPage />} />
      <Route path="/admin/recruiter-applications" element={<WarAdminPage />} />
      <Route path="/admin/recruits" element={<WarAdminPage />} />
      <Route path="/admin/social-checks" element={<WarAdminPage />} />
      <Route path="/admin/risk" element={<WarAdminPage />} />
      <Route path="/admin/leaderboards" element={<WarAdminPage />} />
      <Route path="/admin/prizes" element={<WarAdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
