import { useState, useEffect, useMemo, useRef } from 'react'
import { JewishCalendar, ComplexZmanimCalendar, GeoLocation, ZmanimFormatter, DateTime, HebrewDateFormatter } from 'kosher-zmanim'
import tzlookup from 'tz-lookup'
import { api } from '../lib/api'
import { useMikvaEngine } from '../lib/useMikvaEngine'
import {
  getCellColors,
  cycleForDate,
  effectivePhaseFor,
  DaySheet,
  SettingsSheet,
  PHASE_CFG,
  phaseDetailText,
  PregnancyPrompt,
  shouldAskPregnancy,
} from './Dashboard'
import { evaluateCleanDays } from '../lib/cleanDaysEngine'
import { hebrewDateEquals, daysBetween, ONAH_HE, DOW_HE } from '../lib/hebrewCalendar'
import { daysUntilHefsekAllowed, currentCleanDayNumber, bedikaWindows, plannedMikvehDay } from '../lib/cycleCalculator'

// ── Hebrew helpers ────────────────────────────────────────────────────────────

const MONTH_NAMES = {
  1:'ניסן', 2:'אייר', 3:'סיוון', 4:'תמוז', 5:'אב', 6:'אלול',
  7:'תשרי', 8:'חשוון', 9:'כסלו', 10:'טבת', 11:'שבט', 12:'אדר', 13:'אדר ב׳',
}

const DAY_LETTERS = [
  '','א','ב','ג','ד','ה','ו','ז','ח','ט','י',
  'יא','יב','יג','יד','טו','טז','יז','יח','יט','כ',
  'כא','כב','כג','כד','כה','כו','כז','כח','כט','ל',
]

function toHebrewLetters(n) {
  const H = ['','ק','ר','ש','ת','תק','תר','תש','תת','תתק']
  const T = ['','י','כ','ל','מ','נ','ס','ע','פ','צ']
  const U = ['','א','ב','ג','ד','ה','ו','ז','ח','ט']
  const h = Math.floor(n/100), tu = n%100, t = Math.floor(tu/10), u = tu%10
  let r = h ? H[h] : ''
  if (tu===15) r+='טו'
  else if (tu===16) r+='טז'
  else { if(t) r+=T[t]; if(u) r+=U[u] }
  return r
}

function toHebrewYear(y) {
  const l = toHebrewLetters(y%1000)
  return l.length<=1 ? l+"'" : l.slice(0,-1)+'"'+l.slice(-1)
}

function getZmanim(gYear, gMonth, gDay, lat, lng, tz) {
  const geo = new GeoLocation('', lat, lng, 0, tz)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.fromObject({year:gYear,month:gMonth,day:gDay,hour:12},{zone:tz}))
  const z = ZmanimFormatter.toJSON(cal).Zmanim
  return {
    sunrise: z.Sunrise ? new Date(z.Sunrise) : null,
    sunset:  z.Sunset  ? new Date(z.Sunset)  : null,
  }
}

function fmt(date, tz) {
  if (!date) return '—'
  return date.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:tz})
}

function MoonIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" /></svg>
}
function SunIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
}

