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

type Props = { prompt?: string; dark: boolean }

export default function ThinkingStatus({ prompt = '', dark }: Props) {
  const steps = pickSteps(prompt)
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), 1600)
    return () => clearInterval(t)
  }, [steps])

  return (
    <div className="flex items-center gap-2.5 py-1.5 min-h-[32px]">
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
      <div className={`text-[14px] font-medium tracking-tight ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
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
    </div>
  )
}
