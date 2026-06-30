import { JewishCalendar } from 'kosher-zmanim'
import {
  addHebrewDays,
  addHebrewMonths,
  daysBetween,
  hebrewDateEquals,
  compareHebrewDates,
  nextHebrewMonth,
  daysInHebrewMonth,
  hebrewDateToGregorian,
} from './hebrewCalendar.js'
import { countsForVeset } from './veset/sourceTypes.js'
import { computeHaflagahConcerns, haflagaInterval } from './veset/haflagahEngine.js'
import { computeChodeshConcerns, nextOccurrenceAfter } from './veset/chodeshEngine.js'
import { computeDilugConcerns } from './veset/dilugEngine.js'
import { inMesulekes } from './veset/mesulekes.js'

// ═══════════════════════════════════════════════════════════════════════════
//  אורקסטרטור חישוב הווסתות (פרק כד)
//  בנוי כפונקציה טהורה המחשבת מחדש מכל ההיסטוריה.
//  שלב נוכחי: עונה בינונית · ווסת החודש · ווסת ההפלגה (עם carry-forward) · סירוג
//  טרם מומש (ראה מפת_כיסוי_הלכתית.md): דילוג, מעיין פתוח אוטומטי, עקירת קבוע
//  ע"י בדיקה, שני קבועים, מסולקת מלאה, מקרים מיוחדים.
// ═══════════════════════════════════════════════════════════════════════════

function isLeap(year) {
  return JewishCalendar.isJewishLeapYear(year)
}

// פונקציית "המופע הבא" לכל סוג חשש (לצורך עקירה רב-מופעית).
function recurrenceFn(concern) {
  switch (concern.type) {
    case 'chodesh':
      return (d) => nextOccurrenceAfter(d, concern.canonicalDay, concern.day30Policy)
    case 'haflagah':
      // לקבוע נעקר במשך 3× ההפלגה (כד,סב) — מודל: 3 מופעי interval עוקבים.
      return (d) => addHebrewDays(d, concern.interval)
    case 'sirug':
      return (d) => addHebrewMonths(d, concern.skipMonths)
    case 'dilog':
      if (concern.dilugKind === 'haflagah')
        return (d) => addHebrewDays(d, concern.dilugInterval)
      // דילוג ימי החודש: חודש הבא, יום + Δ (עם גבולות)
      return (d) => {
        const nm = nextHebrewMonth(d.year, d.month)
        const day = d.day + concern.dilugDelta
        if (day < 1 || day > daysInHebrewMonth(nm.year, nm.month)) return null
        return { year: nm.year, month: nm.month, day }
      }
    default:
      return null // עונה בינונית ואחרים — אין מופע חוזר
  }
}

// ── עקירה: forward-walk על תצפיות "עבר בנקיות" לאורך מופעים עוקבים ────────────
// לא-קבוע נעקר במופע נקי אחד (כד,לח,מח); קבוע — בשלושה (כד,סב,סג — V-60).
// מציג את המופע הראשון שטרם נבדק, עם ספירת העקירות שנצברו.
function withUprootingStatus(concern, observations) {
  // עו"ב ושאר חששות שאינם נעקרים (כד,יג — V-13)
  if (concern.type === 'ona_beinonit' || !concern.canUproot) {
    return { ...concern, cleanPasses: 0, needed: 0, uprooted: false, observationIds: [] }
  }

  // קבוע ולחומרא — עקירה ב-3 (כד,סב/עז/פז); שאינו קבוע — ב-1 (כד,לח).
  const needed  = (concern.isKavua || concern.isLechumra) ? 3 : 1
  const advance = recurrenceFn(concern)
  const cleanOn = (hd) => observations.filter(
    o => o.concernId === concern.id && o.result === 'clean' &&
         hebrewDateEquals(o.hebrewDate, hd),
  )

  let date  = concern.hebrewDate
  let count = 0
  const observationIds = []
  let guard = 0
  while (advance && date && guard++ < 12) {
    const obs = cleanOn(date)
    if (obs.length === 0) break          // מופע שטרם נבדק → זהו יום החשש המוצג
    observationIds.push(...obs.map(o => o._id))
    count += 1
    if (count >= needed) break
    date = advance(date)
  }

  return {
    ...concern,
    hebrewDate:   date ?? concern.hebrewDate,
    cleanPasses:  count,
    needed,
    uprooted:     count >= needed,
    observationIds,
  }
}

