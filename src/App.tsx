import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { LivePage } from './pages/LivePage'
import { HirePage } from './pages/HirePage'
import { JobPage } from './pages/JobPage'
import { AgentsPage } from './pages/AgentsPage'
import { BuildPage } from './pages/BuildPage'
import { BreakItPage } from './pages/BreakItPage'
import { JudgePage } from './pages/JudgePage'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <Nav />
        <Routes>
          <Route path="/" element={<LivePage />} />
          <Route path="/hire" element={<HirePage />} />
          <Route path="/job/:id" element={<JobPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/break-it" element={<BreakItPage />} />
          <Route path="/judge" element={<JudgePage />} />
          <Route path="/build" element={<BuildPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
