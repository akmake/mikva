import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import ZmanimMapPage from './pages/ZmanimMapPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/zmanim" element={<ZmanimMapPage />} />
      </Routes>
    </BrowserRouter>
  )
}
