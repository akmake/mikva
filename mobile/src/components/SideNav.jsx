import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

// תפריט צד (drawer) לאפליקציית המובייל — נפתח מימין (RTL) בלחיצה על ההמבורגר.
// שני יעדים: לוח עברי (בית) ומפת המקוואות.
const LINKS = [
  { to: '/', label: 'לוח עברי', icon: 'calendar' },
  { to: '/map', label: 'מפת מקוואות', icon: 'pin' },
]

function Icon({ name }) {
  const paths = {
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="1" />
        <path d="M8 3v4M16 3v4M3.5 9.5h17" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5.5-7 11-7 11s-7-5.5-7-11a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.2" />
      </>
    ),
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export default function SideNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // סגירה אוטומטית בכל מעבר מסך
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <>
      {/* כפתור המבורגר צף — מופיע מעל כל מסך */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="פתיחת תפריט"
        className="fixed right-3 top-3 z-[3000] flex h-11 w-11 flex-col items-center justify-center gap-[5px] rounded-xl border border-stone-300 bg-white/95 text-stone-700 shadow-lg backdrop-blur active:scale-95"
      >
        <span className="block h-0.5 w-5 rounded bg-current" />
        <span className="block h-0.5 w-5 rounded bg-current" />
        <span className="block h-0.5 w-5 rounded bg-current" />
      </button>

      {/* רקע כהה */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[3001] bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* המגירה — מהצד הימני (RTL) */}
      <aside
        dir="rtl"
        className={`fixed inset-y-0 right-0 z-[3002] flex h-full w-72 max-w-[82vw] flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-800 text-white">
              <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 18c2.1 0 2.1-2 4.2-2s2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2" />
                <path d="M6 23c2.1 0 2.1-2 4.2-2s2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2" />
                <path d="M16 5c3 3.5 4.5 5.8 4.5 7.7A4.5 4.5 0 0 1 16 17a4.5 4.5 0 0 1-4.5-4.3C11.5 10.8 13 8.5 16 5Z" />
              </svg>
            </span>
            <div className="leading-none">
              <p className="text-base font-semibold text-stone-900">מקווה</p>
              <p className="mt-1 text-[10px] font-semibold tracking-[0.14em] text-stone-400">טהרה · הלכה · זמן</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="סגירת תפריט"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-base transition-colors ${
                  isActive
                    ? 'bg-teal-50 font-semibold text-teal-900'
                    : 'font-medium text-stone-600 hover:bg-stone-50'
                }`
              }
            >
              <Icon name={link.icon} />
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
