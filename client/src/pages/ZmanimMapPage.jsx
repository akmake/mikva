import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import {
  ComplexZmanimCalendar,
  GeoLocation,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'
import tzlookup from 'tz-lookup'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

const WANTED_KEYS = [
  { key: 'AlosBaalHatanya',        label: 'עלות השחר — בעל התניא' },
  { key: 'Misheyakir10Point2Degrees', label: 'משיכיר — טלית (10.2°)' },
  { key: 'Sunrise',                label: 'זריחה' },
  { key: 'SofZmanShmaBaalHatanya', label: 'סוף ק"ש — בעל התניא' },
  { key: 'SofZmanTfilaBaalHatanya',label: 'סוף תפילה — בעל התניא' },
  { key: 'Chatzos',                label: 'חצות' },
  { key: 'MinchaGedolaBaalHatanya',label: 'מנחה גדולה — בעל התניא' },
  { key: 'MinchaKetanaBaalHatanya',label: 'מנחה קטנה — בעל התניא' },
  { key: 'PlagHaminchaBaalHatanya',label: 'פלג המנחה — בעל התניא' },
  { key: 'Sunset',                 label: 'שקיעה' },
  { key: 'TzaisBaalHatanya',       label: 'צאת — בעל התניא' },
  { key: 'SolarMidnight',          label: 'חצות הלילה' },
]

function fmtIso(val, tz) {
  if (!val || val === 'N/A') return null
  const d = new Date(val)
  if (isNaN(d)) return null
  return d.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  })
}

function buildCal(lat, lng, tz) {
  const geo = new GeoLocation('', lat, lng, 0, tz)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.local().setZone(tz))
  return cal
}

function extractZmanim(cal) {
  const z = ZmanimFormatter.toJSON(cal).Zmanim

  const directCalls = [
    ['AlosBaalHatanya',        () => cal.getAlosBaalHatanya()],
    ['SofZmanShmaBaalHatanya', () => cal.getSofZmanShmaBaalHatanya()],
    ['SofZmanTfilaBaalHatanya',() => cal.getSofZmanTfilaBaalHatanya()],
    ['MinchaGedolaBaalHatanya',() => cal.getMinchaGedolaBaalHatanya()],
    ['MinchaKetanaBaalHatanya',() => cal.getMinchaKetanaBaalHatanya()],
    ['PlagHaminchaBaalHatanya',() => cal.getPlagHaminchaBaalHatanya()],
    ['TzaisBaalHatanya',       () => cal.getTzaisBaalHatanya()],
  ]

  for (const [key, fn] of directCalls) {
    if (!z[key]) {
      try { const v = fn(); if (v) z[key] = v.toISO() } catch {}
    }
  }

  // Fallback for AlosBaalHatanya when degree calculation fails (high-latitude summer):
  // use solar midnight (chatzot layla) — same as Chabad.org
  if (!z.AlosBaalHatanya) {
    try {
      const midnight = cal.getSolarMidnight()
      if (midnight) z.AlosBaalHatanya = midnight.toISO()
    } catch {}
  }

  return z
}

function ClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) })
  return null
}

const NAVBAR_H = 52

export default function ZmanimMapPage() {
  const [pin,    setPin]    = useState(null)
  const [zmanim, setZmanim] = useState(null)
  const [tz,     setTz]     = useState('Asia/Jerusalem')

  function handleMapClick({ lat, lng }) {
    const detectedTz = tzlookup(lat, lng) ?? 'UTC'
    setPin({ lat, lng })
    setTz(detectedTz)
    const cal = buildCal(lat, lng, detectedTz)
    setZmanim(extractZmanim(cal))
  }

  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: tz,
  })

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} dir="rtl">

      {/* Navbar */}
      <div
        style={{ height: NAVBAR_H, flexShrink: 0 }}
        className="flex items-center gap-4 px-5 bg-blue-950 text-white"
      >
        <Link to="/" className="text-blue-300 hover:text-white text-sm transition">← דף הבית</Link>
        <h1 className="font-bold text-lg">זמנים הלכתיים לפי מיקום</h1>
        {pin ? (
          <span className="mr-auto text-blue-300 text-xs font-mono">
            {pin.lat.toFixed(4)}°N {pin.lng.toFixed(4)}°E
            <span className="mr-2 text-blue-500">{tz}</span>
          </span>
        ) : (
          <span className="mr-auto text-blue-300 text-sm">לחץ על כל נקודה במפה</span>
        )}
      </div>

      {/* Map */}
      <div style={{ height: '45vh', flexShrink: 0 }}>
        <MapContainer
          center={[31.7, 35.0]}
          zoom={8}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onMapClick={handleMapClick} />
          {pin && <Marker position={[pin.lat, pin.lng]} />}
        </MapContainer>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="bg-blue-950">
        {!pin ? (
          <div className="flex items-center justify-center h-full text-blue-300 text-sm">
            לחץ על נקודה במפה כדי להציג זמנים
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-blue-900 z-10">
              <tr>
                <th className="px-4 py-2 text-right text-blue-200 font-medium border-b border-blue-700">
                  זמן — {today}
                </th>
                <th className="px-4 py-2 text-center border-b border-blue-700">
                  <div className="text-white font-bold">שעה</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {WANTED_KEYS.map(({ key, label }, i) => {
                const val = fmtIso(zmanim?.[key], tz)
                return (
                  <tr key={key} className={i % 2 === 0 ? 'bg-blue-950' : 'bg-blue-900/30'}>
                    <td className="px-4 py-2 text-blue-200 border-b border-blue-800/40 text-sm">
                      {label}
                    </td>
                    <td className="px-4 py-2 text-center border-b border-blue-800/40">
                      <span className={`font-mono font-bold ${val ? 'text-white text-base' : 'text-blue-800'}`}>
                        {val ?? '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
