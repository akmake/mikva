import { useEffect, useMemo, useState } from 'react'
import { JewishCalendar } from 'kosher-zmanim'
import { useApp } from '../AppState'
import { getDayStatus, PHASES } from '../lib/status'
import { dayLabel, DAY_LETTERS, holidayLabel, monthLabel, toHebrewYear, WEEKDAY_SHORT } from '../lib/hebrewText'
import { hebrewDateEquals, DOW_HE } from '../lib/hebrewCalendar'
import { hebrewDayZmanim, onahNow } from '../lib/zmanimDay'
import { TONES } from '../ui/tones'
import Icon from '../ui/Icon'
import { Lotus } from '../ui/HomeArt'

const JERUSALEM = { lat: 31.7767, lng: 35.2345, tz: 'Asia/Jerusalem' }
const GREG_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function nextMonth(year, month) {
  const leap = JewishCalendar.isJewishLeapYear(year)
  if (month === 6)  return { year: year + 1, month: 7 }
  if (month === 12) return leap ? { year, month: 13 } : { year, month: 1 }
  if (month === 13) return { year, month: 1 }
  return { year, month: month + 1 }
}
function prevMonth(year, month) {
  const leap = JewishCalendar.isJewishLeapYear(year)
  if (month === 7) return { year: year - 1, month: 6 }
  if (month === 1) return leap ? { year, month: 13 } : { year, month: 12 }
  return { year, month: month - 1 }
}

const jcOf = (hd) => {
  const jc = new JewishCalendar()
  jc.setJewishDate(hd.year, hd.month, hd.day)
  return jc
}

