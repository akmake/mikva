import { useState, useEffect, useMemo, useRef } from 'react'
import { JewishCalendar, ComplexZmanimCalendar, GeoLocation, ZmanimFormatter, DateTime, HebrewDateFormatter } from 'kosher-zmanim'
import tzlookup from 'tz-lookup'
import { api } from '../lib/api'
import {
  addHebrewDays,
  hebrewDateEquals,
  daysBetween,
  todayHebrew,
  MONTH_NAMES,
  ONAH_HE,
  DOW_HE,
} from '../lib/hebrewCalendar'
import {
  plannedMikvehDay,
  hefsekTaharaDay,
  hefsekWindow,
  bedikaWindows,
  daysUntilHefsekAllowed,
  currentCleanDayNumber,
} from '../lib/cycleCalculator'
import { SOURCE_LABEL, SOURCE_TYPE } from '../lib/veset/sourceTypes'
import { useMikvaEngine } from '../lib/useMikvaEngine'
import { evaluateCleanDays } from '../lib/cleanDaysEngine'
import { derivePhase } from '../lib/cycleCalculator'

// ── Hebrew helpers ──────────────────────────────────────────────────────────

const DAY_LETTERS = [
  '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
]
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

// שם החג/המועד של יום עברי נתון (ריק אם יום חול רגיל); שבת קודש נבדקת בנפרד
// כי getDayOfWeek אינו Yom Tov. חשוב לזיהוי ימים שבהם זמני/הלכות הבדיקה שונים
// (תשעה באב, יום כיפור וכו').
function holidayLabel(jCal) {
  const hdf = new HebrewDateFormatter()
  hdf.setHebrewFormat(true)
  let label = hdf.formatYomTov(jCal)
  if (!label && jCal.isRoshChodesh()) label = hdf.formatRoshChodesh(jCal)
  if (!label && jCal.getDayOfWeek() === 7) label = 'שבת קודש'
  return label || null
}

function MoonIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" /></svg>
}
function SunIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
}

// ── Cell status ─────────────────────────────────────────────────────────────
// Night onah and day onah are INDEPENDENT — each gets its own color.
// nightColor  = color for the right (night) half
// dayColor    = color for the left (day) half
// nightConcerns / dayConcerns = veset concerns split by onah

// ה-onset (הדם הראשון) של נידה, כתאריך עברי.
function cycleOnset(c) {
  return c?.latestSighting?.hebrewDate ?? c?.bleedings?.[0]?.hebrewDate ?? null
}

// הנידה ש*מכסה* תאריך עברי נתון = זו עם ה-onset המאוחר ביותר שעדיין ≤ hd.
// כך כל יום בלוח מצייר את תהליך הטהרה של הנידה הנכונה שלו (כולל נידות-עבר).
export function cycleForDate(cycles, hd) {
  let best = null
  let bestOnset = null
  for (const c of cycles ?? []) {
    const onset = cycleOnset(c)
    if (!onset) continue
    if (daysBetween(onset, hd) >= 0 && (!bestOnset || daysBetween(bestOnset, onset) > 0)) {
      best = c; bestOnset = onset
    }
  }
  return best
}

// ה-onset של הנידה הבאה (המוקדם ביותר שאחרי onset הנוכחי) — תוחם את טווח הטומאה
// של נידה שטרם תועד לה הפסק, כדי שלא תימרח אדום עד היום כשיש נידה מאוחרת יותר.
function nextOnsetAfter(cycles, cyc) {
  const myOnset = cycleOnset(cyc)
  if (!myOnset) return null
  let best = null
  for (const c of cycles ?? []) {
    const o = cycleOnset(c)
    if (!o) continue
    if (daysBetween(myOnset, o) > 0 && (!best || daysBetween(o, best) > 0)) best = o
  }
  return best
}

// ה-phase האפקטיבי של נידה מסוימת (זהה ללוגיקה ב-useMikvaEngine, אך פר-נידה) —
// כדי שפעולות ה-DaySheet יעבדו על הנידה של היום שנבחר, גם נידת-עבר.
export function effectivePhaseFor(cycle) {
  const phase = derivePhase(cycle)
  if (phase !== 'counting_7') return phase
  const cs = evaluateCleanDays(cycle?.cleanDays ?? [])
  if (cs.status === 'blocked') return 'blocked'
  if (cs.complete)             return 'waiting_mikveh'
  return 'counting_7'
}

