import Icon from './Icon'

// חותם סטטוס — במקום "נורת" רמזור זוהרת: טבעת מקטעים שמראה התקדמות בימים
// (למשל 4 מתוך 7 נקיים), ועליה עיגול מלא בצבע הרמזור עם סימן.
// segments = מספר המקטעים בטבעת; filled = כמה מהם מלאים.
export default function Seal({ color, tint, glyph, segments = 0, filled = 0, size = 124 }) {
  const c = size / 2
  const rOuter = c - 3
  const rInner = c - 20

  // מקטעי טבעת: קשתות עם רווח ביניהן
  const arcs = []
  if (segments > 0) {
    const gap = segments > 1 ? 0.09 : 0 // רדיאנים
    const step = (Math.PI * 2) / segments
    for (let i = 0; i < segments; i++) {
      const a0 = -Math.PI / 2 + i * step + gap / 2
      const a1 = -Math.PI / 2 + (i + 1) * step - gap / 2
      const p = (a) => [c + rOuter * Math.cos(a), c + rOuter * Math.sin(a)]
      const [x0, y0] = p(a0)
      const [x1, y1] = p(a1)
      const large = a1 - a0 > Math.PI ? 1 : 0
      arcs.push(
        <path
          key={i}
          d={`M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1}`}
          stroke={i < filled ? color : tint}
          strokeWidth="5"
          strokeLinecap="butt"
          fill="none"
        />,
      )
    }
  } else {
    arcs.push(<circle key="ring" cx={c} cy={c} r={rOuter} stroke={tint} strokeWidth="1.5" fill="none" />)
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        {arcs}
        <circle cx={c} cy={c} r={rInner + 6} stroke={color} strokeWidth="0.75" fill="none" opacity="0.5" />
        <circle cx={c} cy={c} r={rInner} fill={color} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color: '#FFFCFB' }}>
        <Icon name={glyph} size={size * 0.3} stroke={1.8} />
      </div>
    </div>
  )
}
