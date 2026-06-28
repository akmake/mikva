import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MapPage from './pages/MapPage'
import ZmanimMapPage from './pages/ZmanimMapPage'
import HebrewCalendarPage from './pages/HebrewCalendarPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/zmanim" element={<ZmanimMapPage />} />
        <Route path="/calendar" element={<HebrewCalendarPage />} />
      </Routes>
    </BrowserRouter>
  )
}
