// טסט עצמאי למנוע הווסתות. הרצה:  node src/lib/veset/engine.test.mjs  (מתיקיית client)
import assert from 'node:assert/strict'
import { addHebrewDays, hebrewDateToGregorian } from '../hebrewCalendar.js'
import { computeVesetConcerns } from '../vesetCalculator.js'
import { SOURCE_TYPE } from './sourceTypes.js'
import { evaluateCleanDays } from '../cleanDaysEngine.js'

let pass = 0, fail = 0
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name) }
  catch (e) { fail++; console.log('  ✗', name, '\n      ', e.message) }
}

const BASE = { year: 5784, month: 1, day: 1 } // א' ניסן תשפ"ד

// בונה ראייה ביום BASE+offset (מהיום הבסיסי), עונת יום, סוג נתון.
let seq = 0
function sighting(offsetDays, sourceType = SOURCE_TYPE.VESET, onah = 'day') {
  const hebrewDate = addHebrewDays(BASE, offsetDays)
  return {
    _id: `s${++seq}`,
    hebrewDate,
    onah,
    sourceType,
    gregorianDatetime: hebrewDateToGregorian(hebrewDate).toISOString(),
  }
}

// ראייה בתאריך עברי מפורש
function sightingOn(hebrewDate, onah = 'day', sourceType = SOURCE_TYPE.VESET) {
  return {
    _id: `s${++seq}`,
    hebrewDate,
    onah,
    sourceType,
    gregorianDatetime: hebrewDateToGregorian(hebrewDate).toISOString(),
  }
}

const haflagot = (concerns) =>
  concerns.filter(c => c.type === 'haflagah').map(c => c.interval).sort((a, b) => a - b)
const chodashim = (concerns) =>
  concerns.filter(c => c.type === 'chodesh').map(c => c.canonicalDay).sort((a, b) => a - b)

console.log('\n=== veset engine ===')

test('הפלגה בודדת — 20 יום', () => {
  const s = [sighting(0), sighting(20)]
  const c = computeVesetConcerns(s)
  assert.deepEqual(haflagot(c), [20])
})

test('⭐ carry-forward: הקדימה לראות → שני ימי חשש (33 ואז 24)', () => {
  // s1→s2 = 33 (קובע חשש 33); s2→s3 = 24 (ראתה לפני יום ה-33 → לא נעקר)
  const s = [sighting(0), sighting(33), sighting(33 + 24)]
  const c = computeVesetConcerns(s)
  assert.deepEqual(haflagot(c), [24, 33], 'שני החששות צריכים להיות פעילים')
})

test('עקירה: ראתה ארוך מכולם (40) → הקצרים נעקרים', () => {
  const s = [sighting(0), sighting(33), sighting(33 + 24), sighting(33 + 24 + 40)]
  const c = computeVesetConcerns(s)
  assert.deepEqual(haflagot(c), [40], '24 ו-33 נעקרו, נשאר 40')
})

test('קביעת הפלגה: 20,20,20 → קבוע, ועונה בינונית מדוכאת (V-11)', () => {
  const s = [sighting(0), sighting(20), sighting(40), sighting(60)]
  const c = computeVesetConcerns(s)
  const h20 = c.find(x => x.type === 'haflagah' && x.interval === 20)
  assert.ok(h20?.isKavua, 'הפלגת 20 צריכה להיות קבועה')
  assert.ok(!c.some(x => x.type === 'ona_beinonit'), 'עונה בינונית לא נוצרת כשיש קבוע')
})

test('עונה בינונית קיימת כשאין ווסת קבוע', () => {
  const s = [sighting(0), sighting(25)]
  const c = computeVesetConcerns(s)
  const ob = c.find(x => x.type === 'ona_beinonit')
  assert.ok(ob, 'צריכה להיות עונה בינונית')
  assert.equal(ob.uprooted, false, 'עו"ב לעולם אינה נעקרת (V-13)')
})

test('סינון סוג ראייה: כתם אינו נכנס לחישוב (F-02)', () => {
  // כתם באמצע לא אמור לשנות את ההפלגה 20→20
  const withKesem = [sighting(0), sighting(10, SOURCE_TYPE.KESEM), sighting(20)]
  assert.deepEqual(haflagot(computeVesetConcerns(withKesem)), [20], 'הכתם מתעלם')
})

