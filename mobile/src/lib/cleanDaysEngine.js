// ── מנוע ספירת שבעה נקיים — פרק יז (C-20..C-30) ───────────────────────────────
//
// בדיעבד (סעיף ח,כב): די בבדיקה נקייה ביום הראשון *וביום השביעי* של חלון 7
// הימים — האמצע מוחזק בחזקת טהרה. לכן ספירה תקפה = קיים חלון [A, A+6] שבו גם
// יום A וגם יום A+6 נבדקו נקי, ואין ביניהם יום שנמצא בו דם.
//
// דוגמאות (סעיפים ח–יג):
//   ראשון+שביעי            → טובלת מוצאי שביעי
//   רק ראשון / רק אמצעיים  → לא הושלם
//   רק שביעי               → שביעי=ראשון חדש, +6 (טובלת מוצאי יום 13)
//   ראשון+שלישי+תשיעי      → שלישי=ראשון, תשיעי=שביעי → מוצאי תשיעי
//
// ⚠️ טרם מומש (סעיף יב, C-26 — סוגיית הנוב"י): גישור ≤5 ימים (ראשון+שלישי+שמיני
// → טבילה מוקדמת יותר). המודל כאן *שמרני* — לכל היותר דורש ימים נוספים, ולעולם
// אינו מקדים טבילה שלא כדין. דורש עיון בטקסט הנקי לפני יישום ההקלה.

/** האם ביום זה נעשתה בדיקה נקייה (די באחת — בוקר או ערב, סעיף ח). */
function isCleanDay(d) {
  return d.morningCheck === 'clean' || d.eveningCheck === 'clean'
}
/** האם ביום זה נמצא דם (בדיקה טמאה) — חוסם חלון. */
function isBlockedDay(d) {
  return d.morningCheck === 'stain' || d.eveningCheck === 'stain'
}

/**
 * הערכת מצב ספירת שבעה נקיים.
 * @param {Array} cleanDays  [{ dayNumber(1-מבוסס מההפסק), morningCheck, eveningCheck }]
 * @returns {{ complete, tovelDay, cleanChecked, status }}
 */
export function evaluateCleanDays(cleanDays = []) {
  const cleanSet   = new Set()
  const blockedSet = new Set()
  for (const d of cleanDays) {
    if (isCleanDay(d))   cleanSet.add(d.dayNumber)
    if (isBlockedDay(d)) blockedSet.add(d.dayNumber)
  }

  const checked = [...cleanSet].sort((a, b) => a - b)

  // החלון המוקדם ביותר [A, A+6] ששני קצותיו נקיים ואין דם בתווך
  let tovelDay = null
  for (const A of checked) {
    if (!cleanSet.has(A + 6)) continue
    let ok = true
    for (let k = A; k <= A + 6; k++) {
      if (blockedSet.has(k)) { ok = false; break }
    }
    if (ok) { tovelDay = A + 6; break }
  }

  let status
  if (tovelDay !== null)        status = 'complete'        // ניתן לטבול במוצאי tovelDay
  else if (blockedSet.size)     status = 'blocked'         // נמצא דם — צריך הפסק חדש
  else if (checked.length === 0) status = 'no_bedikot'
  else                          status = 'incomplete'      // ממשיכה לבדוק עד שיהיו ראשון+שביעי

  return { complete: tovelDay !== null, tovelDay, cleanChecked: checked, status }
}
