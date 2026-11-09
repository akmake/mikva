import Icon from './Icon'

// עיגול המצב: זר פרחים עדין סביב טבעת מקטעים שמראה התקדמות בימים, ובמרכז תוכן.
// הצבע של הטבעת והתג הוא צבע הרמזור (אדום/כתום/ירוק) — הזר הוא קישוט בלבד.
// segments = מספר מקטעים בטבעת; filled = כמה מהם מלאים.
const SIZE = 264

function polar(c, r, deg) {
  const a = (deg * Math.PI) / 180
  return [c + r * Math.cos(a), c + r * Math.sin(a)]
}

function Flower({ x, y, s, rot, fill, core }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-9" rx="6.2" ry="9.5" fill={fill} transform={`rotate(${a})`} opacity="0.92" />
      ))}
      <circle r="4" fill={core} />
    </g>
  )
}

function Leaf({ x, y, rot, s = 1 }) {
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}
      d="M0 0 C 6 -6 14 -6 20 0 C 14 6 6 6 0 0 Z"
      fill="#9DB89A"
      opacity="0.85"
    />
  )
}

export default function Wreath({ color, tint, glyph, segments = 0, filled = 0, children }) {
  const c = SIZE / 2
  const ringR = 98

  // מקטעי טבעת
  const arcs = []
  if (segments > 0) {
    const gap = 5 // מעלות
    const step = 360 / segments
    for (let i = 0; i < segments; i++) {
      const a0 = -90 + i * step + gap / 2
      const a1 = -90 + (i + 1) * step - gap / 2
      const [x0, y0] = polar(c, ringR, a0)
      const [x1, y1] = polar(c, ringR, a1)
      arcs.push(
        <path
          key={i}
          d={`M ${x0} ${y0} A ${ringR} ${ringR} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`}
          stroke={i < filled ? color : tint}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />,
      )
    }
  } else {
    arcs.push(<circle key="r" cx={c} cy={c} r={ringR} stroke={tint} strokeWidth="3" fill="none" />)
  }

  // זר: עלים לאורך קשת שמאל-תחתונה, ופרחים בנקודות קבועות
  const leafAngles = [118, 134, 150, 166, 182, 198, 214, 230, 246, 262, 278]
  const flowers = [
    { a: 128, r: 118, s: 1.05, fill: '#F3B7C7', core: '#E58AA6', rot: 10 },
    { a: 172, r: 120, s: 0.85, fill: '#F6C9D4', core: '#E9A0B5', rot: 40 },
    { a: 212, r: 118, s: 1.15, fill: '#EFA6BB', core: '#D9758F', rot: 70 },
    { a: 252, r: 119, s: 0.8, fill: '#F6C9D4', core: '#E9A0B5', rot: 20 },
    { a: 292, r: 118, s: 0.95, fill: '#F3B7C7', core: '#E58AA6', rot: 55 },
    { a: 24, r: 119, s: 0.7, fill: '#F6C9D4', core: '#E9A0B5', rot: 30 },
  ]

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 overflow-visible">
        <defs>
          <radialGradient id="wreath-disc" cx="50%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FBEFF0" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={ringR + 10} fill="url(#wreath-disc)" />
        <circle cx={c} cy={c} r={ringR + 10} fill="none" stroke="#EBD3D8" strokeWidth="1" />
        {leafAngles.map((a, i) => {
          const [x, y] = polar(c, 116 + (i % 2) * 3, a)
          return <Leaf key={a} x={x} y={y} rot={a + 90 + (i % 2 ? 28 : -28)} s={1 + (i % 3) * 0.1} />
        })}
        {flowers.map((f) => {
          const [x, y] = polar(c, f.r, f.a)
          return <Flower key={f.a} x={x} y={y} s={f.s} rot={f.rot} fill={f.fill} core={f.core} />
        })}
        {arcs}
      </svg>

      {/* תג צבע-המצב בראש הטבעת */}
      <span
        className="absolute left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-paper-bright text-paper-bright shadow-lift"
        style={{ top: c - ringR - 18, background: color }}
      >
        <Icon name={glyph} size={18} stroke={2.2} />
      </span>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-[52px] text-center">{children}</div>
    </div>
  )
}
