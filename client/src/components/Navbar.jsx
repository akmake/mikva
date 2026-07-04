import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'היום', icon: 'home' },
  { to: '/calendar', label: 'לוח עברי', icon: 'calendar' },
  { to: '/zmanim', label: 'זמנים', icon: 'clock' },
  { to: '/map', label: 'מקוואות', icon: 'pin' },
]

function NavIcon({ name }) {
  const paths = {
    home: <><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></>,
    pin: <><path d="M19 10c0 5.5-7 11-7 11s-7-5.5-7-11a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-800 text-white shadow-[0_6px_16px_rgba(17,94,89,0.18)] transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M6 18c2.1 0 2.1-2 4.2-2s2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2"/>
        <path d="M6 23c2.1 0 2.1-2 4.2-2s2.1 2 4.2 2 2.1-2 4.2-2 2.1 2 4.2 2 2.1-2 4.2-2"/>
        <path d="M16 5c3 3.5 4.5 5.8 4.5 7.7A4.5 4.5 0 0 1 16 17a4.5 4.5 0 0 1-4.5-4.3C11.5 10.8 13 8.5 16 5Z"/>
      </svg>
    </span>
  )
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  const linkClass = ({ isActive }) =>
    `group relative flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
      isActive ? 'font-semibold text-teal-900' : 'font-medium text-stone-500 hover:text-stone-900'
    }`

  return (
    <nav dir="rtl" className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#f6f5f1]/90 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="flex h-16 items-center justify-between">
          <NavLink to="/" className="group flex items-center gap-3" aria-label="מקווה — דף הבית">
            <BrandMark />
            <div className="leading-none">
              <span className="block text-base font-semibold tracking-tight text-stone-900">מקווה</span>
              <span className="mt-1 block text-[9px] font-semibold tracking-[0.16em] text-stone-400">טהרה · הלכה · זמן</span>
            </div>
          </NavLink>

          <div className="hidden items-center gap-4 sm:flex">
            {LINKS.map(link => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'} className={linkClass}>
                {({ isActive }) => <>
                  <NavIcon name={link.icon} />
                  <span>{link.label}</span>
                  <span className={`absolute inset-x-3 -bottom-[13px] h-0.5 bg-teal-800 transition-transform ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'}`} />
                </>}
              </NavLink>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-label={open ? 'סגירת תפריט' : 'פתיחת תפריט'}
            aria-expanded={open}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-stone-300 hover:shadow sm:hidden"
          >
            <span className={`block h-px w-5 bg-current transition-transform ${open ? 'translate-y-[3.5px] rotate-45' : ''}`} />
            <span className={`block h-px w-5 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-px w-5 bg-current transition-transform ${open ? '-translate-y-[3.5px] -rotate-45' : ''}`} />
          </button>
        </div>

        <div className={`grid transition-[grid-template-rows] duration-300 sm:hidden ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <div className="grid grid-cols-2 gap-px border-t border-stone-200 bg-stone-200 py-px">
              {LINKS.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) => `flex items-center gap-3 bg-[#f6f5f1] px-4 py-4 text-sm transition-colors ${isActive ? 'font-semibold text-teal-900' : 'text-stone-500 hover:text-stone-900'}`}
                >
                  <NavIcon name={link.icon} />
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
