// איורי הקישוט של מסך הבית: לוטוס הלוגו, ענף הזהב ליד הטבעת, וגלי הרקע.
// הכול SVG מוטמע — ללא תמונות ורשת.

export function Lotus({ size = 64 }) {
  return (
    <svg className="lotus" width={size} height={size * 0.82} viewBox="0 0 80 66" aria-hidden="true">
      <defs>
        <linearGradient id="lotus-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a2f4f" />
          <stop offset="1" stopColor="#55213b" />
        </linearGradient>
        <linearGradient id="lotus-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c8546f" />
          <stop offset="1" stopColor="#e58aa0" />
        </linearGradient>
      </defs>
      <path d="M40 4C50 16 52 34 40 56C28 34 30 16 40 4Z" fill="url(#lotus-c)" />
      <path d="M38 14C22 16 10 30 8 46C22 48 34 42 40 30Z" fill="url(#lotus-s)" opacity=".92" />
      <path d="M42 14C58 16 70 30 72 46C58 48 46 42 40 30Z" fill="#d9718a" opacity=".9" />
      <path d="M40 8C46 20 46 36 40 52" fill="none" stroke="#c9a16c" strokeWidth="1" opacity=".8" />
    </svg>
  )
}

export function Sprig({ className = '' }) {
  return (
    <svg className={className} width="92" height="170" viewBox="0 0 92 170" aria-hidden="true">
      <path d="M78 164C58 130 40 92 56 6" fill="none" stroke="#c9a16c" strokeWidth="1.4" strokeLinecap="round" />
      {[
        [62, 28, -28, '#e3a4b3'], [52, 52, 24, '#d9b788'], [48, 76, -32, '#e6a8b8'],
        [50, 100, 26, '#d9b788'], [58, 124, -26, '#e6a8b8'], [66, 146, 22, '#d9b788'],
      ].map(([x, y, r, f], i) => (
        <path
          key={i}
          transform={`translate(${x} ${y}) rotate(${r})`}
          d="M0 0C-8 -8 -8 -22 0 -30C8 -22 8 -8 0 0Z"
          fill={f}
          opacity=".88"
        />
      ))}
      <path d="M56 6C48 -2 44 8 50 14C56 14 58 10 56 6Z" fill="#d9718a" opacity=".95" />
    </svg>
  )
}

export function Waves() {
  return (
    <svg className="home-art" viewBox="0 0 480 760" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <linearGradient id="wave-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6dbe1" stopOpacity="0" />
          <stop offset="1" stopColor="#f3cfd8" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id="wave-l" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#f6dbe1" stopOpacity="0" />
          <stop offset="1" stopColor="#f3cfd8" stopOpacity=".8" />
        </linearGradient>
      </defs>
      <path d="M0 150C70 190 96 300 52 420C28 480 0 500 0 500Z" fill="url(#wave-l)" />
      <path d="M480 330C400 350 350 430 400 560C420 600 480 640 480 640Z" fill="url(#wave-r)" />
      <path d="M0 160C80 200 160 250 220 330" fill="none" stroke="#c9a16c" strokeWidth="1" opacity=".55" />
      <path d="M300 410C380 340 430 300 480 296" fill="none" stroke="#c9a16c" strokeWidth="1" opacity=".5" />
    </svg>
  )
}
