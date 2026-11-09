import { useEffect, useState } from 'react'
import tzlookup from 'tz-lookup'

// שעון שמתעדכן כל שנייה
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const JERUSALEM = { lat: 31.7767, lng: 35.2345, tz: 'Asia/Jerusalem' }

// מיקום המכשיר (דרך ה-geoShim ב-native), עם נפילה לירושלים
export function useLocation() {
  const [location, setLocation] = useState(null)
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const tz = tzlookup(coords.latitude, coords.longitude) ?? 'Asia/Jerusalem'
        setLocation({ lat: coords.latitude, lng: coords.longitude, tz })
      },
      () => setLocation(JERUSALEM),
      { timeout: 8000 },
    )
  }, [])
  return location
}
