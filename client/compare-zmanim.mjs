/**
 * Zmanim accuracy comparison — Tel Aviv, one month
 *
 * Compares KosherZmanim (NOAA + SunTimes) and Hebcal against
 * dahanswebsite.com/api/zmanim (treated as ground truth).
 *
 * Run from client/ directory:
 *   node compare-zmanim.mjs
 */

import {
  ComplexZmanimCalendar,
  GeoLocation,
  SunTimesCalculator,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'

// ── Config ────────────────────────────────────────────────────────────
const LAT         = 32.0853
const LNG         = 34.7818
const LOCATION_ID = 531
const TIMEZONE    = 'Asia/Jerusalem'
const FROM        = '2026-06-01'
const TO          = '2026-06-30'

// ── Mapping: API type → candidates to try in each source ─────────────
//
// For each apiType we list every kosher-zmanim key that *might* match.
// The script will try all of them and pick the winner per row.
const ROWS = [
  {
    apiType:    'AlosHashachar',
    label:      'עלות השחר',
    kzCandidates: ['AlosBaalHatanya', 'Alos72'],
    hebcalKey:  'alotHaShachar',
  },
  {
    apiType:    'EarliestTefillin',
    label:      'משיכיר (ציצית/תפילין)',
    kzCandidates: ['Misheyakir10Point2Degrees', 'Misheyakir11Degrees'],
    hebcalKey:  null,
  },
  {
    apiType:    'NetzHachamah',
    label:      'נץ החמה',
    kzCandidates: ['Sunrise', 'SeaLevelSunrise'],
    hebcalKey:  'sunrise',
  },
  {
    apiType:    'LatestShema',
    label:      'סוף ק"ש',
    kzCandidates: ['SofZmanShmaBaalHatanya', 'SofZmanShmaGRA', 'SofZmanShmaMGA'],
    hebcalKey:  null,
  },
  {
    apiType:    'LatestTefillah',
    label:      'סוף תפילה',
    kzCandidates: ['SofZmanTfilaBaalHatanya', 'SofZmanTfilaGRA', 'SofZmanTfilaMGA'],
    hebcalKey:  null,
  },
  {
    apiType:    'Chatzos',
    label:      'חצות היום',
    kzCandidates: ['Chatzos', 'SunTransit'],
    hebcalKey:  'chatzot',
  },
  {
    apiType:    'MinchahGedolah',
    label:      'מנחה גדולה',
    kzCandidates: ['MinchaGedola', 'MinchaGedolaBaalHatanya', 'MinchaGedolaGreaterThan30'],
    hebcalKey:  'minchaGedola',
  },
  {
    apiType:    'MinchahKetanah',
    label:      'מנחה קטנה',
    kzCandidates: ['MinchaKetanaBaalHatanya', 'MinchaKetana'],
    hebcalKey:  'minchaKetana',
  },
  {
    apiType:    'PlagHaminchah',
    label:      'פלג המנחה',
    kzCandidates: ['PlagHaminchaBaalHatanya', 'PlagHamincha'],
    hebcalKey:  'plagHaMincha',
  },
  {
    apiType:    'Shkiah',
    label:      'שקיעה',
    kzCandidates: ['Sunset', 'SeaLevelSunset'],
    hebcalKey:  'sunset',
  },
  {
    apiType:    'Tzeis',
    label:      'צאת הכוכבים',
    kzCandidates: ['TzaisBaalHatanya', 'Tzais8Point5Degrees', 'TzaisGeonim5Point95Degrees', 'TzaisGeonim7Point083Degrees'],
    hebcalKey:  'tzeit85deg',
  },
  {
    apiType:    'ChatzosNight',
    label:      'חצות הלילה',
    kzCandidates: ['SolarMidnight', 'SunLowerTransit'],
    hebcalKey:  null,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────

/** Parse "H:MM" → minutes since midnight */
function parseHHMM(str) {
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

/** ISO string → minutes since midnight in Jerusalem */
function isoToMins(iso) {
  if (!iso || iso === 'N/A') return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  const hhmm = d.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE,
  })
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Generate ISO date strings for a range */
function dateRange(from, to) {
  const result = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    result.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

/** Build a ComplexZmanimCalendar for a date string */
function buildCal(dateStr, useSunTimes = false) {
  const geo = new GeoLocation('', LAT, LNG, 0, TIMEZONE)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.fromISO(dateStr, { zone: TIMEZONE }))
  if (useSunTimes) cal.setAstronomicalCalculator(new SunTimesCalculator())
  return cal
}

/** Extract all zmanim from a cal, including blacklisted ones */
function extractZmanim(cal) {
  const z = ZmanimFormatter.toJSON(cal).Zmanim

  // Baal HaTanya zmanim that are blacklisted by the formatter
  const directCalls = [
    ['AlosBaalHatanya',          () => cal.getAlosBaalHatanya()],
    ['SofZmanShmaBaalHatanya',   () => cal.getSofZmanShmaBaalHatanya()],
    ['SofZmanTfilaBaalHatanya',  () => cal.getSofZmanTfilaBaalHatanya()],
    ['MinchaGedolaBaalHatanya',  () => cal.getMinchaGedolaBaalHatanya()],
    ['MinchaKetanaBaalHatanya',  () => cal.getMinchaKetanaBaalHatanya()],
    ['PlagHaminchaBaalHatanya',  () => cal.getPlagHaminchaBaalHatanya()],
    ['TzaisBaalHatanya',         () => cal.getTzaisBaalHatanya()],
  ]

  for (const [key, fn] of directCalls) {
    if (!z[key]) {
      try { const v = fn(); if (v) z[key] = v.toISO() } catch {}
    }
  }

  return z
}

// ── Data fetching ─────────────────────────────────────────────────────

async function fetchApiMonth() {
  const url =
    `https://dahanswebsite.com/api/zmanim` +
    `?locationId=${LOCATION_ID}&from=${FROM}&to=${TO}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  const days = await res.json()

  const map = {}
  for (const day of days) {
    map[day.date] = {}
    for (const z of day.zmanim) {
      // skip ShaahZmanit (contains "דקות", not a clock time)
      if (z.time && !z.time.includes('דקות') && !z.time.includes('min')) {
        map[day.date][z.type] = parseHHMM(z.time)
      }
    }
  }
  return map
}

async function fetchHebcalDay(dateStr) {
  const url =
    `https://www.hebcal.com/zmanim?cfg=json` +
    `&latitude=${LAT}&longitude=${LNG}&tzid=Asia%2FJerusalem&date=${dateStr}`
  const res = await fetch(url)
  if (!res.ok) return {}
  const data = await res.json()
  return data.times || {}
}

// ── Stats accumulator ─────────────────────────────────────────────────

function makeAccumulator(rows) {
  const acc = {}
  for (const row of rows) {
    acc[row.apiType] = { label: row.label, series: {} }
    for (const k of row.kzCandidates) {
      acc[row.apiType].series[`${k} [NOAA]`]     = []
      acc[row.apiType].series[`${k} [SunTimes]`] = []
    }
    if (row.hebcalKey) acc[row.apiType].series['Hebcal'] = []
  }
  return acc
}

function recordDiff(series, label, apiMins, sourceMins) {
  if (apiMins == null || sourceMins == null) return
  series[label]?.push(Math.abs(sourceMins - apiMins))
}

// ── Report ────────────────────────────────────────────────────────────

function avg(arr) {
  if (!arr.length) return Infinity
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function printReport(acc) {
  const SEP = '─'.repeat(80)

  // Per-zman breakdown
  console.log('\n' + '═'.repeat(80))
  console.log(' BREAKDOWN PER ZMAN')
  console.log('═'.repeat(80))

  // Collect global stats: sourceLabel → all diffs
  const global = {}

  for (const [apiType, { label, series }] of Object.entries(acc)) {
    const entries = Object.entries(series)
      .filter(([, d]) => d.length > 0)
      .map(([src, d]) => ({ src, avg: avg(d), max: Math.max(...d), n: d.length }))
      .sort((a, b) => a.avg - b.avg)

    if (!entries.length) continue

    const winner = entries[0]
    const winMark = avg(entries[0].avg) < 1.5 ? '✓' : avg(entries[0].avg) < 5 ? '~' : '✗'

    console.log(`\n${winMark} ${label} (${apiType})`)
    for (const e of entries) {
      const bar = '█'.repeat(Math.min(30, Math.round(e.avg)))
      console.log(`   ${e.src.padEnd(42)} avg ${e.avg.toFixed(1).padStart(4)}m  max ${e.max}m  ${bar}`)

      // accumulate for global
      const s = series[e.src]
      if (!global[e.src]) global[e.src] = []
      global[e.src].push(...s)
    }
    console.log(`   → Best: ${winner.src} (avg diff ${winner.avg.toFixed(1)} min)`)
  }

  // Global summary
  console.log('\n' + '═'.repeat(80))
  console.log(' GLOBAL SUMMARY (all zmanim combined)')
  console.log('═'.repeat(80))

  const summary = Object.entries(global)
    .filter(([, d]) => d.length > 0)
    .map(([src, d]) => ({ src, avg: avg(d), n: d.length }))
    .sort((a, b) => a.avg - b.avg)

  for (const { src, avg: a, n } of summary) {
    const bar = '█'.repeat(Math.min(40, Math.round(a * 2)))
    console.log(`  ${src.padEnd(42)} avg ${a.toFixed(2).padStart(5)}m  (${n} data points)  ${bar}`)
  }

  console.log()
  if (summary.length) {
    console.log(`🏆 Overall winner: ${summary[0].src}  (avg ${summary[0].avg.toFixed(2)} min from API)`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nZmanim accuracy comparison — Tel Aviv ${FROM} → ${TO}`)
  console.log(`Ground truth: dahanswebsite.com/api/zmanim (locationId=${LOCATION_ID})\n`)

  process.stdout.write('Fetching API data for the month... ')
  const apiData = await fetchApiMonth()
  console.log(`${Object.keys(apiData).length} days OK`)

  const acc  = makeAccumulator(ROWS)
  const dates = dateRange(FROM, TO)

  for (let i = 0; i < dates.length; i++) {
    const date   = dates[i]
    const apiDay = apiData[date]
    if (!apiDay) continue

    process.stdout.write(`\rProcessing days: ${i + 1}/${dates.length} (${date})`)

    // KosherZmanim NOAA
    const kzNoaa = extractZmanim(buildCal(date, false))
    // KosherZmanim SunTimes
    const kzSun  = extractZmanim(buildCal(date, true))

    // Hebcal (polite delay)
    let hebTimes = {}
    const row0 = ROWS.find(r => r.hebcalKey)
    if (row0) {
      try {
        hebTimes = await fetchHebcalDay(date)
        await new Promise(r => setTimeout(r, 80))
      } catch {}
    }

    for (const row of ROWS) {
      const apiMins = apiDay[row.apiType]
      if (apiMins == null) continue

      const s = acc[row.apiType].series

      for (const k of row.kzCandidates) {
        recordDiff(s, `${k} [NOAA]`,     apiMins, isoToMins(kzNoaa[k]))
        recordDiff(s, `${k} [SunTimes]`, apiMins, isoToMins(kzSun[k]))
      }

      if (row.hebcalKey) {
        recordDiff(s, 'Hebcal', apiMins, isoToMins(hebTimes[row.hebcalKey]))
      }
    }
  }

  console.log() // newline after progress line
  printReport(acc)
}

main().catch(err => { console.error(err); process.exit(1) })