export function getCellColors(hd, sightings, cycles, vesetMap) {
  const cycle      = cycleForDate(cycles, hd)
  const cleanState = evaluateCleanDays(cycle?.cleanDays ?? [])
  const k = `${hd.year}-${hd.month}-${hd.day}`
  const allConcerns = vesetMap[k] ?? []
  const shownConcerns = allConcerns.filter(c => !c.uprooted)
  // חשש פעיל (עתידי/נוכחי) → כתום; חשש שעבר (היסטורי, מצטבר) → אפור.
  const activeConcerns = shownConcerns.filter(c => !c.passed)
  const passedConcerns = shownConcerns.filter(c => c.passed)
  const byOnah = (arr, o) => arr.filter(c => c.onah === o || c.onah === 'full_day')
  const nightConcerns = byOnah(activeConcerns, 'night')
  const dayConcerns   = byOnah(activeConcerns, 'day')
  const nightPassed   = byOnah(passedConcerns, 'night')
  const dayPassed     = byOnah(passedConcerns, 'day')

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
    // טרם נעשה הפסק — טמאה מהראייה ועד היום, אך *תחומה* לנידה: אם יש נידה מאוחרת
    // יותר, עוצרים יום לפני ה-onset שלה (נידת-עבר לא נמרחת אדום עד היום).
    const nextOnset  = nextOnsetAfter(cycles, cycle)
    const withinOpen = nextOnset
      ? daysBetween(hd, nextOnset) > 0
      : daysBetween(hd, todayHebrew()) >= 0
    const inTamei = hefsekHD
      // הדם הראשון < יום < ההפסק האחרון (יום ההפסק עצמו נצבע כתום בהמשך)
      ? afterOnset && daysBetween(hd, hefsekHD) > 0
      : afterOnset && (cycle.phase === 'waiting_5_days' || cycle.phase === 'waiting_hefsek')
          && withinOpen
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
        nightColor: isTovel ? 'bg-teal-400' : 'bg-teal-200',
        dayColor:   isTovel ? 'bg-teal-300' : 'bg-teal-100',
        dayText: 'text-teal-900',
        nightConcerns, dayConcerns, type: isTovel ? 'clean_7' : 'clean', dayNum: diff,
      }
    }

    // ── ליל הטבילה — מסומן ברגע שיש הפסק טהרה, גם אם 7 הנקיים לא סומנו כ"הושלמו"
    // באפליקציה (ברירת מחדל: יום 7). NIGHT onah בלבד ──
    const tovelDay = cleanState?.complete ? cleanState.tovelDay : 7
    const mikvehHD = plannedMikvehDay(hefsekHD, tovelDay)
    if (hebrewDateEquals(mikvehHD, hd)) {
      const done = !!cycle.mikveDate?.actual
      return {
        nightColor: done ? 'bg-blue-500' : 'bg-blue-200',
        dayColor:   'bg-white', // ← daytime is ordinary; mikveh is AT NIGHT only
        dayText: 'text-gray-800',
        nightConcerns, dayConcerns, type: done ? 'mikveh' : 'mikveh_planned', dayNum: null,
        mikvehOverdue: false,
      }
    }
  }

  // ── עברה ליל הטבילה המתוכנן וטרם נרשמה טבילה — נקודה אדומה של אזהרה ──
  const mikvehOverdue = !!(
    cycle?.hefsekTahara?.hebrewDate && !cycle?.mikveDate?.actual && cycle.status !== 'completed' &&
    daysBetween(plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState?.complete ? cleanState.tovelDay : 7), hd) > 0
  )

  // ── חשש ווסת (עתידי/רגיל): צובע את חצי-העונה שבו נופל החשש ברקע כתום רך ──
  if (nightConcerns.length > 0 || dayConcerns.length > 0) {
    return {
      nightColor: nightConcerns.length ? 'bg-orange-200' : (nightPassed.length ? 'bg-gray-200' : 'bg-slate-100'),
      dayColor:   dayConcerns.length   ? 'bg-orange-100' : (dayPassed.length   ? 'bg-gray-100' : 'bg-white'),
      dayText:    dayConcerns.length   ? 'text-orange-900' : 'text-gray-800',
      nightConcerns, dayConcerns, nightPassed, dayPassed, type: 'concern', dayNum: null, mikvehOverdue,
    }
  }

  // ── חשש שעבר (היסטורי, מצטבר): רקע אפור רך + נקודה אפורה ──
  if (nightPassed.length > 0 || dayPassed.length > 0) {
    return {
      nightColor: nightPassed.length ? 'bg-gray-200' : 'bg-slate-100',
      dayColor:   dayPassed.length   ? 'bg-gray-100' : 'bg-white',
      dayText: 'text-gray-500',
      nightConcerns, dayConcerns, nightPassed, dayPassed, type: 'concern_passed', dayNum: null, mikvehOverdue,
    }
  }

  // ── ימי טהרה רגילים (אחרי טבילה בפועל, או שאין נידה שמכסה את היום כלל) ──
  const isTahorDay = !cycle || !!cycle?.mikveDate?.actual
  if (isTahorDay) {
    return { nightColor: 'bg-emerald-200', dayColor: 'bg-emerald-100', dayText: 'text-emerald-900',
             nightConcerns, dayConcerns, nightPassed, dayPassed, type: 'tahorah', dayNum: null, mikvehOverdue }
  }

  return { nightColor: 'bg-slate-100', dayColor: 'bg-white', dayText: 'text-gray-800',
           nightConcerns, dayConcerns, nightPassed, dayPassed, type: 'normal', dayNum: null, mikvehOverdue }
}

