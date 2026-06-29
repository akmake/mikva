import { JewishCalendar } from 'kosher-zmanim'
import {
  addHebrewDays,
  addHebrewMonths,
  nextMonthSameDay,
  daysBetween,
  hebrewDateEquals,
  compareHebrewDates,
} from './hebrewCalendar.js'

// ── helpers ────────────────────────────────────────────────────────────────────

function isLeap(year) {
  return JewishCalendar.isJewishLeapYear(year)
}

function sightingDaysBetween(a, b, useShuar = false, hefsekMap = {}) {
  if (useShuar) {
    const aHefsek = hefsekMap[a._id] ?? addHebrewDays(a.hebrewDate, 7)
    return daysBetween(aHefsek, b.hebrewDate)
  }
  return daysBetween(a.hebrewDate, b.hebrewDate)
}

function trailingMonthCount(sorted, last) {
  // Consider only sightings with matching day+onah, then count consecutive 1-month steps from the end
  const sameDay = sorted.filter(
    s => s.hebrewDate.day === last.hebrewDate.day && s.onah === last.onah,
  )
  let count = 1
  for (let i = sameDay.length - 2; i >= 0; i--) {
    const expected = nextMonthSameDay(sameDay[i].hebrewDate)
    if (!hebrewDateEquals(expected, sameDay[i + 1].hebrewDate)) break
    count++
  }
  return count
}

function trailingHaflagaCount(sorted, interval, useShuar, hefsekMap) {
  let count = 0
  for (let i = sorted.length - 1; i >= 1; i--) {
    const diff = sightingDaysBetween(sorted[i - 1], sorted[i], useShuar, hefsekMap)
    if (diff === interval && sorted[i].onah === sorted[sorted.length - 1].onah) count++
    else break
  }
  return count
}

// ── uprooting logic ────────────────────────────────────────────────────────────

function withUprootingStatus(concern, observations) {
  const relObs = observations.filter(
    o => o.concernId === concern.id &&
         hebrewDateEquals(o.hebrewDate, concern.hebrewDate) &&
         o.result === 'clean',
  )
  const cleanPasses    = relObs.length
  const observationIds = relObs.map(o => o._id)

  let needed, uprooted
  if (concern.type === 'ona_beinonit') {
    needed = 3; uprooted = false
  } else if (concern.isKavua) {
    needed = 3; uprooted = cleanPasses >= 3
  } else {
    needed = 1; uprooted = cleanPasses >= 1
  }

  return { ...concern, cleanPasses, needed, uprooted, observationIds }
}

// ── Adar helpers ───────────────────────────────────────────────────────────────

/**
 * In a leap year, Adar I (12) and Adar II (13) are halachically interchangeable
 * for veset matching: a sighting in Adar I "counts" for an expected Adar II date
 * and vice-versa.
 */
function fitsAdar(sm, em, year) {
  if (!isLeap(year)) return false
  return (sm === 12 && em === 13) || (sm === 13 && em === 12)
}

/** True if `sighting` matches expectedHD+onah, including Adar leniency. */
function fitsExpected(sighting, expectedHD, expectedOnah) {
  if (sighting.onah !== expectedOnah) return false
  const shd = sighting.hebrewDate
  if (hebrewDateEquals(shd, expectedHD)) return true
  return (
    shd.year  === expectedHD.year &&
    shd.day   === expectedHD.day  &&
    fitsAdar(shd.month, expectedHD.month, expectedHD.year)
  )
}

/**
 * When a sirug next-date lands on Adar I of a leap year, we must ALSO warn
 * for Adar II (a woman who saw in Adar I must check both Adars in the next
 * occurrence year as well).  Returns 1 or 2 dates.
 */
function expandAdar(hd) {
  if (hd.month === 12 && isLeap(hd.year)) return [hd, { ...hd, month: 13 }]
  return [hd]
}

// ── ווסת סירוג ─────────────────────────────────────────────────────────────────

/**
 * Build the longest forward chain of sightings from `group` (oldest→newest)
 * where consecutive links are exactly `skip` Hebrew months apart, AND the chain
 * ends at `last` (the most recent sighting in this day/onah group).
 *
 * We try every starting point in the group and keep the longest chain that
 * terminates at `last`.
 */
