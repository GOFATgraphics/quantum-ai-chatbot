import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const DEFAULT_STEPS = ['Thinking', 'Gathering context', 'Working on it']
const EMAIL_STEPS = [
  'Connecting to Workspace',
  'Checking your inbox',
  'Scanning messages',
  'Sorting what matters',
]
const SEARCH_STEPS = [
  'Connecting to Workspace',
  'Searching files',
  'Digging through results',
]
const DRIVE_STEPS = [
  'Connecting to Drive',
  'Looking through files',
  'Finding matches',
]

function pickSteps(prompt: string): string[] {
  const p = prompt.toLowerCase()
  if (/email|inbox|gmail|mail|message|send/.test(p)) return EMAIL_STEPS
  if (/drive|doc|file|sheet|document/.test(p)) return DRIVE_STEPS
  if (/search|find|look up/.test(p)) return SEARCH_STEPS
  return DEFAULT_STEPS
}

type Props = { prompt?: string; dark: boolean }

export default function ThinkingStatus({ prompt = '', dark }: Props) {
  const steps = pickSteps(prompt)
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), 1600)
    return () => clearInterval(t)
  }, [steps])

  const isWorkspace = /Workspace|Drive/.test(steps[i] || '')

  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1a73e8] opacity-40" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#1a73e8]" />
      </span>
      <div className={`text-[15px] ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <AnimatePresence mode="wait">
          <motion.span
            key={steps[i]}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-1.5"
          >
            {isWorkspace && (
              <span className="inline-flex gap-0.5 text-xs font-bold tracking-tight">
                <span className="text-[#ea4335]">M</span>
                <span className="text-[#4285f4]">D</span>
                <span className="text-[#34a853]">G</span>
              </span>
            )}
            {steps[i]}…
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}
