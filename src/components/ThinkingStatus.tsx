import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'

const DEFAULT_STEPS = ['Thinking', 'Gathering context', 'Working on it']
const SEARCH_STEPS = ['Searching sources', 'Cross-checking facts', 'Synthesizing findings']
const EMAIL_STEPS = [
  'Connecting to Workspace',
  'Checking your inbox',
  'Scanning messages',
  'Sorting what matters',
]
const DRIVE_STEPS = [
  'Connecting to Drive',
  'Looking through files',
  'Finding matches',
]
const CAL_STEPS = [
  'Opening Calendar',
  'Checking your schedule',
  'Pulling events',
]

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
    search_gmail: 'Searching Gmail',
    get_gmail_message: 'Reading email',
    send_email: 'Sending email',
    create_email_draft: 'Creating draft',
    reply_email: 'Replying',
    forward_email: 'Forwarding',
    modify_gmail: 'Updating mail',
    list_gmail_labels: 'Checking labels',
    bulk_archive_gmail: 'Archiving mail',
    search_drive: 'Searching Drive',
    read_google_doc: 'Reading Doc',
    create_google_doc: 'Creating Doc',
    append_google_doc: 'Updating Doc',
    search_sheets: 'Searching Sheets',
    read_sheet: 'Reading sheet',
    create_spreadsheet: 'Creating spreadsheet',
    update_sheet: 'Updating sheet',
    list_calendar_events: 'Checking calendar',
    create_calendar_event: 'Creating event',
    search_outlook: 'Searching Outlook',
    search_excel: 'Searching Excel',
    save_memory: 'Saving memory',
    web_search: 'Searching the web',
    web_fetch: 'Reading page',
  }
  const parts = raw.split(/[,·|]/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return 'Working…'
  return parts.map((p) => map[p] || p.replace(/_/g, ' ')).join(' · ')
}

type Props = {
  prompt?: string
  dark: boolean
  /** Live tool names from server status events, e.g. "search_gmail · web_search" */
  toolLabel?: string | null
}

export default function ThinkingStatus({
  prompt = '',
  dark,
  toolLabel,
}: Props) {
  const steps = pickSteps(prompt)
  const [activeIdx, setActiveIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setActiveIdx(0)
    setElapsed(0)
    // Advance through steps so completed ones get checkmarks; keep last active
    const t = setInterval(() => {
      setActiveIdx((v) => (v < steps.length - 1 ? v + 1 : v))
    }, 1600)
    const e = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => {
      clearInterval(t)
      clearInterval(e)
    }
  }, [steps])

  const liveTool = toolLabel ? friendlyToolLabel(toolLabel) : null

  return (
    <div
      className="flex flex-col gap-2.5 py-1.5 min-h-[32px] max-w-full overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={liveTool || steps[activeIdx]}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className={`block w-1.5 h-1.5 rounded-full ${
                dark ? 'bg-white' : 'bg-neutral-900'
              }`}
              animate={
                reduceMotion
                  ? { opacity: 0.7 }
                  : { opacity: [0.35, 1, 0.35], scale: [0.85, 1, 0.85] }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 1.1,
                      repeat: Infinity,
                      delay: d * 0.18,
                      ease: 'easeInOut',
                    }
              }
            />
          ))}
        </div>
        {elapsed > 0 && (
          <span className={`text-[12px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            {elapsed}s
          </span>
        )}
      </div>

      {/* Full step list — nothing hidden behind ellipsis */}
      <ul className="ml-1 space-y-1.5">
        {steps.map((step, i) => {
          const done = i < activeIdx
          const current = i === activeIdx
          return (
            <li
              key={step}
              className={`flex items-center gap-2 text-[13px] font-medium transition-opacity ${
                done
                  ? dark
                    ? 'text-slate-400'
                    : 'text-slate-500'
                  : current
                    ? dark
                      ? 'text-slate-100'
                      : 'text-slate-800'
                    : dark
                      ? 'text-slate-600'
                      : 'text-slate-400'
              }`}
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                {done ? (
                  <Check className={`w-3.5 h-3.5 ${dark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                ) : current ? (
                  <Loader2
                    className={`w-3.5 h-3.5 animate-spin ${dark ? 'text-white' : 'text-neutral-900'}`}
                  />
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-slate-600' : 'bg-slate-300'}`}
                  />
                )}
              </span>
              <span className="min-w-0 break-words">{step}</span>
            </li>
          )
        })}
      </ul>

      {liveTool && (
        <div
          className={`ml-1 inline-flex items-center gap-2 text-[13px] font-semibold px-2.5 py-1 rounded-full w-fit ${
            dark
              ? 'text-neutral-200 bg-white/10 ring-1 ring-white/15'
              : 'text-neutral-800 bg-neutral-100 ring-1 ring-black/10'
          }`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="min-w-0 break-words">{liveTool}</span>
        </div>
      )}

      <div
        className={`ml-1 h-[2px] w-[min(180px,40%)] rounded-full overflow-hidden ${
          dark ? 'bg-white/10' : 'bg-neutral-200'
        }`}
        aria-hidden
      >
        <motion.div
          className={`h-full w-1/3 rounded-full ${
            dark
              ? 'bg-gradient-to-r from-white via-neutral-300 to-neutral-500'
              : 'bg-gradient-to-r from-neutral-900 via-neutral-600 to-neutral-400'
          }`}
          animate={reduceMotion ? { x: '100%' } : { x: ['-100%', '300%'] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: 1.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
          }
        />
      </div>
    </div>
  )
}
