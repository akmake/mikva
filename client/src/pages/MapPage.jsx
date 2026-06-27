import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix missing default marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

const MIKVAOT = [
  { id: 1, name: 'מקווה רחוב הרב קוק', lat: 31.776, lng: 35.214, city: 'ירושלים' },
  { id: 2, name: 'מקווה בני ברק מרכז', lat: 32.084, lng: 34.833, city: 'בני ברק' },
  { id: 3, name: 'מקווה גבעת שאול', lat: 31.791, lng: 35.185, city: 'ירושלים' },
]

export default function MapPage() {
  return (
    <div className="h-screen flex flex-col bg-blue-950">
      {/* Navbar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-blue-950 text-white shadow-md">
        <Link to="/" className="text-blue-300 hover:text-white transition text-sm">
          ← דף הבית
        </Link>
        <h2 className="font-bold text-lg">מפת מקוואות</h2>
      </div>

      {/* Map */}
      <div className="flex-1">
        <MapContainer
          center={[31.95, 35.1]}
          zoom={9}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {MIKVAOT.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]}>
              <Popup>
                <div className="text-right" dir="rtl">
                  <strong>{m.name}</strong>
                  <br />
                  {m.city}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
