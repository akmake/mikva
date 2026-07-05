import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  JewishCalendar,
  ComplexZmanimCalendar,
  GeoLocation,
  ZmanimFormatter,
  DateTime,
} from 'kosher-zmanim'
import tzlookup from 'tz-lookup'
import { useMikvaEngine } from '../lib/useMikvaEngine'
import {
  getCellColors,
  cycleForDate,
  effectivePhaseFor,
  DaySheet,
  SettingsSheet,
  PHASE_CFG,
  phaseDetailText,
} from './Dashboard'
import { evaluateCleanDays } from '../lib/cleanDaysEngine'

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

const DAY_HEADERS = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','שב׳']

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

// ── Month navigation ──────────────────────────────────────────────────────────

function nextMonth(year, month) {
  const leap = JewishCalendar.isJewishLeapYear(year)
  if (month===6)  return { year:year+1, month:7 }
  if (month===12) return leap ? {year,month:13} : {year,month:1}
  if (month===13) return {year,month:1}
  return {year,month:month+1}
}
function prevMonth(year, month) {
  const leap = JewishCalendar.isJewishLeapYear(year)
  if (month===7) return {year:year-1,month:6}
  if (month===1) return leap ? {year,month:13} : {year,month:12}
  return {year,month:month-1}
}

function buildGrid(year, month) {
  const c = new JewishCalendar()
  c.setJewishDate(year, month, 1)
  const start = c.getDayOfWeek()
  const total = c.getDaysInJewishMonth()
  const cells = []
  for (let i=1; i<start; i++) cells.push(null)
  for (let d=1; d<=total; d++) cells.push(d)
  return cells
}

// ── Zmanim ────────────────────────────────────────────────────────────────────

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

function pct(now, a, b) {
  if (!a||!b) return 0
  return Math.min(100,Math.max(0,(now-a)/(b-a)*100))
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ sel, location, now }) {
  const data = useMemo(() => {
    if (!location) return null
    const {lat,lng,tz} = location
    const c = new JewishCalendar()
    c.setJewishDate(sel.year, sel.month, sel.day)
    const gd = c.getDate()
    const dt = DateTime.fromObject({year:gd.year,month:gd.month,day:gd.day,hour:12},{zone:tz})
    const prev = dt.minus({days:1})
    const todayZ = getZmanim(dt.year,   dt.month,   dt.day,   lat, lng, tz)
    const prevZ  = getZmanim(prev.year, prev.month, prev.day, lat, lng, tz)
    return { nightStart:prevZ.sunset, dayStart:todayZ.sunrise, dayEnd:todayZ.sunset, tz }
  }, [location, sel])

  if (!location)
    return (
      <div className="flex min-h-44 items-center justify-center gap-3 text-stone-400 text-sm">
        <span className="w-4 h-4 rounded-full border-2 border-stone-200 border-t-stone-700 animate-spin" />
        מחשב את זמני היום
      </div>
    )
  if (!data) return null

  const {nightStart,dayStart,dayEnd,tz} = data
  const inNight = nightStart && dayStart && now>=nightStart && now<dayStart
  const inDay   = dayStart  && dayEnd   && now>=dayStart   && now<dayEnd
  const mn = MONTH_NAMES[sel.month]

  return (
    <div>
      <div className="mb-7">
        <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-stone-400">היום שנבחר</p>
        <h3 className="text-2xl font-semibold tracking-tight text-stone-900">
          {DAY_LETTERS[sel.day]} {mn}
        </h3>
        <p className="mt-1 text-sm text-stone-500">{toHebrewYear(sel.year)}</p>
      </div>

      <div className="space-y-3">
        <TimeCard
          label="לילה" tone="night" active={inNight}
          from={fmt(nightStart,tz)} to={fmt(dayStart,tz)}
          progress={inNight ? pct(now,nightStart,dayStart) : null}
        />
        <TimeCard
          label="יום" tone="day" active={inDay}
          from={fmt(dayStart,tz)} to={fmt(dayEnd,tz)}
          progress={inDay ? pct(now,dayStart,dayEnd) : null}
        />
      </div>
      <p className="mt-5 text-xs leading-5 text-stone-400">הזמנים מחושבים לפי המיקום הנוכחי שלך.</p>
    </div>
  )
}

