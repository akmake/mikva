// ── סוגי ראייה — פרק כד, סעיפים ג–ה (F-01..F-05) ──────────────────────────────
//
// רק ראיות דאורייתא נכנסות לחישובי הווסתות. כתם / בתולים / לידה / הפלה
// מטמאים אך אינם משפיעים על חישובי הווסת (לא יוצרים חשש ולא קוטעים הפלגה).

export const SOURCE_TYPE = {
  VESET:        'veset',         // ראיה רגילה / דם בהרגשה — דאורייתא
  BEDIKA:       'bedika',        // דם בבדיקה בעד בדוק — דאורייתא
  KINUACH:      'kinuach',       // דם בקינוח (לא בעומק) — מקילים בלא קבוע (כד,ג)
  KESEM:        'kesem',         // כתם — דרבנן (כד,ד)
  BESULIM:      'besulim',       // דם בתולים (כד,ד)
  LEIDA:        'leida',         // דם לידה (כד,ה)
  HAFLATA:      'haflata',       // דם הפלה (כד,ה)
  DOCTOR_SAFEK: 'doctor_safek',  // בדיקת רופא שמטמאה רק מספק (כד,ג)
}

export const SOURCE_LABEL = {
  veset:        'ראיה',
  bedika:       'בדיקה',
  kinuach:      'קינוח',
  kesem:        'כתם',
  besulim:      'דם בתולים',
  leida:        'דם לידה',
  haflata:      'הפלה',
  doctor_safek: 'בדיקת רופא (ספק)',
}

// סוגים שנכנסים לחישובי הווסתות (דאורייתא ודאי)
const COUNTING = new Set([SOURCE_TYPE.VESET, SOURCE_TYPE.BEDIKA])

/**
 * האם ראייה זו נחשבת לחישובי הווסתות.
 * ברירת מחדל (כשאין שדה) = 'veset' לתאימות לאחור עם נתונים ישנים.
 *
 * הערה: קינוח (F-04) — לכתחילה מקילים שלא לחשוש בווסת שאינו קבוע;
 * לעת עתה איננו מחשיבים אותו. יוקל/יוחמר לפי הגדרה בשלב מאוחר יותר.
 */
export function countsForVeset(sighting) {
  const t = sighting?.sourceType ?? SOURCE_TYPE.VESET
  return COUNTING.has(t)
}