// ── חפיפה — הכנה לטבילה (מקורות/יח,יט — זמן החפיפה ודיני החפיפה) ────────────
// תיעוד בלבד: רשימת פעולות ההכנה שמוזכרות במקור, לסימון לפני הטבילה.
export const CHAFIFA_ITEMS = [
  { key: 'bath',      label: 'רחיצה במים חמים (כולל אזורי השיער)' },
  { key: 'comb',      label: 'חפיפת/סירוק השיער במסרק' },
  { key: 'teeth',     label: 'ניקוי שיניים — צחצוח וחוט דנטלי' },
  { key: 'nails',     label: 'גזיזת וניקוי הציפורניים (ידיים ורגליים)' },
  { key: 'jewelry',   label: 'הסרת תכשיטים (טבעות, עגילים, צמידים, ריסים תותבים)' },
  { key: 'earHoles',  label: 'ניקוי חורי העגילים' },
  { key: 'lenses',    label: 'הסרת עדשות מגע' },
  { key: 'folds',     label: 'ניקוי בית הקמטים ובית הסתרים' },
  { key: 'eyesEars',  label: 'ניקוי עיניים, אף ואוזניים' },
  { key: 'recheck',   label: 'בדיקה חוזרת של הגוף סמוך לטבילה' },
]

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

// ── חפיפה — צ'קליסט הכנה לטבילה ──────────────────────────────────────────────

