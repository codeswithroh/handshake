import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { DashboardLayout } from './components/DashboardLayout'
import { LivePage } from './pages/LivePage'
import { HirePage } from './pages/HirePage'
import { JobPage } from './pages/JobPage'
import { AgentsPage } from './pages/AgentsPage'
import { BuildPage } from './pages/BuildPage'
import { BreakItPage } from './pages/BreakItPage'
import { JudgePage } from './pages/JudgePage'

function JobIdRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/dashboard/job/${id ?? ''}`} replace />
}

function Dashboard() {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<LivePage />} />
        <Route path="/hire" element={<HirePage />} />
        <Route path="/job/:id" element={<JobPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/break-it" element={<BreakItPage />} />
        <Route path="/judge" element={<JudgePage />} />
        <Route path="/build" element={<BuildPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        {/* Legacy routes: redirect into dashboard */}
        <Route path="/hire" element={<Navigate to="/dashboard/hire" replace />} />
        <Route path="/job/:id" element={<JobIdRedirect />} />
        <Route path="/agents" element={<Navigate to="/dashboard/agents" replace />} />
        <Route path="/break-it" element={<Navigate to="/dashboard/break-it" replace />} />
        <Route path="/judge" element={<Navigate to="/dashboard/judge" replace />} />
        <Route path="/build" element={<Navigate to="/dashboard/build" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
