import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import {
  getZmanimJson,
  ComplexZmanimCalendar,
  GeoLocation,
  SunTimesCalculator,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

// רשימת הזמנים המבוקשים בסדר כרונולוגי
const WANTED_KEYS = [
  { key: 'AlosBaalHatanya',                     label: 'עלות השחר — בעל התניא' },
  { key: 'Misheyakir10Point2Degrees',            label: 'משיכיר — טלית (10.2°)' },
  { key: 'Sunrise',                              label: 'זריחה' },
  { key: 'SofZmanShmaBaalHatanya',               label: 'סוף ק"ש — בעל התניא' },
  { key: 'SofZmanTfilaBaalHatanya',              label: 'סוף תפילה — בעל התניא' },
  { key: 'Chatzos',                              label: 'חצות' },
  { key: 'MinchaGedola',                         label: 'מנחה גדולה' },
  { key: 'MinchaGedolaGreaterThan30',            label: 'מנחה גדולה (מינימום 30 דקות)' },
  { key: 'MinchaGedolaBaalHatanya',              label: 'מנחה גדולה — בעל התניא' },
  { key: 'MinchaGedolaBaalHatanyaGreaterThan30', label: 'מנחה גדולה ב"ה (מינימום 30 דקות)' },
  { key: 'MinchaKetanaBaalHatanya',              label: 'מנחה קטנה — בעל התניא' },
  { key: 'PlagHaminchaBaalHatanya',              label: 'פלג המנחה — בעל התניא' },
  { key: 'SeaLevelSunset',                       label: 'שקיעה — פני הים' },
  { key: 'Sunset',                               label: 'שקיעה' },
  { key: 'TzaisGeonim5Point95Degrees',           label: 'צאת גאונים — 5.95°' },
  { key: 'EndCivilTwilight',                     label: 'סוף דמדומים אזרחיים' },
  { key: 'TzaisBaalHatanya',                     label: 'צאת — בעל התניא' },
  { key: 'SolarMidnight',                        label: 'חצות הלילה' },
  { key: 'SunLowerTransit',                      label: 'מעבר תחתון — שמש' },
]

// מיפוי מפתחות kosher-zmanim → Hebcal (כל מה שידוע)
const KZ_TO_HEBCAL = {
  Sunrise:            'sunrise',
  SofZmanShmaMGA:     'sofZmanShmaMGA',
  SofZmanTfilaMGA:    'sofZmanTfillaMGA',
  Chatzos:            'chatzot',
  MinchaGedola:       'minchaGedola',
  MinchaKetana:       'minchaKetana',
  PlagHamincha:       'plagHaMincha',
  Sunset:             'sunset',
}

function fmtIso(val) {
  if (!val || val === 'N/A') return null
  const d = new Date(val)
  if (isNaN(d)) return null
  return d.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  })
}

function buildCal(lat, lng) {
  const geo = new GeoLocation('', lat, lng, 0, 'Asia/Jerusalem')
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.local())
  return cal
}

function calToZmanim(cal) {
  const z = ZmanimFormatter.toJSON(cal).Zmanim
  // AlosBaalHatanya נחסם ע"י הספרייה — קוראים ישירות
  const alos = cal.getAlosBaalHatanya()
  if (alos) z.AlosBaalHatanya = alos.toISO()
  return z
}

function fetchNoaa(lat, lng) {
  return calToZmanim(buildCal(lat, lng))
}

function fetchSunTimes(lat, lng) {
  const cal = buildCal(lat, lng)
  cal.setAstronomicalCalculator(new SunTimesCalculator())
  return calToZmanim(cal)
}

async function fetchHebcal(lat, lng) {
  const url =
    `https://www.hebcal.com/zmanim?cfg=json` +
    `&latitude=${lat}&longitude=${lng}&tzid=Asia%2FJerusalem`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Hebcal error')
  const data = await res.json()
  return data.times
}

function ClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) })
  return null
}

const NAVBAR_H = 52

export default function ZmanimMapPage() {
  const [pin, setPin]         = useState(null)
  const [noaa, setNoaa]       = useState(null)
  const [sunTimes, setSunTimes] = useState(null)
  const [hebcal, setHebcal]   = useState(null)
  const [hebcalStatus, setHebcalStatus] = useState(null) // 'loading' | 'error' | 'ok'

  async function handleMapClick({ lat, lng }) {
    setPin({ lat, lng })
    setHebcalStatus('loading')
    setHebcal(null)

    // חישובים מקומיים — מיידיים
    setNoaa(fetchNoaa(lat, lng))
    setSunTimes(fetchSunTimes(lat, lng))

    // Hebcal — async
    try {
      const h = await fetchHebcal(lat, lng)
      setHebcal(h)
      setHebcalStatus('ok')
    } catch {
      setHebcalStatus('error')
    }
  }

  const allKeys = WANTED_KEYS

  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
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
        {pin && (
          <span className="mr-auto text-blue-300 text-xs font-mono">
            {pin.lat.toFixed(4)}°N {pin.lng.toFixed(4)}°E
          </span>
        )}
        {!pin && (
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
                  <div className="text-white font-bold">KosherZmanim</div>
                  <div className="text-blue-400 text-xs font-normal">NOAA</div>
                </th>
                <th className="px-4 py-2 text-center border-b border-blue-700">
                  <div className="text-white font-bold">KosherZmanim</div>
                  <div className="text-blue-400 text-xs font-normal">SunTimes</div>
                </th>
                <th className="px-4 py-2 text-center border-b border-blue-700">
                  <div className="text-white font-bold">Hebcal</div>
                  <div className="text-blue-400 text-xs font-normal">
                    {hebcalStatus === 'loading' ? 'טוען...' : hebcalStatus === 'error' ? 'שגיאה' : 'hebcal.com'}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {allKeys.map(({ key, label }, i) => {
                const noaaVal     = fmtIso(noaa?.[key])
                const sunVal      = fmtIso(sunTimes?.[key])
                const hebcalKey   = KZ_TO_HEBCAL[key]
                const hebcalVal   = hebcalKey ? fmtIso(hebcal?.[hebcalKey]) : null

                return (
                  <tr key={key} className={i % 2 === 0 ? 'bg-blue-950' : 'bg-blue-900/30'}>
                    <td className="px-4 py-2 text-blue-200 border-b border-blue-800/40 text-sm">
                      {label}
                    </td>
                    <td className="px-4 py-2 text-center border-b border-blue-800/40">
                      <span className="font-mono font-bold text-white">{noaaVal ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2 text-center border-b border-blue-800/40">
                      <span className="font-mono font-bold text-white">{sunVal ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2 text-center border-b border-blue-800/40">
                      {hebcalStatus === 'loading'
                        ? <span className="text-blue-500 animate-pulse text-xs">טוען...</span>
                        : hebcalStatus === 'error'
                          ? <span className="text-red-500 text-xs">—</span>
                          : <span className={`font-mono font-bold ${hebcalVal ? 'text-white' : 'text-blue-800'}`}>
                              {hebcalVal ?? '—'}
                            </span>
                      }
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
