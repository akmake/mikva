import Icon from './Icon'
import { fmtTime } from '../lib/hebrewText'

// פס לילה | יום — לילה בנייבי עמוק, יום בנייר בהיר, כדי שההבדל יקרא מיד.
// מחוג ה"עכשיו" זז בכיוון הקריאה (מימין לשמאל) בתוך העונה הנוכחית בלבד.
// night/day = { start, end } (Date) · period = 'night' | 'day' | null · pct = 0..100
export default function OnahStrip({ night, day, tz, period, pct, height = 112, compact = false }) {
  return (
    <div className="daynight-card relative flex overflow-hidden rounded-[20px] shadow-card" style={{ height }} dir="rtl">
      <Panel
        kind="night"
        label="לילה"
        icon="moon"
        win={night}
        tz={tz}
        pct={period === 'night' ? pct : null}
        compact={compact}
      />
      <Panel
        kind="day"
        label="יום"
        icon="sun"
        win={day}
        tz={tz}
        pct={period === 'day' ? pct : null}
        compact={compact}
      />
    </div>
  )
}

function Panel({ kind, label, icon, win, tz, pct, compact }) {
  const isNight = kind === 'night'
  const bg = isNight ? 'bg-[#30203f] text-night-text' : 'bg-[#fffdfb] text-[#55213b]'
  const sub = isNight ? 'text-night-text/70' : 'text-ink-soft'
  const needle = isNight ? '#E3B341' : '#ad3659'
  return (
    <div className={`relative flex flex-1 flex-col justify-between px-4 py-3 ${bg} ${isNight ? '' : 'border-s border-rule'}`}>
      <div className="flex items-center gap-2.5">
        <Icon name={icon} size={compact ? 24 : 32} stroke={1.4} />
        <span className={`font-serif font-medium leading-none ${compact ? 'text-[19px]' : 'text-[24px]'}`}>{label}</span>
      </div>
      <div className={`flex items-end justify-between tabular ${compact ? 'text-[14px]' : 'text-[17px]'} font-medium`} dir="rtl">
        <span>{fmtTime(win?.start, tz)}</span>
        <span className={`h-px flex-1 mx-2 mb-[7px] ${isNight ? 'bg-night-text/30' : 'bg-ink/25'}`} />
        <span className={sub}>{fmtTime(win?.end, tz)}</span>
      </div>
      {pct != null && (
        <>
          <span
            className="pointer-events-none absolute inset-y-0 w-[2px] -me-[1px]"
            style={{ right: `${pct}%`, background: needle }}
          />
          <span
            className="pointer-events-none absolute top-0 -me-[18px] rounded-b-sm px-1.5 py-[2px] text-[10px] font-bold leading-none"
            style={{ right: `${pct}%`, background: needle, color: isNight ? '#2E1D3A' : '#FFFCFB' }}
          >
            עכשיו
          </span>
        </>
      )}
    </div>
  )
}
