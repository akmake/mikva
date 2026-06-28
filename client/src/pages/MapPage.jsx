import { MapContainer, TileLayer } from 'react-leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'

export default function MapPage() {
  return (
    <div className="h-screen flex flex-col bg-blue-950">
      <div className="flex items-center gap-4 px-6 py-3 bg-blue-950 text-white shadow-md z-10 relative">
        <Link to="/" className="text-blue-300 hover:text-white transition text-sm">← דף הבית</Link>
        <h2 className="font-bold text-lg">מפת מקוואות</h2>
      </div>

      <div className="flex-1 relative">
        <MapContainer center={[31.95, 35.1]} zoom={9} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </MapContainer>
      </div>
    </div>
  )
}