function TimeCard({ label, tone, active, from, to, progress }) {
  const isNight = tone === 'night'
  return (
    <div className={`relative border p-4 transition-colors ${
      active ? 'border-teal-700 bg-teal-50/50' : 'border-stone-200 bg-white'
    }`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${active ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-500'}`}>
            {isNight ? <MoonIcon /> : <SunIcon />}
          </span>
          <span className={`text-sm font-semibold ${active ? 'text-teal-950' : 'text-stone-700'}`}>{label}</span>
        </div>
        {active && <span className="text-[10px] font-semibold tracking-wide text-teal-800">עכשיו</span>}
      </div>
      <div className="flex items-end justify-between" dir="rtl">
        <div><span className="block text-[10px] text-stone-400">מתחיל</span><span className="font-mono text-sm tabular-nums text-stone-800" dir="ltr">{from}</span></div>
        <span className="mb-1 h-px flex-1 bg-stone-200 mx-3" />
        <div className="text-left"><span className="block text-[10px] text-stone-400">מסתיים</span><span className="font-mono text-sm tabular-nums text-stone-800" dir="ltr">{to}</span></div>
      </div>
      {progress != null && (
        <div className="mt-4 h-0.5 bg-teal-100 overflow-hidden">
          <div className="h-full bg-teal-700 transition-all duration-700" style={{width:`${progress}%`}} />
        </div>
      )}
    </div>
  )
}

function MoonIcon() {
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" /></svg>
}

function SunIcon() {
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HebrewCalendarPage() {
  const todayCal   = useMemo(() => new JewishCalendar(new Date()), [])
  const todayYear  = todayCal.getJewishYear()
  const todayMonth = todayCal.getJewishMonth()
  const todayDay   = todayCal.getJewishDayOfMonth()

  const [dispYear,  setDispYear]  = useState(todayYear)
  const [dispMonth, setDispMonth] = useState(todayMonth)
  const [sel, setSel] = useState({year:todayYear, month:todayMonth, day:todayDay})
  const [sheetHd, setSheetHd]     = useState(null)   // day whose action-sheet is open
  const [showSettings, setShowSettings] = useState(false)
  const [location, setLocation]   = useState(null)
  const [now, setNow]             = useState(new Date())

  // ── Shared halachic engine (identical to the "/" dashboard) ──
  const {
    cycle, cycles, sightings, dataLoaded, error, refresh,
    cleanState, effectivePhase, vesetConcerns, vesetMap,
  } = useMikvaEngine()

  const phaseCfg    = PHASE_CFG[effectivePhase] ?? PHASE_CFG.tahorah
  const phaseDetail = useMemo(
    () => phaseDetailText(cycle, effectivePhase, cleanState),
    [cycle, effectivePhase, cleanState],
  )

  const sheetColors = sheetHd
    ? getCellColors(sheetHd, sightings, cycles, vesetMap)
    : null

  // הנידה שמכסה את היום שנבחר בשיט־action — פעולות פר-נידה (כולל נידת-עבר).
  const sheetCycle      = sheetHd ? cycleForDate(cycles, sheetHd) : null
  const sheetCleanState = useMemo(() => evaluateCleanDays(sheetCycle?.cleanDays ?? []), [sheetCycle])
  const sheetPhase      = sheetCycle ? effectivePhaseFor(sheetCycle) : effectivePhase

  // current period for today (to colour the cells)
  const todayPeriods = useMemo(() => {
    if (!location) return null
    const {lat,lng,tz} = location
    const c = new JewishCalendar()
    c.setJewishDate(todayYear, todayMonth, todayDay)
    const gd = c.getDate()
    const dt   = DateTime.fromObject({year:gd.year,month:gd.month,day:gd.day,hour:12},{zone:tz})
    const prev = dt.minus({days:1})
    const todayZ = getZmanim(dt.year,dt.month,dt.day,lat,lng,tz)
    const prevZ  = getZmanim(prev.year,prev.month,prev.day,lat,lng,tz)
    return { nightStart:prevZ.sunset, dayStart:todayZ.sunrise, dayEnd:todayZ.sunset }
  }, [location, todayYear, todayMonth, todayDay])

  const currentPeriod = useMemo(() => {
    if (!todayPeriods) return null
    const {nightStart,dayStart,dayEnd} = todayPeriods
    if (nightStart && dayStart && now>=nightStart && now<dayStart) return 'night'
    if (dayStart && dayEnd && now>=dayStart && now<dayEnd) return 'day'
    return null
  }, [todayPeriods, now])

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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const cells     = buildGrid(dispYear, dispMonth)
  const monthName = dispMonth===12 && JewishCalendar.isJewishLeapYear(dispYear)
    ? 'אדר א׳' : MONTH_NAMES[dispMonth]

  const isToday    = d => d===todayDay    && dispMonth===todayMonth    && dispYear===todayYear
  const isSelected = d => d===sel.day     && dispMonth===sel.month     && dispYear===sel.year
  const isTodayNight = d => isToday(d) && currentPeriod==='night'
  const isTodayDay   = d => isToday(d) && currentPeriod==='day'

  const todayLabel = `${DAY_LETTERS[todayDay]} ${MONTH_NAMES[todayMonth]} ${toHebrewYear(todayYear)}`
  const isCurrentMonth = dispMonth===todayMonth && dispYear===todayYear

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-stone-900" dir="rtl">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="mb-8 flex items-end justify-between border-b border-stone-300 pb-6">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-teal-800">לוח עברי</p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{todayLabel}</h1>
            <p className="mt-2 text-sm text-stone-500">התאריך העברי, זמני היום ומעקב הטהרה — במקום אחד.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              aria-label="הגדרות הלכתיות"
              className="flex h-10 w-10 items-center justify-center border border-stone-300 bg-white text-lg text-stone-500 transition hover:border-stone-500 hover:text-stone-900"
            >⚙</button>
            <Link to="/" aria-label="חזרה לדף הבית" className="hidden h-10 items-center gap-2 border border-stone-300 bg-white px-4 text-sm text-stone-600 transition hover:border-stone-500 hover:text-stone-900 sm:flex">
              דף הבית <span aria-hidden="true">←</span>
            </Link>
          </div>
        </header>

        {/* Phase strip — current halachic status */}
        {dataLoaded && (
          <div className={`mb-6 flex items-center justify-center gap-2 border px-4 py-2.5 ${phaseCfg.bg} ${phaseCfg.border}`}>
            <span className={`text-sm font-semibold ${phaseCfg.text}`}>{phaseCfg.label}</span>
            {phaseDetail && <span className={`text-sm opacity-60 ${phaseCfg.text}`}>· {phaseDetail}</span>}
          </div>
        )}

        <div className="grid overflow-hidden border border-stone-300 bg-white shadow-[0_18px_60px_rgba(41,37,36,0.07)] lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="p-4 sm:p-7 lg:p-9">
          <div className="flex items-center justify-between pb-5">
            <button
              onClick={() => { const p=prevMonth(dispYear,dispMonth); setDispYear(p.year); setDispMonth(p.month) }}
              aria-label="החודש הקודם"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-500 transition hover:bg-stone-200 hover:text-stone-900 active:scale-95"
            >›</button>

            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">{monthName}</h2>
              <p className="mt-1 text-xs tracking-[0.12em] text-stone-400">{toHebrewYear(dispYear)}</p>
            </div>

            <button
              onClick={() => { const n=nextMonth(dispYear,dispMonth); setDispYear(n.year); setDispMonth(n.month) }}
              aria-label="החודש הבא"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xl text-stone-500 transition hover:bg-stone-200 hover:text-stone-900 active:scale-95"
            >‹</button>
          </div>

          <div className="flex h-11 items-center justify-center">
            {!isCurrentMonth && <button onClick={() => { setDispYear(todayYear); setDispMonth(todayMonth) }} className="text-xs font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-teal-950">חזרה לחודש הנוכחי</button>}
          </div>

          <div className="mb-1 grid grid-cols-7 rounded-xl bg-stone-50">
            {DAY_HEADERS.map((h, idx) => (
              <div key={h} className={`py-3 text-center text-[11px] font-semibold tracking-wide ${idx===6 ? 'text-teal-700' : 'text-stone-400'}`}>{h}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="aspect-square" />

              const hd       = { year: dispYear, month: dispMonth, day }
              const today    = isToday(day)
              const selected = isSelected(day)
              const activeNight = isTodayNight(day)
              const activeDay   = isTodayDay(day)
              const isShabbat = (i % 7) === 6

              // Halachic status colours (night and day are split evenly) — same
              // engine the "/" dashboard uses.
              const colors = dataLoaded
                ? getCellColors(hd, sightings, cycles, vesetMap)
                : null
              const nightColor    = colors?.nightColor ?? 'bg-transparent'
              const dayColor      = colors?.dayColor   ?? 'bg-transparent'
              const hasConcern    = (colors?.nightConcerns?.length ?? 0) > 0
                                 || (colors?.dayConcerns?.length   ?? 0) > 0

              return (
                <button
                  key={i}
                  onClick={() => { setSel(hd); setSheetHd(hd) }}
                  aria-label={`${DAY_LETTERS[day]} ${monthName}`}
                  className={`group relative flex aspect-square items-center justify-center rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 ${
                    selected ? 'ring-2 ring-inset ring-teal-800 z-10'
                    : 'hover:bg-stone-50'
                  }`}
                >
                  {/* status background — night | day split */}
                  <span className={`absolute inset-1 flex overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(120,113,108,0.08)] ${isShabbat ? 'bg-teal-50/60' : 'bg-white'}`}>
                    <span className={`w-1/2 ${nightColor}`} />
                    <span className={`w-1/2 ${dayColor}`} />
                  </span>

                  <span className={`relative flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-sm leading-none transition sm:text-base ${
                    colors?.dayText ?? (isShabbat ? 'text-teal-700' : 'text-stone-700')
                  } ${today ? 'bg-teal-800 font-semibold !text-white shadow-sm' : selected ? 'font-semibold' : 'font-normal'}`}>
                    {DAY_LETTERS[day]}
                  </span>

                  {hasConcern && (
                    <span className="absolute bottom-1.5 left-1.5 h-1.5 w-1.5 rounded-full bg-orange-400" />
                  )}
                  {(activeNight || activeDay) && (
                    <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-gray-500 opacity-60 animate-pulse" />
                  )}
                  {today && <span className="absolute right-2 top-2 text-[8px] font-semibold text-teal-800">היום</span>}
                </button>
              )
            })}
          </div>
          </section>

          <aside className="border-t border-stone-300 bg-[#fbfaf7] p-6 sm:p-8 lg:border-r lg:border-t-0">
            <DetailPanel sel={sel} location={location} now={now} />

            {/* Status legend */}
            <div className="mt-8 border-t border-stone-200 pt-5">
              <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-stone-400">מקרא</p>
              <div className="flex flex-col gap-2.5">
                {[
                  { label: 'ראיה',      night: 'bg-rose-500',    day: 'bg-rose-50'     },
                  { label: 'הפסק טהרה', night: 'bg-amber-400',   day: 'bg-amber-300'   },
                  { label: '7 נקיים',   night: 'bg-emerald-200', day: 'bg-emerald-100' },
                  { label: 'מקווה',     night: 'bg-blue-200',    day: 'bg-blue-100'    },
                ].map(({ label, night, day }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className="flex h-4 w-6 overflow-hidden border border-stone-200">
                      <span className={`w-1/2 ${night}`} />
                      <span className={`w-1/2 ${day}`} />
                    </span>
                    <span className="text-xs text-stone-500">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2.5">
                  <span className="ml-1 inline-block h-2 w-2 rounded-full bg-orange-400" />
                  <span className="text-xs text-stone-500">חשש ווסת</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-5 flex items-center justify-between text-xs text-stone-400">
          <Link to="/" className="sm:hidden hover:text-stone-700">← דף הבית</Link>
          <p className="mr-auto">לחצו על תאריך כדי לרשום ראיה, הפסק טהרה, בדיקה או טבילה — ולראות את זמני היום</p>
        </footer>
      </div>

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-lg">
          שגיאת חיבור לשרת: {error}
        </div>
      )}

      {/* Action sheet — full halachic actions for the selected day */}
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
    </main>
  )
}
