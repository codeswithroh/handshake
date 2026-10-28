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
        <footer className="text-center py-6 text-xs" style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
          Independent project built with{' '}
          <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer" className="hover:opacity-80" style={{ color: 'var(--ink-2)' }}>
            Arc Studio
          </a>
          . Not affiliated with Circle.
        </footer>
      </div>
    </BrowserRouter>
  )
}
