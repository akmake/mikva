import {
  addHebrewDays,
  nextMonthSameDay,
  daysBetween,
  hebrewDateEquals,
  compareHebrewDates,
} from './hebrewCalendar.js'

// ── helpers ────────────────────────────────────────────────────────────────────

function sightingDaysBetween(a, b, useShuar = false, hefsekMap = {}) {
  if (useShuar) {
    // שוע"ר: from end of sighting A (hefsek day) to start of sighting B
    const aHefsek = hefsekMap[a._id] ?? addHebrewDays(a.hebrewDate, 7)
    return daysBetween(aHefsek, b.hebrewDate)
  }
  // נוהג: start → start
  return daysBetween(a.hebrewDate, b.hebrewDate)
}

// Count how many consecutive trailing sightings share the same Hebrew day + onah
function trailingMonthCount(sorted, last) {
  let count = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i]
    if (s.hebrewDate.day === last.hebrewDate.day && s.onah === last.onah) count++
    else break
  }
  return count
}

// Count how many consecutive trailing interval pairs share the same interval
function trailingHaflagaCount(sorted, interval, useShuar, hefsekMap) {
  let count = 0
  for (let i = sorted.length - 1; i >= 1; i--) {
    const diff = sightingDaysBetween(sorted[i - 1], sorted[i], useShuar, hefsekMap)
    if (diff === interval && sorted[i].onah === sorted[sorted.length - 1].onah) count++
    else break
  }
  return count
}

// ── main export ────────────────────────────────────────────────────────────────

/**
 * Compute all active veset concerns from the sighting history.
 *
 * @param {Array}   sightings  - array of Sighting objects (oldest→newest)
 * @param {boolean} useShuar   - haflagah calculation method (שוע"ר vs נוהג)
 * @param {object}  hefsekMap  - { sightingId → hebrewDate } of hefsek tahara per sighting
 * @param {boolean} isMesulekes - pregnancy / nursing (cannot establish new kavua)
 * @returns {Array} concern objects sorted by date
 */
export function computeVesetConcerns(
  sightings,
  useShuar = false,
  hefsekMap = {},
  isMesulekes = false,
) {
  if (!sightings || sightings.length === 0) return []

  const sorted = [...sightings].sort(
    (a, b) => new Date(a.gregorianDatetime) - new Date(b.gregorianDatetime),
  )

  const last = sorted[sorted.length - 1]
  const concerns = []

  // ── 1. עונה בינונית ─────────────────────────────────────────────────────
  // 30 days from last sighting (start→start), full day concern, never uprooted alone
  concerns.push({
    id:        'ona_beinonit',
    type:      'ona_beinonit',
    label:     'עונה בינונית',
    hebrewDate: addHebrewDays(last.hebrewDate, 30),
    onah:       'full_day',
    isKavua:    false,
    kavuaCount: 0,
    canUproot:  false,
  })

  // ── 2. ווסת החודש ────────────────────────────────────────────────────────
  const chodeshDate  = nextMonthSameDay(last.hebrewDate)
  const chodeshCount = trailingMonthCount(sorted, last)

  concerns.push({
    id:         'chodesh',
    type:       'chodesh',
    label:      'ווסת החודש',
    hebrewDate:  chodeshDate,
    onah:        last.onah,
    isKavua:    !isMesulekes && chodeshCount >= 3,
    kavuaCount:  chodeshCount,
    canUproot:   true,
  })

  // ── 3. ווסת ההפלגה ───────────────────────────────────────────────────────
  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2]
    const interval = sightingDaysBetween(prev, last, useShuar, hefsekMap)

    if (interval > 0) {
      const haflagaDate  = addHebrewDays(last.hebrewDate, interval)
      const haflagaCount = trailingHaflagaCount(sorted, interval, useShuar, hefsekMap)
      const label = useShuar
        ? `ווסת ההפלגה — ${interval} יום (שוע"ר)`
        : `ווסת ההפלגה — ${interval} יום`

      concerns.push({
        id:          `haflagah_${interval}`,
        type:        'haflagah',
        label,
        hebrewDate:   haflagaDate,
        onah:         last.onah,
        isKavua:     !isMesulekes && haflagaCount >= 3,
        kavuaCount:   haflagaCount,
        interval,
        canUproot:    true,
      })

      // If שוע"ר is on, also show the נוהג calculation if different
      if (useShuar) {
        const minhagInterval = daysBetween(prev.hebrewDate, last.hebrewDate)
        if (minhagInterval !== interval && minhagInterval > 0) {
          concerns.push({
            id:         `haflagah_minhag_${minhagInterval}`,
            type:       'haflagah',
            label:      `ווסת ההפלגה — ${minhagInterval} יום (נוהג)`,
            hebrewDate:  addHebrewDays(last.hebrewDate, minhagInterval),
            onah:        last.onah,
            isKavua:     false,
            kavuaCount:  1,
            interval:    minhagInterval,
            canUproot:   true,
          })
        }
      }
    }
  }

  return concerns.sort((a, b) => compareHebrewDates(a.hebrewDate, b.hebrewDate))
}

// Returns concerns whose Hebrew date matches today or is in the past (unpassed)
export function todayConcerns(concerns, todayHD) {
  return concerns.filter(c => compareHebrewDates(c.hebrewDate, todayHD) <= 0)
}

// Returns concerns in the next N days
export function upcomingConcerns(concerns, todayHD, withinDays = 60) {
  return concerns.filter(c => {
    const diff = daysBetween(todayHD, c.hebrewDate)
    return diff >= 0 && diff <= withinDays
  })
}
