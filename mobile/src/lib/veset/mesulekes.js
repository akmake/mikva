// ── מסולקת מדמים — פרק כד, סעיפים צו–קה (V-90..V-98) ──────────────────────────
//
// מעוברת: מהחודש הרביעי (90 יום מתחילת ההריון) — V-90.
// מינקת: 24 חודש מהלידה (גם בלי הנקה / קיסרי / מפלת נפל אחרי 40 יום) — V-91,92,99.
//
// השלכות:
//   V-93: אינה קובעת ווסת בימי הסילוק.
//   V-94: עדיין חוששת לעונה בינונית ולווסתות לא-קבועים מראיותיה בימי הסילוק.
//   V-95: חשש שנוצר *לפני* הסילוק ויום החשש חל *בתוך* הסילוק → אינה חוששת.
//
// טרם מומש (ראה מפה): V-96 (חלק מהראיות בסילוק), V-97 (חזרה לקבוע אחרי הסילוק),
// V-98 (תרופות מדכאות/מגרות).

const DAY = 86400000

/**
 * מחזיר רשימת חלונות "מסולקת" (טווחי תאריכים גרגוריאניים) מתוך הגדרות המחזור.
 * @returns {Array<{from:number, to:number}>} זמני epoch (ms)
 */
export function mesulekesWindows(cycle = {}) {
  const wins = []
  const { isPregnant, pregnancyStart, isMeineket, meinaketStart } = cycle

  if (isPregnant && pregnancyStart) {
    const start = new Date(pregnancyStart).getTime()
    // מהחודש הרביעי (90 יום) ועד הלידה המשוערת (~280 יום)
    wins.push({ from: start + 90 * DAY, to: start + 280 * DAY })
  }
  if (isMeineket && meinaketStart) {
    const birth = new Date(meinaketStart)
    const to = new Date(birth); to.setMonth(to.getMonth() + 24) // 24 חודש
    wins.push({ from: birth.getTime(), to: to.getTime() })
  }
  return wins
}

/** האם תאריך גרגוריאני (JS Date / ms) נמצא באחד מחלונות הסילוק. */
export function inMesulekes(windows, gregMs) {
  if (!windows || windows.length === 0) return false
  return windows.some(w => gregMs >= w.from && gregMs <= w.to)
}
