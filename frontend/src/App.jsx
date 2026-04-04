import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Analysis from './pages/Analysis'
import Explain from './pages/Explain'
import Mitigate from './pages/Mitigate'
import Report from './pages/Report'

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/upload', label: 'Upload' },
  { path: '/analysis', label: 'Analysis' },
  { path: '/explain', label: 'Explain' },
  { path: '/mitigate', label: 'Mitigate' },
  { path: '/report', label: 'Report' },
]

function Sidebar() {
  const location = useLocation()
  return (
    <aside className="w-56 bg-gray-900 text-white min-h-screen p-4 flex flex-col">
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold tracking-tight">FairLens</h1>
        <p className="text-xs text-gray-400 mt-1">AI Bias Detection</p>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-sky-600 text-white font-medium'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/analysis/:id" element={<Analysis />} />
            <Route path="/explain/:id" element={<Explain />} />
            <Route path="/mitigate/:id" element={<Mitigate />} />
            <Route path="/report/:id" element={<Report />} />
            <Route path="/report" element={<Report />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/explain" element={<Explain />} />
            <Route path="/mitigate" element={<Mitigate />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
