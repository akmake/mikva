// ── מנוע ווסת הדילוג — פרק כד, סעיפים פג–צה (V-80..V-88) ──────────────────────
//
// דילוג = פרוגרסיה שווה. שני סוגים עיקריים:
//   • דילוג ימי החודש (פד): חודשים עוקבים, היום עולה/יורד ב-Δ קבוע
//     (ט"ו,ט"ז,י"ז,י"ח → Δ=+1; או לאחור ט"ו,י"ד,י"ג → Δ=-1).
//   • דילוג בהפלגות (פו): ההפלגות עולות ב-Δ קבוע (20,21,22,23).
//
// ספים (V-80,87): הראייה/הפלגה הראשונה אינה "דילוג", ולכן —
//   ימי חודש:  4 ראיות = קבוע, 3 = לחומרא.
//   הפלגות:    4 הפלגות = קבוע, 3 = לחומרא.
// דילוג נחשב רק אחרי שנקבע (V-84) — מתקיים מאליו (חשש נוצר רק מ-3 ומעלה).
//
// טרם מומש (ראה מפה): דילוג בעונות (פה), נפקעה בסוף החודש (V-85/צא),
// דילוג שהפך הפלגה שווה (V-87/צד), שינוי ראיות (V-86), אדר.

import {
  addHebrewDays,
  nextHebrewMonth,
  daysInHebrewMonth,
} from '../hebrewCalendar.js'
import { haflagaInterval } from './haflagahEngine.js'

function isNextMonth(prevHD, curHD) {
  const nm = nextHebrewMonth(prevHD.year, prevHD.month)
  return nm.year === curHD.year && nm.month === curHD.month
}

// ── דילוג ימי החודש ──────────────────────────────────────────────────────────
function monthDilug(counting) {
  const n = counting.length
  if (n < 3) return null
  const last = counting[n - 1]
  const onah = last.onah
  const chain = [last]
  let delta = null

  for (let i = n - 2; i >= 0; i--) {
    const prev = counting[i], cur = counting[i + 1]
    if (prev.onah !== onah || cur.onah !== onah) break
    if (!isNextMonth(prev.hebrewDate, cur.hebrewDate)) break
    const d = cur.hebrewDate.day - prev.hebrewDate.day
    if (d === 0) break                  // Δ=0 → ווסת חודש, לא דילוג
    if (delta === null) delta = d
    else if (d !== delta) break
    chain.unshift(prev)
  }

  if (chain.length < 3) return null

  const nm = nextHebrewMonth(last.hebrewDate.year, last.hebrewDate.month)
  const nextDay = last.hebrewDate.day + delta
  if (nextDay < 1 || nextDay > daysInHebrewMonth(nm.year, nm.month)) return null // נפקע (V-85)

  return {
    kind: 'month',
    delta,
    onah,
    count: chain.length,
    hebrewDate: { year: nm.year, month: nm.month, day: nextDay },
  }
}

// ── דילוג בהפלגות ────────────────────────────────────────────────────────────
function haflagahDilug(counting, method, hefsekMap) {
  const n = counting.length
  if (n < 4) return null               // ≥3 הפלגות = ≥4 ראיות
  const last = counting[n - 1]
  const onah = last.onah

  const intervals = []
  for (let i = 1; i < n; i++) {
    intervals.push(haflagaInterval(counting[i - 1], counting[i], method, hefsekMap))
  }

  const chain = [intervals[intervals.length - 1]]
  let delta = null
  let k = intervals.length - 2
  for (; k >= 0; k--) {
    // העונה של כל הראיות המעורבות חייבת להיות זהה
    if (counting[k].onah !== onah || counting[k + 1].onah !== onah) break
    const d = intervals[k + 1] - intervals[k]
    if (d === 0) break                  // Δ=0 → הפלגה רגילה
    if (delta === null) delta = d
    else if (d !== delta) break
    chain.unshift(intervals[k])
  }

  if (chain.length < 3) return null     // צריך ≥3 הפלגות בדילוג

  const nextInterval = chain[chain.length - 1] + delta
  if (nextInterval <= 0) return null

  return {
    kind: 'haflagah',
    delta,
    onah,
    count: chain.length,                // מספר ההפלגות בדילוג
    interval: nextInterval,
    hebrewDate: addHebrewDays(last.hebrewDate, nextInterval),
  }
}

/**
 * חששות דילוג פעילים. count≥4 → קבוע; count==3 → לחומרא (V-87).
 */
export function computeDilugConcerns(counting, method = 'nohag', hefsekMap = {}, isMesulekes = false) {
  if (!counting || counting.length < 3) return []
  const out = []

  const m = monthDilug(counting)
  if (m) {
    const kavua = !isMesulekes && m.count >= 4
    out.push({
      type:       'dilog',
      id:         `dilog_month_${m.delta}_${m.onah}`,
      label:      `ווסת הדילוג — ימי החודש (${m.delta > 0 ? '+' : ''}${m.delta})`,
      hebrewDate:  m.hebrewDate,
      onah:        m.onah,
      isKavua:     kavua,
      isLechumra:  !kavua,
      kavuaCount:  m.count,
      dilugKind:   'month',
      dilugDelta:  m.delta,
      canUproot:   true,
      relatedSightingId: counting[counting.length - 1]._id,
    })
  }

  const h = haflagahDilug(counting, method, hefsekMap)
  if (h) {
    const kavua = !isMesulekes && h.count >= 4
    out.push({
      type:       'dilog',
      id:         `dilog_haflagah_${h.delta}_${h.onah}`,
      label:      `ווסת הדילוג — הפלגה (${h.delta > 0 ? '+' : ''}${h.delta})`,
      hebrewDate:  h.hebrewDate,
      onah:        h.onah,
      isKavua:     kavua,
      isLechumra:  !kavua,
      kavuaCount:  h.count,
      dilugKind:   'haflagah',
      dilugDelta:  h.delta,
      dilugInterval: h.interval,
      canUproot:   true,
      relatedSightingId: counting[counting.length - 1]._id,
    })
  }

  return out
}
