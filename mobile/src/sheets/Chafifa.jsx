import { useState } from 'react'
import { api } from '../lib/api'
import { CHAFIFA_GROUPS, CHAFIFA_ITEMS } from '../lib/status'
import { Button, Check, Sheet } from '../ui/controls'
import Icon from '../ui/Icon'

// ── הכנה לטבילה: רשימות סימון (מה להסיר ומה לקחת), עם סימון שנשמר בנידה ────────
export function useChafifa(cycle, onRefresh) {
  const [busy, setBusy] = useState(null)
  const checklist = cycle?.chafifaChecklist ?? {}
  const done = CHAFIFA_ITEMS.filter((i) => checklist[i.key]).length

  async function toggle(key, checked) {
    setBusy(key)
    try {
      await api.recordChafifa({ itemKey: key, checked, cycleId: cycle?._id })
      await onRefresh()
    } catch (e) { alert(e.message) }
    finally { setBusy(null) }
  }
  return { checklist, done, total: CHAFIFA_ITEMS.length, busy, toggle }
}

export function ChafifaList({ cycle, onRefresh }) {
  const { checklist, busy, toggle } = useChafifa(cycle, onRefresh)
  return (
    <div>
      {CHAFIFA_GROUPS.map((group) => {
        const groupDone = group.items.filter((i) => checklist[i.key]).length
        return (
          <section key={group.key} className="mb-5 last:mb-0">
            <div className="mb-1 flex items-end justify-between border-b border-rule pb-2">
              <h3 className="eyebrow">{group.title}</h3>
              <span className="text-[12px] tabular text-ink-mute">{groupDone}/{group.items.length}</span>
            </div>
            <div className="divide-y divide-rule">
              {group.items.map((item) => (
                <Check
                  key={item.key}
                  checked={!!checklist[item.key]}
                  disabled={busy === item.key}
                  onChange={(v) => toggle(item.key, v)}
                >
                  {item.label}
                </Check>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// mikveh = { done, doneAt, can, busy, onDo } — מגיע ממסך הבית ומשתמש באותה פעולה ובאותם תנאים
// (ליל הטבילה, אחרי השקיעה) של כפתור "הלכתי למקווה", בלי לחשב דבר חדש כאן.
export function ChafifaSheet({ cycle, onRefresh, onClose, mikveh }) {
  const { done, total } = useChafifa(cycle, onRefresh)
  return (
    <Sheet
      eyebrow={`${done} מתוך ${total}`}
      title="הכנה לטבילה"
      onClose={onClose}
      footer={mikveh && <MikvehMark {...mikveh} />}
    >
      <p className="mb-4 text-[13px] leading-relaxed text-ink-soft">
        הסימון הוא תיעוד בלבד. הרשימה כללית, ובמקרה של ספק יש לשאול רב או מדריכת כלות.
      </p>
      <ChafifaList cycle={cycle} onRefresh={onRefresh} />
    </Sheet>
  )
}

function MikvehMark({ done, doneAt, can, busy, onDo }) {
  if (done) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-md bg-tahor-wash px-4 py-3.5 text-[15px] font-semibold text-tahor">
        <Icon name="check" size={20} stroke={2.2} />
        בוצעה טבילה{doneAt ? ` · ${doneAt}` : ''}
      </p>
    )
  }
  if (!can) {
    return <p className="rounded-md border border-dashed border-rule px-4 py-3.5 text-center text-[14px] text-ink-mute">סימון הטבילה יהיה זמין בליל הטבילה, משקיעה</p>
  }
  return (
    <Button tone="mikveh" icon="wave" disabled={busy} onClick={onDo}>סימון שבוצעה טבילה</Button>
  )
}
