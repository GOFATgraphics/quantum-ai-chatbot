import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Logo from './Logo'

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
    <div className="flex items-center gap-3 py-1.5">
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="shrink-0"
      >
        <Logo size={28} dark={dark} />
      </motion.div>
      <div className={`text-[15px] font-medium ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <AnimatePresence mode="wait">
          <motion.span
            key={steps[i]}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="inline-block"
          >
            {steps[i]}
            <span className={`inline-block w-4 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>…</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}
