import { hebrewDateEquals, daysBetween, todayHebrew } from './hebrewCalendar'
import {
  plannedMikvehDay,
  daysUntilHefsekAllowed,
  currentCleanDayNumber,
  derivePhase,
} from './cycleCalculator'
import { evaluateCleanDays } from './cleanDaysEngine'
import { DAY_LETTERS } from './hebrewText'
import { MONTH_NAMES } from './hebrewCalendar'

// ═══════════════════════════════════════════════════════════════════════════
// לוגיקת מצב היום — הועברה מ-Dashboard.jsx (הלוגיקה ההלכתית זהה; רק שכבת
// הצבע הוחלפה בשמות "גוון" סמנטיים שה-UI ממפה לצבעי מערכת העיצוב).
// ═══════════════════════════════════════════════════════════════════════════

// ה-onset (הדם הראשון) של נידה, כתאריך עברי.
function cycleOnset(c) {
  return c?.latestSighting?.hebrewDate ?? c?.bleedings?.[0]?.hebrewDate ?? null
}

// הנידה ש*מכסה* תאריך עברי נתון = זו עם ה-onset המאוחר ביותר שעדיין ≤ hd.
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

// ה-onset של הנידה הבאה — תוחם את טווח הטומאה של נידה שטרם תועד לה הפסק.
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

// ה-phase האפקטיבי של נידה מסוימת (פר-נידה, זהה ללוגיקה ב-useMikvaEngine).
export function effectivePhaseFor(cycle) {
  const phase = derivePhase(cycle)
  if (phase !== 'counting_7') return phase
  const cs = evaluateCleanDays(cycle?.cleanDays ?? [])
  if (cs.status === 'blocked') return 'blocked'
  if (cs.complete)             return 'waiting_mikveh'
  return 'counting_7'
}

