import {
  getZmanimJson,
  ComplexZmanimCalendar,
  GeoLocation,
  SunTimesCalculator,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'

function fmtIso(isoStr) {
  if (!isoStr || isoStr === 'N/A') return null
  return new Date(isoStr).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  })
}

// ─── Row definitions ───────────────────────────────────────────────
// hebcal לא מחזיר זמני גר"א — לכן 'hebcal' חסר בשורות הרלוונטיות
export const ROWS = [
  {
    label: 'עלות השחר',
    keys: { kosherzmanim: 'Alos72', 'kosherzmanim-suntimes': 'Alos72', hebcal: 'alotHaShachar' },
  },
  {
    label: 'נץ החמה',
    keys: { kosherzmanim: 'Sunrise', 'kosherzmanim-suntimes': 'Sunrise', hebcal: 'sunrise' },
  },
  {
    label: 'סוף ק"ש — גר"א',
    keys: { kosherzmanim: 'SofZmanShmaGRA', 'kosherzmanim-suntimes': 'SofZmanShmaGRA' },
  },
  {
    label: 'סוף ק"ש — מג"א',
    keys: { kosherzmanim: 'SofZmanShmaMGA', 'kosherzmanim-suntimes': 'SofZmanShmaMGA', hebcal: 'sofZmanShmaMGA' },
  },
  {
    label: 'סוף תפילה — גר"א',
    keys: { kosherzmanim: 'SofZmanTfilaGRA', 'kosherzmanim-suntimes': 'SofZmanTfilaGRA' },
  },
  {
    label: 'סוף תפילה — מג"א',
    keys: { kosherzmanim: 'SofZmanTfilaMGA', 'kosherzmanim-suntimes': 'SofZmanTfilaMGA', hebcal: 'sofZmanTfillaMGA' },
  },
  {
    label: 'חצות היום',
    keys: { kosherzmanim: 'Chatzos', 'kosherzmanim-suntimes': 'Chatzos', hebcal: 'chatzot' },
  },
  {
    label: 'מנחה גדולה',
    keys: { kosherzmanim: 'MinchaGedola', 'kosherzmanim-suntimes': 'MinchaGedola', hebcal: 'minchaGedola' },
  },
  {
    label: 'מנחה קטנה',
    keys: { kosherzmanim: 'MinchaKetana', 'kosherzmanim-suntimes': 'MinchaKetana', hebcal: 'minchaKetana' },
  },
  {
    label: 'פלג המנחה',
    keys: { kosherzmanim: 'PlagHamincha', 'kosherzmanim-suntimes': 'PlagHamincha', hebcal: 'plagHaMincha' },
  },
  {
    label: 'שקיעת החמה',
    keys: { kosherzmanim: 'Sunset', 'kosherzmanim-suntimes': 'Sunset', hebcal: 'sunset' },
  },
  {
    label: 'צאת הכוכבים',
    keys: { kosherzmanim: 'Tzais8Point5Degrees', 'kosherzmanim-suntimes': 'Tzais8Point5Degrees', hebcal: 'tzeit85deg' },
  },
  {
    label: 'צאת ר"ת (72 דקות)',
    keys: { kosherzmanim: 'Tzais72', 'kosherzmanim-suntimes': 'Tzais72', hebcal: 'tzeit42min' },
  },
]

// ─── Sources ────────────────────────────────────────────────────────
export const SOURCES = [
  {
    id: 'kosherzmanim',
    label: 'KosherZmanim',
    subtitle: 'אלגוריתם NOAA',
    async fetch(lat, lng) {
      const result = getZmanimJson({
        date: new Date(),
        timeZoneId: 'Asia/Jerusalem',
        locationName: '',
        latitude: lat,
        longitude: lng,
        elevation: 0,
        complexZmanim: true,
      })
      return result.Zmanim
    },
  },
  {
    id: 'kosherzmanim-suntimes',
    label: 'KosherZmanim',
    subtitle: 'אלגוריתם SunTimes',
    async fetch(lat, lng) {
      const geoLocation = new GeoLocation('', lat, lng, 0, 'Asia/Jerusalem')
      const cal = new ComplexZmanimCalendar(geoLocation)
      cal.setAstronomicalCalculator(new SunTimesCalculator())
      cal.setDate(DateTime.local())
      const json = ZmanimFormatter.toJSON(cal)
      return json.Zmanim
    },
  },
  {
    id: 'hebcal',
    label: 'Hebcal',
    subtitle: 'hebcal.com',
    async fetch(lat, lng) {
      const url =
        `https://www.hebcal.com/zmanim?cfg=json` +
        `&latitude=${lat}&longitude=${lng}&tzid=Asia%2FJerusalem`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Hebcal error')
      const data = await res.json()
      return data.times
    },
  },
]
