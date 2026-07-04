import { useState, useEffect, useMemo } from 'react'
import { JewishCalendar, ComplexZmanimCalendar, GeoLocation, ZmanimFormatter, DateTime } from 'kosher-zmanim'
import tzlookup from 'tz-lookup'
import { api } from '../lib/api'
import {
  addHebrewDays,
  hebrewDateEquals,
  daysBetween,
  todayHebrew,
  MONTH_NAMES,
  ONAH_HE,
} from '../lib/hebrewCalendar'
import {
  plannedMikvehDay,
  hefsekWindow,
  bedikaWindows,
  daysUntilHefsekAllowed,
  currentCleanDayNumber,
} from '../lib/cycleCalculator'
import { SOURCE_LABEL, SOURCE_TYPE } from '../lib/veset/sourceTypes'
import { useMikvaEngine } from '../lib/useMikvaEngine'

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

export function getCellColors(hd, sightings, cycle, vesetMap, cleanState) {
  const k = `${hd.year}-${hd.month}-${hd.day}`
  const allConcerns = vesetMap[k] ?? []
  // Only show dots for ACTIVE (non-uprooted) concerns
  const activeConcerns = allConcerns.filter(c => !c.uprooted)
  const nightConcerns  = activeConcerns.filter(c => c.onah === 'night' || c.onah === 'full_day')
  const dayConcerns    = activeConcerns.filter(c => c.onah === 'day'   || c.onah === 'full_day')

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

  // ── ימי טומאה: רצף אדום מהראייה הראשונה ועד ההפסק טהרה האחרון שנעשה ──
  // מכסה גם שבירת ספירה באמצע ה-7 (נמצא דם): כל הימים אדומים עד ההפסק האחרון,
  // וממנו והלאה מתחילה ספירה חדשה (ירוק). onset = cycle.latestSighting (הדם הראשון).
  if (cycle?.latestSighting?.hebrewDate) {
    const onset      = cycle.latestSighting.hebrewDate
    const hefsekHD   = cycle?.hefsekTahara?.hebrewDate
    const afterOnset = daysBetween(onset, hd) > 0
    const inTamei = hefsekHD
      // הדם הראשון < יום < ההפסק האחרון (יום ההפסק עצמו נצבע כתום בהמשך)
      ? afterOnset && daysBetween(hd, hefsekHD) > 0
      // עוד לא נעשה הפסק — טמאה מהראייה ועד היום
      : afterOnset && (cycle.phase === 'waiting_5_days' || cycle.phase === 'waiting_hefsek')
          && daysBetween(hd, todayHebrew()) >= 0
    if (inTamei) {
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

    // ── 7 clean days ──
    const diff = daysBetween(hefsekHD, hd)
    if (diff >= 1 && diff <= 7) {
      const rec = (cycle.cleanDays ?? []).find(d => d.dayNumber === diff)
      // נמצא דם בתוך הספירה → יום חוסם, הספירה נפסלת (evaluateCleanDays → blocked)
      if (rec && (rec.morningCheck === 'stain' || rec.eveningCheck === 'stain')) {
        return {
          nightColor: 'bg-rose-400', dayColor: 'bg-rose-300', dayText: 'text-rose-900',
          nightConcerns, dayConcerns, type: 'clean_blocked', dayNum: diff,
        }
      }
      const isTovel = cleanState?.complete && cleanState.tovelDay === diff
      return {
        nightColor: isTovel ? 'bg-emerald-400' : 'bg-emerald-200',
        dayColor:   isTovel ? 'bg-emerald-300' : 'bg-emerald-100',
        dayText: 'text-emerald-900',
        nightConcerns, dayConcerns, type: isTovel ? 'clean_7' : 'clean', dayNum: diff,
      }
    }

    // ── Mikveh: NIGHT onah only — only once the count actually completed ──
    if (cleanState?.complete) {
      const mikvehHD = plannedMikvehDay(hefsekHD, cleanState.tovelDay)
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
  }

  // ── חשש ווסת (עתידי/רגיל): צובע את חצי-העונה שבו נופל החשש ברקע כתום רך ──
  if (nightConcerns.length > 0 || dayConcerns.length > 0) {
    return {
      nightColor: nightConcerns.length ? 'bg-orange-200' : 'bg-slate-100',
      dayColor:   dayConcerns.length   ? 'bg-orange-100' : 'bg-white',
      dayText:    dayConcerns.length   ? 'text-orange-900' : 'text-gray-800',
      nightConcerns, dayConcerns, type: 'concern', dayNum: null,
    }
  }

  return { nightColor: 'bg-slate-100', dayColor: 'bg-white', dayText: 'text-gray-800',
           nightConcerns, dayConcerns, type: 'normal', dayNum: null }
}

// ── Phase banner config ─────────────────────────────────────────────────────

export const PHASE_CFG = {
  tahorah:        { label: 'טהורה',              bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  waiting_5_days: { label: 'ימי המתנה',          bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700'    },
  waiting_hefsek: { label: 'ממתינה להפסק טהרה', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   },
  counting_7:     { label: 'ספירת 7 נקיים',      bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  waiting_mikveh: { label: 'מוכנה לטבילה',       bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700'    },
  blocked:        { label: 'נמצא דם — הספירה נפסקה', bg: 'bg-rose-50', border: 'border-rose-300',    text: 'text-rose-700'    },
}

// Short one-line detail shown next to the phase label. Shared by both pages.
export function phaseDetailText(cycle, effectivePhase, cleanState) {
  if (!cycle) return null
  if (effectivePhase === 'waiting_5_days' && cycle.latestSighting) {
    const d = daysUntilHefsekAllowed(cycle.latestSighting.hebrewDate)
    return d === 0 ? 'הפסק טהרה אפשרי היום' : `עוד ${d} ימים`
  }
  if (effectivePhase === 'blocked') {
    return 'יש לעשות הפסק טהרה חדש ולהתחיל ספירה'
  }
  if (effectivePhase === 'counting_7' && cycle.hefsekTahara) {
    const n = currentCleanDayNumber(cycle.hefsekTahara.hebrewDate)
    return n ? `יום ${n} מ-7` : null
  }
  if (effectivePhase === 'waiting_mikveh' && cycle.hefsekTahara) {
    const m = plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState.tovelDay)
    return `מקווה: ליל ${DAY_LETTERS[m.day]} ${MONTH_NAMES[m.month]}`
  }
  return null
}

// ── Day detail bottom sheet ─────────────────────────────────────────────────

export function DaySheet({ hd, cellColors, cycle, cleanState, sightings, vesetConcerns = [], location, phase, onClose, onRefresh }) {
  const [view, setView]         = useState('main')
  const [timeInput, setTimeInput] = useState('')
  const [sourceType, setSourceType] = useState(SOURCE_TYPE.VESET)
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

  // השוואה כרונולוגית אמיתית — compareHebrewDates סופר חודשים 1..13 ואינו נכון
  // מעבר לגבול תשרי (השנה מתחילה בתשרי=7), מה שסימן ראיות עבר כ"עתיד".
  const daysFromToday = daysBetween(todayHebrew(), hd)
  const isFuture     = daysFromToday > 0
  const isPast       = daysFromToday < 0
  const daySightings = sightings.filter(s => hebrewDateEquals(s.hebrewDate, hd))
  const dayType       = cellColors?.type ?? 'normal'
  const nightConcerns = cellColors?.nightConcerns ?? []
  const dayConcerns   = cellColors?.dayConcerns   ?? []
  const allConcerns   = [...nightConcerns, ...dayConcerns]
    .filter((c, i, a) => a.findIndex(x => x.id === c.id) === i) // dedupe full_day

  // Concerns that land ON this Hebrew day — with full uprooting data
  const thisDayConcerns = vesetConcerns.filter(c => hebrewDateEquals(c.hebrewDate, hd))

  const isBlocked         = phase === 'blocked'
  const canRecordSighting = !daySightings.length && !isFuture
  // הפסק טהרה: רגיל (סוף 5 ימים) או הפסק *חדש* לאחר שנמצא דם בספירה (blocked)
  const canDoHefsek       = ((phase === 'waiting_hefsek' && !cycle?.hefsekTahara) || isBlocked) && !isFuture
  const canRecordBedika   = phase === 'counting_7' && (dayType === 'clean' || dayType === 'clean_7') && !isFuture
  // טבילה — זמינה כשיש הפסק טהרה ובמהלך/סיום ספירת ה-7 (כולל למפרע). זמין גם על
  // תא ליל הטבילה עצמו (שהוא "עתידי" ביום אחד לפי התאריך העברי, אך הטבילה בלילה שלו).
  const canRecordMikveh   = !!cycle?.hefsekTahara &&
    (phase === 'waiting_mikveh' || phase === 'counting_7') &&
    (!isFuture || dayType === 'mikveh_planned')
  // Can mark a concern day as "passed clean" only if: it's a past concern day, no sighting recorded on it
  const canMarkClean = isPast && thisDayConcerns.length > 0 && daySightings.length === 0

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
        sourceType,
        lat, lng,
      })
      await onRefresh()
      setView('main')
      setTimeInput('')
      setSourceType(SOURCE_TYPE.VESET)
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

  async function doMarkClean(concern) {
    setLoading(true)
    try {
      await api.recordCleanPass({
        concernType:       concern.type,
        concernId:         concern.id,
        hebrewDate:        concern.hebrewDate,
        onah:              concern.onah,
        relatedSightingId: concern.relatedSightingId,
      })
      await onRefresh()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function doUndoClean(concern) {
    if (!concern.observationIds?.length) return
    setLoading(true)
    try {
      await api.deleteObservation(concern.observationIds[0])
      await onRefresh()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div dir="rtl" className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-h-[90vh] max-w-xl overflow-y-auto rounded-t-[2rem] border border-stone-200/80 bg-[#fcfbf8] shadow-[0_-24px_80px_rgba(28,25,23,0.22)] sm:bottom-6 sm:rounded-[1.75rem]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-stone-300 sm:hidden" />
        </div>

        <div className="px-5 pb-10 pt-2 sm:px-8 sm:pt-6">
          {/* Date */}
          <div className="mb-6 flex items-start justify-between border-b border-stone-200 pb-5">
            <div><p className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-teal-800">פרטי היום</p><h2 className="text-3xl font-semibold tracking-tight text-stone-900">{DAY_LETTERS[hd.day]} {monthName}</h2></div>
            <button onClick={onClose} aria-label="סגירה" className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-sm text-stone-500 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:text-stone-900 hover:shadow">✕</button>
          </div>

          {/* Onah times — vertical split matching calendar */}
          <div className="mb-5 flex overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            {/* Night — right in RTL */}
            <div className="flex-1 bg-stone-100 px-4 py-3">
              <p className="mb-1 text-xs font-semibold text-stone-500">לילה</p>
              <p className="text-slate-700 text-sm font-mono" dir="ltr">{fmt(zmanim.nightStart, tz)}</p>
              <p className="text-slate-400 text-xs font-mono" dir="ltr">↓ {fmt(zmanim.dayStart, tz)}</p>
            </div>
            <div className="w-px bg-gray-200" />
            {/* Day — left in RTL */}
            <div className="flex-1 bg-[#fffaf0] px-4 py-3">
              <p className="mb-1 text-xs font-semibold text-amber-700">יום</p>
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
              <p className="text-emerald-700 font-semibold">
                יום {cellColors?.dayNum} מ-7 ימים נקיים{dayType === 'clean_7' ? ' — הושלמה הספירה' : ''}
              </p>
            </div>
          )}
          {dayType === 'clean_blocked' && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <div>
                <p className="text-rose-700 font-semibold">נמצא דם ביום {cellColors?.dayNum}</p>
                <p className="text-rose-400 text-sm">הספירה נפסלה — יש להתחיל הפסק טהרה חדש</p>
              </div>
            </div>
          )}
          {isBlocked && dayType !== 'clean_blocked' && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <p className="text-rose-700 font-semibold">הספירה נפסקה — נדרש הפסק טהרה חדש</p>
            </div>
          )}
          {(dayType === 'mikveh' || dayType === 'mikveh_planned') && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <p className="text-blue-700 font-semibold">{dayType === 'mikveh' ? 'טבילה במקווה' : 'ליל הטבילה (מתוכנן)'}</p>
            </div>
          )}
          {thisDayConcerns.map(c => {
            const isUprooted = c.uprooted
            const kavuaLabel = c.isKavua ? ' (קבוע)' : ''
            const progressLabel = c.needed > 1
              ? `עקירה: ${c.cleanPasses}/${c.needed}`
              : c.cleanPasses >= 1 ? 'עבר ✓' : null

            return (
              <div key={c.id} className={`rounded-2xl px-4 py-3 mb-2 border ${
                isUprooted
                  ? 'bg-gray-50 border-gray-200 opacity-60'
                  : 'bg-orange-50 border-orange-100'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isUprooted ? 'bg-gray-400' : 'bg-orange-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isUprooted ? 'text-gray-400 line-through' : 'text-orange-700'}`}>
                      חשש {c.label}{kavuaLabel}
                    </p>
                    <p className={`text-xs mt-0.5 ${isUprooted ? 'text-gray-400' : 'text-orange-400'}`}>
                      {ONAH_HE[c.onah]}
                      {progressLabel && <span className="mr-2 font-medium">{progressLabel}</span>}
                    </p>
                    {c.isKavua && !isUprooted && (
                      <p className="text-xs text-orange-500 mt-0.5">נדרשות {c.needed - c.cleanPasses} עקירות נוספות</p>
                    )}
                  </div>
                </div>
                {/* Clean-pass action buttons */}
                {isPast && daySightings.length === 0 && !isUprooted && (
                  <button
                    onClick={() => doMarkClean(c)}
                    disabled={loading || c.cleanPasses >= 1}
                    className={`mt-2 w-full rounded-xl py-2 text-sm font-medium transition ${
                      c.cleanPasses >= 1
                        ? 'bg-gray-100 text-gray-400 cursor-default'
                        : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                    }`}
                  >
                    {c.cleanPasses >= 1 ? 'סומן כעבר ללא ראיה ✓' : 'יום החשש עבר ללא ראיה'}
                  </button>
                )}
                {isPast && c.cleanPasses >= 1 && (
                  <button
                    onClick={() => doUndoClean(c)}
                    disabled={loading}
                    className="mt-1 w-full text-gray-400 text-xs py-1 hover:text-gray-600 transition"
                  >
                    בטל סימון
                  </button>
                )}
              </div>
            )
          })}

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
            <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_12px_35px_rgba(41,37,36,0.06)] sm:p-6">
              {/* Source-type selector — only veset/bedika feed the veset engine */}
              <div className="mb-5"><p className="text-lg font-semibold text-stone-900">עדכון ראייה</p><p className="mt-1 text-xs leading-5 text-stone-500">בחרי את סוג הראייה והזיני את השעה. העונה תחושב עבורך.</p></div>
              <p className="mb-2 text-xs font-semibold text-stone-700">סוג הראייה</p>
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(SOURCE_LABEL).map(([val, label]) => {
                  const active  = sourceType === val
                  const daoraita = val === SOURCE_TYPE.VESET || val === SOURCE_TYPE.BEDIKA
                  return (
                    <button
                      key={val}
                      onClick={() => setSourceType(val)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                        active
                          ? 'border-rose-600 bg-rose-50 text-rose-800 shadow-[0_0_0_2px_rgba(225,29,72,0.08)]'
                          : 'border-stone-200 bg-white text-stone-600 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-sm'
                      }`}
                    >
                      {label}{daoraita ? '' : ' ·'}
                    </button>
                  )
                })}
              </div>
              <p className="mb-6 text-[11px] text-stone-400">
                רק ראיה ובדיקה נכנסות לחישוב הווסתות · שאר הסוגים מטמאים בלבד
              </p>

              <label htmlFor="sighting-time" className="mb-2 block text-xs font-semibold text-stone-700">שעת הראייה</label>

              {/* Time input */}
              <input
                id="sighting-time"
                type="time"
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                className="mb-3 w-full rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-center font-mono text-2xl text-stone-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-4 focus:ring-teal-700/10"
                style={{ direction: 'ltr' }}
              />

              {/* Live onah result */}
              {timeInput ? (
                <div className={`mb-4 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 ${
                  computedOnah === 'day'
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-slate-100 border border-slate-200'
                }`}>
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

              <div className="flex gap-2 border-t border-stone-200 pt-4">
                <button onClick={() => { setView('main'); setTimeInput(''); setSourceType(SOURCE_TYPE.VESET) }}
                  className="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50">
                  ביטול
                </button>
                <button onClick={doRecordSighting} disabled={loading || !timeInput || !computedOnah}
                  className="flex-1 rounded-xl bg-rose-700 py-3 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(190,18,60,0.18)] transition hover:-translate-y-0.5 hover:bg-rose-800 hover:shadow-[0_10px_26px_rgba(190,18,60,0.24)] disabled:translate-y-0 disabled:opacity-40">
                  {loading ? 'שומר…' : 'שמירת עדכון'}
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
                <button onClick={() => doBedika('morning', 'stain')} disabled={loading}
                  className="w-full bg-rose-500 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50">נמצא דם ✗</button>
              </div>
              <button onClick={() => setView('main')} className="w-full mt-2 text-gray-400 text-sm py-2">סגור</button>
            </div>
          )}

          {/* Main actions */}
          {view === 'main' && (
            <div className="space-y-2 mt-2">
              {canRecordSighting && (
                <button onClick={() => setView('sighting')}
                  className="w-full flex items-center justify-between rounded-2xl bg-rose-700 px-5 py-4 font-semibold text-white shadow-[0_10px_25px_rgba(190,18,60,0.16)] transition hover:-translate-y-0.5 hover:bg-rose-800 hover:shadow-[0_14px_30px_rgba(190,18,60,0.22)]">
                  <span>רשום ראיה</span><span className="text-2xl leading-none">+</span>
                </button>
              )}
              {canDoHefsek && (
                <button onClick={doHefsek} disabled={loading}
                  className="w-full flex items-center justify-between bg-amber-500 hover:bg-amber-600 text-white rounded-2xl px-5 py-4 transition font-semibold disabled:opacity-60">
                  <span>{isBlocked ? 'הפסק טהרה חדש — התחלת ספירה מחדש' : 'אישור הפסק טהרה'}</span>
                  <span className="text-2xl leading-none">✓</span>
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
              {!canRecordSighting && !canDoHefsek && !canRecordBedika && !canRecordMikveh && !canMarkClean && (
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

  // Today: keep original halachic colors, just add a ring around the cell.
  // No background override — today is NOT a halachic status.
  const effectNight = nightColor
  const effectDay   = dayColor
  const effectText  = dayText

  return (
    <button
      onClick={onClick}
      className={`relative h-16 w-full overflow-hidden rounded-xl border border-stone-100 focus:outline-none sm:h-20 ${
        isSelected
          ? 'z-10 shadow-md ring-2 ring-teal-800'
          : isToday
            ? 'z-10 shadow-sm ring-2 ring-teal-500'
            : 'transition-all hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:brightness-90'
      }`}
    >
      {/* ── Night onah — RIGHT in RTL ── */}
      <div className={`absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-0.5 border-l border-black/5 ${effectNight}`}>
        {isToday && currentPeriod === 'night' && (
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 opacity-60 animate-pulse" />
        )}
        {nightConcerns.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        )}
      </div>

      {/* ── Day onah — LEFT in RTL, carries the date number ── */}
      <div className={`absolute inset-y-0 left-0 flex w-3/5 flex-col items-center justify-center gap-0.5 ${effectDay}`}>
        <span className={`text-sm font-semibold leading-none sm:text-base ${effectText}`}>
          {DAY_LETTERS[day]}
        </span>
        {isToday && currentPeriod === 'day' && (
          <span className="w-1 h-1 rounded-full bg-gray-400 opacity-50 animate-pulse" />
        )}
        {dayConcerns.length > 0 && (
          <span className="w-1 h-1 rounded-full bg-orange-400" />
        )}
      </div>
    </button>
  )
}

// ── Settings sheet — exposes the veset-engine parameters ────────────────────

function Row({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <p className="text-gray-800 font-medium text-sm">{title}</p>
        {desc && <p className="text-gray-400 text-xs mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`w-11 h-6 rounded-full transition relative ${on ? 'bg-emerald-500' : 'bg-gray-200'} ${disabled ? 'opacity-50' : ''}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  )
}

export function SettingsSheet({ cycle, onClose, onRefresh }) {
  const [loading, setLoading] = useState(false)

  async function save(patch) {
    setLoading(true)
    try { await api.updateSettings(patch); await onRefresh() }
    catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 pt-2 pb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">הגדרות הלכתיות</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-sm flex items-center justify-center">✕</button>
          </div>

          <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
            <Row title="שיטת שוע״ר להפלגה" desc="חישוב הפלגה מסוף הדימום (הפסק) ולא מתחילתו">
              <Toggle on={!!cycle?.useShuar} onChange={v => save({ useShuar: v })} />
            </Row>
            <Row title="חומרת יום ל״א" desc="פרישה גם ביום ל״א בעונת הראייה (כד,כט)">
              <Toggle on={!!cycle?.onaBeinonit31} onChange={v => save({ onaBeinonit31: v })} />
            </Row>
            <Row title="ל׳ בחודש חסר" desc="כשראיית ל׳ והחודש הבא חסר">
              <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs">
                <button
                  onClick={() => save({ day30Policy: 'tzemach_tzedek' })}
                  className={`px-3 py-2 ${(cycle?.day30Policy ?? 'tzemach_tzedek') === 'tzemach_tzedek' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-600'}`}
                >צמח צדק</button>
                <button
                  onClick={() => save({ day30Policy: 'rosh_chodesh' })}
                  className={`px-3 py-2 ${cycle?.day30Policy === 'rosh_chodesh' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-600'}`}
                >ר״ח</button>
              </div>
            </Row>
            <Row title="הריון" desc="מצב מסולקת דמים — ממתן חששות ווסת">
              <Toggle on={!!cycle?.isPregnant} onChange={v => save({ isPregnant: v })} />
            </Row>
            <Row title="מניקה" desc="מצב מסולקת דמים — ממתן חששות ווסת">
              <Toggle on={!!cycle?.isMeineket} onChange={v => save({ isMeineket: v })} />
            </Row>
          </div>

          <p className="text-gray-400 text-xs mt-5 leading-relaxed">
            ההגדרות משפיעות על חישוב חששות הווסת בלבד. בכל ספק — יש לשאול רב.
          </p>
        </div>
      </div>
    </>
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
  const [showSettings, setShowSettings] = useState(false)
  const [location,  setLocation]  = useState(null)
  const [now, setNow]             = useState(new Date())

  const {
    cycle, sightings, dataLoaded, error, refresh,
    cleanState, effectivePhase, vesetConcerns, vesetMap,
  } = useMikvaEngine()

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

  const cells = useMemo(() => buildGrid(dispYear, dispMonth), [dispYear, dispMonth])

  const isLeap    = JewishCalendar.isJewishLeapYear(dispYear)
  const monthName = (isLeap && dispMonth === 12) ? 'אדר א׳' : MONTH_NAMES[dispMonth]
  const phaseCfg  = PHASE_CFG[effectivePhase] ?? PHASE_CFG.tahorah

  const phaseDetail = useMemo(
    () => phaseDetailText(cycle, effectivePhase, cleanState),
    [effectivePhase, cycle, cleanState],
  )

  function goNext() { const n = nextHMonth(dispYear, dispMonth); setDispYear(n.year); setDispMonth(n.month) }
  function goPrev() { const p = prevHMonth(dispYear, dispMonth); setDispYear(p.year); setDispMonth(p.month) }

  const selectedColors = selected
    ? getCellColors(selected, sightings, cycle, vesetMap, cleanState)
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
    <main className="min-h-screen bg-[#f3f2ee] pb-12" dir="rtl">

      {/* ── Sticky header ── */}
      <div className="sticky top-16 z-10 border-b border-stone-200/80 bg-[#f3f2ee]/90 px-4 py-5 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl">
        <div className="flex justify-end mb-1">
          <button onClick={() => setShowSettings(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:-translate-y-0.5 hover:text-stone-900 hover:shadow"
            aria-label="הגדרות"><span aria-hidden="true">⚙</span></button>
        </div>
        <div className="flex items-center justify-between mb-3">
          <button onClick={goPrev} className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-xl font-light text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow">›</button>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900 leading-none">{monthName}</h1>
            <p className="mt-1 text-xs tracking-[0.12em] text-stone-400">{toHebrewYear(dispYear)}</p>
          </div>
          <button onClick={goNext} className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-xl font-light text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow">‹</button>
        </div>

        {/* Phase strip */}
        {dataLoaded && (
          <div className={`mx-auto mt-4 flex max-w-xl items-center justify-center gap-2 rounded-xl border px-4 py-2.5 shadow-sm ${phaseCfg.bg} ${phaseCfg.border}`}>
            <span className={`text-sm font-semibold ${phaseCfg.text}`}>{phaseCfg.label}</span>
            {phaseDetail && <span className={`text-sm ${phaseCfg.text} opacity-60`}>· {phaseDetail}</span>}
          </div>
        )}
        </div>
      </div>

      <div className="mx-auto mt-7 max-w-6xl rounded-[1.75rem] border border-stone-200/90 bg-white p-3 shadow-[0_24px_70px_rgba(41,37,36,0.08)] sm:p-7">
        {/* ── Column headers with night/day labels ── */}
        <div className="mt-1 grid grid-cols-7 border-b border-stone-200">
          {DAY_HEADERS.map(h => (
            <div key={h} className="py-3 text-center text-xs font-semibold text-stone-400">{h}</div>
          ))}
        </div>

        {/* Night/Day sub-headers */}
        <div className="grid grid-cols-7 border-b border-stone-200">
          {DAY_HEADERS.map((_, i) => (
            <div key={i} className="flex h-5 overflow-hidden border-l border-stone-100">
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
          <div className="grid grid-cols-7 gap-1.5 pt-2 sm:gap-2">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="h-16 sm:h-20" />
              const hd      = { year: dispYear, month: dispMonth, day }
              const isToday = day === todayDay && dispMonth === todayMonth && dispYear === todayYear
              const isSel   = selected && hebrewDateEquals(hd, selected)
              const colors  = getCellColors(hd, sightings, cycle, vesetMap, cleanState)
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
          cleanState={cleanState}
          sightings={sightings}
          vesetConcerns={vesetConcerns}
          location={location}
          phase={effectivePhase}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
        />
      )}

      {/* ── Settings sheet ── */}
      {showSettings && (
        <SettingsSheet
          cycle={cycle}
          onClose={() => setShowSettings(false)}
          onRefresh={refresh}
        />
      )}
    </main>
  )
}
