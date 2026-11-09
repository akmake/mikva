import Icon from './Icon'
import { Sprig } from './HomeArt'

// כרטיס הסטטוס של מסך הבית: טבעת דקה (מקטעי התקדמות בימים כשיש ספירה, אחרת טבעת מלאה
// עם קשת זהב), תג בצבע המצב בראשה, וענף זהב קישוטי. הצבעים מגיעים מהמצב הקיים (LEVELS).
const SIZE = 208
const C = SIZE / 2
const R = 99

const pt = (deg) => {
  const a = (deg * Math.PI) / 180
  return [C + R * Math.cos(a), C + R * Math.sin(a)]
}
const arc = (a0, a1) => {
  const [x0, y0] = pt(a0)
  const [x1, y1] = pt(a1)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export default function StatusRing({ color, tint, glyph, segments = 0, filled = 0, children }) {
  const parts = []
  if (segments > 0) {
    const gap = 6
    const step = 360 / segments
    for (let i = 0; i < segments; i++) {
      parts.push(
        <path
          key={i} d={arc(-90 + i * step + gap / 2, -90 + (i + 1) * step - gap / 2)}
          stroke={i < filled ? color : tint} strokeWidth="4" strokeLinecap="round" fill="none"
        />,
      )
    }
  } else {
    parts.push(<circle key="full" cx={C} cy={C} r={R} stroke={tint} strokeWidth="3" fill="none" />)
    parts.push(<path key="gold" d={arc(120, 250)} stroke="#c9a16c" strokeWidth="3" strokeLinecap="round" fill="none" />)
  }

  return (
    <div className="status-card">
      <Sprig className="sprig" />
      <div className="status-ring">
        <svg className="status-arcs" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">{parts}</svg>
        <span className="status-badge" style={{ background: color }}>
          <Icon name={glyph} size={18} stroke={2.2} />
        </span>
        <div className="status-body">{children}</div>
      </div>
    </div>
  )
}
