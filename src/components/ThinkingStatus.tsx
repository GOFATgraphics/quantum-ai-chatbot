import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

const DEFAULT_STEPS = ['Thinking…', 'Gathering context…', 'Working on it…']
const SEARCH_STEPS = ['Searching…', 'Checking sources…', 'Synthesizing…']
const EMAIL_STEPS = ['Checking inbox…', 'Reading messages…', 'Sorting…']
const DRIVE_STEPS = ['Looking through files…', 'Finding matches…']
const CAL_STEPS = ['Checking calendar…', 'Pulling events…']

function pickSteps(prompt: string): string[] {
  const p = prompt.toLowerCase()
  if (/email|inbox|gmail|mail|message|send|outlook/.test(p)) return EMAIL_STEPS
  if (/calendar|schedule|meeting|event|appointment/.test(p)) return CAL_STEPS
  if (/drive|doc|file|sheet|document|excel/.test(p)) return DRIVE_STEPS
  if (/search|find|look up/.test(p)) return SEARCH_STEPS
  return DEFAULT_STEPS
}

function friendlyToolLabel(raw: string): string {
  const map: Record<string, string> = {
    search_gmail: 'Searching Gmail…',
    get_gmail_message: 'Reading email…',
    send_email: 'Sending email…',
    create_email_draft: 'Creating draft…',
    reply_email: 'Replying…',
    forward_email: 'Forwarding…',
    modify_gmail: 'Updating mail…',
    list_gmail_labels: 'Checking labels…',
    bulk_archive_gmail: 'Archiving mail…',
    search_drive: 'Searching Drive…',
    read_google_doc: 'Reading Doc…',
    create_google_doc: 'Creating Doc…',
    append_google_doc: 'Updating Doc…',
    search_sheets: 'Searching Sheets…',
    read_sheet: 'Reading sheet…',
    create_spreadsheet: 'Creating spreadsheet…',
    update_sheet: 'Updating sheet…',
    list_calendar_events: 'Checking calendar…',
    create_calendar_event: 'Creating event…',
    search_outlook: 'Searching Outlook…',
    search_excel: 'Searching Excel…',
    save_memory: 'Saving memory…',
    web_search: 'Searching the web…',
    web_fetch: 'Reading page…',
  }
  const parts = raw.split(/[,·|]/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return 'Working…'
  return parts.map((p) => map[p] || (p.replace(/_/g, ' ') + '…')).join(' · ')
}

type Props = {
  prompt?: string
  dark: boolean
  toolLabel?: string | null
}

/** Single compact status line — no multi-step list eating the screen */
export default function ThinkingStatus({ prompt = '', toolLabel }: Props) {
  const steps = pickSteps(prompt)
  const [activeIdx, setActiveIdx] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setActiveIdx(0)
    const t = setInterval(() => {
      setActiveIdx((v) => (v < steps.length - 1 ? v + 1 : v))
    }, 1800)
    return () => clearInterval(t)
  }, [steps])

  const label = toolLabel ? friendlyToolLabel(toolLabel) : steps[activeIdx]

  return (
    <div
      className="inline-flex items-center gap-2 py-0.5 min-h-[22px] max-w-full"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center gap-1 shrink-0" aria-hidden>
        {[0, 1, 2].map((d) => (
          <motion.span
            key={d}
            className="block w-1.5 h-1.5 rounded-full bg-foreground"
            animate={
              reduceMotion
                ? { opacity: 0.7 }
                : { opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 1.05, repeat: Infinity, delay: d * 0.16, ease: 'easeInOut' }
            }
          />
        ))}
      </div>
      <span
        className="text-[13px] font-medium truncate text-muted-foreground"
      >
        {label}
      </span>
    </div>
  )
}