test('שיטת שוע"ר מול נוהג נותנות interval שונה', () => {
  const s = [sighting(0), sighting(20)]
  const nohag = computeVesetConcerns(s, [], false)
  const shuar = computeVesetConcerns(s, [], true)
  const nInt = nohag.find(c => c.type === 'haflagah' && c.isPrimary)?.interval
  const sInt = shuar.find(c => c.type === 'haflagah' && c.isPrimary)?.interval
  assert.equal(nInt, 20, 'נוהג: תחילה→תחילה = 20')
  assert.equal(sInt, 13, 'שוע"ר: סוף(יום 7)→תחילה = 13')
})

test('שוע"ר: יום החשש הבא מעוגן בהפסק האחרון + interval (לא בתחילת הראייה)', () => {
  const s = [sighting(0), sighting(20)]
  // הפסק של הראייה השנייה ביום 24 (יום 20 + 4 = חמישי לספירה)
  const hefsekMap = { [s[1]._id]: addHebrewDays(BASE, 24) }
  const shuar = computeVesetConcerns(s, [], true, hefsekMap)
  const hafl  = shuar.find(c => c.type === 'haflagah' && c.isPrimary)
  // interval שוע"ר = סוף ראייה קודמת (יום 0+7) → תחילת השנייה (יום 20) = 13
  assert.equal(hafl.interval, 13)
  // הניבוי: הפסק אחרון (יום 24) + 13 = יום 37 — ולא תחילת הראייה (יום 20) + 13 = 33
  assert.deepEqual(hafl.hebrewDate, addHebrewDays(hefsekMap[s[1]._id], 13))
})

// ── ווסת החודש ───────────────────────────────────────────────────────────────
const NISAN = 1, IYAR = 2

test('⭐ חודש carry-forward: כ"ג ניסן ואז ט\' אייר (מוקדם) → שני ימי חשש [9,23]', () => {
  const s = [
    sightingOn({ year: 5784, month: NISAN, day: 23 }),
    sightingOn({ year: 5784, month: IYAR, day: 9 }),
  ]
  // כ"ג לא נעקר (יום החשש שלו עוד לא עבר), וגם ט' חדש
  assert.deepEqual(chodashim(computeVesetConcerns(s)), [9, 23])
})

test('חודש קבוע: ה\' שלושה חודשים רצופים → קבוע, עו"ב מדוכאת', () => {
  const s = [
    sightingOn({ year: 5784, month: 1, day: 5 }),
    sightingOn({ year: 5784, month: 2, day: 5 }),
    sightingOn({ year: 5784, month: 3, day: 5 }),
  ]
  const c = computeVesetConcerns(s)
  const ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 5)
  assert.ok(ch?.isKavua, 'ה\' צריך להיות קבוע')
  assert.ok(!c.some(x => x.type === 'ona_beinonit'), 'עו"ב מדוכאת בקבוע')
})

test('חודש: דילוג חודש שובר את הרצף (לא-קבוע, kavuaCount=1)', () => {
  const s = [
    sightingOn({ year: 5784, month: 1, day: 5 }),
    sightingOn({ year: 5784, month: 2, day: 5 }),
    sightingOn({ year: 5784, month: 4, day: 5 }), // דילגה סיון
  ]
  const c = computeVesetConcerns(s)
  const ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 5)
  assert.equal(ch?.kavuaCount, 1, 'הרצף נשבר → נספר מחדש')
  assert.ok(!ch?.isKavua)
  assert.ok(c.some(x => x.type === 'ona_beinonit'), 'אין קבוע → עו"ב קיימת')
})

test('⭐ V-24: דם שהמשיך על יום החשש עוקר אותו (ווסת החודש)', () => {
  const s1 = sightingOn({ year: 5784, month: 1, day: 23 })
  const s2 = sightingOn({ year: 5784, month: 2, day: 21 }) // התחילה כ"א
  // בלי הפסק → carry רגיל: חוששת גם 21 וגם 23
  assert.deepEqual(chodashim(computeVesetConcerns([s1, s2])), [21, 23])
  // עם הפסק כ"ה אייר → הדם נמשך כ"א→כ"ה ועבר על כ"ג → כ"ג נעקר כהמשך
  const hefsekMap = { [s2._id]: { year: 5784, month: 2, day: 25 } }
  assert.deepEqual(
    chodashim(computeVesetConcerns([s1, s2], [], false, hefsekMap)),
    [21], 'כ"ג נעקר — המשך ראייה',
  )
})

test('V-24 לא חל כשהדם פסק לפני יום החשש', () => {
  const s1 = sightingOn({ year: 5784, month: 1, day: 23 })
  const s2 = sightingOn({ year: 5784, month: 2, day: 21 })
  // הפסק כ"ב — הדם לא הגיע לכ"ג → שני החששות נשארים
  const hefsekMap = { [s2._id]: { year: 5784, month: 2, day: 22 } }
  assert.deepEqual(chodashim(computeVesetConcerns([s1, s2], [], false, hefsekMap)), [21, 23])
})

