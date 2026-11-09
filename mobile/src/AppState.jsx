import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { JewishCalendar } from 'kosher-zmanim'
import { useMikvaEngine } from './lib/useMikvaEngine'
import { useLocation, useNow } from './lib/useEnv'
import { shouldAskPregnancy, cycleForDate, effectivePhaseFor, getDayStatus } from './lib/status'
import { evaluateCleanDays } from './lib/cleanDaysEngine'
import { daysBetween } from './lib/hebrewCalendar'
import DaySheet from './sheets/DaySheet'
import SettingsSheet from './sheets/SettingsSheet'
import PregnancyPrompt from './sheets/PregnancyPrompt'

// מצב משותף לכל המסכים: נתוני המנוע ההלכתי, מיקום, שעון, וגיליונות גלובליים.
const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const todayCal = useMemo(() => new JewishCalendar(new Date()), [])
  const todayHD = useMemo(
    () => ({ year: todayCal.getJewishYear(), month: todayCal.getJewishMonth(), day: todayCal.getJewishDayOfMonth() }),
    [todayCal],
  )

  // החודש שמוצג בלוח קובע עד איפה מתרחבת סדרת העונה הבינונית
  const [viewHD, setViewHD] = useState(todayHD)
  const engine = useMikvaEngine(viewHD)
  const location = useLocation()
  const now = useNow(1000)

  const [dayHD, setDayHD] = useState(null)         // היום שנפתח ב-DaySheet
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pregOpen, setPregOpen] = useState(false)
  const pregAsked = useRef(false)

  useEffect(() => {
    if (!engine.dataLoaded) return
    const ask = shouldAskPregnancy(engine.cycle)
    if (ask && !pregAsked.current) {
      pregAsked.current = true
      setPregOpen(true)
    } else if (!ask) {
      setPregOpen(false)
    }
  }, [engine.dataLoaded, engine.cycle])

  // הגדרת horizon: לא לרדת מתחת להיום
  // (פונקציה יציבה + השוואת ערכים, כדי שהשעון של כל שנייה לא יפעיל מחדש את חישוב הלוח)
  const setViewMonth = useCallback((hd) => {
    const next = daysBetween(todayHD, hd) < 0 ? todayHD : hd
    setViewHD((cur) => (cur.year === next.year && cur.month === next.month && cur.day === next.day ? cur : next))
  }, [todayHD])

  const value = {
    ...engine, location, now, todayCal, todayHD,
    openDay: setDayHD, openSettings: () => setSettingsOpen(true), setViewMonth,
  }

  // נתוני DaySheet לתאריך הנבחר
  const dayStatus = dayHD ? getDayStatus(dayHD, engine.sightings, engine.cycles, engine.vesetMap) : null
  const dayCycle  = dayHD ? cycleForDate(engine.cycles, dayHD) : null
  const dayClean  = useMemo(() => evaluateCleanDays(dayCycle?.cleanDays ?? []), [dayCycle])
  const dayPhase  = dayCycle ? effectivePhaseFor(dayCycle) : engine.effectivePhase

  return (
    <Ctx.Provider value={value}>
      {children}
      {dayHD && (
        <DaySheet
          hd={dayHD}
          status={dayStatus}
          cycle={dayCycle}
          cleanState={dayClean}
          sightings={engine.sightings}
          vesetConcerns={engine.vesetConcerns}
          location={location}
          phase={dayPhase}
          onClose={() => setDayHD(null)}
          onRefresh={engine.refresh}
        />
      )}
      {settingsOpen && (
        <SettingsSheet cycle={engine.cycle} onClose={() => setSettingsOpen(false)} onRefresh={engine.refresh} />
      )}
      {pregOpen && (
        <PregnancyPrompt cycle={engine.cycle} onRefresh={engine.refresh} onClose={() => setPregOpen(false)} />
      )}
    </Ctx.Provider>
  )
}
