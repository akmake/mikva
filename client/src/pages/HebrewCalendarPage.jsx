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
    return <p className="text-center text-slate-400 text-sm py-4 animate-pulse">מאתר מיקום…</p>
  if (!data) return null

  const {nightStart,dayStart,dayEnd,tz} = data
  const inNight = nightStart && dayStart && now>=nightStart && now<dayStart
  const inDay   = dayStart  && dayEnd   && now>=dayStart   && now<dayEnd
  const mn = MONTH_NAMES[sel.month]

  return (
    <div className="mt-4 border-t border-slate-700/50 pt-4">
      <p className="text-center text-slate-300 text-sm mb-3 font-medium">
        {DAY_LETTERS[sel.day]} {mn} {toHebrewYear(sel.year)}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* Night */}
        <div className={`rounded-xl p-3 flex flex-col gap-1.5 transition-all ${
          inNight ? 'bg-indigo-900 ring-1 ring-indigo-400' : 'bg-slate-800/60'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-300">🌙 לילה</span>
            {inNight && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums" dir="ltr">
            {fmt(nightStart,tz)} – {fmt(dayStart,tz)}
          </div>
          {inNight && (
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full" style={{width:`${pct(now,nightStart,dayStart)}%`}} />
            </div>
          )}
        </div>

        {/* Day */}
        <div className={`rounded-xl p-3 flex flex-col gap-1.5 transition-all ${
          inDay ? 'bg-amber-900/60 ring-1 ring-amber-400' : 'bg-slate-800/60'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300">☀️ יום</span>
            {inDay && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums" dir="ltr">
            {fmt(dayStart,tz)} – {fmt(dayEnd,tz)}
          </div>
          {inDay && (
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{width:`${pct(now,dayStart,dayEnd)}%`}} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
  const [location, setLocation]   = useState(null)
  const [now, setNow]             = useState(new Date())

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center px-3 py-8" dir="rtl">
      <div className="w-full max-w-sm">

        <Link to="/" className="text-slate-400 hover:text-slate-200 text-sm mb-5 inline-flex items-center gap-1 transition">
          <span>→</span> דף הבית
        </Link>

        <div className="bg-slate-900/90 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <button
              onClick={() => { const p=prevMonth(dispYear,dispMonth); setDispYear(p.year); setDispMonth(p.month) }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition text-lg"
            >›</button>

            <div className="text-center">
              <h2 className="text-white text-xl font-bold tracking-wide">{monthName}</h2>
              <p className="text-slate-400 text-xs mt-0.5">{toHebrewYear(dispYear)}</p>
            </div>

            <button
              onClick={() => { const n=nextMonth(dispYear,dispMonth); setDispYear(n.year); setDispMonth(n.month) }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition text-lg"
            >‹</button>
          </div>

          {/* ── Day-of-week headers ── */}
          <div className="grid grid-cols-7 border-b border-slate-700/50">
            {DAY_HEADERS.map(h => (
              <div key={h} className="text-center text-slate-500 text-xs font-medium py-2">{h}</div>
            ))}
          </div>

          {/* ── Calendar grid ── */}
          <div className="grid grid-cols-7 gap-1 p-2">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />

              const today    = isToday(day)
              const selected = isSelected(day)
              const activeNight = isTodayNight(day)
              const activeDay   = isTodayDay(day)

              return (
                <button
                  key={i}
                  onClick={() => setSel({year:dispYear, month:dispMonth, day})}
                  className={`rounded-lg overflow-hidden transition-all focus:outline-none ${
                    selected ? 'ring-2 ring-white shadow-lg shadow-white/10' :
                    today    ? 'ring-1 ring-blue-400' : 'hover:ring-1 hover:ring-slate-500'
                  }`}
                >
                  {/* Night half */}
                  <div className={`h-4 flex items-center justify-center transition-colors ${
                    activeNight ? 'bg-indigo-600'
                    : today     ? 'bg-indigo-950'
                                : 'bg-slate-800'
                  }`}>
                    {activeNight && <span className="w-1 h-1 rounded-full bg-indigo-300 animate-pulse" />}
                  </div>

                  {/* Day half */}
                  <div className={`h-7 flex items-center justify-center transition-colors ${
                    activeDay ? 'bg-amber-700/70'
                    : today   ? 'bg-blue-800'
                              : 'bg-slate-700/60'
                  }`}>
                    <span className={`text-sm font-bold leading-none ${
                      today || selected ? 'text-white' : 'text-slate-200'
                    }`}>
                      {DAY_LETTERS[day]}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── Detail panel ── */}
          <div className="px-4 pb-4">
            <DetailPanel sel={sel} location={location} now={now} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-800 inline-block border border-slate-600" />
            לילה
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-700/60 inline-block border border-slate-600" />
            יום
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-600 inline-block" />
            עכשיו (לילה)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-700/70 inline-block" />
            עכשיו (יום)
          </span>
        </div>
      </div>
    </div>
  )
}
