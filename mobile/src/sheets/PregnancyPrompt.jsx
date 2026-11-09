import { useState } from 'react'
import { api } from '../lib/api'
import { daysBetween, todayHebrew } from '../lib/hebrewCalendar'
import { Button } from '../ui/controls'

// מוקפץ כשעברו pregnancyPromptDays מהראייה האחרונה ללא ראייה חדשה. "כן" → מסמן
// הריון עם pregnancyStart = תאריך הראייה האחרונה; "לא" → מושתק לנידה הזו.
export default function PregnancyPrompt({ cycle, onRefresh, onClose }) {
  const [loading, setLoading] = useState(false)
  const onset = cycle?.latestSighting
  const days = onset ? daysBetween(onset.hebrewDate, todayHebrew()) : 0

  async function answer(pregnant) {
    setLoading(true)
    try {
      if (pregnant) await api.updateSettings({ isPregnant: true, pregnancyStart: onset.gregorianDatetime })
      else await api.updateSettings({ pregnancyPromptSnoozedFor: String(onset._id) })
      await onRefresh()
      onClose()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5" dir="rtl">
      <div className="absolute inset-0 bg-ink/60" />
      <div className="relative w-full max-w-sm rounded-lg border border-rule bg-paper-raised p-6 shadow-lift">
        <p className="eyebrow mb-2">שאלה אחת</p>
        <h2 className="font-serif text-[30px] font-medium leading-tight">האם את בהריון?</h2>
        <p className="mb-6 mt-3 text-[15px] leading-relaxed text-ink-soft">
          עברו <span className="tabular font-semibold text-ink">{days}</span> ימים מהראייה האחרונה ללא ראייה חדשה.
          אם את בהריון, לאחר שלושה חודשים נפסיק להציג חששות ווסת (מצב מסולקת דמים).
        </p>
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <Button tone="quiet" size="md" disabled={loading} onClick={() => answer(false)}>לא</Button>
          <Button tone="ink" size="md" disabled={loading} onClick={() => answer(true)}>{loading ? '…' : 'כן, אני בהריון'}</Button>
        </div>
      </div>
    </div>
  )
}