// תאים של חודש עברי בשורות של 7: null = ריק; אחרת { day, greg }
function buildWeeks(year, month) {
  const c = new JewishCalendar()
  c.setJewishDate(year, month, 1)
  const start = c.getDayOfWeek()
  const total = c.getDaysInJewishMonth()
  const cells = []
  for (let i = 1; i < start; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push({ day: d, greg: jcOf({ year, month, day: d }).getDate().day })
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return { weeks, total }
}

// "אוקטובר – נובמבר 2026"
function gregRange(year, month, total) {
  const a = jcOf({ year, month, day: 1 }).getDate()
  const b = jcOf({ year, month, day: total }).getDate()
  if (a.year === b.year && a.month === b.month) return `${GREG_MONTHS[a.month - 1]} ${a.year}`
  if (a.year === b.year) return `${GREG_MONTHS[a.month - 1]} – ${GREG_MONTHS[b.month - 1]} ${a.year}`
  return `${GREG_MONTHS[a.month - 1]} ${a.year} – ${GREG_MONTHS[b.month - 1]} ${b.year}`
}

// "2026–2027" — השנים הלועזיות שהשנה העברית נפרשת עליהן (תשרי עד אלול)
function gregYears(year) {
  const y = jcOf({ year, month: 7, day: 1 }).getDate().year
  return `⁦${y}–${y + 1}⁩`
}

// מקרא: צבע (טון קיים) + צורה/אייקון + טקסט
const LEGEND = [
  { label: 'ראייה',      n: 'blood',      d: 'bloodMid',   icon: 'drop' },
  { label: 'הפסק טהרה',  n: 'bloodWash',  d: 'hefsek',     icon: 'clock' },
  { label: '7 נקיים',    n: 'countTint',  d: 'countWash',  icon: 'list' },
  { label: 'מקווה',      n: 'mikvehTint', d: 'none',       icon: 'wave' },
  { label: 'טהורה',      n: 'tahorTint',  d: 'tahorWash',  icon: 'check' },
]
const DOTS = [
  { label: 'חשש ווסת', color: '#bc5a1e' },
  { label: 'חשש שעבר', color: '#9b7f8e' },
  { label: 'עברה ליל הטבילה', color: '#a9303a' },
]

// תיאור קצר של סוג היום (מהסיווג הקיים של getDayStatus, ללא חישוב חדש)
const TYPE_LABEL = {
  sighting: 'יום ראייה', waiting: 'ימי המתנה', hefsek: 'הפסק טהרה',
  mikveh: 'טבילה', mikveh_planned: 'יום הטבילה המתוכנן',
  concern: 'חשש ווסת', concern_passed: 'חשש שעבר', tahorah: 'טהורה', normal: 'יום רגיל',
}
function statusText(st) {
  if (['clean', 'clean_7'].includes(st.type)) return { title: `יום נקי ${st.dayNum}`, sub: 'מתוך 7' }
  if (st.type === 'clean_blocked') return { title: `יום ${st.dayNum}`, sub: 'הספירה נפסקה' }
  return { title: TYPE_LABEL[st.type] ?? 'יום רגיל', sub: null }
}
const TYPE_ICON = {
  sighting: 'drop', waiting: 'drop', hefsek: 'clock', clean: 'list', clean_7: 'list', clean_blocked: 'x',
  mikveh: 'wave', mikveh_planned: 'wave', concern: 'alert', concern_passed: 'alert', tahorah: 'check', normal: 'calendar',
}
const TYPE_COLOR = {
  sighting: '#a9303a', waiting: '#c26b5e', hefsek: '#9a6f1c', clean: '#2c747a', clean_7: '#2c747a', clean_blocked: '#a9303a',
  mikveh: '#3a5f94', mikveh_planned: '#3a5f94', concern: '#bc5a1e', concern_passed: '#82757d', tahorah: '#327955', normal: '#82757d',
}
const TYPE_BG = {
  sighting: '#f8e2e8', waiting: '#f8e2e8', clean_blocked: '#f8e2e8', hefsek: '#f7ecd6',
  clean: '#dcedeb', clean_7: '#dcedeb', mikveh: '#dce6f2', mikveh_planned: '#dce6f2',
  concern: '#f6dfc8', concern_passed: '#f1ebed', tahorah: '#e2f1e6', normal: '#f3eef0',
}
// סימן קטן בתא לפי סוג (בנוסף לצבע — כדי שלא להסתמך על צבע בלבד)
const CELL_MARK = { sighting: 'drop', hefsek: 'clock', mikveh: 'wave', mikveh_planned: 'wave' }

export default function Calendar() {
  const {
    cycles, sightings, vesetMap, dataLoaded, effectivePhase, location, now,
    todayHD, openDay, openSettings, setViewMonth,
  } = useApp()
  const { lat, lng, tz } = location ?? JERUSALEM

  const [disp, setDisp] = useState({ year: todayHD.year, month: todayHD.month })
  const [sel, setSel] = useState(todayHD)
  const isCurrent = disp.year === todayHD.year && disp.month === todayHD.month
  const atToday = isCurrent && hebrewDateEquals(sel, todayHD)

  // סדרת העונה הבינונית מתרחבת עד החודש הנצפה
  useEffect(() => { setViewMonth({ year: disp.year, month: disp.month, day: 1 }) }, [disp, setViewMonth])
  useEffect(() => () => setViewMonth(todayHD), [setViewMonth, todayHD])

  const { weeks, total } = useMemo(() => buildWeeks(disp.year, disp.month), [disp])
  const range = useMemo(() => gregRange(disp.year, disp.month, total), [disp, total])
  const years = useMemo(() => gregYears(disp.year), [disp.year])

  // מחוג העכשיו בתא של היום
  const z = useMemo(() => hebrewDayZmanim(todayHD, lat, lng, tz), [todayHD, lat, lng, tz])
  const onah = onahNow(z, now)

  const phase = PHASES[effectivePhase] ?? PHASES.tahorah
  const go = (fn) => setDisp((d) => fn(d.year, d.month))
  const backToToday = () => { setDisp({ year: todayHD.year, month: todayHD.month }); setSel(todayHD) }

  // ── פרטי היום הנבחר ──
  const selJc = useMemo(() => jcOf(sel), [sel])
  const selSt = dataLoaded ? getDayStatus(sel, sightings, cycles, vesetMap) : null
  const selGreg = (() => {
    const g = selJc.getDate()
    return `${String(g.day).padStart(2, '0')}.${String(g.month).padStart(2, '0')}.${g.year}`
  })()
  const selHoliday = holidayLabel(selJc)
  const selText = selSt ? statusText(selSt) : null
  const selConcerns = selSt ? selSt.nightConcerns.length + selSt.dayConcerns.length : 0

  return (
    <div className="tahara-calendar">
      <div className="tc-shell">
        <header className="tc-top">
          <Lotus size={46} />
          <h1>לוח שנה</h1>
          <p className="years">{years} &nbsp;|&nbsp; {toHebrewYear(disp.year)}</p>
          <button className="tc-icon-button" onClick={openSettings} aria-label="הגדרות">
            <Icon name="gear" size={22} stroke={1.6} />
          </button>
        </header>

        {/* ── ניווט חודשים ── */}
        <nav className="tc-month-nav" aria-label="ניווט בין חודשים">
          <button className="tc-step" onClick={() => go(prevMonth)} aria-label="החודש הקודם">
            <span className="chev"><Icon name="chevR" size={20} stroke={2} /></span>
            <span className="txt">חודש קודם</span>
          </button>
          <div className="tc-month-pill" aria-live="polite">
            <strong>{monthLabel(disp.year, disp.month)} {toHebrewYear(disp.year)}</strong>
            <small>{range}</small>
          </div>
          <button className="tc-step" onClick={() => go(nextMonth)} aria-label="החודש הבא">
            <span className="txt">חודש הבא</span>
            <span className="chev"><Icon name="chevL" size={20} stroke={2} /></span>
          </button>
        </nav>

        <div className="tc-tools">
          <span className="tc-chip">מצב כעת: <b>{phase.label}</b></span>
          <button className="tc-chip action" onClick={backToToday} disabled={atToday}>
            <Icon name="calendar" size={18} stroke={1.8} />
            היום
          </button>
        </div>

        {/* ── לוח ── */}
        <section className="tc-card tc-board">
          <div className="tc-weekdays" aria-hidden="true">
            {WEEKDAY_SHORT.map((w) => <div key={w}>{w}</div>)}
          </div>

          {!dataLoaded ? (
            <div style={{ height: 280, display: 'grid', placeItems: 'center' }}>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-rule border-t-rose" />
            </div>
          ) : (
            <div className="tc-grid" role="grid" aria-label={`${monthLabel(disp.year, disp.month)} ${toHebrewYear(disp.year)}`}>
              {weeks.map((week, wi) => (
                <div key={wi} className="tc-week" role="row">
                  {week.map((cell, i) => {
                    if (!cell) return <div key={i} className="tc-day blank" role="gridcell" aria-hidden="true" />
                    const hd = { year: disp.year, month: disp.month, day: cell.day }
                    const st = getDayStatus(hd, sightings, cycles, vesetMap)
                    const today = hebrewDateEquals(hd, todayHD)
                    const selected = hebrewDateEquals(hd, sel)
                    const nT = TONES[st.nightTone], dT = TONES[st.dayTone]
                    const concern = st.nightConcerns.length + st.dayConcerns.length > 0
                    const passed = !concern && st.nightPassed.length + st.dayPassed.length > 0
                    // צבע המספר: אם שני החצאים כהים — בהיר; אחרת כהה
                    const light = (t) => ['blood', 'bloodMid', 'countDeep', 'mikveh'].includes(t)
                    const dark = light(st.nightTone) && light(st.dayTone)
                    const numColor = dark ? '#fffcfb' : '#54223c'
                    const mark = CELL_MARK[st.type]
                    const label = `${DAY_LETTERS[cell.day]} ${monthLabel(disp.year, disp.month)}, ${cell.greg} · ${statusText(st).title}${today ? ' · היום' : ''}`
                    return (
                      <button
                        key={i}
                        role="gridcell"
                        aria-selected={selected}
                        aria-label={label}
                        // לחיצה ראשונה בוחרת את היום; לחיצה על יום שכבר נבחר פותחת את הפרטים והפעולות
                        onClick={() => (selected ? openDay(hd) : setSel(hd))}
                        className={`tc-day${today ? ' is-today' : ''}`}
                      >
                        {/* חצי לילה (ימין) | חצי יום (שמאל) */}
                        <span className="halves">
                          <span style={{ background: st.nightTone === 'none' ? '#f6e6e9' : nT.bg }}>
                            <Icon name="moon" size={10} style={{ color: numColor }} />
                            {today && onah?.period === 'night' && (
                              <span className="needle" style={{ right: `${onah.pct}%`, background: '#e3b341' }} />
                            )}
                          </span>
                          <span style={{ background: st.dayTone === 'none' ? '#fffaf9' : dT.bg }}>
                            <Icon name="sun" size={10} style={{ color: numColor }} />
                            {today && onah?.period === 'day' && (
                              <span className="needle" style={{ right: `${onah.pct}%`, background: '#bb4770' }} />
                            )}
                          </span>
                        </span>
                        <span className="tc-hebrew-date" style={{ color: numColor }}>{DAY_LETTERS[cell.day]}</span>
                        <span className="tc-gregorian-date" style={{ color: numColor }}>{cell.greg}</span>
                        {concern ? <i className="mark dot" style={{ background: '#bc5a1e' }} />
                          : passed ? <i className="mark dot" style={{ background: '#9b7f8e' }} />
                          : mark ? <i className="mark"><Icon name={mark} size={9} stroke={2.2} /></i> : null}
                        {st.mikvehOverdue && <i className="late" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── מקרא ── */}
        <section className="tc-card tc-legend">
          <h3>מקרא</h3>
          <div className="tc-legend-grid">
            {LEGEND.map((l) => (
              <div key={l.label} className="tc-legend-item">
                <span className="tc-swatch">
                  <span style={{ background: TONES[l.n].bg }} />
                  <span style={{ background: TONES[l.d].bg }} />
                  <Icon name={l.icon} size={14} stroke={2} />
                </span>
                {l.label}
              </div>
            ))}
            {DOTS.map((l) => (
              <div key={l.label} className="tc-legend-item">
                <span className="tc-swatch" style={{ background: '#fffdfb' }}>
                  <i style={{ position: 'absolute', inset: 0, margin: 'auto', width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                </span>
                {l.label}
              </div>
            ))}
          </div>
          <p className="tc-legend-note">
            כל תא מחולק לשניים: חצי ימין הוא עונת הלילה (ירח), חצי שמאל עונת היום (שמש). האות היא התאריך העברי והמספר הקטן הוא הלועזי.
          </p>
        </section>

        {/* ── פרטי היום הנבחר ── */}
        {selSt && (
          <section className="tc-card tc-details" aria-live="polite">
            <p className="kicker">פרטי היום הנבחר</p>
            <h3>יום {DOW_HE[selJc.getDayOfWeek()]}, {dayLabel(sel.day)} {monthLabel(sel.year, sel.month)} {toHebrewYear(sel.year)}</h3>
            <p className="dates">{selGreg}</p>
            <div className="tc-status" style={{ background: TYPE_BG[selSt.type] ?? '#f3eef0' }}>
              <span className="ico" style={{ color: TYPE_COLOR[selSt.type] }}>
                <Icon name={TYPE_ICON[selSt.type] ?? 'calendar'} size={22} stroke={1.8} />
              </span>
              <div>
                <strong>{selText.title}</strong>
                {selText.sub && <small>{selText.sub}</small>}
              </div>
            </div>
            {(selHoliday || selConcerns > 0 || selSt.mikvehOverdue) && (
              <div className="tc-tags">
                {selHoliday && <span className="tc-tag">{selHoliday}</span>}
                {selConcerns > 0 && <span className="tc-tag">חשש ווסת</span>}
                {selSt.mikvehOverdue && <span className="tc-tag">עברה ליל הטבילה</span>}
              </div>
            )}
            <button className="tc-open" onClick={() => openDay(sel)}>
              <Icon name="list" size={20} stroke={1.7} />
              פרטים ופעולות
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