// ── מצב יום בלוח ────────────────────────────────────────────────────────────
// מחזיר גוון נפרד לחצי הלילה ולחצי היום, וסוג יום (type) לפעולות ב-DaySheet.
export function getDayStatus(hd, sightings, cycles, vesetMap) {
  const cycle      = cycleForDate(cycles, hd)
  const cleanState = evaluateCleanDays(cycle?.cleanDays ?? [])
  const k = `${hd.year}-${hd.month}-${hd.day}`
  const allConcerns = vesetMap[k] ?? []
  const shownConcerns = allConcerns.filter(c => !c.uprooted)
  const activeConcerns = shownConcerns.filter(c => !c.passed)
  const passedConcerns = shownConcerns.filter(c => c.passed)
  const byOnah = (arr, o) => arr.filter(c => c.onah === o || c.onah === 'full_day')
  const nightConcerns = byOnah(activeConcerns, 'night')
  const dayConcerns   = byOnah(activeConcerns, 'day')
  const nightPassed   = byOnah(passedConcerns, 'night')
  const dayPassed     = byOnah(passedConcerns, 'day')
  const base = { nightConcerns, dayConcerns, nightPassed, dayPassed, dayNum: null, mikvehOverdue: false }

  // ── ראייה: צובעת רק את העונה שבה נראתה ──
  const daySightings = sightings.filter(s => hebrewDateEquals(s.hebrewDate, hd))
  if (daySightings.length > 0) {
    let night = 'none', day = 'none'
    for (const s of daySightings) {
      if (s.onah === 'night') night = 'blood'
      else if (s.onah === 'day') day = 'blood'
      else { night = 'blood'; day = 'bloodMid' }
    }
    return { ...base, nightTone: night, dayTone: day, type: 'sighting' }
  }

  // ── ימי טומאה: מהראייה הראשונה ועד ההפסק טהרה האחרון ──
  if (cycle?.latestSighting?.hebrewDate) {
    const onset      = cycle.latestSighting.hebrewDate
    const hefsekHD   = cycle?.hefsekTahara?.hebrewDate
    const afterOnset = daysBetween(onset, hd) > 0
    const nextOnset  = nextOnsetAfter(cycles, cycle)
    const withinOpen = nextOnset
      ? daysBetween(hd, nextOnset) > 0
      : daysBetween(hd, todayHebrew()) >= 0
    const inTamei = hefsekHD
      ? afterOnset && daysBetween(hd, hefsekHD) > 0
      : afterOnset && (cycle.phase === 'waiting_5_days' || cycle.phase === 'waiting_hefsek') && withinOpen
    if (inTamei) {
      return { ...base, nightTone: 'bloodTint', dayTone: 'bloodWash', type: 'waiting' }
    }
  }

  if (cycle?.hefsekTahara?.hebrewDate) {
    const hefsekHD = cycle.hefsekTahara.hebrewDate

    // הפסק טהרה — ביום; הלילה עדיין "זנב ההמתנה"
    if (hebrewDateEquals(hefsekHD, hd)) {
      return { ...base, nightTone: 'bloodWash', dayTone: 'hefsek', type: 'hefsek' }
    }

    // 7 נקיים
    const diff = daysBetween(hefsekHD, hd)
    if (diff >= 1 && diff <= 7) {
      const rec = (cycle.cleanDays ?? []).find(d => d.dayNumber === diff)
      if (rec && (rec.morningCheck === 'stain' || rec.eveningCheck === 'stain')) {
        return { ...base, nightTone: 'bloodMid', dayTone: 'bloodTint', type: 'clean_blocked', dayNum: diff }
      }
      const isTovel = cleanState?.complete && cleanState.tovelDay === diff
      return {
        ...base,
        nightTone: isTovel ? 'countDeep' : 'countTint',
        dayTone:   isTovel ? 'countTint' : 'countWash',
        type: isTovel ? 'clean_7' : 'clean',
        dayNum: diff,
      }
    }

    // ליל הטבילה — מסומן ברגע שיש הפסק טהרה (ברירת מחדל יום 7). עונת לילה בלבד.
    const tovelDay = cleanState?.complete ? cleanState.tovelDay : 7
    const mikvehHD = plannedMikvehDay(hefsekHD, tovelDay)
    if (hebrewDateEquals(mikvehHD, hd)) {
      const done = !!cycle.mikveDate?.actual
      return {
        ...base,
        nightTone: done ? 'mikveh' : 'mikvehTint',
        dayTone: 'none',
        type: done ? 'mikveh' : 'mikveh_planned',
      }
    }
  }

  // עברה ליל הטבילה המתוכנן וטרם נרשמה טבילה — נקודת אזהרה
  const mikvehOverdue = !!(
    cycle?.hefsekTahara?.hebrewDate && !cycle?.mikveDate?.actual && cycle.status !== 'completed' &&
    daysBetween(plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState?.complete ? cleanState.tovelDay : 7), hd) > 0
  )

  // חשש ווסת (פעיל)
  if (nightConcerns.length > 0 || dayConcerns.length > 0) {
    return {
      ...base, mikvehOverdue, type: 'concern',
      nightTone: nightConcerns.length ? 'concernTint' : (nightPassed.length ? 'passedTint' : 'none'),
      dayTone:   dayConcerns.length   ? 'concernWash' : (dayPassed.length   ? 'passedWash' : 'none'),
    }
  }

  // חשש שעבר (היסטורי)
  if (nightPassed.length > 0 || dayPassed.length > 0) {
    return {
      ...base, mikvehOverdue, type: 'concern_passed',
      nightTone: nightPassed.length ? 'passedTint' : 'none',
      dayTone:   dayPassed.length   ? 'passedWash' : 'none',
    }
  }

  // ימי טהרה רגילים: אחרי טבילה בפועל, או כשאין נידה שמכסה את היום
  if (!cycle || !!cycle?.mikveDate?.actual) {
    return { ...base, mikvehOverdue, nightTone: 'tahorTint', dayTone: 'tahorWash', type: 'tahorah' }
  }

  return { ...base, mikvehOverdue, nightTone: 'none', dayTone: 'none', type: 'normal' }
}

// ── מצבי תהליך (תוויות) ─────────────────────────────────────────────────────
// level: red = אסורה · amber = חשש · green = טהורה
export const PHASES = {
  tahorah:        { label: 'טהורה',                    tone: 'tahor' },
  waiting_5_days: { label: 'ימי המתנה',                tone: 'blood' },
  waiting_hefsek: { label: 'ממתינה להפסק טהרה',        tone: 'hefsek' },
  counting_7:     { label: 'ספירת 7 נקיים',            tone: 'count' },
  waiting_mikveh: { label: 'מוכנה לטבילה',             tone: 'mikveh' },
  blocked:        { label: 'נמצא דם — הספירה נפסקה',   tone: 'blood' },
}