test('צמח צדק (ברירת מחדל): ראיית ל\' בחודש שאחריו חסר → אין חשש חודש', () => {
  const s = [sightingOn({ year: 5784, month: 1, day: 30 })] // ל' ניסן; אייר חסר
  const c = computeVesetConcerns(s)
  assert.deepEqual(chodashim(c), [], 'אין ווסת חודש מראיית ל\'')
  assert.ok(c.some(x => x.type === 'ona_beinonit'), 'עו"ב כן קיימת')
})

test('שיטת ר"ח (rosh_chodesh): ראיית ל\' → חשש בר"ח', () => {
  const s = [sightingOn({ year: 5784, month: 1, day: 30 })]
  const c = computeVesetConcerns(s, [], false, {}, false, 'rosh_chodesh')
  const ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 30)
  assert.ok(ch, 'יש חשש חודש (ר"ח)')
  assert.equal(ch.hebrewDate.day, 1, 'נופל על יום א\' (ר"ח)')
})

// ── עקירת/שינוי ווסת קבוע (שלב 4) ────────────────────────────────────────────

test('V-60/61: שינתה מהפלגה קבועה → חוששת לקבוע *וגם* לחדש', () => {
  // 20×3 = קבוע, ואז הפלגת 25. הקבוע אינו נעקר ע"י עבירת היום (V-60)
  const s = [sighting(0), sighting(20), sighting(40), sighting(60), sighting(85)]
  const c = computeVesetConcerns(s)
  assert.deepEqual(haflagot(c), [20, 25], 'גם 20 (קבוע) וגם 25 (חדש)')
  assert.ok(c.find(x => x.type === 'haflagah' && x.interval === 20)?.isKavua, '20 נשאר קבוע')
  assert.ok(!c.some(x => x.type === 'ona_beinonit'), 'אין עו"ב כל עוד הקבוע קיים')
})

test('V-63: חזרה לראות ביום הקבוע (אחרי עקירה ב-3 המשכי-ראייה) → קביעות חוזרת מיד', () => {
  const M = (month, day) => ({ year: 5784, month, day })
  // קביעת ה' קבוע: ניסן/אייר/סיון
  const base = [sightingOn(M(1, 5)), sightingOn(M(2, 5)), sightingOn(M(3, 5))]
  // 3 המשכי-ראייה שעוקרים את ה': כל חודש מתחילה ג' ונמשכת עד ז' (עובר על ה')
  const cont = [sightingOn(M(4, 3)), sightingOn(M(5, 3)), sightingOn(M(6, 3))]
  const hefsekMap = {
    [cont[0]._id]: M(4, 7), [cont[1]._id]: M(5, 7), [cont[2]._id]: M(6, 7),
  }
  // חזרה לראות ב-ה' (תשרי — שנה הבאה, שהרי תשרי קודם לניסן באותה שנה עברית)
  const back = sightingOn({ year: 5785, month: 7, day: 5 })

  const all = [...base, ...cont, back]
  const c = computeVesetConcerns(all, [], false, hefsekMap)
  const ch5 = c.find(x => x.type === 'chodesh' && x.canonicalDay === 5)
  assert.ok(ch5, 'יש חשש חודש ל-ה\'')
  assert.ok(ch5.isKavua, 'ה\' חזר לקביעות מיד (V-63), אף שנעקר ונספר פעם אחת')
})

// ── עקירה ע"י בדיקות (forward-walk, השלמת V-60) ──────────────────────────────

let obsSeq = 0
const cleanObs = (concernId, hebrewDate) =>
  ({ _id: `o${++obsSeq}`, concernId, hebrewDate, result: 'clean' })

test('עקירת לא-קבוע: בדיקה נקייה אחת עוקרת (כד,לח)', () => {
  const s = [sightingOn({ year: 5784, month: 1, day: 23 })] // חודש 23 לא-קבוע, הבא כ"ג אייר
  const obs = [cleanObs('chodesh_d23_day', { year: 5784, month: 2, day: 23 })]
  const c = computeVesetConcerns(s, obs)
  const ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 23)
  assert.ok(ch?.uprooted, 'נעקר בבדיקה אחת')
})

