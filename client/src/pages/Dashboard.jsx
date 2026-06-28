import { useState, useEffect, useMemo, useCallback } from 'react'
import { JewishCalendar, ComplexZmanimCalendar, GeoLocation, ZmanimFormatter, DateTime } from 'kosher-zmanim'
import tzlookup from 'tz-lookup'
import { api } from '../lib/api'
import {
  addHebrewDays,
  hebrewDateEquals,
  compareHebrewDates,
  daysBetween,
  todayHebrew,
  MONTH_NAMES,
  ONAH_HE,
} from '../lib/hebrewCalendar'
import {
  plannedMikvehDay,
  hefsekWindow,
  bedikaWindows,
  derivePhase,
  daysUntilHefsekAllowed,
  currentCleanDayNumber,
} from '../lib/cycleCalculator'
import { computeVesetConcerns } from '../lib/vesetCalculator'

// ── Hebrew helpers ──────────────────────────────────────────────────────────

const DAY_LETTERS = [
  '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
]
const DAY_HEADERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שב׳']

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
function toHebrewYear(y) {
  const l = toHebrewLetters(y % 1000)
  return l.length <= 1 ? l + "'" : l.slice(0, -1) + '"' + l.slice(-1)
}

function nextHMonth(year, month) {
  const leap = JewishCalendar.isJewishLeapYear(year)
  if (month === 6)  return { year: year + 1, month: 7 }
  if (month === 12) return leap ? { year, month: 13 } : { year, month: 1 }
  if (month === 13) return { year, month: 1 }
  return { year, month: month + 1 }
}
function prevHMonth(year, month) {
  const leap = JewishCalendar.isJewishLeapYear(year)
  if (month === 7)  return { year: year - 1, month: 6 }
  if (month === 1)  return leap ? { year, month: 13 } : { year, month: 12 }
  return { year, month: month - 1 }
}

function buildGrid(year, month) {
  const c = new JewishCalendar()
  c.setJewishDate(year, month, 1)
  const start = c.getDayOfWeek()
  const total = c.getDaysInJewishMonth()
  const cells = []
  for (let i = 1; i < start; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push(d)
  return cells
}

// ── Zmanim ──────────────────────────────────────────────────────────────────

function getZmanimForDay(gYear, gMonth, gDay, lat, lng, tz) {
  const geo = new GeoLocation('', lat, lng, 0, tz)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.fromObject({ year: gYear, month: gMonth, day: gDay, hour: 12 }, { zone: tz }))
  const z = ZmanimFormatter.toJSON(cal).Zmanim
  return {
    sunrise:       z.Sunrise         ? new Date(z.Sunrise)         : null,
    sunset:        z.Sunset          ? new Date(z.Sunset)          : null,
    minchaKetana:  z.MinchaKetana    ? new Date(z.MinchaKetana)    : null,
    alotHaShachar: z.AlosHashachar   ? new Date(z.AlosHashachar)   : null,
    tzais:         z.TzaisHacochavim ? new Date(z.TzaisHacochavim) : null,
  }
}

function fmt(date, tz) {
  if (!date) return '—'
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}

// ── Cell status ─────────────────────────────────────────────────────────────
// Night onah and day onah are INDEPENDENT — each gets its own color.
// nightColor  = color for the right (night) half
// dayColor    = color for the left (day) half
// nightConcerns / dayConcerns = veset concerns split by onah

