import { JewishCalendar, HebrewDateFormatter } from 'kosher-zmanim'
import { MONTH_NAMES } from './hebrewCalendar'

// ── טקסט עברי: אותיות יום/שנה, שם חודש, חגים, שעות ────────────────────────────

export const DAY_LETTERS = [
  '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
]

export const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

// יום בחודש עם גרש/גרשיים: ט׳ · י״ב · ט״ו · ל׳
export function dayLabel(n) {
  const l = DAY_LETTERS[n] ?? ''
  return l.length <= 1 ? l + '׳' : l.slice(0, -1) + '״' + l.slice(-1)
}

function toHebrewLetters(n) {
  const H = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']
  const T = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
  const U = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
  const h = Math.floor(n / 100), tu = n % 100, t = Math.floor(tu / 10), u = tu % 10
  let r = h ? H[h] : ''
  if (tu === 15) r += 'טו'
  else if (tu === 16) r += 'טז'
  else { if (t) r += T[t]; if (u) r += U[u] }
  return r
}

// תשפ״ז
export function toHebrewYear(y) {
  const l = toHebrewLetters(y % 1000)
  return l.length <= 1 ? l + '׳' : l.slice(0, -1) + '״' + l.slice(-1)
}

// שם חודש עברי (אדר א׳ בשנה מעוברת)
export function monthLabel(year, month) {
  return month === 12 && JewishCalendar.isJewishLeapYear(year) ? 'אדר א׳' : MONTH_NAMES[month]
}

// שם החג/המועד של יום עברי נתון (null אם יום חול רגיל). שבת קודש נבדקת בנפרד
// כי getDayOfWeek אינו Yom Tov — חשוב לזיהוי ימים שבהם הלכות/זמני הבדיקה שונים.
export function holidayLabel(jCal) {
  const hdf = new HebrewDateFormatter()
  hdf.setHebrewFormat(true)
  let label = hdf.formatYomTov(jCal)
  if (!label && jCal.isRoshChodesh()) label = hdf.formatRoshChodesh(jCal)
  if (!label && jCal.getDayOfWeek() === 7) label = 'שבת קודש'
  return label || null
}

// HH:MM בלי תלות בלוקאל של המכשיר
export function fmtTime(date, tz) {
  if (!date) return '—'
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
}

export function fmtClock(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz,
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00'
  return { h: get('hour'), m: get('minute'), s: get('second') }
}

// טווח שעות בתצוגה LTR (05:34–06:42) גם בתוך טקסט RTL
export function fmtRange(a, b, tz) {
  return `⁦${fmtTime(a, tz)}–${fmtTime(b, tz)}⁩`
}