test('עקירת קבוע: דורשת 3 בדיקות עוקבות (V-60)', () => {
  const M = (m) => ({ year: 5784, month: m, day: 5 })
  const s = [sightingOn(M(1)), sightingOn(M(2)), sightingOn(M(3))] // ה' קבוע
  // מופעים עוקבים: ה' תמוז/אב/אלול
  const dates = [{ year: 5784, month: 4, day: 5 }, { year: 5784, month: 5, day: 5 }, { year: 5784, month: 6, day: 5 }]

  // בדיקה אחת → עדיין לא נעקר, מוצג במופע הבא עם 1/3
  let c = computeVesetConcerns(s, [cleanObs('chodesh_d5_day', dates[0])])
  let ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 5)
  assert.ok(!ch.uprooted && ch.cleanPasses === 1, 'אחרי בדיקה אחת: 1/3, לא נעקר')
  assert.ok(!c.some(x => x.type === 'ona_beinonit'), 'עו"ב עדיין מדוכאת (קבוע פעיל)')

  // שלוש בדיקות → נעקר, ועונה בינונית חוזרת (V-15)
  c = computeVesetConcerns(s, dates.map(d => cleanObs('chodesh_d5_day', d)))
  ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 5)
  assert.ok(ch.uprooted, 'אחרי 3 בדיקות — נעקר')
  assert.ok(c.some(x => x.type === 'ona_beinonit'), 'עו"ב חוזרת אחרי עקירת הקבוע (V-15)')
})

// ── ווסת הדילוג (שלב 6) ──────────────────────────────────────────────────────

const dilugim = (c) => c.filter(x => x.type === 'dilog')

test('דילוג ימי חודש קדימה: ט"ו,ט"ז,י"ז,י"ח → קבוע, הבא י"ט', () => {
  const s = [
    sightingOn({ year: 5784, month: 1, day: 15 }),
    sightingOn({ year: 5784, month: 2, day: 16 }),
    sightingOn({ year: 5784, month: 3, day: 17 }),
    sightingOn({ year: 5784, month: 4, day: 18 }),
  ]
  const d = dilugim(computeVesetConcerns(s)).find(x => x.dilugKind === 'month')
  assert.ok(d, 'זוהה דילוג ימי חודש')
  assert.ok(d.isKavua, '4 ראיות → קבוע')
  assert.equal(d.hebrewDate.day, 19, 'הבא: י"ט')
  assert.equal(d.hebrewDate.month, 5, 'באב')
})

test('דילוג ימי חודש: 3 ראיות → לחומרא בלבד', () => {
  const s = [
    sightingOn({ year: 5784, month: 1, day: 15 }),
    sightingOn({ year: 5784, month: 2, day: 16 }),
    sightingOn({ year: 5784, month: 3, day: 17 }),
  ]
  const d = dilugim(computeVesetConcerns(s)).find(x => x.dilugKind === 'month')
  assert.ok(d && !d.isKavua && d.isLechumra, '3 ראיות → לחומרא')
  assert.ok(computeVesetConcerns(s).some(x => x.type === 'ona_beinonit'), 'לחומרא אינו מדכא עו"ב')
})

test('דילוג ימי חודש לאחור: ט"ו,י"ד,י"ג,י"ב → קבוע, הבא י"א', () => {
  const s = [
    sightingOn({ year: 5784, month: 1, day: 15 }),
    sightingOn({ year: 5784, month: 2, day: 14 }),
    sightingOn({ year: 5784, month: 3, day: 13 }),
    sightingOn({ year: 5784, month: 4, day: 12 }),
  ]
  const d = dilugim(computeVesetConcerns(s)).find(x => x.dilugKind === 'month')
  assert.ok(d?.isKavua && d.hebrewDate.day === 11, 'הבא: י"א')
})

test('דילוג בהפלגות: 20,21,22,23 → קבוע, הבא 24', () => {
  const s = [sighting(0), sighting(20), sighting(41), sighting(63), sighting(86)]
  const d = dilugim(computeVesetConcerns(s)).find(x => x.dilugKind === 'haflagah')
  assert.ok(d?.isKavua, '4 הפלגות בדילוג → קבוע')
  assert.equal(d.dilugInterval, 24, 'ההפלגה הבאה: 24')
})

test('סירוג: 3 ראיות → לחומרא; 4 → קבוע (V-71)', () => {
  const M = (m) => ({ year: 5784, month: m, day: 15 })
  const three = [sightingOn(M(1)), sightingOn(M(3)), sightingOn(M(5))] // כל חודשיים, ט"ו
  const s3 = computeVesetConcerns(three).find(x => x.type === 'sirug')
  assert.ok(s3 && !s3.isKavua && s3.isLechumra, '3 ראיות = לחומרא')
})

test('מעיין פתוח (V-50,55): ראיה בתוך 7 ימים אינה ראיה חדשה', () => {
  // ראיה ביום 0, ושוב יום 3 (אותה נידה), ושוב יום 20
  const s = [sighting(0), sighting(3), sighting(20)]
  // ההפלגה היחידה צריכה להיות 20 (0→20), לא 3 ולא 17
  assert.deepEqual(haflagot(computeVesetConcerns(s)), [20], 'הראיה הסמוכה התעלמה')
})