// ── עזרי אדר (שנה מעוברת: אדר א'/ב' מתחלפים) ─────────────────────────────────
function fitsAdar(sm, em, year) {
  if (!isLeap(year)) return false
  return (sm === 12 && em === 13) || (sm === 13 && em === 12)
}

function fitsExpected(sighting, expectedHD, expectedOnah) {
  if (sighting.onah !== expectedOnah) return false
  const shd = sighting.hebrewDate
  if (hebrewDateEquals(shd, expectedHD)) return true
  return (
    shd.year === expectedHD.year &&
    shd.day  === expectedHD.day  &&
    fitsAdar(shd.month, expectedHD.month, expectedHD.year)
  )
}

function expandAdar(hd) {
  if (hd.month === 12 && isLeap(hd.year)) return [hd, { ...hd, month: 13 }]
  return [hd]
}

// ── ווסת סירוג (כד,עג–פב) — נשמר מהמימוש הקיים ───────────────────────────────
function buildSirugChain(group, last, skip) {
  let best = []
  for (const start of group) {
    const chain = [start]
    let cur = start
    while (true) {
      const nextHD = addHebrewMonths(cur.hebrewDate, skip)
      const found  = group.find(s => s !== cur && fitsExpected(s, nextHD, start.onah))
      if (!found) break
      chain.push(found)
      cur = found
    }
    const tail = chain[chain.length - 1]
    if (fitsExpected(tail, last.hebrewDate, last.onah) && chain.length > best.length) best = chain
  }
  return best
}