function getCellColors(hd, sightings, cycle, vesetMap) {
  const k = `${hd.year}-${hd.month}-${hd.day}`
  const allConcerns = vesetMap[k] ?? []
  // Concerns are per-onah — split them
  const nightConcerns = allConcerns.filter(c => c.onah === 'night' || c.onah === 'full_day')
  const dayConcerns   = allConcerns.filter(c => c.onah === 'day'   || c.onah === 'full_day')

  let nightColor = 'bg-slate-100'
  let dayColor   = 'bg-white'
  let dayText    = 'text-gray-800'
  let type       = 'normal'
  let dayNum     = null

  // ── Sightings: only color the specific onah that had the sighting ──
  const daySightings = sightings.filter(s => hebrewDateEquals(s.hebrewDate, hd))
  if (daySightings.length > 0) {
    for (const s of daySightings) {
      if (s.onah === 'night')    nightColor = 'bg-rose-500'
      else if (s.onah === 'day') { dayColor = 'bg-rose-500'; dayText = 'text-white' }
      else { nightColor = 'bg-rose-500'; dayColor = 'bg-rose-400'; dayText = 'text-white' }
    }
    return { nightColor, dayColor, dayText, nightConcerns, dayConcerns, type: 'sighting', dayNum }
  }

  // ── 5-day wait: both onahs are tamei ──
  if (cycle?.latestSighting?.hebrewDate) {
    const diff = daysBetween(cycle.latestSighting.hebrewDate, hd)
    if (diff > 0 && diff <= 4 && (cycle.phase === 'waiting_5_days' || cycle.phase === 'waiting_hefsek')) {
      return { nightColor: 'bg-rose-200', dayColor: 'bg-rose-100', dayText: 'text-rose-900',
               nightConcerns, dayConcerns, type: 'waiting', dayNum: null }
    }
  }

  if (cycle?.hefsekTahara?.hebrewDate) {
    const hefsekHD = cycle.hefsekTahara.hebrewDate

    // ── Hefsek tahara: happens during DAY only — night half is still "tail of wait" ──
    if (hebrewDateEquals(hefsekHD, hd)) {
      return {
        nightColor: 'bg-rose-100',  // tail of the wait period
        dayColor:   'bg-amber-400', // hefsek done in daytime (after mincha ketana)
        dayText: 'text-amber-900',
        nightConcerns, dayConcerns, type: 'hefsek', dayNum: null,
      }
    }

    // ── 7 clean days: both onahs are clean ──
    const diff = daysBetween(hefsekHD, hd)
    if (diff >= 1 && diff <= 7) {
      const last = diff === 7
      return {
        nightColor: last ? 'bg-emerald-400' : 'bg-emerald-200',
        dayColor:   last ? 'bg-emerald-300' : 'bg-emerald-100',
        dayText: 'text-emerald-900',
        nightConcerns, dayConcerns, type: last ? 'clean_7' : 'clean', dayNum: diff,
      }
    }

    // ── Mikveh: NIGHT onah only — day onah is normal tahorah ──
    const mikvehHD = plannedMikvehDay(hefsekHD)
    if (hebrewDateEquals(mikvehHD, hd)) {
      const done = !!cycle.mikveDate?.actual
      return {
        nightColor: done ? 'bg-blue-500' : 'bg-blue-200',
        dayColor:   'bg-white', // ← daytime is ordinary; mikveh is AT NIGHT only
        dayText: 'text-gray-800',
        nightConcerns, dayConcerns, type: done ? 'mikveh' : 'mikveh_planned', dayNum: null,
      }
    }
  }

  return { nightColor: 'bg-slate-100', dayColor: 'bg-white', dayText: 'text-gray-800',
           nightConcerns, dayConcerns, type: 'normal', dayNum: null }
}

// ── Phase banner config ─────────────────────────────────────────────────────

