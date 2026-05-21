import { Navigate, Route, Routes } from 'react-router-dom'

import { HomePage } from './pages/HomePage'
import { DeleteDataPage } from './pages/DeleteDataPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { RidePage } from './pages/RidePage'
import { TermsPage } from './pages/TermsPage'

function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/ride/:rideId" element={<RidePage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/delete-account" element={<DeleteDataPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
