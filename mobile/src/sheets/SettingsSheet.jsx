import { useState } from 'react'
import { api } from '../lib/api'
import { Sheet, Toggle, Segmented } from '../ui/controls'

function Row({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-rule py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[16px] font-medium leading-tight">{title}</p>
        {desc && <p className="mt-1 text-[13px] leading-snug text-ink-soft">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Group({ title, children }) {
  return (
    <section className="mb-6">
      <h3 className="eyebrow mb-1 border-b border-rule pb-2">{title}</h3>
      {children}
    </section>
  )
}

export default function SettingsSheet({ cycle, onClose, onRefresh }) {
  const [loading, setLoading] = useState(false)

  async function save(patch) {
    setLoading(true)
    try { await api.updateSettings(patch); await onRefresh() }
    catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <Sheet eyebrow="הלכה וחישוב" title="הגדרות" onClose={onClose}>
      <div className={loading ? 'pointer-events-none opacity-60' : ''}>
        <Group title="חישוב ווסתות">
          <Row title="שיטת שוע״ר להפלגה" desc="חישוב הפלגה מסוף הדימום (הפסק) ולא מתחילתו">
            <Toggle on={!!cycle?.useShuar} onChange={(v) => save({ useShuar: v })} />
          </Row>
          <Row title="חומרת יום ל״א" desc="פרישה גם ביום ל״א בעונת הראייה (כד,כט)">
            <Toggle on={!!cycle?.onaBeinonit31} onChange={(v) => save({ onaBeinonit31: v })} />
          </Row>
          <Row title="ל׳ בחודש חסר" desc="כשראיית ל׳ והחודש הבא חסר">
            <Segmented
              value={cycle?.day30Policy ?? 'tzemach_tzedek'}
              onChange={(v) => save({ day30Policy: v })}
              options={[{ value: 'tzemach_tzedek', label: 'צמח צדק' }, { value: 'rosh_chodesh', label: 'ר״ח' }]}
            />
          </Row>
        </Group>

        <Group title="מצב אישי">
          <Row title="הריון" desc="מצב מסולקת דמים — ממתן חששות ווסת">
            <Toggle
              on={!!cycle?.isPregnant}
              onChange={(v) => save(v
                ? { isPregnant: true, pregnancyStart: cycle?.latestSighting?.gregorianDatetime ?? null }
                : { isPregnant: false })}
            />
          </Row>
          <Row title="מניקה" desc="מצב מסולקת דמים — ממתן חששות ווסת">
            <Toggle on={!!cycle?.isMeineket} onChange={(v) => save({ isMeineket: v })} />
          </Row>
          <Row title="שאלת הריון" desc="ימים מהראייה האחרונה שאחריהם נשאל אם את בהריון (0 = כבוי)">
            <input
              type="number" min="0" max="365" inputMode="numeric"
              defaultValue={cycle?.pregnancyPromptDays ?? 60}
              onBlur={(e) => save({ pregnancyPromptDays: Math.max(0, Number(e.target.value) || 0) })}
              className="h-10 w-[68px] rounded-md border border-rose/30 bg-paper-bright text-center text-[16px] font-medium outline-none focus:border-ink"
            />
          </Row>
        </Group>

        <p className="text-[12px] leading-relaxed text-ink-mute">
          ההגדרות משפיעות על חישוב חששות הווסת בלבד. בכל ספק — יש לשאול רב.
        </p>
      </div>
    </Sheet>
  )
}
