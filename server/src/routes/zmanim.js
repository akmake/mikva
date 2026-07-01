import { Router } from 'express'
import {
  ComplexZmanimCalendar,
  GeoLocation,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'
import tzlookup from 'tz-lookup'

const router = Router()

const DEFAULT_ELEVATION = 800

function tzFor(lat, lng) {
  try { return tzlookup(lat, lng) ?? 'Asia/Jerusalem' }
  catch { return 'Asia/Jerusalem' }
}

/** זמני היום עבור תאריך גרגוריאני + מיקום. */
function zmanimForDay(year, month, day, lat, lng, tz) {
  const geo = new GeoLocation('', lat, lng, DEFAULT_ELEVATION, tz)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.fromObject({ year, month, day, hour: 12 }, { zone: tz }))
  const z = ZmanimFormatter.toJSON(cal).Zmanim
  const iso = (v) => (v ? new Date(v).toISOString() : null)
  return {
    sunrise:       iso(z.Sunrise),
    sunset:        iso(z.Sunset),
    minchaKetana:  iso(z.MinchaKetana),
    alotHaShachar: iso(z.Alos72),
    tzais:         iso(z.TzaisHacochavim),
  }
}

// GET /api/zmanim?lat=..&lng=..&year=..&month=..&day=..
// מחזיר את זמני היום המבוקש + זמני היום הקודם (לגבול עונת הלילה).
router.get('/', (req, res) => {
  try {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat/lng required' })
    }
    const now = new Date()
    const year  = Number(req.query.year)  || now.getFullYear()
    const month = Number(req.query.month) || now.getMonth() + 1
    const day   = Number(req.query.day)   || now.getDate()

    const tz = tzFor(lat, lng)
    const todayZ = zmanimForDay(year, month, day, lat, lng, tz)

    // היום הקודם — שקיעתו היא תחילת עונת הלילה של היום המבוקש
    const prev = new Date(Date.UTC(year, month - 1, day) - 86400000)
    const prevZ = zmanimForDay(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), lat, lng, tz)

    res.json({
      tz,
      date: { year, month, day },
      // גבולות העונות עבור היום המבוקש
      nightStart: prevZ.sunset,     // שקיעת אתמול → תחילת עונת הלילה
      dayStart:   todayZ.sunrise,   // זריחה → תחילת עונת היום
      dayEnd:     todayZ.sunset,    // שקיעה → סוף עונת היום
      minchaKetana:  todayZ.minchaKetana,
      alotHaShachar: todayZ.alotHaShachar,
      tzais:         todayZ.tzais,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
