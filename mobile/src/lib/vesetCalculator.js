import { JewishCalendar } from 'kosher-zmanim'
import {
  addHebrewDays,
  addHebrewMonths,
  daysBetween,
  hebrewDateEquals,
  compareHebrewDates,
  chronCompare,
  nextHebrewMonth,
  daysInHebrewMonth,
  hebrewDateToGregorian,
  todayHebrew,
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
  tevilaDates   = [],
  includeHistory = false,
) {
  if (!sightings || sightings.length === 0) return []

  // ── סינון לפי סוג הראייה: רק דאורייתא נכנס לחישוב (כד,ג–ה — F-01..F-05) ──
  const filtered = [...sightings]
    .filter(countsForVeset)
    .sort((a, b) => new Date(a.gregorianDatetime) - new Date(b.gregorianDatetime))

  // ── קיבוץ לנידות: כל דימום שלפני טבילה שייך לאותה נידה (הכרעת המשתמש).
  // נידה = מהדם הראשון עד הטבילה. ווסת החודש/עונה בינונית נמדדים מ*הדם הראשון*
  // (onset); ווסת ההפלגה מ*הדם האחרון* (סוף הדימום — שוע"ר). כשיש תאריכי טבילה
  // (tevilaDates) הגבול מדויק; בהיעדרם (טסטים) — נפילה לחלון מעיין-פתוח הישן (7).
  const niddot = []
  for (const s of filtered) {
    const cur      = niddot[niddot.length - 1]
    const prevLast = cur ? cur[cur.length - 1] : null
    let newNidda
    if (!prevLast) newNidda = true
    else if (tevilaDates.length) {
      newNidda = tevilaDates.some(t =>
        chronCompare(t, prevLast.hebrewDate) > 0 && chronCompare(s.hebrewDate, t) >= 0)
    } else {
      newNidda = daysBetween(prevLast.hebrewDate, s.hebrewDate) >= 7
    }
    if (newNidda) niddot.push([s])
    else cur.push(s)
  }

  if (niddot.length === 0) return []

  const onsets    = niddot.map(n => n[0])                 // דם ראשון של כל נידה (מוקד onset)
  const lastOnset = onsets[onsets.length - 1]

  // ההפסק של כל נידה חתום על *הדם האחרון*; ממפים אותו ל-onset._id כדי ששוע"ר
  // (סוף הדימום → תחילה) ו-V-24 של החודש ימדדו מסוף הדימום האמיתי של הנידה —
  // זה מימוש "הפלגה מהדם האחרון" בלי לשבור את נוהג (שמודד מהתחילה = ה-onset).
  const niddaHefsek = {}
  for (const n of niddot) {
    for (const b of n) if (hefsekMap[b._id]) niddaHefsek[n[0]._id] = hefsekMap[b._id]
  }
  const raw  = []

  // מסולקת מדמים (V-90..V-95): לפי onset הראייה האחרונה.
  const lastInWindow = inMesulekes(mesulekesWins, hebrewDateToGregorian(lastOnset.hebrewDate).getTime())
  const mesulekes    = isMesulekes || lastInWindow

  // ── ווסת החודש (כד,לד–מד) — מנוע carry-forward (V-20..V-28) ────────────────
  const chodeshKavuaKeys = new Set()
  for (const c of computeChodeshConcerns(onsets, { isMesulekes: mesulekes, day30Policy, hefsekMap })) {
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

  for (const c of computeHaflagahConcerns(onsets, primaryMethod, niddaHefsek, mesulekes)) {
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
  if (useShuar && onsets.length >= 2) {
    const secInterval = haflagaInterval(
      onsets[onsets.length - 2], lastOnset, secondaryMethod, niddaHefsek,
    )
    const primInterval = haflagaInterval(
      onsets[onsets.length - 2], lastOnset, primaryMethod, niddaHefsek,
    )
    if (secInterval > 0 && secInterval !== primInterval) {
      const methodTag = secondaryMethod === 'shuar' ? ' (שוע"ר)' : ' (נוהג)'
      raw.push({
        id:          `haflagah_${secondaryMethod}_${secInterval}`,
        type:        'haflagah',
        label:       `ווסת ההפלגה — ${secInterval} יום${methodTag}`,
        hebrewDate:   addHebrewDays(lastOnset.hebrewDate, secInterval),
        onah:         lastOnset.onah,
        isKavua:      false,
        kavuaCount:   1,
        interval:     secInterval,
        isSecondary:  true,
        canUproot:    true,
        relatedSightingId: lastOnset._id,
      })
    }
  }

  // ── ווסת סירוג (כד,עג–פב) — קבוע-חודש מסונן ע"י chodeshKavuaKeys ────────────
  raw.push(...detectSirugConcerns(onsets, chodeshKavuaKeys, mesulekes))

  // ── ווסת דילוג (כד,פג–צה) ─────────────────────────────────────────────────
  // דילוג ימי-חודש מבוסס onset; דילוג-הפלגה עדין יותר בנידה עם המשך — קירוב סביר.
  raw.push(...computeDilugConcerns(onsets, primaryMethod, hefsekMap, mesulekes))

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
  // יום השלושים = ראייה + 29: "ל' יום אלו הם מתחילת ראיה לתחלת ראיה, וב' ימי
  // הראיות בכלל הל'" (כד) — יום הראייה נספר כיום 1 (כמו ספירת 5 הימים).
  const anyActiveKavua = enriched.some(c => c.isKavua && !c.uprooted)
  if (!anyActiveKavua) {
    enriched.push(withUprootingStatus({
      id:         'ona_beinonit',
      type:       'ona_beinonit',
      label:      'עונה בינונית',
      hebrewDate:  addHebrewDays(lastOnset.hebrewDate, 29),
      onah:       'full_day',
      isKavua:    false,
      kavuaCount: 0,
      canUproot:  false,
      relatedSightingId: lastOnset._id,
    }, observations))

    // V-12: חומרת יום ל"א (הגדרה) = ראייה + 30. פרישה בעונת הראייה בלבד (כד,כט).
    if (onaBeinonit31) {
      enriched.push(withUprootingStatus({
        id:         'ona_beinonit_31',
        type:       'ona_beinonit',
        label:      'עונה בינונית (יום ל"א)',
        hebrewDate:  addHebrewDays(lastOnset.hebrewDate, 30),
        onah:        lastOnset.onah,
        isKavua:    false,
        kavuaCount: 0,
        canUproot:  false,
        relatedSightingId: lastOnset._id,
      }, observations))
    }
  }

  // ── ימי חשש מצטברים (תצוגה) ──────────────────────────────────────────────
  // עונה בינונית "אינה מתבטלת לעולם" למי שאין ווסתה קבוע, וחוזרת "משלשים
  // לשלשים" (כד,סה; שוע"ר קפט,א — מקורות/כד.txt שו' 1091,1102). לכן פולטים את
  // *סדרת* ימי העונה בינונית (כל 30 יום) לכל נידה, חסומה ע"י הנידה הבאה, ולנידה
  // האחרונה עד אופק עתידי. כן פולטים חודש/הפלגה של נידות-עבר. המנוע הקדימי
  // (enriched) נשאר כמות שהוא; passed=true (מוצג אפור) אם עבר תאריך החשש.
  if (includeHistory) {
  const todayHD  = todayHebrew()
  const HORIZON  = 210 // ~7 חודשים קדימה לסדרת העונה בינונית של הנידה האחרונה
  const seenKeys = new Set(
    enriched.map(c => `${c.type}|${c.hebrewDate.year}-${c.hebrewDate.month}-${c.hebrewDate.day}|${c.onah}`),
  )
  const pushHist = (type, label, hd, onah, relId, extra = {}) => {
    if (!hd) return
    const key = `${type}|${hd.year}-${hd.month}-${hd.day}|${onah}`
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    enriched.push({
      id: `hist_${key}`, type, label, hebrewDate: hd, onah,
      isKavua: false, kavuaCount: 0, canUproot: false,
      cleanPasses: 0, needed: 0, uprooted: false, observationIds: [],
      passed: chronCompare(hd, todayHD) < 0, historical: true,
      relatedSightingId: relId, ...extra,
    })
  }
  for (let i = 0; i < onsets.length; i++) {
    const O       = onsets[i]
    const nextO   = onsets[i + 1] ?? null
    // גבול עליון (בלעדי): ה-onset של הנידה הבאה, או אופק עתידי לנידה האחרונה.
    const bound   = nextO ? nextO.hebrewDate : addHebrewDays(todayHD, HORIZON)

    // עונה בינונית מצטברת — יום ל', ואם עבר בנקיות שוב יום ל' וכן הלאה (רק כשאין
    // ווסת קבוע פעיל, V-11 — כמו המנוע הקדימי).
    if (!anyActiveKavua) {
      for (let k = 0; k < 24; k++) {
        const d30 = addHebrewDays(O.hebrewDate, 29 + 30 * k)
        if (chronCompare(d30, bound) >= 0) break
        pushHist('ona_beinonit', 'עונה בינונית', d30, 'full_day', O._id)
        if (onaBeinonit31)
          pushHist('ona_beinonit', 'עונה בינונית (יום ל"א)', addHebrewDays(O.hebrewDate, 30 + 30 * k), O.onah, O._id)
      }
    }

    // חודש/הפלגה של נידות-עבר (הנידה האחרונה מטופלת ע"י המנוע הקדימי).
    if (i < onsets.length - 1) {
      pushHist('chodesh', 'ווסת החודש', nextOccurrenceAfter(O.hebrewDate, O.hebrewDate.day, day30Policy), O.onah, O._id)
      if (i >= 1) {
        const interval = haflagaInterval(onsets[i - 1], O, primaryMethod, niddaHefsek)
        if (interval > 0) {
          const anchor = primaryMethod === 'shuar'
            ? (niddaHefsek[onsets[i - 1]._id] ?? addHebrewDays(onsets[i - 1].hebrewDate, 7))
            : onsets[i - 1].hebrewDate
          pushHist('haflagah', `ווסת ההפלגה — ${interval} יום`,
            addHebrewDays(anchor, interval), O.onah, onsets[i - 1]._id, { interval })
        }
      }
    }
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
