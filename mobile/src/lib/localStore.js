// ── אחסון מקומי אופליין ─────────────────────────────────────────────────────
// פורט נאמן (verbatim בהתנהגות) של לוגיקת השרת מ-server/src/routes/*.js אל תוך
// המכשיר, מעל @capacitor/preferences. אין כאן שום הלכה חדשה — רק אותם כללים
// שהיו בשרת (שיוך ראיה לנידה כרונולוגית, כלל 7 הימים, איפוס ספירה על דם).
// המנוע ההלכתי (lib/*, getCellColors, computeVesetConcerns) לא נגע ולא משתנה.
//
// נתוני האמת מוחזקים במפתח יחיד ב-Preferences; בדפדפן dev זה נופל אוטומטית
// ל-localStorage (מימוש ה-web של הפלאגין).

import { Preferences } from '@capacitor/preferences'

const KEY = 'mikva.db.v1'
const DAY_MS = 86_400_000

// ── ברירות מחדל של Settings (server/src/models/Settings.js) ──────────────────
function defaultSettings() {
  return {
    isPregnant: false,
    pregnancyStart: undefined,
    isMeineket: false,
    meinaketStart: undefined,
    useShuar: false,
    onaBeinonit31: false,
    day30Policy: 'tzemach_tzedek',
    pregnancyPromptDays: 60,
    pregnancyPromptSnoozedFor: null,
  }
}

function emptyDb() {
  return { seq: 1, sightings: [], cycles: [], observations: [], settings: defaultSettings() }
}

let _db = null

async function load() {
  if (_db) return _db
  try {
    const { value } = await Preferences.get({ key: KEY })
    _db = value ? JSON.parse(value) : emptyDb()
  } catch {
    _db = emptyDb()
  }
  if (!_db.settings) _db.settings = defaultSettings()
  return _db
}

async function save() {
  await Preferences.set({ key: KEY, value: JSON.stringify(_db) })
}