function detectSirugConcerns(sorted, chodeshKavuaKeys, isMesulekes) {
  const concerns = []
  if (sorted.length < 2) return concerns

  const groups = new Map()
  for (const s of sorted) {
    const k = `${s.hebrewDate.day}|${s.onah}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(s)
  }

  const generated = new Set()

  for (const [gk, group] of groups) {
    if (group.length < 2) continue
    if (chodeshKavuaKeys.has(gk)) continue

    const last = group[group.length - 1]
    const [dayStr, onah] = gk.split('|')
    const day = parseInt(dayStr, 10)

    for (let skip = 2; skip <= 6; skip++) {
      const chain = buildSirugChain(group, last, skip)
      if (chain.length < 2) continue

      const chainLast  = chain[chain.length - 1]
      const nextHD     = addHebrewMonths(chainLast.hebrewDate, skip)
      const nextDates  = expandAdar(nextHD)
      const kavuaCount = chain.length
      // V-71/V-77: 4 ראיות בסירוג = קבוע גמור; 3 = קבוע לחומרא בלבד.
      const kavua      = !isMesulekes && kavuaCount >= 4
      const lechumra   = !kavua && kavuaCount === 3
      const skipLabel  = skip === 2 ? 'כל חודשיים' : `כל ${skip} חודשים`

      for (const nd of nextDates) {
        const dateKey = `${nd.year}-${nd.month}-${nd.day}|${onah}`
        if (generated.has(dateKey)) continue
        generated.add(dateKey)

        const adarSuffix =
          nd.month === 13                    ? ' (אדר ב׳)' :
          nd.month === 12 && isLeap(nd.year) ? ' (אדר א׳)' : ''
        const id = `sirug_${skip}_d${day}_${onah}${nd.month === 13 ? '_adar2' : ''}`

        concerns.push({
          id,
          type:       'sirug',
          label:      `ווסת סירוג — ${skipLabel}${adarSuffix}`,
          hebrewDate:  nd,
          onah,
          isKavua:     kavua,
          isLechumra:  lechumra,
          kavuaCount,
          skipMonths:  skip,
          canUproot:   true,
          relatedSightingId: chainLast._id,
        })
      }
    }
  }
  return concerns
}

// ═══════════════════════════════════════════════════════════════════════════
//  Export ראשי
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {Array}   sightings    מסמכי ראייה
 * @param {Array}   observations תצפיות "עבר בנקיות"
 * @param {boolean} useShuar     שיטת הפלגה ראשית (שוע"ר / נוהג)
 * @param {object}  hefsekMap    { sightingId → hebrewDate }
 * @param {boolean} isMesulekes  הריון / מינקת
 */
export function computeVesetConcerns(
  sightings,
  observations = [],
  useShuar     = false,
  hefsekMap    = {},
  isMesulekes  = false,
  day30Policy  = 'tzemach_tzedek',
  mesulekesWins = [],
  onaBeinonit31 = false,
) {
  if (!sightings || sightings.length === 0) return []

  // ── סינון לפי סוג הראייה: רק דאורייתא נכנס לחישוב (כד,ג–ה — F-01..F-05) ──
  const filtered = [...sightings]
    .filter(countsForVeset)
    .sort((a, b) => new Date(a.gregorianDatetime) - new Date(b.gregorianDatetime))

  // ── מעיין פתוח (כד,נב,נח — V-50,55): ראיה בתוך 7 ימים מהקודמת היא אותה נידה
  // (מעיין פתוח) ואינה ראיה חדשה לחישובי הווסת — מתחשבים רק בראיה הסתומה.
  const counting = []
  for (const s of filtered) {
    if (!counting.length ||
        daysBetween(counting[counting.length - 1].hebrewDate, s.hebrewDate) >= 7) {
      counting.push(s)
    }
  }

  if (counting.length === 0) return []

  const last = counting[counting.length - 1]
  const raw  = []

  // מסולקת מדמים (V-90..V-95): אם הראייה האחרונה בחלון הסילוק — אינה קובעת (V-93).
  const lastInWindow = inMesulekes(mesulekesWins, hebrewDateToGregorian(last.hebrewDate).getTime())
  const mesulekes    = isMesulekes || lastInWindow

  // ── ווסת החודש (כד,לד–מד) — מנוע carry-forward (V-20..V-28) ────────────────
  const chodeshKavuaKeys = new Set()
  for (const c of computeChodeshConcerns(counting, { isMesulekes: mesulekes, day30Policy, hefsekMap })) {
    if (c.isKavua) chodeshKavuaKeys.add(`${c.canonicalDay}|${c.onah}`)
    for (const cd of expandAdar(c.hebrewDate)) {
      const adarSuffix =
        cd.month === 13                    ? ' (אדר ב׳)' :
        cd.month === 12 && isLeap(cd.year) ? ' (אדר א׳)' : ''
      raw.push({
        id:         `chodesh_d${c.canonicalDay}_${c.onah}${cd.month === 13 ? '_adar2' : ''}`,
        type:       'chodesh',
        label:      `ווסת החודש${adarSuffix}`,
        hebrewDate:  cd,
        canonicalDay: c.canonicalDay,
        day30Policy,
        onah:        c.onah,
        isKavua:     c.isKavua,
        kavuaCount:  c.kavuaCount,
        canUproot:   true,
        relatedSightingId: c.relatedSightingId,
      })
    }
  }

  // ── ווסת ההפלגה (כד,מה–נא) — שיטה ראשית עם carry-forward ⭐ ────────────────
  const primaryMethod   = useShuar ? 'shuar' : 'nohag'
  const secondaryMethod = useShuar ? 'nohag' : 'shuar'

  for (const c of computeHaflagahConcerns(counting, primaryMethod, hefsekMap, mesulekes)) {
    const methodTag = c.method === 'shuar' ? ' (שוע"ר)' : ''
    raw.push({
      id:          `haflagah_${c.method}_${c.interval}`,
      type:        'haflagah',
      label:       `ווסת ההפלגה — ${c.interval} יום${methodTag}`,
      hebrewDate:   c.hebrewDate,
      onah:         c.onah,
      isKavua:      c.isKavua,
      kavuaCount:   c.kavuaCount,
      interval:     c.interval,
      isPrimary:    c.isPrimary,
      canUproot:    true,
      relatedSightingId: c.relatedSightingId,
    })
  }

  // השיטה המשנית (נוהג) — מוצגת רק לנוהגים כשוע"ר, ורק להפלגה האחרונה
  // (לחומרא), בלי carry-forward מלא. נוהג-רגיל אינו חושש ליום השוע"ר.
  if (useShuar && counting.length >= 2) {
    const secInterval = haflagaInterval(
      counting[counting.length - 2], last, secondaryMethod, hefsekMap,
    )
    const primInterval = haflagaInterval(
      counting[counting.length - 2], last, primaryMethod, hefsekMap,
    )
    if (secInterval > 0 && secInterval !== primInterval) {
      const methodTag = secondaryMethod === 'shuar' ? ' (שוע"ר)' : ' (נוהג)'
      raw.push({
        id:          `haflagah_${secondaryMethod}_${secInterval}`,
        type:        'haflagah',
        label:       `ווסת ההפלגה — ${secInterval} יום${methodTag}`,
        hebrewDate:   addHebrewDays(last.hebrewDate, secInterval),
        onah:         last.onah,
        isKavua:      false,
        kavuaCount:   1,
        interval:     secInterval,
        isSecondary:  true,
        canUproot:    true,
        relatedSightingId: last._id,
      })
    }
  }

  // ── ווסת סירוג (כד,עג–פב) — קבוע-חודש מסונן ע"י chodeshKavuaKeys ────────────
  raw.push(...detectSirugConcerns(counting, chodeshKavuaKeys, mesulekes))

  // ── ווסת דילוג (כד,פג–צה) ─────────────────────────────────────────────────
  raw.push(...computeDilugConcerns(counting, primaryMethod, hefsekMap, mesulekes))

  // ── העשרה בעקירה ───────────────────────────────────────────────────────────
  let enriched = raw.map(c => withUprootingStatus(c, observations))

  // V-95: חשש מראייה שלפני הסילוק שיום החשש שלו נופל בתוך חלון הסילוק → אינה חוששת.
  // (חל רק כשהראייה האחרונה אינה בחלון — אחרת אלו חששותיה הנוכחיים, V-94.)
  if (mesulekesWins.length && !lastInWindow) {
    enriched = enriched.filter(
      c => !inMesulekes(mesulekesWins, hebrewDateToGregorian(c.hebrewDate).getTime()),
    )
  }

  // ── עונה בינונית (כד,כה–ל) ────────────────────────────────────────────────
  // V-11: אינה נוצרת כל עוד יש ווסת קבוע *פעיל* (שטרם נעקר).
  // V-15: חוזרת מיד כשהקבוע נעקר בפועל.
  const anyActiveKavua = enriched.some(c => c.isKavua && !c.uprooted)
  if (!anyActiveKavua) {
    enriched.push(withUprootingStatus({
      id:         'ona_beinonit',
      type:       'ona_beinonit',
      label:      'עונה בינונית',
      hebrewDate:  addHebrewDays(last.hebrewDate, 30),
      onah:       'full_day',
      isKavua:    false,
      kavuaCount: 0,
      canUproot:  false,
      relatedSightingId: last._id,
    }, observations))

    // V-12: חומרת יום ל"א (הגדרה). פרישה ביום ל"א בעונת הראייה בלבד (כד,כט).
    if (onaBeinonit31) {
      enriched.push(withUprootingStatus({
        id:         'ona_beinonit_31',
        type:       'ona_beinonit',
        label:      'עונה בינונית (יום ל"א)',
        hebrewDate:  addHebrewDays(last.hebrewDate, 31),
        onah:        last.onah,
        isKavua:    false,
        kavuaCount: 0,
        canUproot:  false,
        relatedSightingId: last._id,
      }, observations))
    }
  }

  return enriched.sort((a, b) => compareHebrewDates(a.hebrewDate, b.hebrewDate))
}

export function upcomingConcerns(concerns, todayHD, withinDays = 60) {
  return concerns.filter(c => {
    const diff = daysBetween(todayHD, c.hebrewDate)
    return diff >= 0 && diff <= withinDays
  })
}
