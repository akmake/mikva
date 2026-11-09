import { useEffect } from 'react'
import Icon from './Icon'

// ── כפתור ───────────────────────────────────────────────────────────────────
// tone: ink | blood | mikveh | quiet (קו מתאר)
const BTN = {
  ink:    'bg-rose text-paper-bright shadow-lift active:bg-rose-deep',
  blood:  'bg-blood text-paper-bright shadow-lift active:bg-[#8A262E]',
  mikveh: 'bg-mikveh text-paper-bright active:bg-[#2D4C7A]',
  count:  'bg-count text-paper-bright active:bg-[#225D62]',
  hefsek: 'bg-[#D6A93A] text-[#3E2C05] active:bg-[#C49A30]',
  quiet:  'border border-rose/40 bg-paper-bright text-rose active:bg-rose-wash',
}
export function Button({ tone = 'ink', icon, children, className = '', size = 'lg', ...rest }) {
  const h = size === 'lg' ? 'h-14 text-[17px]' : 'h-11 text-[15px]'
  return (
    <button
      className={`flex w-full items-center justify-center gap-2.5 rounded-md font-semibold transition-colors disabled:opacity-40 ${h} ${BTN[tone]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} stroke={1.8} />}
      {children}
    </button>
  )
}

// ── תווית-קטע: קו כפול דק + כותרת, כמו פרק בספר ────────────────────────────
export function SectionHead({ children, aside }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="eyebrow">{children}</h2>
      {aside && <span className="text-[12px] text-ink-mute tabular">{aside}</span>}
    </div>
  )
}

// ── מתג ─────────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full border transition-colors ${
        on ? 'border-rose bg-rose' : 'border-ink-faint bg-paper-deep'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`absolute top-[2px] h-[20px] w-[20px] rounded-full bg-paper-bright shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-all ${
          on ? 'end-[2px]' : 'start-[2px]'
        }`}
      />
    </button>
  )
}

// ── בורר מקטעים ──────────────────────────────────────────────────────────────
export function Segmented({ value, options, onChange }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-rose/40 bg-paper-bright">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 text-[13px] font-medium transition-colors ${i > 0 ? 'border-s border-rose/40' : ''} ${
            value === o.value ? 'bg-rose text-paper-bright' : 'text-ink-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── תיבת סימון ───────────────────────────────────────────────────────────────
export function Check({ checked, onChange, disabled, children }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 py-2.5 text-start"
    >
      <span
        className={`mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm border transition-colors ${
          checked ? 'border-tahor bg-tahor text-paper-bright' : 'border-ink-faint bg-paper-bright'
        }`}
      >
        {checked && <Icon name="check" size={15} stroke={2.4} />}
      </span>
      <span className={`text-[15px] leading-snug ${checked ? 'text-ink-mute' : 'text-ink'}`}>{children}</span>
    </button>
  )
}

// ── גיליון תחתון ─────────────────────────────────────────────────────────────
export function Sheet({ title, eyebrow, onClose, children, footer }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" dir="rtl">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-sheet bg-paper-raised shadow-sheet">
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-[3px] w-9 rounded-full bg-ink-faint" />
        </div>
        <div className="flex items-start justify-between px-5 pb-3 pt-2">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h2 className="font-serif text-[30px] font-medium leading-none text-ink">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="-me-2 flex h-10 w-10 items-center justify-center text-ink-soft"
          >
            <Icon name="x" size={22} />
          </button>
        </div>
        <div className="scroll-clean min-h-0 flex-1 overflow-y-auto border-t border-rule px-5 pb-6 pt-4">{children}</div>
        {footer && (
          <div className="border-t border-rule bg-paper-raised px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── שורת אירוע בגיליון (פס צבעוני בצד + טקסט) ───────────────────────────────
export function EventRow({ color, title, sub, right, muted }) {
  return (
    <div className={`flex items-stretch gap-3 border-b border-rule py-3 last:border-b-0 ${muted ? 'opacity-55' : ''}`}>
      <span className="w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className={`text-[16px] font-semibold leading-tight ${muted ? 'line-through' : ''}`}>{title}</p>
        {sub && <p className="mt-0.5 text-[13px] text-ink-soft">{sub}</p>}
      </div>
      {right}
    </div>
  )
}
