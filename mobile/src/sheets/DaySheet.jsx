import { useMemo, useState } from 'react'
import { JewishCalendar } from 'kosher-zmanim'
import { api } from '../lib/api'
import {
  hebrewDateEquals, daysBetween, todayHebrew, ONAH_HE, DOW_HE,
} from '../lib/hebrewCalendar'
import { plannedMikvehDay, hefsekTaharaDay, hefsekWindow, bedikaWindows } from '../lib/cycleCalculator'
import { SOURCE_LABEL, SOURCE_TYPE } from '../lib/veset/sourceTypes'
import { dayLabel, monthLabel, toHebrewYear, holidayLabel, fmtTime, fmtRange } from '../lib/hebrewText'
import { hebrewDayZmanim } from '../lib/zmanimDay'
import Icon from '../ui/Icon'
import OnahStrip from '../ui/OnahStrip'
import { Button, EventRow, Sheet, SectionHead } from '../ui/controls'
import { ChafifaList, useChafifa } from './Chafifa'

const C = {
  blood: '#A9303A', hefsek: '#D6A93A', count: '#2C747A', mikveh: '#3A5F94', concern: '#BC5A1E', mute: '#9B7F8E',
}

export default function DaySheet({ hd, status, cycle, cleanState, sightings, vesetConcerns = [], location, phase, onClose, onRefresh }) {
  const [view, setView] = useState('main') // main | sighting | bedika
  const [timeInput, setTimeInput] = useState('')
  const [sourceType, setSourceType] = useState(SOURCE_TYPE.VESET)
  const [loading, setLoading] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const tz  = location?.tz ?? 'Asia/Jerusalem'
  const lat = location?.lat ?? 31.7683
  const lng = location?.lng ?? 35.2137

  const jc = useMemo(() => {
    const c = new JewishCalendar()
    c.setJewishDate(hd.year, hd.month, hd.day)
    return c
  }, [hd])
  const zmanim = useMemo(() => hebrewDayZmanim(hd, lat, lng, tz), [hd, lat, lng, tz])
  const holiday = useMemo(() => holidayLabel(jc), [jc])

  // עונה מחושבת מהשעה שהוזנה ומזמני היום בפועל
  const computedOnah = useMemo(() => {
    if (!timeInput || !zmanim.dayStart || !zmanim.dayEnd) return null
    const [h, m] = timeInput.split(':').map(Number)
    const entered = h * 60 + m
    const rise = zmanim.dayStart.getHours() * 60 + zmanim.dayStart.getMinutes()
    const set  = zmanim.dayEnd.getHours() * 60 + zmanim.dayEnd.getMinutes()
    return entered >= rise && entered < set ? 'day' : 'night'
  }, [timeInput, zmanim])

  // השוואה כרונולוגית אמיתית (לא compareHebrewDates שאינו נכון מעבר לגבול תשרי)
  const daysFromToday = daysBetween(todayHebrew(), hd)
  const isFuture = daysFromToday > 0
  const isPast   = daysFromToday < 0
  const daySightings = sightings.filter((s) => hebrewDateEquals(s.hebrewDate, hd))
  const dayType = status?.type ?? 'normal'
  const thisDayConcerns = vesetConcerns.filter((c) => hebrewDateEquals(c.hebrewDate, hd))

  const isBlocked = phase === 'blocked'
  const canRecordSighting = !daySightings.length && !isFuture
  // הפסק טהרה מותר רק מיום ה-5 של הנידה (onset+4); blocked → הפסק חדש מיד
  const onsetHD = cycle?.latestSighting?.hebrewDate ?? cycle?.bleedings?.[0]?.hebrewDate ?? null
  const hefsekDayReached = onsetHD ? daysBetween(hefsekTaharaDay(onsetHD), hd) >= 0 : false
  const canDoHefsek = !isFuture && (
    (phase === 'waiting_hefsek' && !cycle?.hefsekTahara && hefsekDayReached) || isBlocked
  )
  const canRecordBedika = phase === 'counting_7' && (dayType === 'clean' || dayType === 'clean_7') && !isFuture
  // טבילה: מליל הטבילה המוקדם ואילך (הפסק+8), לא תלוי בסימון הבדיקות באפליקציה
  const mikvehEarliestHD = cycle?.hefsekTahara?.hebrewDate
    ? plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState?.complete ? cleanState.tovelDay : 7)
    : null
  const canRecordMikveh = !!mikvehEarliestHD && !cycle?.mikveDate?.actual && !isFuture
    && daysBetween(mikvehEarliestHD, hd) >= 0
  const canMarkClean = isPast && thisDayConcerns.length > 0 && daySightings.length === 0

  const hefsekWin = canDoHefsek ? hefsekWindow(hd, lat, lng) : null
  const bedikaWin = canRecordBedika ? bedikaWindows(hd, lat, lng) : null
  const chafifa = useChafifa(cycle, onRefresh)

  async function run(fn, after) {
    setLoading(true)
    try { await fn(); await onRefresh(); after?.() }
    catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  const doRecordSighting = () => {
    if (!computedOnah) return
    return run(async () => {
      const gd = jc.getDate()
      const [h, m] = timeInput.split(':').map(Number)
      let datetime
      if (computedOnah === 'day') datetime = new Date(gd.year, gd.month - 1, gd.day, h, m, 0)
      else datetime = h < 12
        ? new Date(gd.year, gd.month - 1, gd.day, h, m, 0)
        : new Date(gd.year, gd.month - 1, gd.day - 1, h, m, 0)
      await api.recordSighting({
        gregorianDatetime: datetime.toISOString(), hebrewDate: hd, onah: computedOnah, sourceType, lat, lng,
      })
    }, () => { setView('main'); setTimeInput(''); setSourceType(SOURCE_TYPE.VESET) })
  }
  const doHefsek = () => run(
    () => api.recordHefsek({ gregorianDatetime: new Date().toISOString(), hebrewDate: hd, cycleId: cycle?._id }),
    () => setView('main'),
  )
  const doBedika = (type, result) => run(
    () => api.recordBedika({ dayNumber: status?.dayNum, hebrewDate: hd, type, result, cycleId: cycle?._id }),
  )
  const doMikveh = () => run(
    () => api.recordMikveh({ gregorianDatetime: new Date().toISOString(), cycleId: cycle?._id }),
    onClose,
  )
  const doMarkClean = (c) => run(() => api.recordCleanPass({
    concernType: c.type, concernId: c.id, hebrewDate: c.hebrewDate, onah: c.onah, relatedSightingId: c.relatedSightingId,
  }))
  const doUndoClean = (c) => c.observationIds?.length
    ? run(() => api.deleteObservation(c.observationIds[0])) : null
  const doDeleteSighting = (id) => run(() => api.deleteSighting(id), () => setConfirmDel(null))

  const eyebrow = [`יום ${DOW_HE[jc.getDayOfWeek()]}`, toHebrewYear(hd.year), holiday].filter(Boolean).join(' · ')

  return (
    <Sheet eyebrow={eyebrow} title={`${dayLabel(hd.day)} ${monthLabel(hd.year, hd.month)}`} onClose={onClose}>
      <OnahStrip
        night={{ start: zmanim.nightStart, end: zmanim.dayStart }}
        day={{ start: zmanim.dayStart, end: zmanim.dayEnd }}
        tz={tz} period={null} pct={null} height={84} compact
      />

      {/* ── אירועי היום ── */}
      <div className="mt-5">
        {daySightings.map((s) => (
          <EventRow
            key={s._id}
            color={C.blood}
            title="ראייה"
            sub={`${ONAH_HE[s.onah]}${SOURCE_LABEL[s.sourceType] ? ' · ' + SOURCE_LABEL[s.sourceType] : ''}`}
            right={
              confirmDel === s._id ? (
                <div className="flex items-center gap-1 self-center">
                  <button onClick={() => doDeleteSighting(s._id)} disabled={loading}
                    className="rounded bg-blood px-3 py-1.5 text-[13px] font-semibold text-paper-bright">מחיקה</button>
                  <button onClick={() => setConfirmDel(null)}
                    className="px-2 py-1.5 text-[13px] text-ink-soft">ביטול</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(s._id)} aria-label="מחיקת ראייה"
                  className="flex h-10 w-10 items-center justify-center self-center text-ink-mute">
                  <Icon name="trash" size={19} />
                </button>
              )
            }
          />
        ))}
        {dayType === 'hefsek' && <EventRow color={C.hefsek} title="הפסק טהרה" />}
        {(dayType === 'clean' || dayType === 'clean_7') && (
          <EventRow color={C.count}
            title={`יום ${status?.dayNum} מתוך 7 נקיים`}
            sub={dayType === 'clean_7' ? 'הושלמה הספירה' : null} />
        )}
        {dayType === 'clean_blocked' && (
          <EventRow color={C.blood} title={`נמצא דם ביום ${status?.dayNum}`}
            sub="הספירה נפסלה — יש להתחיל הפסק טהרה חדש" />
        )}
        {isBlocked && dayType !== 'clean_blocked' && (
          <EventRow color={C.blood} title="הספירה נפסקה" sub="נדרש הפסק טהרה חדש" />
        )}
        {(dayType === 'mikveh' || dayType === 'mikveh_planned') && (
          <EventRow color={C.mikveh} title={dayType === 'mikveh' ? 'טבילה במקווה' : 'ליל הטבילה'}
            sub={dayType === 'mikveh' ? null : 'מתוכנן'} />
        )}
        {status?.mikvehOverdue && (
          <EventRow color={C.blood} title="עברה ליל הטבילה" sub="טרם נרשמה טבילה" />
        )}

        {thisDayConcerns.map((c) => {
          const uprooted = c.uprooted || c.passed
          const progress = c.needed > 1
            ? `עקירה ${c.cleanPasses} מתוך ${c.needed}`
            : c.cleanPasses >= 1 ? 'עבר ללא ראייה' : null
          return (
            <EventRow
              key={c.id}
              color={uprooted ? C.mute : C.concern}
              muted={uprooted}
              title={`חשש ${c.label}${c.isKavua ? ' · קבוע' : ''}`}
              sub={[ONAH_HE[c.onah], progress].filter(Boolean).join(' · ')}
              right={isPast && daySightings.length === 0 && !uprooted ? (
                <button
                  onClick={() => doMarkClean(c)}
                  disabled={loading || c.cleanPasses >= 1}
                  className="self-center rounded-md border border-rose/40 text-rose px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  עבר ללא ראייה
                </button>
              ) : (isPast && c.cleanPasses >= 1 ? (
                <button onClick={() => doUndoClean(c)} disabled={loading}
                  className="flex items-center gap-1 self-center px-2 py-1.5 text-[13px] text-ink-soft">
                  <Icon name="undo" size={15} /> בטל
                </button>
              ) : null)}
            />
          )
        })}
      </div>

      {/* ── חלונות זמן ── */}
      {canDoHefsek && hefsekWin && (
        <div className="mt-4 flex items-baseline justify-between border-y border-rule py-3">
          <span className="eyebrow">חלון הפסק טהרה</span>
          <span className="tabular text-[17px] font-medium">{fmtRange(hefsekWin.earliest, hefsekWin.latest, tz)}</span>
        </div>
      )}
      {canRecordBedika && bedikaWin && (
        <div className="mt-4 grid grid-cols-2 border-y border-rule">
          <div className="border-e border-rule py-3 pe-3">
            <p className="eyebrow mb-1">בדיקת בוקר</p>
            <p className="tabular text-[16px] font-medium">{fmtRange(bedikaWin.morningStart, bedikaWin.morningEnd, tz)}</p>
          </div>
          <div className="py-3 ps-4">
            <p className="eyebrow mb-1">בדיקת ערב</p>
            <p className="tabular text-[16px] font-medium">{fmtRange(bedikaWin.eveningStart, bedikaWin.eveningEnd, tz)}</p>
          </div>
        </div>
      )}

      {/* ── טופס רישום ראייה ── */}
      {view === 'sighting' && (
        <div className="mt-5 border-t border-rule pt-4">
          <h3 className="font-serif text-[24px] font-medium">רישום ראייה</h3>
          <p className="mt-1 text-[13px] text-ink-soft">בחרי את סוג הראייה והזיני את השעה. העונה תחושב עבורך.</p>

          <p className="eyebrow mb-2 mt-5">סוג הראייה</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SOURCE_LABEL).map(([val, label]) => {
              const active = sourceType === val
              const feeds = val === SOURCE_TYPE.VESET || val === SOURCE_TYPE.BEDIKA
              return (
                <button key={val} onClick={() => setSourceType(val)}
                  className={`flex min-h-[58px] flex-col justify-center rounded border px-3 py-2 text-start transition-colors ${
                    active ? 'border-blood bg-blood-wash text-blood' : 'border-rule bg-paper-bright text-ink-soft'
                  }`}>
                  <span className="text-[14px] font-medium leading-tight">{label}</span>
                  <span className="mt-0.5 text-[11px] leading-none text-ink-mute">{feeds ? 'נכנס לחישוב' : 'מטמא בלבד'}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12px] text-ink-mute">רק ראייה ובדיקה נכנסות לחישוב הווסתות · שאר הסוגים מטמאים בלבד</p>

          <label htmlFor="sighting-time" className="eyebrow mb-2 mt-5 block">שעת הראייה</label>
          <input
            id="sighting-time" type="time" value={timeInput} dir="ltr"
            onChange={(e) => setTimeInput(e.target.value)}
            className="w-full rounded-md border border-rose/30 bg-paper-bright px-4 py-3 text-center font-serif text-[40px] font-medium outline-none focus:border-blood"
          />

          <div className="mt-3 flex min-h-[52px] items-center justify-center gap-2 rounded border border-dashed border-rule text-[14px]">
            {computedOnah ? (
              <>
                <Icon name={computedOnah === 'day' ? 'sun' : 'moon'} size={20} />
                <span className="font-semibold">{computedOnah === 'day' ? 'עונת היום' : 'עונת הלילה'}</span>
                <span className="tabular text-ink-soft">
                  {computedOnah === 'day'
                    ? fmtRange(zmanim.dayStart, zmanim.dayEnd, tz)
                    : fmtRange(zmanim.nightStart, zmanim.dayStart, tz)}
                </span>
              </>
            ) : <span className="text-ink-mute">העונה תופיע אחרי הזנת שעה</span>}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
            <Button tone="quiet" size="md" onClick={() => { setView('main'); setTimeInput(''); setSourceType(SOURCE_TYPE.VESET) }}>ביטול</Button>
            <Button tone="blood" size="md" onClick={doRecordSighting} disabled={loading || !timeInput || !computedOnah}>
              {loading ? 'שומר…' : 'שמירת הראייה'}
            </Button>
          </div>
        </div>
      )}

      {/* ── רישום בדיקה ── */}
      {view === 'bedika' && (
        <div className="mt-5 border-t border-rule pt-4">
          <h3 className="font-serif text-[24px] font-medium">בדיקות יום {status?.dayNum}</h3>
          <div className="mt-3 space-y-2">
            <Button tone="count" size="md" icon="check" disabled={loading} onClick={() => doBedika('morning', 'clean')}>בדיקת בוקר — נקייה</Button>
            <Button tone="count" size="md" icon="check" disabled={loading} onClick={() => doBedika('evening', 'clean')}>בדיקת ערב — נקייה</Button>
            <Button tone="blood" size="md" icon="drop" disabled={loading} onClick={() => doBedika('morning', 'stain')}>נמצא דם</Button>
            <Button tone="quiet" size="md" onClick={() => setView('main')}>סגירה</Button>
          </div>
        </div>
      )}

      {/* ── פעולות ── */}
      {view === 'main' && (
        <div className="mt-6 space-y-2.5">
          {canRecordSighting && <Button tone="blood" icon="drop" onClick={() => setView('sighting')}>רישום ראייה</Button>}
          {canDoHefsek && (
            <Button tone="hefsek" icon="check" disabled={loading} onClick={doHefsek}>
              {isBlocked ? 'הפסק טהרה חדש — התחלת ספירה מחדש' : 'אישור הפסק טהרה'}
            </Button>
          )}
          {canRecordBedika && <Button tone="count" icon="plus" onClick={() => setView('bedika')}>רישום בדיקה</Button>}
          {canRecordMikveh && (
            <div className="pt-3">
              <SectionHead aside={`${chafifa.done}/${chafifa.total}`}>הכנה לטבילה</SectionHead>
              <div className="mb-4 border-y border-rule">
                <ChafifaList cycle={cycle} onRefresh={onRefresh} />
              </div>
              <Button tone="mikveh" icon="wave" disabled={loading} onClick={doMikveh}>אישור טבילה במקווה</Button>
              <p className="mt-2 text-center text-[12px] text-ink-mute">
                טבילה בליל הטבילה — יש לוודא אישור/בירור עם רב במקרה של ספק
              </p>
            </div>
          )}
          {!canRecordSighting && !canDoHefsek && !canRecordBedika && !canRecordMikveh && !canMarkClean && (
            <p className="py-4 text-center text-[14px] text-ink-mute">{isFuture ? 'תאריך עתידי' : 'אין פעולות זמינות'}</p>
          )}
        </div>
      )}
    </Sheet>
  )
}