const PHASE_CFG = {
  tahorah:        { label: 'טהורה',              bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  waiting_5_days: { label: 'ימי המתנה',          bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700'    },
  waiting_hefsek: { label: 'ממתינה להפסק טהרה', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   },
  counting_7:     { label: 'ספירת 7 נקיים',      bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  waiting_mikveh: { label: 'מוכנה לטבילה',       bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700'    },
}

// ── Day detail bottom sheet ─────────────────────────────────────────────────

function DaySheet({ hd, cellColors, cycle, sightings, location, phase, onClose, onRefresh }) {
  const [view, setView]         = useState('main')
  const [timeInput, setTimeInput] = useState('')
  const [loading, setLoading]   = useState(false)

  const tz  = location?.tz ?? 'Asia/Jerusalem'
  const lat = location?.lat ?? 31.7683
  const lng = location?.lng ?? 35.2137

  const zmanim = useMemo(() => {
    const c = new JewishCalendar()
    c.setJewishDate(hd.year, hd.month, hd.day)
    const gd   = c.getDate()
    const dt   = DateTime.fromObject({ year: gd.year, month: gd.month, day: gd.day, hour: 12 }, { zone: tz })
    const prev = dt.minus({ days: 1 })
    const todayZ = getZmanimForDay(dt.year,   dt.month,   dt.day,   lat, lng, tz)
    const prevZ  = getZmanimForDay(prev.year, prev.month, prev.day, lat, lng, tz)
    return {
      nightStart:   prevZ.sunset,
      dayStart:     todayZ.sunrise,
      dayEnd:       todayZ.sunset,
      minchaKetana: todayZ.minchaKetana,
    }
  }, [hd, lat, lng, tz])

  // Derive onah automatically from the time the user enters + actual zmanim
  const computedOnah = useMemo(() => {
    if (!timeInput || !zmanim.dayStart || !zmanim.dayEnd) return null
    const [h, m] = timeInput.split(':').map(Number)
    const enteredMins = h * 60 + m
    const sunriseMins = zmanim.dayStart.getHours() * 60 + zmanim.dayStart.getMinutes()
    const sunsetMins  = zmanim.dayEnd.getHours()   * 60 + zmanim.dayEnd.getMinutes()
    return (enteredMins >= sunriseMins && enteredMins < sunsetMins) ? 'day' : 'night'
  }, [timeInput, zmanim])

  const isFuture     = compareHebrewDates(hd, todayHebrew()) > 0
  const daySightings = sightings.filter(s => hebrewDateEquals(s.hebrewDate, hd))
  const dayType       = cellColors?.type ?? 'normal'
  const nightConcerns = cellColors?.nightConcerns ?? []
  const dayConcerns   = cellColors?.dayConcerns   ?? []
  const allConcerns   = [...nightConcerns, ...dayConcerns]
    .filter((c, i, a) => a.findIndex(x => x.id === c.id) === i) // dedupe full_day

  const canRecordSighting = !daySightings.length && !isFuture
  const canDoHefsek       = phase === 'waiting_hefsek' && !cycle?.hefsekTahara && !isFuture
  const canRecordBedika   = phase === 'counting_7' && (dayType === 'clean' || dayType === 'clean_7') && !isFuture
  const canRecordMikveh   = (phase === 'waiting_mikveh' || phase === 'counting_7') && !isFuture

  const hefsekWin = canDoHefsek ? hefsekWindow(hd, lat, lng) : null
  const bedikaWin = canRecordBedika ? bedikaWindows(hd, lat, lng) : null

  const isLeap    = JewishCalendar.isJewishLeapYear(hd.year)
  const monthName = (isLeap && hd.month === 12) ? 'אדר א׳' : MONTH_NAMES[hd.month]

  async function doRecordSighting() {
    if (!computedOnah) return
    setLoading(true)
    try {
      const jc = new JewishCalendar()
      jc.setJewishDate(hd.year, hd.month, hd.day)
      const gd = jc.getDate()
      const [h, m] = timeInput.split(':').map(Number)

      let datetime
      if (computedOnah === 'day') {
        // Gregorian day N at entered time
        datetime = new Date(gd.year, gd.month - 1, gd.day, h, m, 0)
      } else {
        // Night of Hebrew N: if time is before noon → early morning of Gregorian N
        //                    if time >= noon → evening of Gregorian N-1
        if (h < 12) {
          datetime = new Date(gd.year, gd.month - 1, gd.day, h, m, 0)
        } else {
          datetime = new Date(gd.year, gd.month - 1, gd.day - 1, h, m, 0)
        }
      }

      await api.recordSighting({
        gregorianDatetime: datetime.toISOString(),
        hebrewDate: hd,
        onah: computedOnah,
        lat, lng,
      })
      await onRefresh()
      setView('main')
      setTimeInput('')
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function doHefsek() {
    setLoading(true)
    try {
      await api.recordHefsek({ gregorianDatetime: new Date().toISOString(), hebrewDate: hd })
      await onRefresh(); setView('main')
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function doBedika(type, result) {
    setLoading(true)
    try {
      await api.recordBedika({ dayNumber: cellColors?.dayNum, hebrewDate: hd, type, result })
      await onRefresh()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function doMikveh() {
    setLoading(true)
    try {
      await api.recordMikveh({ gregorianDatetime: new Date().toISOString() })
      await onRefresh(); onClose()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pt-2 pb-10">
          {/* Date */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">{DAY_LETTERS[hd.day]} {monthName}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-sm flex items-center justify-center">✕</button>
          </div>

          {/* Onah times — vertical split matching calendar */}
          <div className="flex rounded-2xl overflow-hidden border border-gray-100 mb-4">
            {/* Night — right in RTL */}
            <div className="flex-1 bg-slate-100 px-3 py-3">
              <p className="text-slate-500 text-xs font-medium mb-1">🌙 לילה</p>
              <p className="text-slate-700 text-sm font-mono" dir="ltr">{fmt(zmanim.nightStart, tz)}</p>
              <p className="text-slate-400 text-xs font-mono" dir="ltr">↓ {fmt(zmanim.dayStart, tz)}</p>
            </div>
            <div className="w-px bg-gray-200" />
            {/* Day — left in RTL */}
            <div className="flex-1 bg-amber-50 px-3 py-3">
              <p className="text-amber-500 text-xs font-medium mb-1">☀️ יום</p>
              <p className="text-amber-700 text-sm font-mono" dir="ltr">{fmt(zmanim.dayStart, tz)}</p>
              <p className="text-amber-400 text-xs font-mono" dir="ltr">↓ {fmt(zmanim.dayEnd, tz)}</p>
            </div>
          </div>

          {/* Events */}
          {daySightings.map((s, i) => (
            <div key={i} className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <div>
                <p className="text-rose-700 font-semibold">ראיה</p>
                <p className="text-rose-400 text-sm">{ONAH_HE[s.onah]}</p>
              </div>
            </div>
          ))}
          {dayType === 'hefsek' && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <p className="text-amber-700 font-semibold">הפסק טהרה</p>
            </div>
          )}
          {(dayType === 'clean' || dayType === 'clean_7') && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-emerald-700 font-semibold">יום {cellColors?.dayNum} מ-7 ימים נקיים</p>
            </div>
          )}
          {(dayType === 'mikveh' || dayType === 'mikveh_planned') && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <p className="text-blue-700 font-semibold">{dayType === 'mikveh' ? 'טבילה במקווה' : 'ליל הטבילה (מתוכנן)'}</p>
            </div>
          )}
          {allConcerns.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />
              <div>
                <p className="text-orange-700 font-semibold">חשש {c.label}</p>
                <p className="text-orange-400 text-sm">{ONAH_HE[c.onah]}</p>
              </div>
            </div>
          ))}

          {/* Hefsek window */}
          {canDoHefsek && hefsekWin && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-3">
              <p className="text-amber-600 text-sm font-medium mb-0.5">חלון הפסק טהרה</p>
              <p className="text-amber-800 font-mono text-sm" dir="ltr">{fmt(hefsekWin.earliest, tz)} – {fmt(hefsekWin.latest, tz)}</p>
            </div>
          )}

          {/* Bedika windows */}
          {canRecordBedika && bedikaWin && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                <p className="text-emerald-500 text-xs font-medium mb-0.5">בדיקת בוקר</p>
                <p className="text-emerald-800 font-mono text-xs" dir="ltr">{fmt(bedikaWin.morningStart, tz)} – {fmt(bedikaWin.morningEnd, tz)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                <p className="text-emerald-500 text-xs font-medium mb-0.5">בדיקת ערב</p>
                <p className="text-emerald-800 font-mono text-xs" dir="ltr">{fmt(bedikaWin.eveningStart, tz)} – {fmt(bedikaWin.eveningEnd, tz)}</p>
              </div>
            </div>
          )}

          {/* Sighting sub-view — time input, onah computed from zmanim */}
          {view === 'sighting' && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-3">
              <p className="text-gray-800 font-semibold mb-1">באיזו שעה הייתה הראיה?</p>
              <p className="text-gray-400 text-xs mb-3">העונה תחושב אוטומטית לפי זמני היום</p>

              {/* Time input */}
              <input
                type="time"
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                className="w-full border-2 border-gray-200 focus:border-gray-400 rounded-xl px-4 py-3.5 text-2xl text-center font-mono text-gray-900 mb-3 focus:outline-none bg-white"
                style={{ direction: 'ltr' }}
              />

              {/* Live onah result */}
              {timeInput ? (
                <div className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 mb-3 ${
                  computedOnah === 'day'
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-slate-100 border border-slate-200'
                }`}>
                  <span className="text-lg">{computedOnah === 'day' ? '☀️' : '🌙'}</span>
                  <span className={`font-semibold text-sm ${computedOnah === 'day' ? 'text-amber-700' : 'text-slate-700'}`}>
                    {computedOnah === 'day' ? 'עונת היום' : 'עונת הלילה'}
                  </span>
                  <span className={`text-xs ${computedOnah === 'day' ? 'text-amber-400' : 'text-slate-400'}`}>
                    ({computedOnah === 'day'
                      ? `${fmt(zmanim.dayStart, tz)}–${fmt(zmanim.dayEnd, tz)}`
                      : `${fmt(zmanim.nightStart, tz)}–${fmt(zmanim.dayStart, tz)}`})
                  </span>
                </div>
              ) : (
                <div className="h-10 mb-3" />
              )}

              <div className="flex gap-2">
                <button onClick={() => { setView('main'); setTimeInput('') }}
                  className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium">
                  ביטול
                </button>
                <button onClick={doRecordSighting} disabled={loading || !timeInput || !computedOnah}
                  className="flex-1 bg-rose-500 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 transition">
                  {loading ? '...' : 'שמור ✓'}
                </button>
              </div>
            </div>
          )}

          {/* Bedika sub-view */}
          {view === 'bedika' && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-3">
              <p className="text-gray-700 font-semibold mb-3">בדיקות יום {cellColors?.dayNum}</p>
              <div className="space-y-2">
                <button onClick={() => doBedika('morning', 'clean')} disabled={loading}
                  className="w-full bg-emerald-500 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50">בדיקת בוקר — נקיה ✓</button>
                <button onClick={() => doBedika('evening', 'clean')} disabled={loading}
                  className="w-full bg-emerald-500 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50">בדיקת ערב — נקיה ✓</button>
                <button onClick={() => doBedika('moch', 'clean')} disabled={loading}
                  className="w-full bg-gray-200 text-gray-700 rounded-xl py-3 text-sm disabled:opacity-50">מוך דחוק — נקי ✓</button>
              </div>
              <button onClick={() => setView('main')} className="w-full mt-2 text-gray-400 text-sm py-2">סגור</button>
            </div>
          )}

          {/* Main actions */}
          {view === 'main' && (
            <div className="space-y-2 mt-2">
              {canRecordSighting && (
                <button onClick={() => setView('sighting')}
                  className="w-full flex items-center justify-between bg-rose-500 hover:bg-rose-600 text-white rounded-2xl px-5 py-4 transition font-semibold">
                  <span>רשום ראיה</span><span className="text-2xl leading-none">+</span>
                </button>
              )}
              {canDoHefsek && (
                <button onClick={doHefsek} disabled={loading}
                  className="w-full flex items-center justify-between bg-amber-500 hover:bg-amber-600 text-white rounded-2xl px-5 py-4 transition font-semibold disabled:opacity-60">
                  <span>אישור הפסק טהרה</span><span className="text-2xl leading-none">✓</span>
                </button>
              )}
              {canRecordBedika && (
                <button onClick={() => setView('bedika')}
                  className="w-full flex items-center justify-between bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-5 py-4 transition font-semibold">
                  <span>רשום בדיקה</span><span className="text-2xl leading-none">+</span>
                </button>
              )}
              {canRecordMikveh && (
                <button onClick={doMikveh} disabled={loading}
                  className="w-full flex items-center justify-between bg-blue-500 hover:bg-blue-600 text-white rounded-2xl px-5 py-4 transition font-semibold disabled:opacity-60">
                  <span>אישור טבילה במקווה</span><span className="text-2xl leading-none">✓</span>
                </button>
              )}
              {!canRecordSighting && !canDoHefsek && !canRecordBedika && !canRecordMikveh && (
                <p className="text-center text-gray-400 text-sm py-3">
                  {isFuture ? 'תאריך עתידי' : 'אין פעולות זמינות'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Day cell — vertical split: night (right, RTL) | day (left, RTL) ─────────
// Each half is FULLY INDEPENDENT — color, concerns, live indicator.

function DayCell({ day, cellColors, isToday, isSelected, currentPeriod, onClick }) {
  const {
    nightColor    = 'bg-slate-100',
    dayColor      = 'bg-white',
    dayText       = 'text-gray-800',
    nightConcerns = [],
    dayConcerns   = [],
    type          = 'normal',
  } = cellColors ?? {}

  // Today with no halachic status → show live onah with indigo/amber
  const effectNight = (isToday && type === 'normal')
    ? (currentPeriod === 'night' ? 'bg-indigo-500' : 'bg-indigo-100')
    : nightColor
  const effectDay = (isToday && type === 'normal')
    ? (currentPeriod === 'day' ? 'bg-amber-400' : 'bg-amber-50')
    : dayColor
  const effectText = (isToday && type === 'normal') ? 'text-gray-800' : dayText

  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-row rounded-lg overflow-hidden focus:outline-none h-[3.75rem] ${
        isSelected ? 'ring-2 ring-gray-800 shadow-md z-10 relative' : 'hover:brightness-95 active:brightness-90'
      }`}
    >
      {/* ── Night onah — RIGHT in RTL ── */}
      <div className={`w-2/5 flex flex-col items-center justify-center gap-0.5 ${effectNight}`}>
        {isToday && currentPeriod === 'night' && type === 'normal' && (
          <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 animate-pulse" />
        )}
        {nightConcerns.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        )}
      </div>

      {/* ── Day onah — LEFT in RTL, carries the date number ── */}
      <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${effectDay}`}>
        <span className={`text-sm font-bold leading-none ${effectText}`}>
          {DAY_LETTERS[day]}
        </span>
        {isToday && currentPeriod === 'day' && type === 'normal' && (
          <span className="w-1 h-1 rounded-full bg-amber-700 opacity-40 animate-pulse" />
        )}
        {dayConcerns.length > 0 && (
          <span className="w-1 h-1 rounded-full bg-orange-400" />
        )}
      </div>
    </button>
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const todayCal   = useMemo(() => new JewishCalendar(new Date()), [])
  const todayYear  = todayCal.getJewishYear()
  const todayMonth = todayCal.getJewishMonth()
  const todayDay   = todayCal.getJewishDayOfMonth()

  const [dispYear,  setDispYear]  = useState(todayYear)
  const [dispMonth, setDispMonth] = useState(todayMonth)
  const [selected,  setSelected]  = useState(null)
  const [location,  setLocation]  = useState(null)
  const [now, setNow]             = useState(new Date())

  const [cycle,      setCycle]      = useState(null)
  const [sightings,  setSightings]  = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error,      setError]      = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.getCycle(), api.getSightings()])
      setCycle(c); setSightings(s)
    } catch (err) { setError(err.message) }
    finally { setDataLoaded(true) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const tz = tzlookup(coords.latitude, coords.longitude) ?? 'Asia/Jerusalem'
        setLocation({ lat: coords.latitude, lng: coords.longitude, tz })
      },
      () => setLocation({ lat: 31.7767, lng: 35.2345, tz: 'Asia/Jerusalem' }),
      { timeout: 8000 },
    )
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Current period for today
  const currentPeriod = useMemo(() => {
    if (!location) return null
    const { lat, lng, tz } = location
    const gd = todayCal.getDate()
    const dt   = DateTime.fromObject({ year: gd.year, month: gd.month, day: gd.day, hour: 12 }, { zone: tz })
    const prev = dt.minus({ days: 1 })
    const todZ = getZmanimForDay(dt.year,   dt.month,   dt.day,   lat, lng, tz)
    const preZ = getZmanimForDay(prev.year, prev.month, prev.day, lat, lng, tz)
    const ns = preZ.sunset, ds = todZ.sunrise, de = todZ.sunset
    if (ns && ds && now >= ns && now < ds) return 'night'
    if (ds && de && now >= ds && now < de) return 'day'
    return null
  }, [location, todayCal, now])

  const phase = useMemo(() => derivePhase(cycle), [cycle])

  const vesetConcerns = useMemo(() => computeVesetConcerns(sightings), [sightings])

  const vesetMap = useMemo(() => {
    const map = {}
    for (const c of vesetConcerns) {
      const k = `${c.hebrewDate.year}-${c.hebrewDate.month}-${c.hebrewDate.day}`
      if (!map[k]) map[k] = []
      map[k].push(c)
    }
    return map
  }, [vesetConcerns])

  const cells = useMemo(() => buildGrid(dispYear, dispMonth), [dispYear, dispMonth])

  const isLeap    = JewishCalendar.isJewishLeapYear(dispYear)
  const monthName = (isLeap && dispMonth === 12) ? 'אדר א׳' : MONTH_NAMES[dispMonth]
  const phaseCfg  = PHASE_CFG[phase] ?? PHASE_CFG.tahorah

  const phaseDetail = useMemo(() => {
    if (!cycle) return null
    if (phase === 'waiting_5_days' && cycle.latestSighting) {
      const d = daysUntilHefsekAllowed(cycle.latestSighting.hebrewDate)
      return d === 0 ? 'הפסק טהרה אפשרי היום' : `עוד ${d} ימים`
    }
    if (phase === 'counting_7' && cycle.hefsekTahara) {
      const n = currentCleanDayNumber(cycle.hefsekTahara.hebrewDate)
      return n ? `יום ${n} מ-7` : null
    }
    if (phase === 'waiting_mikveh' && cycle.hefsekTahara) {
      const m = plannedMikvehDay(cycle.hefsekTahara.hebrewDate)
      return `מקווה: ליל ${DAY_LETTERS[m.day]} ${MONTH_NAMES[m.month]}`
    }
    return null
  }, [phase, cycle])

  function goNext() { const n = nextHMonth(dispYear, dispMonth); setDispYear(n.year); setDispMonth(n.month) }
  function goPrev() { const p = prevHMonth(dispYear, dispMonth); setDispYear(p.year); setDispMonth(p.month) }

  const selectedColors = selected
    ? getCellColors(selected, sightings, cycle, vesetMap)
    : null

  if (error) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8 text-center" dir="rtl">
      <div>
        <p className="text-red-500 font-semibold mb-2">שגיאת חיבור לשרת</p>
        <p className="text-gray-400 text-sm mb-4">{error}</p>
        <button onClick={refresh} className="text-gray-600 underline text-sm">נסה שוב</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white" dir="rtl">

      {/* ── Sticky header ── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <button onClick={goPrev} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition text-xl font-light">›</button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 leading-none">{monthName}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{toHebrewYear(dispYear)}</p>
          </div>
          <button onClick={goNext} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition text-xl font-light">‹</button>
        </div>

        {/* Phase strip */}
        {dataLoaded && (
          <div className={`rounded-xl border px-4 py-2 flex items-center justify-center gap-2 ${phaseCfg.bg} ${phaseCfg.border}`}>
            <span className={`text-sm font-semibold ${phaseCfg.text}`}>{phaseCfg.label}</span>
            {phaseDetail && <span className={`text-sm ${phaseCfg.text} opacity-60`}>· {phaseDetail}</span>}
          </div>
        )}
      </div>

      <div className="px-2">
        {/* ── Column headers with night/day labels ── */}
        <div className="grid grid-cols-7 mt-3 mb-1">
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-gray-400 text-xs font-medium py-1">{h}</div>
          ))}
        </div>

        {/* Night/Day sub-headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_HEADERS.map((_, i) => (
            <div key={i} className="flex rounded overflow-hidden h-4">
              <div className="w-2/5 flex items-center justify-center bg-slate-100">
                <span className="text-slate-400 text-[8px] leading-none">ל׳</span>
              </div>
              <div className="flex-1 flex items-center justify-center bg-amber-50">
                <span className="text-amber-400 text-[8px] leading-none">י׳</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Calendar grid ── */}
        {!dataLoaded ? (
          <div className="h-72 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="h-[3.75rem]" />
              const hd      = { year: dispYear, month: dispMonth, day }
              const isToday = day === todayDay && dispMonth === todayMonth && dispYear === todayYear
              const isSel   = selected && hebrewDateEquals(hd, selected)
              const colors  = getCellColors(hd, sightings, cycle, vesetMap)
              return (
                <DayCell
                  key={i}
                  day={day}
                  cellColors={colors}
                  isToday={isToday}
                  isSelected={isSel}
                  currentPeriod={currentPeriod}
                  onClick={() => setSelected(isSel ? null : hd)}
                />
              )
            })}
          </div>
        )}

        {/* ── Legend ── */}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 justify-center pb-8">
          {[
            { label: 'ראיה',         night: 'bg-rose-500',    day: 'bg-rose-50'    },
            { label: 'הפסק טהרה',    night: 'bg-amber-400',   day: 'bg-amber-300'  },
            { label: '7 נקיים',      night: 'bg-emerald-200', day: 'bg-emerald-100'},
            { label: 'מקווה',        night: 'bg-blue-200',    day: 'bg-blue-100'   },
          ].map(({ label, night, day }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="flex rounded overflow-hidden w-5 h-3">
                <div className={`w-2/5 ${night}`} />
                <div className={`flex-1 ${day}`} />
              </div>
              <span className="text-gray-400 text-xs">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
            <span className="text-gray-400 text-xs">חשש ווסת</span>
          </div>
        </div>
      </div>

      {/* ── Day sheet ── */}
      {selected && (
        <DaySheet
          hd={selected}
          cellColors={selectedColors}
          cycle={cycle}
          sightings={sightings}
          location={location}
          phase={phase}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}