function buildSirugChain(group, last, skip) {
  let best = []

  for (const start of group) {
    const chain = [start]
    let cur = start

    while (true) {
      const nextHD = addHebrewMonths(cur.hebrewDate, skip)
      const found  = group.find(s => s !== cur && fitsExpected(s, nextHD, start.onah))
      if (!found) break
      chain.push(found)
      cur = found
    }

    const tail = chain[chain.length - 1]
    if (
      fitsExpected(tail, last.hebrewDate, last.onah) &&
      chain.length > best.length
    ) best = chain
  }

  return best
}

/**
 * Detect all ווסת סירוג patterns (skip = 2..6 months) in the sighting history.
 *
 * Rules applied here:
 * - Requires ≥ 2 sightings in the same pattern to generate a concern
 * - Becomes קבוע after 3 consecutive occurrences
 * - Adar I / Adar II are interchangeable (see `fitsExpected` and `expandAdar`)
 * - If ווסת חודש is already kavua for a given (day, onah), sirug concerns on
 *   that day are subsumed — we don't generate them separately
 * - Skips 1–6 month intervals; ווסת חודש (skip=1) is handled as its own type
 * - Deduplicates by (hebrewDate, onah) to avoid double-warnings from Adar expansion
 */
function detectSirugConcerns(sorted, chodeshKavuaKeys, isMesulekes) {
  const concerns = []
  if (sorted.length < 2) return concerns

  const groups = new Map()
  for (const s of sorted) {
    const k = `${s.hebrewDate.day}|${s.onah}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(s)
  }

  const generated = new Set() // dedup by `year-month-day|onah`

  for (const [gk, group] of groups) {
    if (group.length < 2) continue
    if (chodeshKavuaKeys.has(gk)) continue // subsumed by kavua ווסת חודש

    const last = group[group.length - 1]
    const [dayStr, onah] = gk.split('|')
    const day = parseInt(dayStr, 10)

    for (let skip = 2; skip <= 6; skip++) {
      const chain = buildSirugChain(group, last, skip)
      if (chain.length < 2) continue

      const chainLast  = chain[chain.length - 1]
      const nextHD     = addHebrewMonths(chainLast.hebrewDate, skip)
      const nextDates  = expandAdar(nextHD)
      const kavuaCount = chain.length
      const kavua      = !isMesulekes && kavuaCount >= 3

      const skipLabel = skip === 2 ? 'כל חודשיים' : `כל ${skip} חודשים`

      for (const nd of nextDates) {
        const dateKey = `${nd.year}-${nd.month}-${nd.day}|${onah}`
        if (generated.has(dateKey)) continue
        generated.add(dateKey)

        const adarSuffix =
          nd.month === 13                     ? ' (אדר ב׳)' :
          nd.month === 12 && isLeap(nd.year)  ? ' (אדר א׳)' : ''

        const id = `sirug_${skip}_d${day}_${onah}${nd.month === 13 ? '_adar2' : ''}`

        concerns.push({
          id,
          type:       'sirug',
          label:      `ווסת סירוג — ${skipLabel}${adarSuffix}`,
          hebrewDate:  nd,
          onah,
          isKavua:     kavua,
          kavuaCount,
          skipMonths:  skip,
          canUproot:   true,
          relatedSightingId: chainLast._id,
        })
      }
    }
  }

  return concerns
}

// ── main export ────────────────────────────────────────────────────────────────

/**
 * Compute all active veset concerns from sighting history,
 * enriched with uprooting status from stored observations.
 *
 * @param {Array}   sightings    - Sighting documents (oldest→newest)
 * @param {Array}   observations - VesetObservation documents (clean passes)
 * @param {boolean} useShuar     - haflagah method (שוע"ר vs נוהג)
 * @param {object}  hefsekMap    - { sightingId → hebrewDate }
 * @param {boolean} isMesulekes  - pregnancy / nursing flag
 */
export function computeVesetConcerns(
  sightings,
  observations = [],
  useShuar     = false,
  hefsekMap    = {},
  isMesulekes  = false,
) {
  if (!sightings || sightings.length === 0) return []

  const sorted = [...sightings].sort(
    (a, b) => new Date(a.gregorianDatetime) - new Date(b.gregorianDatetime),
  )
  const last = sorted[sorted.length - 1]
  const raw  = []

  // ── 1. עונה בינונית ──────────────────────────────────────────────────────
  raw.push({
    id:         'ona_beinonit',
    type:       'ona_beinonit',
    label:      'עונה בינונית',
    hebrewDate:  addHebrewDays(last.hebrewDate, 30),
    onah:       'full_day',
    isKavua:    false,
    kavuaCount: 0,
    canUproot:  true,
    relatedSightingId: last._id,
  })

  // ── 2. ווסת החודש ─────────────────────────────────────────────────────────
  const chodeshDate  = nextMonthSameDay(last.hebrewDate)
  const chodeshCount = trailingMonthCount(sorted, last)
  const chodeshKavua = !isMesulekes && chodeshCount >= 3

  // Adar expansion: if chodesh date is Adar I in a leap year, also warn for Adar II
  const chodeshDates = expandAdar(chodeshDate)
  for (const cd of chodeshDates) {
    const adarSuffix =
      cd.month === 13                    ? ' (אדר ב׳)' :
      cd.month === 12 && isLeap(cd.year) ? ' (אדר א׳)' : ''
    raw.push({
      id:         cd.month === 13 ? 'chodesh_adar2' : 'chodesh',
      type:       'chodesh',
      label:      `ווסת החודש${adarSuffix}`,
      hebrewDate:  cd,
      onah:        last.onah,
      isKavua:     chodeshKavua,
      kavuaCount:  chodeshCount,
      canUproot:   true,
      relatedSightingId: last._id,
    })
  }

  // ── 3. ווסת ההפלגה ────────────────────────────────────────────────────────
  if (sorted.length >= 2) {
    const prev     = sorted[sorted.length - 2]
    const interval = sightingDaysBetween(prev, last, useShuar, hefsekMap)

    if (interval > 0) {
      const haflagaCount = trailingHaflagaCount(sorted, interval, useShuar, hefsekMap)
      const label = useShuar
        ? `ווסת ההפלגה — ${interval} יום (שוע"ר)`
        : `ווסת ההפלגה — ${interval} יום`

      raw.push({
        id:          `haflagah_${interval}`,
        type:        'haflagah',
        label,
        hebrewDate:   addHebrewDays(last.hebrewDate, interval),
        onah:         last.onah,
        isKavua:     !isMesulekes && haflagaCount >= 3,
        kavuaCount:   haflagaCount,
        interval,
        canUproot:   true,
        relatedSightingId: last._id,
      })

      if (useShuar) {
        const minhagInterval = daysBetween(prev.hebrewDate, last.hebrewDate)
        if (minhagInterval !== interval && minhagInterval > 0) {
          raw.push({
            id:          `haflagah_minhag_${minhagInterval}`,
            type:        'haflagah',
            label:       `ווסת ההפלגה — ${minhagInterval} יום (נוהג)`,
            hebrewDate:   addHebrewDays(last.hebrewDate, minhagInterval),
            onah:         last.onah,
            isKavua:     false,
            kavuaCount:  1,
            interval:    minhagInterval,
            canUproot:   true,
            relatedSightingId: last._id,
          })
        }
      }
    }
  }

  // ── 4. ווסת סירוג ──────────────────────────────────────────────────────────
  // Kavua ווסת חודש subsumes sirug on the same (day, onah)
  const chodeshKavuaKeys = new Set()
  if (chodeshKavua) {
    chodeshKavuaKeys.add(`${last.hebrewDate.day}|${last.onah}`)
  }

  const sirugConcerns = detectSirugConcerns(sorted, chodeshKavuaKeys, isMesulekes)
  raw.push(...sirugConcerns)

  // Enrich every concern with uprooting status and sort by date
  return raw
    .map(c => withUprootingStatus(c, observations))
    .sort((a, b) => compareHebrewDates(a.hebrewDate, b.hebrewDate))
}

export function upcomingConcerns(concerns, todayHD, withinDays = 60) {
  return concerns.filter(c => {
    const diff = daysBetween(todayHD, c.hebrewDate)
    return diff >= 0 && diff <= withinDays
  })
}
