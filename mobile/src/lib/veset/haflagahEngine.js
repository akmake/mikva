// ── מנוע ווסת ההפלגה — פרק כד, סעיפים מה–נא (V-30..V-45) ──────────────────────
//
// העיקרון (כד,מו): הפלגה = מספר הימים שבהם המעיין סתום, הנמדד מ"סוף" הראייה
// הקודמת (שוע"ר) או מ"תחילתה" (נוהג) עד תחילת הראייה הבאה. מכיוון שהיא תמיד
// נמדדת מהראייה האחרונה, כל החששות הפעילים מעוגנים בה — ולכן מפתח-המצב היחיד
// הוא ערך ה-interval.
//
// ⭐ הלוז של "שני ימי חשש" (כד,מח–מט):
//   בכל ראייה חדשה, interval = המרחק מהראייה הקודמת.
//   • interval ישן d <  interval חדש  → יום החשש הקצר עבר בנקיות → נעקר.
//   • interval ישן d >  interval חדש  → ראתה לפני יום החשש הארוך → לא נעקר, נישא (carry).
//   • interval ישן d == interval חדש  → ראתה ביום החשש → נצפה, מתקדם לקביעה.
//
//   קביעה (כד,מה): נצפה 3 פעמים בלי שנעקר בינתיים. מכיוון שעקירה מוחקת
//   את ה-interval מהמפה, עצם הישארותו במפה עם seenCount≥3 = 3 פעמים רצופות
//   ללא עקירה = ווסת קבוע (מכסה גם את הקבוע-הארוך של כד,נ).
//
//   עקירת קבוע (כד,סב) דורשת 3 החמצות (לא אחת).

import { addHebrewDays, daysBetween } from '../hebrewCalendar.js'

/** מרחק ההפלגה בין שתי ראיות, לפי השיטה. */
export function haflagaInterval(prev, cur, method, hefsekMap = {}) {
  if (method === 'shuar') {
    // מסוף ראייה = ליל טבילה / הפסק טהרה. בהיעדר הפסק רשום → סוף 7 ימי נידה.
    const end = hefsekMap[prev._id] ?? addHebrewDays(prev.hebrewDate, 7)
    return daysBetween(end, cur.hebrewDate)
  }
  // נוהג: מתחילת ראייה לתחילת ראייה
  return daysBetween(prev.hebrewDate, cur.hebrewDate)
}

/**
 * החזרת רשימת חששות הפלגה פעילים, מעוגנים בראייה האחרונה.
 *
 * @param {Array}   counting   ראיות שנכנסות לחישוב (מסוננות, מסודרות עולה)
 * @param {string}  method     'shuar' | 'nohag'
 * @param {object}  hefsekMap  { sightingId → hebrewDate } לסוף ראייה (שוע"ר)
 * @param {boolean} isMesulekes מסולקת מדמים → אינה קובעת ווסת
 */
export function computeHaflagahConcerns(counting, method, hefsekMap = {}, isMesulekes = false) {
  if (!counting || counting.length < 2) return []

  // interval → { interval, seenCount, onah }
  const active    = new Map()
  const everKavua = new Set() // intervalים שהיו קבועים אי-פעם (לחזרה לקביעות — V-63)

  const isKavuaInterval = (d, info) =>
    (info?.seenCount ?? 0) >= 3 || everKavua.has(d)

  for (let i = 1; i < counting.length; i++) {
    const interval = haflagaInterval(counting[i - 1], counting[i], method, hefsekMap)
    if (interval <= 0) continue // ראייה בתוך 7 ימים (מעיין פתוח) — אין הפלגה חדשה

    const curOnah = counting[i].onah

    // עיבוד החששות הפעילים מול הראייה הנוכחית
    for (const [d, info] of [...active]) {
      if (d === interval) continue            // נצפה — מטופל למטה
      if (d < interval) {
        // יום החשש הקצר עבר בנקיות:
        //   לא-קבוע → נעקר בפעם אחת (כד,מח).
        //   קבוע → אינו נעקר ע"י עבירת היום אלא ע"י בדיקה (כד,סג — V-60),
        //          לכן נישא הלאה (וכך חוששת לקבוע וגם לחדש — V-61).
        if (!isKavuaInterval(d, info)) active.delete(d)
      }
      // d > interval → הקדימה לראות → נישא (carry), ללא שינוי (כד,מט)
    }

    // הוספה/עדכון. חזרה לראות ב-interval שהיה קבוע מחזירה קביעות מיד (V-63).
    const info = active.get(interval) ?? { interval, seenCount: 0 }
    info.seenCount += 1
    info.onah = curOnah
    active.set(interval, info)
    if (info.seenCount >= 3) everKavua.add(interval)
  }

  const last = counting[counting.length - 1]
  const primaryInterval = haflagaInterval(
    counting[counting.length - 2], last, method, hefsekMap,
  )

  // עוגן הניבוי חייב להתאים לעוגן המדידה: בשוע"ר ה-interval נמדד מ*ההפסק* של
  // הראייה, ולכן גם יום החשש הבא נספר מ*ההפסק האחרון* + interval (לא מתחילת
  // הראייה). בנוהג — מתחילת הראייה. חוסר התאמה כזה הקדים את החשש ב"ימי המתנה+הפסק".
  const anchor = method === 'shuar'
    ? (hefsekMap[last._id] ?? addHebrewDays(last.hebrewDate, 7))
    : last.hebrewDate

  const out = []
  for (const [interval, info] of active) {
    out.push({
      type:        'haflagah',
      interval,
      method,
      onah:        info.onah ?? last.onah,
      hebrewDate:  addHebrewDays(anchor, interval),
      isKavua:     !isMesulekes && isKavuaInterval(interval, info),
      kavuaCount:  info.seenCount,
      isPrimary:   interval === primaryInterval,
      relatedSightingId: last._id,
    })
  }
  return out
}
