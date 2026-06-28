import {
  JewishCalendar,
  ComplexZmanimCalendar,
  GeoLocation,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'
import tzlookup from 'tz-lookup'

const DEFAULT_LAT = 31.7683
const DEFAULT_LNG = 35.2137
const DEFAULT_ELEVATION = 800

export const MONTH_NAMES = {
  1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר',
  13: 'אדר ב׳',
}

export const ONAH_HE = { day: 'יום', night: 'לילה', full_day: 'יממה שלמה' }

const DAY_LETTERS = [
  '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
]

export function getTz(lat, lng) {
  try { return tzlookup(lat, lng) ?? 'Asia/Jerusalem' }
  catch { return 'Asia/Jerusalem' }
}

function buildCal(jsDate, lat, lng) {
  const tz = getTz(lat, lng)
  const dt = DateTime.fromJSDate(jsDate, { zone: tz })
  const geo = new GeoLocation('', lat, lng, DEFAULT_ELEVATION, tz)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(dt)
  return { cal, tz }
}

export function getZmanimForDate(jsDate, lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const { cal } = buildCal(jsDate, lat, lng)
  const z = ZmanimFormatter.toJSON(cal).Zmanim
  return {
    sunset:       z.Sunset       ? new Date(z.Sunset)       : null,
    minchaKetana: z.MinchaKetana ? new Date(z.MinchaKetana) : null,
    alotHaShachar:z.Alos72       ? new Date(z.Alos72)       : null,
    tzais:        z.Tzais8Point5Degrees ? new Date(z.Tzais8Point5Degrees) : null,
    sunrise:      z.Sunrise      ? new Date(z.Sunrise)      : null,
  }
}

// Convert a JS Date + location to halachic time info
export function convertToHalachicTime(jsDate, lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const zmanim = getZmanimForDate(jsDate, lat, lng)
  const isAfterSunset = zmanim.sunset && jsDate >= zmanim.sunset

  // If after sunset → next Hebrew day
  const effectiveDate = isAfterSunset
    ? new Date(jsDate.getTime() + 24 * 60 * 60 * 1000)
    : jsDate

  const jc = new JewishCalendar(effectiveDate)
  return {
    hebrewDate: {
      year:  jc.getJewishYear(),
      month: jc.getJewishMonth(),
      day:   jc.getJewishDayOfMonth(),
    },
    onah:   isAfterSunset ? 'night' : 'day',
    sunset: zmanim.sunset,
  }
}

// Convert a Hebrew date back to a JS Date (noon of that Gregorian day)
export function hebrewDateToGregorian(hd) {
  const jc = new JewishCalendar()
  jc.setJewishDate(hd.year, hd.month, hd.day)
  const ldt = jc.getDate() // Luxon DateTime
  return new Date(ldt.year, ldt.month - 1, ldt.day, 12, 0, 0)
}

// Add N days to a Hebrew date
export function addHebrewDays(hd, n) {
  const base = hebrewDateToGregorian(hd)
  const next = new Date(base.getTime() + n * 24 * 60 * 60 * 1000)
  const jc = new JewishCalendar(next)
  return {
    year:  jc.getJewishYear(),
    month: jc.getJewishMonth(),
    day:   jc.getJewishDayOfMonth(),
  }
}

// Advance to the same day in the next Hebrew month
export function nextMonthSameDay(hd) {
  const jc = new JewishCalendar()
  jc.setJewishDate(hd.year, hd.month, 1)
  const daysInMonth = jc.getDaysInJewishMonth()
  const firstOfNext = addHebrewDays({ year: hd.year, month: hd.month, day: 1 }, daysInMonth)
  // Clamp to last day if the next month is shorter
  const targetJc = new JewishCalendar()
  targetJc.setJewishDate(firstOfNext.year, firstOfNext.month, 1)
  const daysInNext = targetJc.getDaysInJewishMonth()
  const targetDay = Math.min(hd.day, daysInNext)
  return addHebrewDays(firstOfNext, targetDay - 1)
}

export function compareHebrewDates(a, b) {
  if (a.year  !== b.year)  return a.year  - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

export function hebrewDateEquals(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function daysBetween(from, to) {
  const a = hebrewDateToGregorian(from).getTime()
  const b = hebrewDateToGregorian(to).getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

export function todayHebrew() {
  const jc = new JewishCalendar(new Date())
  return {
    year:  jc.getJewishYear(),
    month: jc.getJewishMonth(),
    day:   jc.getJewishDayOfMonth(),
  }
}

export function formatHebrewDate(hd) {
  if (!hd) return ''
  const isLeap = JewishCalendar.isJewishLeapYear(hd.year)
  const monthName = (isLeap && hd.month === 12) ? 'אדר א׳' : MONTH_NAMES[hd.month]
  return `${DAY_LETTERS[hd.day]} ${monthName}`
}

export function formatTime(jsDate, tz = 'Asia/Jerusalem') {
  if (!jsDate) return '—'
  return new Date(jsDate).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  })
}