// שורת פירוט קצרה ליד שם המצב
export function phaseDetailText(cycle, effectivePhase, cleanState) {
  if (!cycle) return null
  if (effectivePhase === 'waiting_5_days' && cycle.latestSighting) {
    const d = daysUntilHefsekAllowed(cycle.latestSighting.hebrewDate)
    return d === 0 ? 'הפסק טהרה אפשרי היום' : `עוד ${d} ימים להפסק טהרה`
  }
  if (effectivePhase === 'blocked') return 'יש לעשות הפסק טהרה חדש ולהתחיל ספירה'
  if (effectivePhase === 'counting_7' && cycle.hefsekTahara) {
    const n = currentCleanDayNumber(cycle.hefsekTahara.hebrewDate)
    return n ? `יום ${n} מתוך 7` : null
  }
  if (effectivePhase === 'waiting_mikveh' && cycle.hefsekTahara) {
    const m = plannedMikvehDay(cycle.hefsekTahara.hebrewDate, cleanState.tovelDay)
    return `מקווה: ליל ${DAY_LETTERS[m.day]} ${MONTH_NAMES[m.month]}`
  }
  return null
}

// ── חפיפה — הכנה לטבילה (מקורות/יח,יט) — תיעוד בלבד ─────────────────────────
// שתי קבוצות: מה להסיר/לנקות לפני הטבילה, ומה לקחת למקווה. המפתחות נשמרים בנידה
// (chafifaChecklist), ולכן מפתחות קיימים לא משתנים — רק נוספים חדשים.
export const CHAFIFA_GROUPS = [
  {
    key: 'remove',
    title: 'להסיר ולנקות לפני הטבילה',
    items: [
      { key: 'bath',      label: 'רחיצה במים חמים, כולל אזורי השיער' },
      { key: 'comb',      label: 'חפיפה וסירוק השיער במסרק' },
      { key: 'teeth',     label: 'ניקוי שיניים — צחצוח וחוט דנטלי' },
      { key: 'nails',     label: 'גזיזה וניקוי ציפורניים, ידיים ורגליים' },
      { key: 'polish',    label: 'הסרת לק, לק ג׳ל וציפורניים מלאכותיות' },
      { key: 'makeup',    label: 'הסרת איפור: פנים, עיניים ושפתיים' },
      { key: 'jewelry',   label: 'הסרת תכשיטים: טבעות, עגילים, צמידים, ריסים תותבים' },
      { key: 'earHoles',  label: 'ניקוי חורי העגילים' },
      { key: 'lenses',    label: 'הסרת עדשות מגע' },
      { key: 'plasters',  label: 'הסרת פלסטרים, תחבושות ומדבקות' },
      { key: 'hairItems', label: 'הסרת גומיות, סיכות ומוצרי שיער' },
      { key: 'folds',     label: 'ניקוי בית הקמטים ובית הסתרים' },
      { key: 'eyesEars',  label: 'ניקוי עיניים, אף ואוזניים' },
      { key: 'recheck',   label: 'בדיקה חוזרת של הגוף סמוך לטבילה' },
    ],
  },
  {
    key: 'bring',
    title: 'לקחת איתי למקווה',
    items: [
      { key: 'bringTowel',   label: 'מגבת' },
      { key: 'bringRobe',    label: 'חלוק או בגד נוח ללבישה' },
      { key: 'bringClothes', label: 'בגדים להחלפה אחרי הטבילה' },
      { key: 'bringComb',    label: 'מסרק או מברשת שיער' },
      { key: 'bringBag',     label: 'תיק או שקית לבגדים ולחפצים' },
      { key: 'bringBooking', label: 'תיאום מראש עם המקווה (אם נדרש)' },
    ],
  },
]
export const CHAFIFA_ITEMS = CHAFIFA_GROUPS.flatMap((g) => g.items)

// ── שאלת הריון ──────────────────────────────────────────────────────────────
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
