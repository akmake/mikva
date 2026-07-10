import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { api } from '../lib/api'

// אייקון-סיכה צבוע (divIcon) — ירוק = מפוקח ע"י המרכז הארצי, כתום = אחר
const pinIcon = (color) =>
  L.divIcon({
    className: 'mikva-pin',
    html: `<div style="
      width:18px;height:18px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18],
  })
const GREEN = pinIcon('#22c55e')
const ORANGE = pinIcon('#f97316')

export default function MapPage() {
  const [mikvas, setMikvas] = useState([])
  const [cities, setCities] = useState([])
  const [city, setCity] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.getMikvas({ withCoords: 1 }), api.getMikvaCities()])
      .then(([m, c]) => {
        setMikvas(m)
        setCities(c)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return mikvas.filter((m) => {
      if (city && m.city !== city) return false
      if (needle) {
        const hay = `${m.name} ${m.address} ${m.city}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [mikvas, city, q])

  return (
    <div className="h-screen flex flex-col bg-blue-950" dir="rtl">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-blue-950 text-white shadow-md z-10 relative">
        <Link to="/" className="text-blue-300 hover:text-white transition text-sm">
          ← דף הבית
        </Link>
        <h2 className="font-bold text-lg">מפת מקוואות</h2>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש שם / כתובת / עיר..."
          className="bg-blue-900 text-white placeholder-blue-300 rounded px-3 py-1 text-sm outline-none focus:ring-2 ring-blue-400 w-56"
        />

        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="bg-blue-900 text-white rounded px-3 py-1 text-sm outline-none focus:ring-2 ring-blue-400"
        >
          <option value="">כל הערים ({mikvas.length})</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>

        <span className="text-blue-200 text-sm mr-auto">
          מציג {filtered.length} מקוואות
        </span>
        <span className="flex items-center gap-3 text-xs text-blue-200">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> מפוקח
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-500" /> אחר
          </span>
        </span>
      </div>

      <div className="flex-1 relative">
        {error && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-blue-950/80 text-red-300">
            שגיאה בטעינת המקוואות: {error}
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-blue-950/60 text-white">
            טוען מקוואות...
          </div>
        )}
        <MapContainer center={[31.7, 35.0]} zoom={8} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
          {filtered.map((m) => (
            <Marker
              key={m.externalId}
              position={[m.lat, m.lng]}
              icon={m.supervised ? GREEN : ORANGE}
            >
              <Popup>
                <div dir="rtl" className="text-right space-y-1 min-w-[200px]">
                  <div className="font-bold text-base">{m.name}</div>
                  {m.city && <div className="text-gray-600 text-xs">{m.city}</div>}
                  {m.address && <div>📍 {m.address}</div>}
                  {m.phone && (
                    <div>
                      📞 <a href={`tel:${m.phone}`}>{m.phone}</a>
                    </div>
                  )}
                  {m.contact && <div>👤 {m.contact}</div>}
                  {m.openingHours && (
                    <div className="text-xs text-gray-700">🕒 {m.openingHours}</div>
                  )}
                  {m.services && (
                    <div className="text-xs text-gray-700">🛁 {m.services}</div>
                  )}
                  <div
                    className={`text-xs font-semibold ${
                      m.supervised ? 'text-green-700' : 'text-orange-700'
                    }`}
                  >
                    {m.supervised
                      ? '✓ מפוקח ע"י המרכז הארצי לטהרת המשפחה'
                      : 'אינו בפיקוח המרכז הארצי'}
                  </div>
                  {m.geoPrecision === 'city' && (
                    <div className="text-[10px] text-amber-600">
                      ⚠ מיקום מקורב (רמת עיר/יישוב)
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <a
                      href={`https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 text-xs"
                    >
                      Waze
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 text-xs"
                    >
                      Google Maps
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </div>
  )
}
