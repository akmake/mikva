import {
  addHebrewDays,
  nextMonthSameDay,
  hebrewDateToGregorian,
  getZmanimForDate,
  hebrewDateEquals,
  daysBetween,
  todayHebrew,
} from './hebrewCalendar.js'

const DEFAULT_LAT = 31.7683
const DEFAULT_LNG = 35.2137

// Day 5 from sighting (day 1 = sighting day itself)
export function hefsekTaharaDay(sightingHD) {
  return addHebrewDays(sightingHD, 4)
}

// Day 1 of 7 clean days = day after hefsek tahara
export function firstCleanDay(hefsekHD) {
  return addHebrewDays(hefsekHD, 1)
}

// Planned mikveh = the night AFTER the day the count completes (tovelDay).
// tovelDay is the day-number (from hefsek) on which the 7-clean window closes;
// default 7 → night of day 8, matching the classic case.
export function plannedMikvehDay(hefsekHD, tovelDay = 7) {
  return addHebrewDays(hefsekHD, tovelDay + 1)
}

// { earliest, latest } Date objects for hefsek tahara window on a given Hebrew date
export function hefsekWindow(hebrewDate, lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const greg = hebrewDateToGregorian(hebrewDate)
  const z    = getZmanimForDate(greg, lat, lng)
  return { earliest: z.minchaKetana, latest: z.sunset }
}

// Morning / evening bedika windows for a given Hebrew date
export function bedikaWindows(hebrewDate, lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const greg    = hebrewDateToGregorian(hebrewDate)
  const z       = getZmanimForDate(greg, lat, lng)
  return {
    morningStart: z.alotHaShachar,
    morningEnd:   z.sunrise,
    eveningStart: z.minchaKetana,
    eveningEnd:   z.sunset,
  }
}

// Which clean day number (1–7) is today relative to hefsek?  null if outside range
export function currentCleanDayNumber(hefsekHD) {
  const today   = todayHebrew()
  const first   = firstCleanDay(hefsekHD)
  const diff    = daysBetween(first, today)
  if (diff < 0 || diff > 6) return null
  return diff + 1
}

// How many more calendar days until hefsek is allowed (0 = today is ok)
export function daysUntilHefsekAllowed(sightingHD) {
  const today    = todayHebrew()
  const earliest = hefsekTaharaDay(sightingHD)
  const diff     = daysBetween(today, earliest)
  return Math.max(0, diff)
}

// Derive the current phase from stored data + today's Hebrew date
export function derivePhase(cycle) {
  if (!cycle) return 'tahorah'

  const { phase, latestSighting, hefsekTahara, cleanDays } = cycle

  // If we're in counting_7 or waiting_mikveh, check if we've reached mikveh day
  if (phase === 'waiting_5_days' && latestSighting) {
    const earliest = hefsekTaharaDay(latestSighting.hebrewDate)
    const today    = todayHebrew()
    // השוואה כרונולוגית (ספירת ימים) — compareHebrewDates שגוי מעבר לגבול תשרי
    // וגרם שמיום 5 ואילך המצב לא עבר ל"ממתינה להפסק" (בעיקר בראיות עבר).
    if (daysBetween(earliest, today) >= 0) return 'waiting_hefsek'
    return 'waiting_5_days'
  }

  return phase
}