function genId() {
  return `${Date.now().toString(36)}${(_db.seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const clone = (x) => JSON.parse(JSON.stringify(x))
const nowIso = () => new Date().toISOString()

// ── עזרי נידה ────────────────────────────────────────────────────────────────

const sightingById = (id) => _db.sightings.find((s) => String(s._id) === String(id)) ?? null

// מרחיב cycle: bleedings → אובייקטי ראיה מלאים (populate), בסדר השמור (כרונולוגי)
function populate(cycle) {
  return {
    ...cycle,
    bleedings: (cycle.bleedings ?? []).map(sightingById).filter(Boolean).map(clone),
  }
}

// זמן ה-onset של נידה = הדם המוקדם ביותר בה (fallback: createdAt לנידה ריקה).
function onsetTime(cycle) {
  const times = (cycle.bleedings ?? []).map((id) => +new Date(sightingById(id)?.gregorianDatetime))
    .filter((t) => !Number.isNaN(t))
  if (times.length) return Math.min(...times)
  return +new Date(cycle.createdAt)
}

// המחזור הנוכחי = הנידה הכרונולוגית האחרונה (ה-onset המאוחר ביותר). לא לפי createdAt.
function currentCycleRaw() {
  if (!_db.cycles.length) return null
  const sorted = [..._db.cycles].sort((a, b) => onsetTime(b) - onsetTime(a))
  return sorted[0]
}

function cycleByIdOrCurrentRaw(cycleId) {
  if (cycleId) {
    const c = _db.cycles.find((x) => String(x._id) === String(cycleId))
    if (c) return c
  }
  return currentCycleRaw()
}

// צורת תשובה תואמת ל-Dashboard: מצב הנידה הנוכחית + הגדרות גלובליות ממוזגות +
// latestSighting = הדם הראשון של הנידה (מוקד ספירת 5 הימים).
function serialize(cycleRaw) {
  const s = _db.settings
  const base = cycleRaw
    ? populate(cycleRaw)
    : { phase: 'tahorah', cleanDays: [], mikveDate: {}, bleedings: [] }
  const onset = base.bleedings?.[0] ?? null
  return {
    ...base,
    latestSighting: onset,
    isPregnant: s.isPregnant,
    pregnancyStart: s.pregnancyStart,
    isMeineket: s.isMeineket,
    meinaketStart: s.meinaketStart,
    useShuar: s.useShuar,
    onaBeinonit31: s.onaBeinonit31,
    day30Policy: s.day30Policy,
    pregnancyPromptDays: s.pregnancyPromptDays,
    pregnancyPromptSnoozedFor: s.pregnancyPromptSnoozedFor,
  }
}

// ── פעולות (מקבילות ל-routes של השרת) ───────────────────────────────────────

export async function getSightings() {
  await load()
  return clone(
    [..._db.sightings].sort((a, b) => +new Date(b.gregorianDatetime) - +new Date(a.gregorianDatetime)),
  )
}

// פורט של POST /api/sightings — כולל השיוך הכרונולוגי (תיעוד-עבר) וכלל 7 הימים.
export async function recordSighting(payload) {
  await load()
  const { gregorianDatetime, hebrewDate, onah, sourceType, isOpenSource, lat, lng, notes } = payload

  const sighting = {
    _id: genId(),
    gregorianDatetime: new Date(gregorianDatetime).toISOString(),
    hebrewDate,
    onah,
    sourceType: sourceType ?? 'veset',
    isOpenSource: isOpenSource ?? false,
    hefsekTahara: undefined,
    lat, lng, notes,
    createdAt: nowIso(),
  }
  _db.sightings.push(sighting)

  // ── שיוך כרונולוגי (תומך תיעוד-עבר) ──────────────────────────────────────
  //  • ממשיכה את הנידה הפעילה שה-onset שלה ≤ תאריך הראיה, בתנאי שהפער מהדם
  //    האחרון בה קטן מ-7 ימים (אותה היוריסטיקה של מנוע הווסתות; פער ≥7 = נידה
  //    חדשה, וכך גם ראיה אחרי נידה שנסגרה בטבילה).
  //  • אחרת → פותחת נידה חדשה משלה.
  const sTime = new Date(gregorianDatetime).getTime()
  const onsetOf = (c) =>
    Math.min(...c.bleedings.map((id) => +new Date(sightingById(id).gregorianDatetime)))
  const lastOf = (c) =>
    Math.max(...c.bleedings.map((id) => +new Date(sightingById(id).gregorianDatetime)))

  // הנידה הקרובה ביותר שה-onset שלה ≤ תאריך הראיה (לא כולל את הראיה שנוצרה זה עתה)
  let nearest = null
  for (const c of _db.cycles) {
    const others = c.bleedings.filter((id) => String(id) !== String(sighting._id))
    if (!others.length) continue
    const ot = Math.min(...others.map((id) => +new Date(sightingById(id).gregorianDatetime)))
    if (ot <= sTime && (!nearest || ot > onsetOf(nearest))) nearest = c
  }

  const continuation =
    nearest &&
    nearest.status !== 'completed' &&
    (sTime - lastOf(nearest)) / DAY_MS < 7

  let cycle
  if (continuation) {
    // המשך אותה נידה — מוסיפים וממיינים כרונולוגית כך ש-bleedings[0] הוא ה-onset האמיתי.
    const all = [...nearest.bleedings.filter((id) => String(id) !== String(sighting._id)), sighting._id]
    all.sort((a, b) => +new Date(sightingById(a).gregorianDatetime) - +new Date(sightingById(b).gregorianDatetime))
    nearest.bleedings = all
    // ראיה בתוך/אחרי 7 הנקיים → הספירה נפסלת, נדרש הפסק טהרה חדש (כד — אפיון).
    const midCount = nearest.phase === 'counting_7' || nearest.phase === 'waiting_mikveh'
    if (midCount) {
      nearest.phase = 'waiting_hefsek'
      nearest.hefsekTahara = undefined
      nearest.cleanDays = []
      nearest.mikveDate = {}
    }
    cycle = nearest
  } else {
    // נידה חדשה — מתחילה המתנת 5 ימים (דם ממצב טהרה).
    cycle = {
      _id: genId(),
      bleedings: [sighting._id],
      phase: 'waiting_5_days',
      hefsekTahara: undefined,
      cleanDays: [],
      mikveDate: {},
      status: 'active',
      createdAt: nowIso(),
    }
    _db.cycles.push(cycle)
  }

  await save()
  return { sighting: clone(sighting), cycle: populate(cycle) }
}

export async function getCycle() {
  await load()
  return serialize(currentCycleRaw())
}

// כל הנידות (עם bleedings) — לחישוב הווסתות. ממוין לפי createdAt עולה.
export async function getCycles() {
  await load()
  const sorted = [..._db.cycles].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  return sorted.map(populate)
}

export async function recordHefsek(payload) {
  await load()
  const { gregorianDatetime, hebrewDate, cycleId } = payload
  const cycle = cycleByIdOrCurrentRaw(cycleId)
  if (!cycle) throw new Error('no active cycle')

  cycle.hefsekTahara = { gregorianDatetime: new Date(gregorianDatetime).toISOString(), hebrewDate }
  cycle.phase = 'counting_7'
  cycle.cleanDays = []

  // חותם את ההפסק על *הדם האחרון* של הנידה — ממנו נמדדת ההפלגה (שוע"ר) ועקירת V-24.
  const lastId = cycle.bleedings[cycle.bleedings.length - 1]
  const last = sightingById(lastId)
  if (last) last.hefsekTahara = hebrewDate

  await save()
  return serialize(cycle)
}

export async function recordBedika(payload) {
  await load()
  const { dayNumber, hebrewDate, type, result, cycleId } = payload
  const cycle = cycleByIdOrCurrentRaw(cycleId)
  if (!cycle) throw new Error('no active cycle')

  let day = cycle.cleanDays.find((d) => d.dayNumber === dayNumber)
  if (!day) {
    day = { dayNumber, hebrewDate, morningCheck: 'not_done', eveningCheck: 'not_done', mochCheck: 'not_done' }
    cycle.cleanDays.push(day)
  }
  if (type === 'morning') day.morningCheck = result
  else if (type === 'evening') day.eveningCheck = result
  else if (type === 'moch') day.mochCheck = result

  cycle.phase = 'counting_7'
  await save()
  return serialize(cycle)
}

export async function recordMikveh(payload) {
  await load()
  const { gregorianDatetime, cycleId } = payload
  const cycle = cycleByIdOrCurrentRaw(cycleId)
  if (!cycle) throw new Error('no active cycle')

  cycle.phase = 'tahorah'
  cycle.mikveDate = { ...cycle.mikveDate, actual: new Date(gregorianDatetime).toISOString() }
  cycle.status = 'completed'
  await save()
  return serialize(cycle)
}

export async function updateSettings(payload) {
  await load()
  const {
    isPregnant, pregnancyStart, isMeineket, meinaketStart,
    useShuar, onaBeinonit31, day30Policy,
    pregnancyPromptDays, pregnancyPromptSnoozedFor,
  } = payload
  const s = _db.settings
  if (isPregnant !== undefined) s.isPregnant = isPregnant
  if (pregnancyStart !== undefined) s.pregnancyStart = pregnancyStart ? new Date(pregnancyStart).toISOString() : undefined
  if (isMeineket !== undefined) s.isMeineket = isMeineket
  if (meinaketStart !== undefined) s.meinaketStart = meinaketStart ? new Date(meinaketStart).toISOString() : undefined
  if (useShuar !== undefined) s.useShuar = useShuar
  if (onaBeinonit31 !== undefined) s.onaBeinonit31 = onaBeinonit31
  if (day30Policy !== undefined) s.day30Policy = day30Policy
  if (pregnancyPromptDays !== undefined) s.pregnancyPromptDays = pregnancyPromptDays
  if (pregnancyPromptSnoozedFor !== undefined) s.pregnancyPromptSnoozedFor = pregnancyPromptSnoozedFor

  await save()
  return serialize(currentCycleRaw())
}

export async function getVesetObservations() {
  await load()
  return clone(
    [..._db.observations].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  )
}

export async function recordCleanPass(payload) {
  await load()
  const { concernType, concernId, hebrewDate, onah, relatedSightingId } = payload

  // אידמפוטנטי: לא לשכפל אותה תצפית
  const existing = _db.observations.find(
    (o) => String(o.concernId) === String(concernId) &&
      o.hebrewDate?.year === hebrewDate.year &&
      o.hebrewDate?.month === hebrewDate.month &&
      o.hebrewDate?.day === hebrewDate.day,
  )
  if (existing) return clone(existing)

  const obs = {
    _id: genId(),
    concernType, concernId, hebrewDate, onah,
    result: 'clean',
    relatedSightingId,
    createdAt: nowIso(),
  }
  _db.observations.push(obs)
  await save()
  return clone(obs)
}

export async function deleteObservation(id) {
  await load()
  _db.observations = _db.observations.filter((o) => String(o._id) !== String(id))
  await save()
  return { ok: true }
}

// ── מחיקת כל הנתונים ─────────────────────────────────────────────────────────
// מאפס את המסד לגמרי: כל הראיות, הנידות, הבדיקות וההגדרות נמחקות מהמכשיר.
// אין חזרה. לאחר קריאה מומלץ לרענן את האפליקציה (window.location.reload).
export async function clearAll() {
  _db = emptyDb()
  await Preferences.remove({ key: KEY })
  return { ok: true }
}
