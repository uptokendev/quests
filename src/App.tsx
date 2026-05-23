import { Navigate, Route, Routes } from 'react-router-dom'
import AdminTabPage from './pages/AdminTabPage'
import SocialIdentityPanel from './components/SocialIdentityPanel'
import RecruiterApplyPage from './pages/RecruiterApplyPage'
import RecruiterPortalPage from './pages/RecruiterPortalPage'
import WarAdminPage from './pages/WarAdminPage'
import WarMissionsPage from './pages/WarMissionsPage'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<WarMissionsPage />} />
        <Route path="/missions" element={<WarMissionsPage />} />
        <Route path="/missions/:section" element={<WarMissionsPage />} />
        <Route path="/profile/missions" element={<WarMissionsPage />} />
        <Route path="/profile/squad" element={<WarMissionsPage />} />
        <Route path="/recruiter/apply" element={<RecruiterApplyPage />} />
        <Route path="/recruiter/portal" element={<RecruiterPortalPage />} />
        <Route path="/admin/missions" element={<WarAdminPage />} />
        <Route path="/admin/missions/:section" element={<AdminTabPage />} />
        <Route path="/admin/notifications" element={<AdminTabPage defaultTab="notifications" />} />
        <Route path="/admin/recruiter-applications" element={<AdminTabPage defaultTab="recruiters" />} />
        <Route path="/admin/recruits" element={<AdminTabPage defaultTab="users" />} />
        <Route path="/admin/social-checks" element={<AdminTabPage defaultTab="social" />} />
        <Route path="/admin/risk" element={<AdminTabPage defaultTab="users" />} />
        <Route path="/admin/leaderboards" element={<AdminTabPage defaultTab="overview" />} />
        <Route path="/admin/prizes" element={<AdminTabPage defaultTab="prizes" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SocialIdentityPanel />
    </>
  )
}
