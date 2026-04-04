import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Navbar from './components/Navbar'
import CustomCursor from './components/CustomCursor'
import PageTransition from './components/PageTransition'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Analysis from './pages/Analysis'
import Explain from './pages/Explain'
import Mitigate from './pages/Mitigate'
import Report from './pages/Report'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  return (
    <BrowserRouter>
      {/* Global elements */}
      <CustomCursor />
      <div className="grain-overlay" aria-hidden="true" />

      {/* Top navigation */}
      <Navbar />

      {/* Page content — top padding accounts for fixed navbar height (64px) */}
      <main style={{ minHeight: '100vh', background: '#05080f' }}>
        <PageTransition>
          <Routes>
            <Route path="/"            element={<Landing />} />
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/upload"      element={<Upload />} />
            <Route path="/analysis/:id" element={<Analysis />} />
            <Route path="/analysis"    element={<Analysis />} />
            <Route path="/explain/:id" element={<Explain />} />
            <Route path="/explain"     element={<Explain />} />
            <Route path="/mitigate/:id" element={<Mitigate />} />
            <Route path="/mitigate"    element={<Mitigate />} />
            <Route path="/report/:id"  element={<Report />} />
            <Route path="/report"      element={<Report />} />
          </Routes>
        </PageTransition>
      </main>
    </BrowserRouter>
  )
}
