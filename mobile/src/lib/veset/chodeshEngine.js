// ── מנוע ווסת החודש — פרק כד, סעיפים לד–מד (V-20..V-28) ───────────────────────
//
// "יום כגורם": החשש קשור ליום מסויים בחודש, ואינו זז עם הקדמת ראייה (כד,לט).
//
// ⭐ carry-forward (כד,כג–לט): ראתה מוקדם מיום החשש → היום הישן **לא נעקר**,
// חוששת לשניהם. עקירה רק כשיום החשש עצמו עבר בנקיות (כד,לח: לא-קבוע פעם
// אחת; כד,סב: קבוע 3).
//
// V-24 (כד,מ): ראתה לפני יום החשש ו**נמשכה ראייתה לתוכו** → הדם על יום החשש
// הוא "המשך" ולא תחילת ראייה → יום החשש **נעקר** (קבוע: עקירה אחת מתוך 3).
// משך הדימום נגזר מהראייה (תחילה) עד ההפסק טהרה (סוף) — בלי שדה נוסף.
// (V-25 פסקה-וחזרה — דורש סימון מפורש; טרם מומש.)
//
// ל' בחודש חסר (כד,לה — V-22), הגדרה day30Policy:
//   • 'tzemach_tzedek' (ברירת מחדל) — ראיית ל' שהחודש שאחריה חסר אינה יוצרת
//     חשש חודש כלל (גם לא בחודשים מלאים שאחריה).
//   • 'rosh_chodesh' — חוששת בר"ח של החודש שאחרי החסר.

import {
  daysInHebrewMonth,
  nextHebrewMonth,
  chronCompare,
} from '../hebrewCalendar.js'

const ONAH_RANK = { night: 0, day: 1 }

/** השוואה כרונולוגית כולל עונה (לילה לפני יום באותו תאריך). */
function before(aHD, aOnah, bHD, bOnah) {
  const c = chronCompare(aHD, bHD)
  if (c !== 0) return c < 0
  return (ONAH_RANK[aOnah] ?? 1) < (ONAH_RANK[bOnah] ?? 1)
}

/** המופע הבא של יום החודש, כרונולוגית אחרי afterHD (או null אם נפקע). */
export function nextOccurrenceAfter(afterHD, canonicalDay, policy = 'tzemach_tzedek') {
  // יום ≤ כ"ט קיים בכל חודש → פשוט החודש הבא
  if (canonicalDay <= 29) {
    const nm = nextHebrewMonth(afterHD.year, afterHD.month)
    return { year: nm.year, month: nm.month, day: canonicalDay }
  }
  // יום ל' — תלוי אם החודש הבא מלא
  const nm = nextHebrewMonth(afterHD.year, afterHD.month)
  if (daysInHebrewMonth(nm.year, nm.month) >= 30) {
    return { year: nm.year, month: nm.month, day: 30 }
  }
  // החודש הבא חסר (כ"ט בלבד):
  if (policy === 'rosh_chodesh') {
    const nm2 = nextHebrewMonth(nm.year, nm.month)
    return { year: nm2.year, month: nm2.month, day: 1 } // "שם ר"ח הגורם"
  }
  return null // צמח צדק — נפקע לגמרי
}

/**
 * חישוב חששות ווסת החודש הפעילים מכל ההיסטוריה.
 *
 * @param {Array}  counting  ראיות מסוננות, מסודרות עולה
 * @param {object} opts      { isMesulekes, day30Policy, hefsekMap }
 *   hefsekMap: { sightingId → hebrewDate } — תאריך הפסק טהרה (סוף דימום, ל-V-24)
 */
export function computeChodeshConcerns(counting, opts = {}) {
  const {
    isMesulekes = false,
    day30Policy = 'tzemach_tzedek',
    hefsekMap   = {},
  } = opts
  if (!counting || counting.length === 0) return []

  // key `${canonicalDay}|${onah}` → { canonicalDay, onah, seenCount, uprootCount, nextDate, lastId }
  const active    = new Map()
  const everKavua = new Set() // ימים שהיו קבועים אי-פעם (חזרה לקביעות — V-63)

  const isKavuaConcern = (key, c) =>
    (c?.seenCount ?? 0) >= 3 || everKavua.has(key)

  // עקירה אחת. מחזיר true אם החשש שרד.
  //   bedikaRequired=true  → עבירת יום סתם: קבוע אינו נעקר אלא בבדיקה (כד,סג, V-60) → נישא.
  //   bedikaRequired=false → המשך ראייה (V-24): קבוע נעקר עקירה אחת מתוך 3 (כד,מ).
  function applyMiss(key, c, bedikaRequired) {
    if (isKavuaConcern(key, c)) {
      if (bedikaRequired) return true            // נישא (V-60/V-61)
      c.uprootCount += 1
      if (c.uprootCount >= 3) { active.delete(key); return false }
      return true
    }
    active.delete(key)                           // לא-קבוע — עקירה מיידית (כד,לח)
    return false
  }

  for (const K of counting) {
    const KHD  = K.hebrewDate
    const KKey = `${KHD.day}|${K.onah}`
    const H    = hefsekMap[K._id]    // סוף הדימום (V-24)

    for (const [key, c] of [...active]) {
      // 1. החמצות: מופעים שעברו בנקיות *לפני* תחילת הראייה הנוכחית (דורש בדיקה)
      let guard = 0
      while (c.nextDate && before(c.nextDate, c.onah, KHD, K.onah) && guard++ < 60) {
        if (!applyMiss(key, c, true)) break
        c.nextDate = nextOccurrenceAfter(c.nextDate, c.canonicalDay, day30Policy)
      }
      if (!active.has(key)) continue

      // 2. V-24: יום החשש נופל *בתוך* הדימום (תחילה < יום החשש ≤ הפסק) → המשך → עקירה
      if (H && key !== KKey && c.nextDate &&
          chronCompare(c.nextDate, KHD) > 0 && chronCompare(c.nextDate, H) <= 0) {
        if (applyMiss(key, c, false)) {
          c.nextDate = nextOccurrenceAfter(c.nextDate, c.canonicalDay, day30Policy)
        }
      }
    }

    // 3. ראייה ביום זה → קביעה/חיזוק או יצירת חשש חדש
    const existing = active.get(KKey)
    if (existing) {
      existing.seenCount  += 1
      existing.uprootCount = 0
      existing.nextDate    = nextOccurrenceAfter(KHD, existing.canonicalDay, day30Policy)
      existing.lastId      = K._id
    } else {
      active.set(KKey, {
        canonicalDay: KHD.day,
        onah:         K.onah,
        seenCount:    1,
        uprootCount:  0,
        nextDate:     nextOccurrenceAfter(KHD, KHD.day, day30Policy),
        lastId:       K._id,
      })
    }
    if (active.get(KKey).seenCount >= 3) everKavua.add(KKey)
  }

  const out = []
  for (const [key, c] of active) {
    if (!c.nextDate) continue // נפקע (צמח צדק — ל' בחודש חסר)
    out.push({
      type:         'chodesh',
      canonicalDay: c.canonicalDay,
      onah:         c.onah,
      hebrewDate:   c.nextDate,
      isKavua:      !isMesulekes && isKavuaConcern(key, c),
      kavuaCount:   c.seenCount,
      relatedSightingId: c.lastId,
    })
  }
  return out
}
