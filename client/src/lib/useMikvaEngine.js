import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from './api'
import { derivePhase } from './cycleCalculator'
import { evaluateCleanDays } from './cleanDaysEngine'
import { computeVesetConcerns } from './vesetCalculator'
import { mesulekesWindows } from './veset/mesulekes'

// ── Shared data + halachic engine ───────────────────────────────────────────
// Single source of truth for the cycle data and every derived value the UI
// needs (phase, clean-day state, veset concerns). Both the Dashboard ("/") and
// the Hebrew calendar page ("/calendar") consume this so their behaviour stays
// identical.

export function useMikvaEngine() {
  const [cycle,        setCycle]        = useState(null)
  const [sightings,    setSightings]    = useState([])
  const [observations, setObservations] = useState([])
  const [dataLoaded,   setDataLoaded]   = useState(false)
  const [error,        setError]        = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [c, s, obs] = await Promise.all([
        api.getCycle(),
        api.getSightings(),
        api.getVesetObservations(),
      ])
      setCycle(c); setSightings(s); setObservations(obs)
    } catch (err) { setError(err.message) }
    finally { setDataLoaded(true) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const phase = useMemo(() => derivePhase(cycle), [cycle])

  // ── מנוע 7 נקיים (evaluateCleanDays) — חלון [ראשון,שביעי] כולל איפוס על דם ──
  const cleanState = useMemo(
    () => evaluateCleanDays(cycle?.cleanDays ?? []),
    [cycle],
  )

  // Phase אפקטיבי: בזמן ספירה, מנוע הבדיקות גובר על הדגל הנאיבי של השרת.
  const effectivePhase = useMemo(() => {
    if (phase !== 'counting_7') return phase
    if (cleanState.status === 'blocked') return 'blocked'
    if (cleanState.complete)             return 'waiting_mikveh'
    return 'counting_7'
  }, [phase, cleanState])

  // מפת הפסק טהרה לכל ראייה (לחישובי שוע"ר ולעקירת המשך-ראייה V-24)
  const hefsekMap = useMemo(() => {
    const m = {}
    for (const s of sightings) if (s.hefsekTahara) m[s._id] = s.hefsekTahara
    return m
  }, [sightings])

  const mesulekesWins = useMemo(() => mesulekesWindows(cycle ?? {}), [cycle])

  const isMesulekes = !!(cycle?.isPregnant || cycle?.isMeineket)

  const vesetConcerns = useMemo(
    () => computeVesetConcerns(
      sightings,
      observations,
      cycle?.useShuar ?? false,
      hefsekMap,
      isMesulekes,
      cycle?.day30Policy ?? 'tzemach_tzedek',
      mesulekesWins,
      cycle?.onaBeinonit31 ?? false,
    ),
    [sightings, observations, hefsekMap, mesulekesWins, isMesulekes,
     cycle?.useShuar, cycle?.day30Policy, cycle?.onaBeinonit31],
  )

  const vesetMap = useMemo(() => {
    const map = {}
    for (const c of vesetConcerns) {
      const k = `${c.hebrewDate.year}-${c.hebrewDate.month}-${c.hebrewDate.day}`
      if (!map[k]) map[k] = []
      map[k].push(c)
    }
    return map
  }, [vesetConcerns])

  return {
    cycle, sightings, observations, dataLoaded, error, refresh,
    phase, cleanState, effectivePhase, vesetConcerns, vesetMap,
  }
}