// שם החג/המועד של יום עברי נתון (ריק אם יום חול רגיל); שבת קודש נבדקת בנפרד
// כי getDayOfWeek אינו Yom Tov. חשוב לזיהוי ימים שבהם זמני/הלכות הבדיקה שונים.
function holidayLabel(jCal) {
  const hdf = new HebrewDateFormatter()
  hdf.setHebrewFormat(true)
  let label = hdf.formatYomTov(jCal)
  if (!label && jCal.isRoshChodesh()) label = hdf.formatRoshChodesh(jCal)
  if (!label && jCal.getDayOfWeek() === 7) label = 'שבת קודש'
  return label || null
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HebrewCalendarPage() {
  const todayCal   = useMemo(() => new JewishCalendar(new Date()), [])
  const todayYear  = todayCal.getJewishYear()
  const todayMonth = todayCal.getJewishMonth()
  const todayDay   = todayCal.getJewishDayOfMonth()
  const todayHD    = useMemo(() => ({ year: todayYear, month: todayMonth, day: todayDay }), [todayYear, todayMonth, todayDay])

  const [sheetHd, setSheetHd]     = useState(null)   // day whose action-sheet is open
  const [showSettings, setShowSettings] = useState(false)
  const [location, setLocation]   = useState(null)
  const [pregPromptOpen, setPregPromptOpen] = useState(false)
  const [clockNow, setClockNow]   = useState(new Date())
  const pregAsked = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Shared halachic engine (identical to the "/" dashboard) ──
  // סדרת העונה בינונית מתרחבת עד היום הנוכחי (לא נעצרת באופק קבוע).
  const {
    cycle, cycles, sightings, dataLoaded, error, refresh,
    cleanState, effectivePhase, vesetConcerns, vesetMap,
  } = useMikvaEngine(todayHD)

  const phaseCfg    = PHASE_CFG[effectivePhase] ?? PHASE_CFG.tahorah
  const phaseDetail = useMemo(
    () => phaseDetailText(cycle, effectivePhase, cleanState),
    [cycle, effectivePhase, cleanState],
  )

  // חששות ווסת שנופלים על היום — שבב נפרד מתחת לסטטוס הכללי.
  const todayConcerns = useMemo(
    () => vesetConcerns.filter(c => hebrewDateEquals(c.hebrewDate, todayHD) && !c.uprooted),
    [vesetConcerns, todayHD],
  )

  const sheetColors = sheetHd
    ? getCellColors(sheetHd, sightings, cycles, vesetMap)
    : null

  // הנידה שמכסה את היום שנבחר בשיט־action — פעולות פר-נידה (כולל נידת-עבר).
  const sheetCycle      = sheetHd ? cycleForDate(cycles, sheetHd) : null
  const sheetCleanState = useMemo(() => evaluateCleanDays(sheetCycle?.cleanDays ?? []), [sheetCycle])
  const sheetPhase      = sheetCycle ? effectivePhaseFor(sheetCycle) : effectivePhase

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
    const todayZ = getZmanim(dt.year, dt.month, dt.day, lat, lng, tz)
    const prevZ  = getZmanim(prev.year, prev.month, prev.day, lat, lng, tz)
    return { nightStart: prevZ.sunset, dayStart: todayZ.sunrise, dayEnd: todayZ.sunset }
  }, [location, todayCal])

  const currentPeriod = useMemo(() => {
    if (!todayZmanim) return null
    const { nightStart, dayStart, dayEnd } = todayZmanim
    if (nightStart && dayStart && clockNow >= nightStart && clockNow < dayStart) return 'night'
    if (dayStart && dayEnd && clockNow >= dayStart && clockNow < dayEnd) return 'day'
    return null
  }, [todayZmanim, clockNow])

  const currentProgressPct = useMemo(() => {
    if (!todayZmanim || !currentPeriod) return null
    const { nightStart, dayStart, dayEnd } = todayZmanim
    const pctOf = (a, b) => (!a || !b) ? 0 : Math.min(100, Math.max(0, (clockNow - a) / (b - a) * 100))
    return currentPeriod === 'night' ? pctOf(nightStart, dayStart) : pctOf(dayStart, dayEnd)
  }, [todayZmanim, currentPeriod, clockNow])

  // ── בדיקות בוקר/ערב — זמינות רק בחלון ההלכתי; אזהרה אם הוחמץ ──
  const [quickLoading, setQuickLoading] = useState(false)
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

  // ── טבילה במקווה — פעולה עצמאית שמתעדת עובדה, לא תלויה בכך שהאפליקציה סימנה
  // את 7 הנקיים כמושלמים (בלי מקווה היא אסורה לבעלה גם אם אין דם) ──
  const canQuickMikveh = (effectivePhase === 'counting_7' || effectivePhase === 'waiting_mikveh')
    && !!cycle?.hefsekTahara && !cycle?.mikveDate?.actual

  async function doQuickMikveh() {
    setQuickLoading(true)
    try {
      await api.recordMikveh({ gregorianDatetime: new Date().toISOString(), cycleId: cycle?._id })
      await refresh()
    } catch (e) { alert(e.message) }
    finally { setQuickLoading(false) }
  }

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({coords}) => {
        const tz = tzlookup(coords.latitude, coords.longitude) ?? 'Asia/Jerusalem'
        setLocation({lat:coords.latitude, lng:coords.longitude, tz})
      },
      () => setLocation({lat:31.7767, lng:35.2345, tz:'Asia/Jerusalem'}),
      {timeout:8000}
    )
  }, [])

  // שאלת הריון — פעם אחת לכל טעינה, כשעברו pregnancyPromptDays מהראייה האחרונה
  useEffect(() => {
    if (dataLoaded && !pregAsked.current && shouldAskPregnancy(cycle)) {
      pregAsked.current = true
      setPregPromptOpen(true)
    }
  }, [dataLoaded, cycle])

  const monthName = todayMonth===12 && JewishCalendar.isJewishLeapYear(todayYear)
    ? 'אדר א׳' : MONTH_NAMES[todayMonth]
  const todayDow   = todayCal.getDayOfWeek()
  const todayLabel = `יום ${DOW_HE[todayDow]}, ${DAY_LETTERS[todayDay]} ${monthName} ${toHebrewYear(todayYear)}`
  const todayHoliday = useMemo(() => holidayLabel(todayCal), [todayCal])
  const clockStr   = clockNow.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: location?.tz ?? 'Asia/Jerusalem',
  })

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-stone-900" dir="rtl">
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="mb-6 flex items-end justify-between border-b border-stone-300 pb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{todayLabel}</h1>
            <p className={`mt-1 text-xs font-semibold ${todayHoliday ? 'text-amber-700' : 'text-stone-400'}`}>
              {todayHoliday ?? 'יום חול'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="border border-stone-300 bg-white px-4 py-2">
              <p className="text-2xl font-semibold tabular-nums tracking-wide text-teal-800" dir="ltr">{clockStr}</p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              aria-label="הגדרות הלכתיות"
              className="flex h-10 w-10 items-center justify-center border border-stone-300 bg-white text-lg text-stone-500 transition hover:border-stone-500 hover:text-stone-900"
            >⚙</button>
          </div>
        </header>

        {!dataLoaded ? (
          <div className="flex h-40 items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* ── רמזור סטטוס: אדום=אסורה / כתום=חשש / ירוק=מותרת ── */}
            <div className="border border-stone-300 bg-white px-6 py-8 text-center">
              <div
                className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-3xl text-white"
                style={{ backgroundColor: statusCfg.color, boxShadow: `0 0 0 9px ${statusCfg.ring}, 0 12px 30px ${statusCfg.glow}` }}
              >
                {statusLevel === 'red' ? '✕' : statusLevel === 'orange' ? '!' : '✓'}
              </div>
              <p className="mt-4 text-sm font-medium text-stone-500">
                {phaseCfg.label}{phaseDetail ? ` · ${phaseDetail}` : ''}
              </p>

              {countdown && (
                <div className="mt-6 flex flex-col items-center border-t border-stone-200 pt-5">
                  <span className="flex items-baseline gap-2 leading-none text-stone-900">
                    <span className="text-6xl font-bold tabular-nums">{countdown.n}</span>
                    <span className="text-xl font-semibold">{countdown.n === 1 ? 'יום' : 'ימים'}</span>
                  </span>
                  <span className="mt-2 text-sm font-medium text-stone-500">{countdown.label}</span>
                </div>
              )}
            </div>

            {/* חששות ווסת שחלים היום */}
            {todayConcerns.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {todayConcerns.map(c => (
                  <div key={c.id} className="flex items-center justify-center gap-2 border border-orange-200 bg-orange-50 px-4 py-2">
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
            <div className="overflow-hidden border border-stone-300 bg-white">
              <div className="relative flex h-28">
                <div className="relative flex flex-1 items-center justify-center gap-3 bg-indigo-100">
                  {currentPeriod === 'night' && currentProgressPct != null && (
                    <span
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-teal-700"
                      style={{ left: `${currentProgressPct}%` }}
                      title="המיקום הנוכחי בעונת הלילה"
                    />
                  )}
                  <MoonIcon className="h-9 w-9 shrink-0 text-indigo-600" />
                  <div>
                    <p className="text-base font-semibold text-indigo-700">לילה</p>
                    <p className="font-mono text-base text-indigo-500" dir="ltr">
                      {fmt(todayZmanim?.nightStart, location?.tz)}–{fmt(todayZmanim?.dayStart, location?.tz)}
                    </p>
                  </div>
                </div>
                <div className="w-px bg-stone-300" />
                <div className="relative flex flex-1 items-center justify-center gap-3 bg-amber-50">
                  {currentPeriod === 'day' && currentProgressPct != null && (
                    <span
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-teal-700"
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
                  className={`relative border px-4 py-3.5 text-sm font-semibold transition ${
                    morningDone     ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : morningActive ? 'border-emerald-300 bg-white text-emerald-700'
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
                  className={`relative border px-4 py-3.5 text-sm font-semibold transition ${
                    eveningDone     ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : eveningActive ? 'border-emerald-300 bg-white text-emerald-700'
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
            {canQuickMikveh && (
              <button
                onClick={doQuickMikveh}
                disabled={quickLoading}
                className="w-full border border-blue-200 bg-blue-50 px-4 py-4 text-base font-semibold text-blue-700 transition hover:border-blue-300 disabled:opacity-50"
              >
                הלכתי למקווה ✓
              </button>
            )}

            {/* ── פרטי היום ופעולות (ראייה / הפסק / טבילה) ── */}
            <button
              onClick={() => setSheetHd(sheetHd ? null : todayHD)}
              className="w-full border border-rose-700 bg-rose-700 px-6 py-6 text-center shadow-[0_18px_60px_rgba(190,18,60,0.15)] transition hover:bg-rose-800"
            >
              <p className="text-sm font-medium text-white">רישום ראייה</p>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-lg">
          שגיאת חיבור לשרת: {error}
        </div>
      )}

      {/* Action sheet — full halachic actions for today */}
      {sheetHd && (
        <DaySheet
          hd={sheetHd}
          cellColors={sheetColors}
          cycle={sheetCycle}
          cleanState={sheetCleanState}
          sightings={sightings}
          vesetConcerns={vesetConcerns}
          location={location}
          phase={sheetPhase}
          onClose={() => setSheetHd(null)}
          onRefresh={refresh}
        />
      )}

      {/* Settings sheet */}
      {showSettings && (
        <SettingsSheet
          cycle={cycle}
          onClose={() => setShowSettings(false)}
          onRefresh={refresh}
        />
      )}

      {/* Pregnancy prompt */}
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