export function ChafifaChecklist({ cycle, onRefresh }) {
  const [busyKey, setBusyKey] = useState(null)
  const checklist = cycle?.chafifaChecklist ?? {}
  const doneCount = CHAFIFA_ITEMS.filter(i => checklist[i.key]).length

  async function toggle(key, checked) {
    setBusyKey(key)
    try {
      await api.recordChafifa({ itemKey: key, checked, cycleId: cycle?._id })
      await onRefresh()
    } catch (e) { alert(e.message) }
    finally { setBusyKey(null) }
  }

  return (
    <div className="mb-3 rounded-2xl border border-stone-200 bg-white p-4">
      <p className="mb-2.5 text-sm font-semibold text-stone-700">
        הכנה לטבילה (חפיפה) <span className="font-normal text-stone-400">· {doneCount}/{CHAFIFA_ITEMS.length}</span>
      </p>
      <div className="space-y-2">
        {CHAFIFA_ITEMS.map(item => (
          <label key={item.key} className="flex items-center gap-2.5 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={!!checklist[item.key]}
              disabled={busyKey === item.key}
              onChange={e => toggle(item.key, e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-stone-300 text-teal-700 focus:ring-teal-600"
            />
            <span className={checklist[item.key] ? 'text-stone-400 line-through' : ''}>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
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
  // הפסק טהרה מותר רק מיום ה-5 של הנידה (onset+4) והלאה — לא על הימים הראשונים.
  // ה-onset של הנידה שמכסה את היום שנבחר; היום שנבחר חייב להיות ≥ יום ההפסק המוקדם.
  const onsetHD           = cycle?.latestSighting?.hebrewDate ?? cycle?.bleedings?.[0]?.hebrewDate ?? null
  const hefsekDayReached  = onsetHD ? daysBetween(hefsekTaharaDay(onsetHD), hd) >= 0 : false
  // רגיל: אחרי 5 ימים (וביום ≥ 5). blocked (נמצא דם בספירה): הפסק חדש *מיד*, ללא 5 ימים (אפיון).
  const canDoHefsek       = !isFuture && (
    (phase === 'waiting_hefsek' && !cycle?.hefsekTahara && hefsekDayReached) || isBlocked
  )
  const canRecordBedika   = phase === 'counting_7' && (dayType === 'clean' || dayType === 'clean_7') && !isFuture
  // רישום טבילה — מותר רק מליל הטבילה המוקדם ואילך (הפסק+8, ברירת מחדל יום 7
  // גם אם 7 הנקיים לא סומנו כ"הושלמו" באפליקציה — לא תלוי בסימון הבדיקות,
  // אבל *כן* תלוי בתאריך עצמו: לא כל ימי הווסת, רק מהיום המותר הלכתית).
  const mikvehEarliestHD  = cycle?.hefsekTahara?.hebrewDate
    ? plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState?.complete ? cleanState.tovelDay : 7)
    : null
  const canRecordMikveh   = !!mikvehEarliestHD && !cycle?.mikveDate?.actual && !isFuture
    && daysBetween(mikvehEarliestHD, hd) >= 0
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
      await api.recordHefsek({ gregorianDatetime: new Date().toISOString(), hebrewDate: hd, cycleId: cycle?._id })
      await onRefresh(); setView('main')
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function doBedika(type, result) {
    setLoading(true)
    try {
      await api.recordBedika({ dayNumber: cellColors?.dayNum, hebrewDate: hd, type, result, cycleId: cycle?._id })
      await onRefresh()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function doMikveh() {
    setLoading(true)
    try {
      await api.recordMikveh({ gregorianDatetime: new Date().toISOString(), cycleId: cycle?._id })
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

  async function doDeleteSighting(sightingId) {
    if (!confirm('למחוק את הראייה הזו?')) return
    setLoading(true)
    try {
      await api.deleteSighting(sightingId)
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
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-stone-500"><MoonIcon className="h-3.5 w-3.5" /> לילה</p>
              <p className="text-slate-700 text-sm font-mono" dir="ltr">{fmt(zmanim.nightStart, tz)}</p>
              <p className="text-slate-400 text-xs font-mono" dir="ltr">↓ {fmt(zmanim.dayStart, tz)}</p>
            </div>
            <div className="w-px bg-gray-200" />
            {/* Day — left in RTL */}
            <div className="flex-1 bg-[#fffaf0] px-4 py-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><SunIcon className="h-3.5 w-3.5" /> יום</p>
              <p className="text-amber-700 text-sm font-mono" dir="ltr">{fmt(zmanim.dayStart, tz)}</p>
              <p className="text-amber-400 text-xs font-mono" dir="ltr">↓ {fmt(zmanim.dayEnd, tz)}</p>
            </div>
          </div>

          {/* Events */}
          {daySightings.map((s, i) => (
            <div key={i} className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-rose-700 font-semibold">ראיה</p>
                <p className="text-rose-400 text-sm">{ONAH_HE[s.onah]}</p>
              </div>
              <button
                onClick={() => doDeleteSighting(s._id)}
                disabled={loading}
                aria-label="מחיקת ראייה"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-100 hover:text-rose-700 disabled:opacity-40"
              >✕</button>
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
            const isUprooted = c.uprooted || c.passed
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
                <>
                  <ChafifaChecklist cycle={cycle} onRefresh={onRefresh} />
                  <button onClick={doMikveh} disabled={loading}
                    className="w-full flex items-center justify-between bg-blue-500 hover:bg-blue-600 text-white rounded-2xl px-5 py-4 transition font-semibold disabled:opacity-60">
                    <span>אישור טבילה במקווה</span><span className="text-2xl leading-none">✓</span>
                  </button>
                  <p className="mt-1.5 text-center text-xs text-stone-400">טבילה בליל הטבילה — יש לוודא אישור/בירור עם רב במקרה של ספק</p>
                </>
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
              <Toggle on={!!cycle?.isPregnant} onChange={v => save(
                v ? { isPregnant: true, pregnancyStart: cycle?.latestSighting?.gregorianDatetime ?? null }
                  : { isPregnant: false })} />
            </Row>
            <Row title="מניקה" desc="מצב מסולקת דמים — ממתן חששות ווסת">
              <Toggle on={!!cycle?.isMeineket} onChange={v => save({ isMeineket: v })} />
            </Row>
            <Row title="שאלת הריון" desc="ימים מהראייה האחרונה שאחריהם נשאל אם את בהריון (0 = כבוי)">
              <input
                type="number" min="0" max="365"
                defaultValue={cycle?.pregnancyPromptDays ?? 60}
                onBlur={e => save({ pregnancyPromptDays: Math.max(0, Number(e.target.value) || 0) })}
                className="w-16 rounded-xl border border-gray-200 bg-white px-2 py-2 text-center text-sm text-gray-800 outline-none focus:border-emerald-500"
              />
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

// ── Pregnancy prompt ────────────────────────────────────────────────────────
// מוקפץ כשעברו pregnancyPromptDays מהראייה האחרונה ללא ראייה חדשה. "כן" → מסמן
// הריון עם pregnancyStart = תאריך הראייה האחרונה (סילוק חששות מ-90 יום אחריה,
// mesulekes.js). "לא" → נודניק מושתק לנידה הזו (pregnancyPromptSnoozedFor).
export function shouldAskPregnancy(cycle) {
  const onset = cycle?.latestSighting
  if (!onset?.hebrewDate) return false
  const days = Number(cycle?.pregnancyPromptDays ?? 60)
  if (!days || days <= 0) return false
  if (cycle?.isPregnant || cycle?.isMeineket) return false
  if (cycle?.status === 'completed') return false
  if (cycle?.pregnancyPromptSnoozedFor && String(cycle.pregnancyPromptSnoozedFor) === String(onset._id)) return false
  return daysBetween(onset.hebrewDate, todayHebrew()) >= days
}

export function PregnancyPrompt({ cycle, onRefresh, onClose }) {
  const [loading, setLoading] = useState(false)
  const onset = cycle?.latestSighting
  const days = onset ? daysBetween(onset.hebrewDate, todayHebrew()) : 0

  async function answer(pregnant) {
    setLoading(true)
    try {
      if (pregnant) {
        await api.updateSettings({ isPregnant: true, pregnancyStart: onset.gregorianDatetime })
      } else {
        await api.updateSettings({ pregnancyPromptSnoozedFor: String(onset._id) })
      }
      await onRefresh()
      onClose()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-stone-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div dir="rtl" className="fixed inset-x-4 top-1/2 z-[70] mx-auto max-w-sm -translate-y-1/2 rounded-3xl border border-stone-200 bg-[#fcfbf8] p-6 shadow-2xl sm:inset-x-0">
        <div className="mb-2 text-center text-4xl">🤍</div>
        <h2 className="mb-2 text-center text-xl font-semibold text-stone-900">האם את בהריון?</h2>
        <p className="mb-6 text-center text-sm leading-6 text-stone-500">
          עברו {days} ימים מהראייה האחרונה ללא ראייה חדשה. אם את בהריון, לאחר שלושה
          חודשים נפסיק להציג חששות ווסת (מצב מסולקת דמים).
        </p>
        <div className="flex gap-2">
          <button onClick={() => answer(false)} disabled={loading}
            className="flex-1 rounded-xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-40">
            לא
          </button>
          <button onClick={() => answer(true)} disabled={loading}
            className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-semibold text-white shadow transition hover:bg-teal-800 disabled:opacity-40">
            {loading ? '…' : 'כן, אני בהריון'}
          </button>
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

  const [selected,  setSelected]  = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [location,  setLocation]  = useState(null)
  const [pregPromptOpen, setPregPromptOpen] = useState(false)
  const [clockNow, setClockNow]   = useState(new Date())
  const [quickLoading, setQuickLoading] = useState(false)
  const pregAsked = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // סדרת העונה בינונית מתרחבת עד היום הנוכחי (לא נעצרת באופק קבוע).
  const viewHD = useMemo(() => ({ year: todayYear, month: todayMonth, day: todayDay }), [todayYear, todayMonth, todayDay])
  const {
    cycle, cycles, sightings, dataLoaded, error, refresh,
    cleanState, effectivePhase, vesetConcerns, vesetMap,
  } = useMikvaEngine(viewHD)

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

  // שאלת הריון — פעם אחת לכל טעינה, כשעברו pregnancyPromptDays מהראייה האחרונה
  useEffect(() => {
    if (dataLoaded && !pregAsked.current && shouldAskPregnancy(cycle)) {
      pregAsked.current = true
      setPregPromptOpen(true)
    }
  }, [dataLoaded, cycle])

  const todayHD   = useMemo(() => ({ year: todayYear, month: todayMonth, day: todayDay }), [todayYear, todayMonth, todayDay])
  const isLeap    = JewishCalendar.isJewishLeapYear(todayYear)
  const monthName = (isLeap && todayMonth === 12) ? 'אדר א׳' : MONTH_NAMES[todayMonth]
  const todayDow  = todayCal.getDayOfWeek()
  const todayHoliday = useMemo(() => holidayLabel(todayCal), [todayCal])
  const clockStr  = clockNow.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: location?.tz ?? 'Asia/Jerusalem',
  })
  const phaseCfg  = PHASE_CFG[effectivePhase] ?? PHASE_CFG.tahorah

  const phaseDetail = useMemo(
    () => phaseDetailText(cycle, effectivePhase, cleanState),
    [effectivePhase, cycle, cleanState],
  )

  // חששות ווסת שנופלים על היום — מוצגים כשבב נפרד מתחת לסטטוס הכללי.
  const todayConcerns = useMemo(
    () => vesetConcerns.filter(c => hebrewDateEquals(c.hebrewDate, todayHD) && !c.uprooted),
    [vesetConcerns, todayHD],
  )

  // ── רמזור סטטוס — אדום (אסורה) / כתום (חשש) / ירוק (טהורה ומותרת) ──
  const statusLevel = effectivePhase !== 'tahorah' ? 'red' : (todayConcerns.length > 0 ? 'orange' : 'green')
  const STATUS_CFG = {
    red:    { color: '#dc2626', glow: 'rgba(220,38,38,0.4)',  ring: 'rgba(220,38,38,0.15)',  label: 'אסורה לבעלה' },
    orange: { color: '#f97316', glow: 'rgba(249,115,22,0.4)', ring: 'rgba(249,115,22,0.15)', label: 'חשש ווסת' },
    green:  { color: '#16a34a', glow: 'rgba(22,163,74,0.4)',  ring: 'rgba(22,163,74,0.15)',  label: 'טהורה ומותרת' },
  }
  const statusCfg = STATUS_CFG[statusLevel]

  // ── כמה ימים נשארו — להפסק טהרה / לטבילה במקווה ──
  const countdown = useMemo(() => {
    if (effectivePhase === 'waiting_5_days' && cycle?.latestSighting) {
      const d = daysUntilHefsekAllowed(cycle.latestSighting.hebrewDate)
      return { n: d, label: d === 0 ? 'ניתן לעשות הפסק טהרה היום' : 'עד שאפשר לעשות הפסק טהרה' }
    }
    if (effectivePhase === 'counting_7' && cycle?.hefsekTahara) {
      const n = currentCleanDayNumber(cycle.hefsekTahara.hebrewDate)
      if (n == null) return null
      const remaining = Math.max(0, 7 - n)
      return { n: remaining, label: remaining === 0 ? 'היום היום האחרון לספירה' : 'ימים עד הטבילה במקווה' }
    }
    return null
  }, [effectivePhase, cycle])

  // ── זמני יום/לילה של היום — לפס יום/לילה עם קו "עכשיו" ──
  const todayZmanim = useMemo(() => {
    if (!location) return null
    const { lat, lng, tz } = location
    const gd   = todayCal.getDate()
    const dt   = DateTime.fromObject({ year: gd.year, month: gd.month, day: gd.day, hour: 12 }, { zone: tz })
    const prev = dt.minus({ days: 1 })
    const next = dt.plus({ days: 1 })
    const todayZ = getZmanimForDay(dt.year, dt.month, dt.day, lat, lng, tz)
    const prevZ  = getZmanimForDay(prev.year, prev.month, prev.day, lat, lng, tz)
    const nextZ  = getZmanimForDay(next.year, next.month, next.day, lat, lng, tz)
    return { dayStart: todayZ.sunrise, dayEnd: todayZ.sunset, prevNightStart: prevZ.sunset, nextNightEnd: nextZ.sunrise }
  }, [location, todayCal])

  // חלון הלילה הרלוונטי לרגע זה — "אתמול בלילה" אם עדיין לפני הזריחה, אחרת
  // "הלילה" (מהשקיעה של היום ועד הזריחה הבאה) — כך הקו תמיד יודע איפה אנחנו.
  const nightWindow = useMemo(() => {
    if (!todayZmanim) return null
    const { dayStart, prevNightStart, nextNightEnd, dayEnd } = todayZmanim
    if (dayStart && clockNow < dayStart) return { start: prevNightStart, end: dayStart }
    return { start: dayEnd, end: nextNightEnd }
  }, [todayZmanim, clockNow])

  const currentPeriod = useMemo(() => {
    if (!todayZmanim || !nightWindow) return null
    const { dayStart, dayEnd } = todayZmanim
    if (nightWindow.start && nightWindow.end && clockNow >= nightWindow.start && clockNow < nightWindow.end) return 'night'
    if (dayStart && dayEnd && clockNow >= dayStart && clockNow < dayEnd) return 'day'
    return null
  }, [todayZmanim, nightWindow, clockNow])

  const currentProgressPct = useMemo(() => {
    if (!todayZmanim || !currentPeriod || !nightWindow) return null
    const { dayStart, dayEnd } = todayZmanim
    const pctOf = (a, b) => (!a || !b) ? 0 : Math.min(100, Math.max(0, (clockNow - a) / (b - a) * 100))
    return currentPeriod === 'night' ? pctOf(nightWindow.start, nightWindow.end) : pctOf(dayStart, dayEnd)
  }, [todayZmanim, currentPeriod, nightWindow, clockNow])

  // ── בדיקות בוקר/ערב — זמינות רק בחלון ההלכתי; אזהרה אם הוחמץ ──
  const todayCleanDayNum = (effectivePhase === 'counting_7' && cycle?.hefsekTahara)
    ? currentCleanDayNumber(cycle.hefsekTahara.hebrewDate) : null
  const todayCleanRecord = todayCleanDayNum
    ? (cycle?.cleanDays ?? []).find(d => d.dayNumber === todayCleanDayNum) : null
  const bedikaWin = todayCleanDayNum
    ? bedikaWindows(todayHD, location?.lat ?? 31.7683, location?.lng ?? 35.2137) : null
  const morningDone    = todayCleanRecord?.morningCheck === 'clean'
  const eveningDone    = todayCleanRecord?.eveningCheck === 'clean'
  const morningActive  = !!bedikaWin && clockNow >= bedikaWin.morningStart && clockNow < bedikaWin.morningEnd
  const eveningActive  = !!bedikaWin && clockNow >= bedikaWin.eveningStart && clockNow < bedikaWin.eveningEnd
  const morningMissed  = !!bedikaWin && !morningDone && clockNow >= bedikaWin.morningEnd
  const eveningMissed  = !!bedikaWin && !eveningDone && clockNow >= bedikaWin.eveningEnd

  async function doQuickBedika(type) {
    setQuickLoading(true)
    try {
      await api.recordBedika({ dayNumber: todayCleanDayNum, hebrewDate: todayHD, type, result: 'clean', cycleId: cycle?._id })
      await refresh()
    } catch (e) { alert(e.message) }
    finally { setQuickLoading(false) }
  }

  // ── טבילה במקווה — מותרת רק מליל הטבילה המוקדם ואילך (לא כל ימי הספירה),
  // ורק בעונת הלילה (הטבילה היא בשקיעה/לילה, לא בשעות היום) — לא תלויה בכך
  // שהאפליקציה סימנה את 7 הנקיים כ"הושלמו" (בלי מקווה היא אסורה גם אם אין דם) ──
  const todayMikvehHD = cycle?.hefsekTahara?.hebrewDate
    ? plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState?.complete ? cleanState.tovelDay : 7)
    : null
  // זמין לתעד מהיום המותר ואילך (בכל שעה) — אבל הכפתור עצמו פעיל רק בלילה
  const mikvehDayReached = !!todayMikvehHD && !cycle?.mikveDate?.actual
    && daysBetween(todayMikvehHD, todayHD) >= 0
  const canQuickMikveh = mikvehDayReached && currentPeriod === 'night'

  // עברה ליל הטבילה המתוכנן וטרם נרשמה טבילה — אזהרה
  const todayMikvehOverdue = !!(todayMikvehHD && !cycle?.mikveDate?.actual &&
    daysBetween(todayMikvehHD, todayHD) > 0)

  async function doQuickMikveh() {
    setQuickLoading(true)
    try {
      await api.recordMikveh({ gregorianDatetime: new Date().toISOString(), cycleId: cycle?._id })
      await refresh()
    } catch (e) { alert(e.message) }
    finally { setQuickLoading(false) }
  }

  const selectedColors = selected
    ? getCellColors(selected, sightings, cycles, vesetMap)
    : null

  // הנידה שמכסה את היום שנבחר — פעולות ה-DaySheet פועלות עליה (כולל נידת-עבר).
  const selCycle      = selected ? cycleForDate(cycles, selected) : null
  const selCleanState = useMemo(() => evaluateCleanDays(selCycle?.cleanDays ?? []), [selCycle])
  const selPhase      = selCycle ? effectivePhaseFor(selCycle) : effectivePhase

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
    <main className="min-h-screen pb-12" dir="rtl">

      {/* ── Sticky header ── */}
      <div className="sticky top-16 z-10 border-b border-white/40 bg-white/50 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-stone-900 leading-tight sm:text-xl">
              יום {DOW_HE[todayDow]}, {DAY_LETTERS[todayDay]} {monthName} {toHebrewYear(todayYear)}
            </h1>
            <p className={`mt-1 text-xs font-semibold ${todayHoliday ? 'text-amber-700' : 'text-stone-400'}`}>
              {todayHoliday ?? 'יום חול'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-2xl border border-white/60 bg-white/70 px-5 py-2 shadow-sm">
              <p className="text-3xl font-semibold tabular-nums tracking-wide text-teal-800" dir="ltr">{clockStr}</p>
            </div>
            <button onClick={() => setShowSettings(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:-translate-y-0.5 hover:text-stone-900 hover:shadow"
              aria-label="הגדרות"><span aria-hidden="true">⚙</span></button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-7 max-w-xl px-4">
        {!dataLoaded ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── רמזור סטטוס: אדום=אסורה / כתום=חשש / ירוק=מותרת ── */}
            <div
              className="rounded-[28px] px-6 py-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm"
              style={{ background: `radial-gradient(circle at 50% 0%, ${statusCfg.ring}, rgba(255,255,255,0.85) 65%)` }}
            >
              <div
                className="mx-auto flex h-28 w-28 items-center justify-center rounded-full text-4xl text-white"
                style={{ backgroundColor: statusCfg.color, boxShadow: `0 0 0 10px ${statusCfg.ring}, 0 14px 34px ${statusCfg.glow}` }}
              >
                {statusLevel === 'red' ? '✕' : statusLevel === 'orange' ? '!' : '✓'}
              </div>
              <p className="mt-5 text-sm font-medium text-stone-500">
                {phaseCfg.label}{phaseDetail ? ` · ${phaseDetail}` : ''}
              </p>

              {countdown && (
                <div className="mt-7 flex flex-col items-center border-t border-stone-200/70 pt-6">
                  <span className="flex items-baseline gap-2 leading-none text-stone-900">
                    <span className="text-7xl font-bold tabular-nums">{countdown.n}</span>
                    <span className="text-2xl font-semibold">{countdown.n === 1 ? 'יום' : 'ימים'}</span>
                  </span>
                  <span className="mt-2 text-sm font-medium text-stone-500">{countdown.label}</span>
                </div>
              )}
            </div>

            {/* חששות ווסת שחלים היום */}
            {todayConcerns.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {todayConcerns.map(c => (
                  <div key={c.id} className="flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50/90 px-4 py-2 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                    <span className="text-sm font-semibold text-orange-700">
                      חשש {c.label}{c.isKavua ? ' (קבוע)' : ''}
                    </span>
                    <span className="text-sm text-orange-400">· {ONAH_HE[c.onah]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── פס יום/לילה — קו מפריד באמצע + קו "עכשיו" באזור הנוכחי ── */}
            <div className="overflow-hidden rounded-[20px] border border-white/60 bg-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-sm">
              <div className="relative flex h-28">
                <div className="relative flex flex-1 items-center justify-center gap-3 bg-indigo-100">
                  {currentPeriod === 'night' && currentProgressPct != null && (
                    <span
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-teal-700 shadow-[0_0_6px_rgba(15,118,110,0.6)]"
                      style={{ left: `${currentProgressPct}%` }}
                      title="המיקום הנוכחי בעונת הלילה"
                    />
                  )}
                  <MoonIcon className="h-9 w-9 shrink-0 text-indigo-600" />
                  <div>
                    <p className="text-base font-semibold text-indigo-700">לילה</p>
                    <p className="font-mono text-base text-indigo-500" dir="ltr">
                      {fmt(nightWindow?.start, location?.tz)}–{fmt(nightWindow?.end, location?.tz)}
                    </p>
                  </div>
                </div>
                <div className="w-px bg-stone-300/80" />
                <div className="relative flex flex-1 items-center justify-center gap-3 bg-amber-50">
                  {currentPeriod === 'day' && currentProgressPct != null && (
                    <span
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-teal-700 shadow-[0_0_6px_rgba(15,118,110,0.6)]"
                      style={{ left: `${currentProgressPct}%` }}
                      title="המיקום הנוכחי בעונת היום"
                    />
                  )}
                  <SunIcon className="h-9 w-9 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-base font-semibold text-amber-700">יום</p>
                    <p className="font-mono text-base text-amber-600" dir="ltr">
                      {fmt(todayZmanim?.dayStart, location?.tz)}–{fmt(todayZmanim?.dayEnd, location?.tz)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── בדיקת בוקר/ערב — פעיל רק בחלון ההלכתי; ! אם הוחמץ ── */}
            {todayCleanDayNum && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => doQuickBedika('morning')}
                  disabled={!morningActive || morningDone || quickLoading}
                  className={`relative rounded-2xl border px-4 py-3.5 text-sm font-semibold shadow-sm transition ${
                    morningDone   ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : morningActive ? 'border-emerald-300 bg-white text-emerald-700 hover:-translate-y-0.5 hover:shadow'
                    : 'border-stone-200 bg-stone-50 text-stone-300'
                  }`}
                >
                  {morningDone ? 'בדיקת בוקר ✓' : 'בדיקת בוקר'}
                  {morningMissed && (
                    <span className="absolute -top-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">!</span>
                  )}
                </button>
                <button
                  onClick={() => doQuickBedika('evening')}
                  disabled={!eveningActive || eveningDone || quickLoading}
                  className={`relative rounded-2xl border px-4 py-3.5 text-sm font-semibold shadow-sm transition ${
                    eveningDone   ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : eveningActive ? 'border-emerald-300 bg-white text-emerald-700 hover:-translate-y-0.5 hover:shadow'
                    : 'border-stone-200 bg-stone-50 text-stone-300'
                  }`}
                >
                  {eveningDone ? 'בדיקת ערב ✓' : 'בדיקת ערב'}
                  {eveningMissed && (
                    <span className="absolute -top-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">!</span>
                  )}
                </button>
              </div>
            )}

            {/* ── טבילה במקווה — אם הגיע ליל הטבילה ולא ראתה דם ── */}
            {mikvehDayReached && (
              <div>
                {todayMikvehOverdue && (
                  <div className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" />
                    <span className="text-sm font-semibold text-rose-700">עברה ליל הטבילה — טרם נרשמה טבילה</span>
                  </div>
                )}
                <ChafifaChecklist cycle={cycle} onRefresh={refresh} />
                {canQuickMikveh ? (
                  <button
                    onClick={doQuickMikveh}
                    disabled={quickLoading}
                    className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-base font-semibold text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow disabled:opacity-50"
                  >
                    הלכתי למקווה ✓
                  </button>
                ) : (
                  <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-sm text-stone-400">
                    אישור הטבילה יהיה זמין הערב (משקיעה)
                  </p>
                )}
                <p className="mt-1.5 text-center text-xs text-stone-400">טבילה בליל הטבילה — יש לוודא אישור/בירור עם רב במקרה של ספק</p>
              </div>
            )}

            {/* ── פרטי היום ופעולות (ראייה / הפסק / טבילה) ── */}
            <div className="rounded-[20px] bg-white/85 px-6 py-6 text-center shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-[5px]">
              <button
                onClick={() => setSelected(selected ? null : todayHD)}
                className="rounded-full bg-rose-700 px-10 py-4 text-lg font-medium text-white shadow-[0_5px_15px_rgba(190,18,60,0.3)] transition hover:-translate-y-0.5 hover:bg-rose-800 hover:shadow-[0_8px_20px_rgba(190,18,60,0.38)]"
              >
                רישום ראייה
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Day sheet ── */}
      {selected && (
        <DaySheet
          hd={selected}
          cellColors={selectedColors}
          cycle={selCycle}
          cleanState={selCleanState}
          sightings={sightings}
          vesetConcerns={vesetConcerns}
          location={location}
          phase={selPhase}
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

      {/* ── Pregnancy prompt ── */}
      {pregPromptOpen && (
        <PregnancyPrompt
          cycle={cycle}
          onRefresh={refresh}
          onClose={() => setPregPromptOpen(false)}
        />
      )}
    </main>
  )
}