// ── מסולקת מדמים + יום ל"א (שלב 7) ───────────────────────────────────────────

const win = (fromHD, toHD) =>
  [{ from: hebrewDateToGregorian(fromHD).getTime(), to: hebrewDateToGregorian(toHD).getTime() }]

test('מסולקת: אינה קובעת ווסת (V-93), אך חוששת לעו"ב (V-94)', () => {
  const s = [
    sightingOn({ year: 5784, month: 1, day: 5 }),
    sightingOn({ year: 5784, month: 2, day: 5 }),
    sightingOn({ year: 5784, month: 3, day: 5 }),
  ]
  const wins = win({ year: 5784, month: 1, day: 1 }, { year: 5784, month: 4, day: 1 })
  const c = computeVesetConcerns(s, [], false, {}, false, 'tzemach_tzedek', wins)
  const ch = c.find(x => x.type === 'chodesh' && x.canonicalDay === 5)
  assert.ok(ch && !ch.isKavua, 'לא נקבע קבוע בימי הסילוק')
  assert.ok(c.some(x => x.type === 'ona_beinonit'), 'עו"ב קיימת (V-94)')
})

test('V-95: יום חשש שנופל בחלון הסילוק → אינה חוששת', () => {
  const s = [sightingOn({ year: 5784, month: 1, day: 5 })] // חודש ה', הבא ה' אייר
  const wins = win({ year: 5784, month: 2, day: 1 }, { year: 5784, month: 3, day: 1 }) // מכסה אייר
  const c = computeVesetConcerns(s, [], false, {}, false, 'tzemach_tzedek', wins)
  assert.ok(!c.some(x => x.type === 'chodesh'), 'חשש החודש (אייר) מסונן')
})

test('עונה בינונית יום ל"א (הגדרה V-12)', () => {
  const s = [sighting(0), sighting(25)]
  const c = computeVesetConcerns(s, [], false, {}, false, 'tzemach_tzedek', [], true)
  assert.equal(c.filter(x => x.type === 'ona_beinonit').length, 2, 'יום 30 + יום 31')
})

test('עונה בינונית = ראייה + 29 (יום ל\'), ויום ל"א = ראייה + 30', () => {
  const s = [sighting(0), sighting(25)] // ראייה אחרונה ביום 25 מ-BASE
  const c = computeVesetConcerns(s, [], false, {}, false, 'tzemach_tzedek', [], true)
  const ob   = c.find(x => x.id === 'ona_beinonit')
  const ob31 = c.find(x => x.id === 'ona_beinonit_31')
  // יום ל' = תחילת הראייה נספרת כיום 1 → +29 (לא +30)
  assert.deepEqual(ob.hebrewDate,   addHebrewDays(s[1].hebrewDate, 29), 'עו"ב = +29')
  assert.deepEqual(ob31.hebrewDate, addHebrewDays(s[1].hebrewDate, 30), 'יום ל"א = +30')
})

// ── מנוע שבעה נקיים (פרק יז) ──────────────────────────────────────────────────
const cd = (dayNumber, m = 'clean', e = 'not_done') =>
  ({ dayNumber, morningCheck: m, eveningCheck: e })

test('יז: ראשון+שביעי נקיים → טובלת מוצאי שביעי', () => {
  const r = evaluateCleanDays([cd(1), cd(7)])
  assert.ok(r.complete && r.tovelDay === 7)
})

test('יז: רק ראשון → לא הושלם', () => {
  assert.equal(evaluateCleanDays([cd(1)]).complete, false)
})

test('יז: ראשון+שלישי+תשיעי → טובלת מוצאי תשיעי (3=ראשון, 9=שביעי)', () => {
  const r = evaluateCleanDays([cd(1), cd(3), cd(9)])
  assert.ok(r.complete && r.tovelDay === 9)
})

test('יז: ראשון+שלישי+שמיני → שמרני, לא הושלם (גישור ≤5 טרם מומש)', () => {
  assert.equal(evaluateCleanDays([cd(1), cd(3), cd(8)]).complete, false)
})

test('יז: דם ביום 4 חוסם את החלון [1–7]', () => {
  const r = evaluateCleanDays([cd(1), cd(4, 'stain'), cd(7)])
  assert.ok(!r.complete && r.status === 'blocked')
})

console.log(`\n${pass} עברו, ${fail} נכשלו\n`)
process.exit(fail ? 1 : 0)
