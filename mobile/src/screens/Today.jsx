import { useMemo, useState } from 'react'
import { useApp } from '../AppState'
import { api } from '../lib/api'
import { daysBetween, hebrewDateEquals, ONAH_HE, DOW_HE } from '../lib/hebrewCalendar'
import {
  plannedMikvehDay, hefsekTaharaDay, bedikaWindows, hefsekWindow,
  daysUntilHefsekAllowed, currentCleanDayNumber,
} from '../lib/cycleCalculator'
import { PHASES, phaseDetailText } from '../lib/status'
import { dayLabel, monthLabel, toHebrewYear, holidayLabel, fmtRange, fmtClock } from '../lib/hebrewText'
import { hebrewDayZmanim, onahNow } from '../lib/zmanimDay'
import { LEVELS } from '../ui/tones'
import Icon from '../ui/Icon'
import StatusRing from '../ui/StatusRing'
import OnahStrip from '../ui/OnahStrip'
import { Lotus, Waves } from '../ui/HomeArt'
import { ChafifaSheet, useChafifa } from '../sheets/Chafifa'

const JERUSALEM = { lat: 31.7767, lng: 35.2345, tz: 'Asia/Jerusalem' }

export default function Today() {
  const {
    cycle, dataLoaded, error, refresh, cleanState, effectivePhase, vesetConcerns,
    location, now, todayCal, todayHD, openDay, openSettings,
  } = useApp()
  const { lat, lng, tz } = location ?? JERUSALEM

  const [busy, setBusy] = useState(false)
  const [chafifaOpen, setChafifaOpen] = useState(false)
  const [mikvehMarked, setMikvehMarked] = useState(null) // תאריך הטבילה שנרשמה זה עתה (לתצוגה בגיליון)
  const chafifa = useChafifa(cycle, refresh)

  // ── תאריך ──
  const dow = todayCal.getDayOfWeek()
  const holiday = useMemo(() => holidayLabel(todayCal), [todayCal])
  const clock = fmtClock(now, tz)
  const gregorian = now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz })

  // ── זמני היום והעונה הנוכחית ──
  const z = useMemo(() => hebrewDayZmanim(todayHD, lat, lng, tz), [todayHD, lat, lng, tz])
  const onah = onahNow(z, now)

  // ── מצב: אדום / כתום / ירוק ──
  const todayConcerns = useMemo(
    () => vesetConcerns.filter((c) => hebrewDateEquals(c.hebrewDate, todayHD) && !c.uprooted),
    [vesetConcerns, todayHD],
  )
  const level = effectivePhase !== 'tahorah' ? 'red' : (todayConcerns.length ? 'amber' : 'green')
  const L = LEVELS[level]
  const phase = PHASES[effectivePhase] ?? PHASES.tahorah
  const detail = phaseDetailText(cycle, effectivePhase, cleanState)

  // ── ספירה לאחור ──
  const countdown = useMemo(() => {
    if (effectivePhase === 'waiting_5_days' && cycle?.latestSighting) {
      const d = daysUntilHefsekAllowed(cycle.latestSighting.hebrewDate)
      return { n: d, caption: d === 0 ? 'ניתן לעשות הפסק טהרה היום' : 'עד שאפשר לעשות הפסק טהרה' }
    }
    if (effectivePhase === 'counting_7' && cycle?.hefsekTahara) {
      const n = currentCleanDayNumber(cycle.hefsekTahara.hebrewDate)
      if (n == null) return null
      const left = Math.max(0, 7 - n)
      return { n: left, caption: left === 0 ? 'היום היום האחרון לספירה' : 'עד הטבילה במקווה' }
    }
    return null
  }, [effectivePhase, cycle])

  // ── טבעת המצב: התקדמות בימים ──
  let segments = 0, filled = 0
  const onset = cycle?.latestSighting?.hebrewDate
  if (effectivePhase === 'counting_7') { segments = 7; filled = cycle?.hefsekTahara ? (currentCleanDayNumber(cycle.hefsekTahara.hebrewDate) ?? 7) : 0 }
  else if (effectivePhase === 'waiting_mikveh') { segments = 7; filled = 7 }
  else if (effectivePhase === 'blocked') { segments = 7; filled = 0 }
  else if (effectivePhase === 'waiting_5_days' && onset) { segments = 5; filled = Math.min(5, daysBetween(onset, todayHD) + 1) }
  else if (effectivePhase === 'waiting_hefsek') { segments = 5; filled = 5 }

  // ── הפסק טהרה ──
  const onsetHD = onset ?? cycle?.bleedings?.[0]?.hebrewDate ?? null
  const hefsekDayReached = onsetHD ? daysBetween(hefsekTaharaDay(onsetHD), todayHD) >= 0 : false
  const canHefsek = (effectivePhase === 'waiting_hefsek' && !cycle?.hefsekTahara && hefsekDayReached)
    || effectivePhase === 'blocked'
  const hefsekWin = canHefsek ? hefsekWindow(todayHD, lat, lng) : null

  // ── בדיקות בוקר/ערב ──
  const cleanNum = (effectivePhase === 'counting_7' && cycle?.hefsekTahara)
    ? currentCleanDayNumber(cycle.hefsekTahara.hebrewDate) : null
  const rec = cleanNum ? (cycle?.cleanDays ?? []).find((d) => d.dayNumber === cleanNum) : null
  const bw = cleanNum ? bedikaWindows(todayHD, lat, lng) : null
  const bedikaState = (done, start, end) =>
    done ? 'done' : (now >= start && now < end ? 'open' : (now >= end ? 'missed' : 'later'))
  const morning = bw ? bedikaState(rec?.morningCheck === 'clean', bw.morningStart, bw.morningEnd) : null
  const evening = bw ? bedikaState(rec?.eveningCheck === 'clean', bw.eveningStart, bw.eveningEnd) : null

  // ── טבילה ──
  const mikvehHD = cycle?.hefsekTahara?.hebrewDate
    ? plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState?.complete ? cleanState.tovelDay : 7) : null
  const mikvehDayReached = !!mikvehHD && !cycle?.mikveDate?.actual && daysBetween(mikvehHD, todayHD) >= 0
  const mikvehOverdue = !!mikvehHD && !cycle?.mikveDate?.actual && daysBetween(mikvehHD, todayHD) > 0
  const canMikveh = mikvehDayReached && onah?.period === 'night'

  async function act(fn) {
    setBusy(true)
    try { await fn(); await refresh() } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const doBedika = (type) => act(() => api.recordBedika({
    dayNumber: cleanNum, hebrewDate: todayHD, type, result: 'clean', cycleId: cycle?._id,
  }))
  const doHefsek = () => act(() => api.recordHefsek({
    gregorianDatetime: new Date().toISOString(), hebrewDate: todayHD, cycleId: cycle?._id,
  }))
  const doMikveh = () => act(async () => {
    await api.recordMikveh({ gregorianDatetime: new Date().toISOString(), cycleId: cycle?._id })
    setMikvehMarked(new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: tz }))
  })
  const mikvehActual = cycle?.mikveDate?.actual
  const mikvehInfo = {
    done: !!mikvehActual || !!mikvehMarked,
    doneAt: mikvehMarked ?? (mikvehActual ? new Date(mikvehActual).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: tz }) : null),
    can: canMikveh, busy, onDo: doMikveh,
  }

  // רשימת ההכנה זמינה לאורך ספירת שבעה הנקיים (כדי להתכונן מראש) ובכל יום הטבילה
  const showPrep = ['counting_7', 'waiting_mikveh'].includes(effectivePhase) || mikvehDayReached
  const hasTasks = bw || canHefsek || mikvehDayReached || showPrep

  return (
    <div className="tahara-home">
      <Waves />
      <div className="home-shell">
        {/* ── שורה עליונה ── */}
        <header className="home-top">
          <span className="home-blessing">ב״ה</span>
          <button className="round-btn" onClick={openSettings} aria-label="הגדרות">
            <Icon name="gear" size={22} stroke={1.6} />
          </button>
        </header>

        {/* ── מותג ── */}
        <div className="home-brand">
          <Lotus size={50} />
          <h1>טהרה</h1>
          <p className="tagline">בטחון. הלכה. שקט נפשי.</p>
          <div className="gold-rule"><Icon name="drop" size={12} stroke={1.8} /></div>
        </div>

        {error && <p className="error-box">{error}</p>}

        {/* ── תאריך ושעון ── */}
        <div className="home-date">
          <strong>
            יום {DOW_HE[dow]}, {dayLabel(todayHD.day)} {monthLabel(todayHD.year, todayHD.month)} {toHebrewYear(todayHD.year)}
          </strong>
          {gregorian}
        </div>
        <div className="home-clock">
          <time dir="ltr">{clock.h}:{clock.m}<small>{clock.s}</small></time>
          <span className="holiday-chip" data-holiday={holiday ? 'true' : 'false'}>{holiday ?? 'יום חול'}</span>
        </div>

        {!dataLoaded ? (
          <div style={{ height: 240, display: 'grid', placeItems: 'center' }}>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-rule border-t-rose" />
          </div>
        ) : (
          <>
            {/* ── מצב ── */}
            <StatusRing color={L.color} tint={L.tint} glyph={L.glyph} segments={segments} filled={filled}>
              <span className="kicker">את נמצאת ב:</span>
              <strong>{phase.label}</strong>
              {countdown ? (
                <>
                  <p className="count"><b>{countdown.n}</b><span>{countdown.n === 1 ? 'יום' : 'ימים'}</span></p>
                  <p className="note">{countdown.caption}</p>
                </>
              ) : (
                (detail || level === 'amber') && (
                  <p className="note">{level === 'amber' && effectivePhase === 'tahorah' ? 'חשש ווסת היום' : detail}</p>
                )
              )}
            </StatusRing>

            {/* ── יום / לילה ── */}
            <OnahStrip
              night={onah?.night} day={{ start: z.dayStart, end: z.dayEnd }}
              tz={tz} period={onah?.period} pct={onah?.pct} height={92}
            />

            {/* ── פעולה ראשית ── */}
            <button className="primary-action" onClick={() => openDay(todayHD)}>
              <Icon name="plus" size={22} stroke={1.8} />
              רישום ראייה
            </button>

            {/* ── התראות ── */}
            {(todayConcerns.length > 0 || mikvehOverdue) && (
              <>
                <h2 className="section-title">לתשומת לב</h2>
                <div className="task-card">
                  {mikvehOverdue && <Alert color="#b3303c" title="עברה ליל הטבילה" sub="טרם נרשמה טבילה" />}
                  {todayConcerns.map((c) => (
                    <Alert key={c.id} color="#bc5a1e"
                      title={`חשש ${c.label}${c.isKavua ? ' · קבוע' : ''}`} sub={ONAH_HE[c.onah]} />
                  ))}
                </div>
              </>
            )}

            {/* ── לביצוע היום ── */}
            {hasTasks && (
              <>
                <h2 className="section-title">לביצוע היום{cleanNum && <span>יום {cleanNum} מתוך 7</span>}</h2>
                <div className="task-card">
                  {bw && (
                    <>
                      <TaskRow
                        icon="sunrise" title="בדיקת בוקר" state={morning}
                        window={fmtRange(bw.morningStart, bw.morningEnd, tz)}
                        onDo={() => doBedika('morning')} busy={busy}
                      />
                      <TaskRow
                        icon="moon" title="בדיקת ערב" state={evening}
                        window={fmtRange(bw.eveningStart, bw.eveningEnd, tz)}
                        onDo={() => doBedika('evening')} busy={busy}
                      />
                    </>
                  )}

                  {canHefsek && (
                    <div style={{ padding: '14px 0' }} className="task-row-block">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                        <p className="task-title">הפסק טהרה</p>
                        {hefsekWin && <p className="task-sub">{fmtRange(hefsekWin.earliest, hefsekWin.latest, tz)}</p>}
                      </div>
                      <button className="wide-action" data-tone="hefsek" disabled={busy} onClick={doHefsek}>
                        <Icon name="check" size={20} stroke={2} />
                        {effectivePhase === 'blocked' ? 'הפסק טהרה חדש' : 'אישור הפסק טהרה'}
                      </button>
                    </div>
                  )}

                  {showPrep && (
                    <button
                      onClick={() => setChafifaOpen(true)}
                      className="task-row"
                      style={{ width: '100%', textAlign: 'start', justifyContent: 'space-between' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span className="task-icon" data-state={chafifa.done === chafifa.total ? 'done' : 'open'}>
                          <Icon name={chafifa.done === chafifa.total ? 'check' : 'list'} size={20} />
                        </span>
                        <span>
                          <span className="task-title" style={{ display: 'block' }}>רשימת הכנה לטבילה</span>
                          <span className="task-sub" style={{ display: 'block' }}>{chafifa.done} מתוך {chafifa.total} סומנו</span>
                        </span>
                      </span>
                      <Icon name="chevL" size={20} className="text-ink-mute" />
                    </button>
                  )}

                  {mikvehDayReached && (
                    <div style={{ padding: '14px 0' }}>
                      {canMikveh ? (
                        <button className="wide-action" data-tone="mikveh" disabled={busy} onClick={doMikveh}>
                          <Icon name="wave" size={20} stroke={1.8} />
                          הלכתי למקווה
                        </button>
                      ) : (
                        <p className="hint">אישור הטבילה יהיה זמין הערב, משקיעה</p>
                      )}
                      <p className="fine">טבילה בליל הטבילה — יש לוודא אישור/בירור עם רב במקרה של ספק</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {chafifaOpen && <ChafifaSheet cycle={cycle} onRefresh={refresh} onClose={() => setChafifaOpen(false)} mikveh={mikvehInfo} />}
    </div>
  )
}

function Alert({ color, title, sub }) {
  return (
    <div className="alert-row">
      <i style={{ background: color }} />
      <div>
        <p className="task-title" style={{ fontSize: 16 }}>{title}</p>
        {sub && <p className="task-sub">{sub}</p>}
      </div>
    </div>
  )
}

const STATE_TEXT = { done: 'נעשתה', later: 'עוד לא הגיע הזמן', missed: 'הוחמצה', open: '' }

function TaskRow({ icon, title, state, window, onDo, busy }) {
  return (
    <div className="task-row">
      <span className="task-icon" data-state={state}>
        <Icon name={state === 'done' ? 'check' : state === 'missed' ? 'alert' : icon} size={20} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="task-title" style={state === 'later' ? { color: 'var(--th-muted)' } : undefined}>{title}</p>
        <p className="task-sub">{window}{STATE_TEXT[state] ? ` · ${STATE_TEXT[state]}` : ''}</p>
      </div>
      {state === 'open' && (
        <button className="mini-action" onClick={onDo} disabled={busy}>נקייה</button>
      )}
    </div>
  )
}
