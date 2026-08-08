import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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

type Props = {
  prompt?: string
  dark: boolean
  thinkActive?: boolean
  deepSearchActive?: boolean
}

export default function ThinkingStatus({
  prompt = '',
  dark,
  thinkActive,
  deepSearchActive,
}: Props) {
  const steps = pickSteps(prompt, thinkActive, deepSearchActive)
  const [i, setI] = useState(0)
  const [elapsed, setElapsed] = useState(0)

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

  return (
    <div className="flex flex-col gap-1 py-1.5 min-h-[32px]">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className={`block w-1.5 h-1.5 rounded-full ${
                dark ? 'bg-indigo-300' : 'bg-indigo-500'
              }`}
              animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1, 0.85] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                delay: d * 0.18,
                ease: 'easeInOut',
              }}
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
              key={steps[i]}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.18 }}
              className="inline-block"
            >
              {steps[i]}
            </motion.span>
          </AnimatePresence>
        </div>
        {label && (
          <span
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
          </span>
        )}
      </div>
      {elapsed > 0 && (
        <div className={`text-[12px] pl-6 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          {elapsed}s
        </div>
      )}
    </div>
  )
}
