import { NavLink } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useApp } from '../AppState'

const TABS = [
  { to: '/',          label: 'היום',     icon: 'home' },
  { to: '/calendar',  label: 'לוח שנה',  icon: 'calendar' },
  { to: '/mikvaot',   label: 'מקוואות',  icon: 'pin' },
]

// סרגל תחתון צף ומעוגל. הסגנון ב-styles/tahara-home.css (.tahara-nav).
// "עוד" פותח את ההגדרות הקיימות.
export default function TabBar() {
  const { openSettings } = useApp()
  return (
    <nav className="tahara-nav" aria-label="ניווט ראשי">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'}>
          <Icon name={t.icon} size={23} stroke={1.6} />
          <span>{t.label}</span>
        </NavLink>
      ))}
      <button onClick={openSettings}>
        <Icon name="gear" size={23} stroke={1.6} />
        <span>עוד</span>
      </button>
    </nav>
  )
}
