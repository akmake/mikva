// מיפוי "גוון" סמנטי (שמגיע מ-lib/status.js) לצבעי מערכת העיצוב.
// bg = רקע תא; fg = צבע טקסט קריא עליו.
export const TONES = {
  none:        { bg: '#F0DADD', fg: '#3B1F2F' },
  blood:       { bg: '#A9303A', fg: '#FBF1EC' },
  bloodMid:    { bg: '#C26B5E', fg: '#FBF1EC' },
  bloodTint:   { bg: '#EBC0C4', fg: '#5E1A15' },
  bloodWash:   { bg: '#F0D8D0', fg: '#5E1A15' },
  hefsek:      { bg: '#D6A93A', fg: '#3E2C05' },
  countDeep:   { bg: '#2C747A', fg: '#EAF5F3' },
  countTint:   { bg: '#B8D8D6', fg: '#123C40' },
  countWash:   { bg: '#D5E8E4', fg: '#123C40' },
  mikveh:      { bg: '#3A5F94', fg: '#EAF1F8' },
  mikvehTint:  { bg: '#BCD0E5', fg: '#14304F' },
  concernTint: { bg: '#EBC9A4', fg: '#5B2A07' },
  concernWash: { bg: '#F3DDC4', fg: '#5B2A07' },
  passedTint:  { bg: '#D9C7CE', fg: '#4E3A45' },
  passedWash:  { bg: '#E9DCE1', fg: '#4E3A45' },
  tahorTint:   { bg: '#BDDCC6', fg: '#16391F' },
  tahorWash:   { bg: '#D8EAD9', fg: '#16391F' },
}

// רמזור: אדום = אסורה, כתום = חשש, ירוק = טהורה ומותרת
export const LEVELS = {
  red:    { color: '#A9303A', tint: '#EBC0C4', glyph: 'x',     word: 'אסורה' },
  amber:  { color: '#BC5A1E', tint: '#EBC9A4', glyph: 'alert', word: 'חשש' },
  green:  { color: '#3B7A55', tint: '#BDDCC6', glyph: 'check', word: 'טהורה' },
}
