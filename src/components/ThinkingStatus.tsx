import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

const DEFAULT_STEPS = ['Thinking', 'Gathering context', 'Working on it']
const THINK_STEPS = ['Reasoning', 'Checking assumptions', 'Refining answer']
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

function pickSteps(prompt: string, think?: boolean, deep?: boolean): string[] {
  const p = prompt.toLowerCase()
  if (deep) return SEARCH_STEPS
  if (think) return THINK_STEPS
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
  thinkActive?: boolean
  deepSearchActive?: boolean
  /** Live tool names from server status events, e.g. "search_gmail · web_search" */
  toolLabel?: string | null
}

export default function ThinkingStatus({
  prompt = '',
  dark,
  thinkActive,
  deepSearchActive,
  toolLabel,
}: Props) {
  const steps = pickSteps(prompt, thinkActive, deepSearchActive)
  const [i, setI] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    setI(0)
    setElapsed(0)
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), 1600)
    const e = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => {
      clearInterval(t)
      clearInterval(e)
    }
  }, [steps])

  const label =
    deepSearchActive ? 'DeepSearch' : thinkActive ? 'Think' : null
  const statusText = toolLabel ? friendlyToolLabel(toolLabel) : steps[i]

  return (
    <div
      className="flex flex-col gap-2 py-1.5 min-h-[32px]"
      role="status"
      aria-live="polite"
      aria-label={statusText}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className={`block w-1.5 h-1.5 rounded-full ${
                dark ? 'bg-indigo-300' : 'bg-indigo-500'
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
        <div
          className={`text-[14px] font-medium tracking-tight ${
            dark ? 'text-slate-200' : 'text-slate-700'
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={statusText}
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="inline-block"
            >
              {statusText}
            </motion.span>
          </AnimatePresence>
        </div>
        {label && (
          <motion.span
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              deepSearchActive
                ? dark
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-sky-50 text-sky-700'
                : dark
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'bg-violet-50 text-violet-700'
            }`}
          >
            {label}
          </motion.span>
        )}
      </div>

      <div
        className={`ml-6 h-[2px] w-[min(180px,40%)] rounded-full overflow-hidden ${
          dark ? 'bg-white/10' : 'bg-indigo-100'
        }`}
        aria-hidden
      >
        <motion.div
          className={`h-full w-1/3 rounded-full ${
            dark
              ? 'bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400'
              : 'bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500'
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

      {elapsed > 0 && (
        <div className={`text-[12px] pl-6 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          {elapsed}s
        </div>
      )}
    </div>
  )
}
