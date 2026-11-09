import { JewishCalendar, ComplexZmanimCalendar, GeoLocation, ZmanimFormatter, DateTime } from 'kosher-zmanim'

// ── זמני יום לתאריך גרגוריאני + חלונות לילה/יום ──────────────────────────────

export function getZmanimForDay(gYear, gMonth, gDay, lat, lng, tz) {
  const geo = new GeoLocation('', lat, lng, 0, tz)
  const cal = new ComplexZmanimCalendar(geo)
  cal.setDate(DateTime.fromObject({ year: gYear, month: gMonth, day: gDay, hour: 12 }, { zone: tz }))
  const z = ZmanimFormatter.toJSON(cal).Zmanim
  return {
    sunrise:       z.Sunrise         ? new Date(z.Sunrise)         : null,
    sunset:        z.Sunset          ? new Date(z.Sunset)          : null,
    minchaKetana:  z.MinchaKetana    ? new Date(z.MinchaKetana)    : null,
    alotHaShachar: z.AlosHashachar   ? new Date(z.AlosHashachar)   : null,
    tzais:         z.TzaisHacochavim ? new Date(z.TzaisHacochavim) : null,
  }
}

// הזמנים של יום עברי: הלילה שלפניו (משקיעת אתמול) והיום עצמו.
export function hebrewDayZmanim(hd, lat, lng, tz) {
  const c = new JewishCalendar()
  c.setJewishDate(hd.year, hd.month, hd.day)
  const gd   = c.getDate()
  const dt   = DateTime.fromObject({ year: gd.year, month: gd.month, day: gd.day, hour: 12 }, { zone: tz })
  const prev = dt.minus({ days: 1 })
  const next = dt.plus({ days: 1 })
  const todayZ = getZmanimForDay(dt.year, dt.month, dt.day, lat, lng, tz)
  const prevZ  = getZmanimForDay(prev.year, prev.month, prev.day, lat, lng, tz)
  const nextZ  = getZmanimForDay(next.year, next.month, next.day, lat, lng, tz)
  return {
    nightStart: prevZ.sunset,
    dayStart:   todayZ.sunrise,
    dayEnd:     todayZ.sunset,
    minchaKetana: todayZ.minchaKetana,
    nextNightEnd: nextZ.sunrise,
  }
}

// חלון הלילה הרלוונטי לרגע זה: "אתמול בלילה" לפני הזריחה, אחרת "הלילה"
// (מהשקיעה של היום ועד הזריחה הבאה) — כך המחוג תמיד יודע איפה אנחנו.
export function onahNow(z, now) {
  if (!z) return null
  const night = (z.dayStart && now < z.dayStart)
    ? { start: z.nightStart, end: z.dayStart }
    : { start: z.dayEnd, end: z.nextNightEnd }
  const pctOf = (a, b) => (!a || !b) ? 0 : Math.min(100, Math.max(0, ((now - a) / (b - a)) * 100))
  let period = null
  if (night.start && night.end && now >= night.start && now < night.end) period = 'night'
  else if (z.dayStart && z.dayEnd && now >= z.dayStart && now < z.dayEnd) period = 'day'
  const pct = period === 'night' ? pctOf(night.start, night.end)
            : period === 'day'   ? pctOf(z.dayStart, z.dayEnd)
            : null
  return { night, period, pct }
}
