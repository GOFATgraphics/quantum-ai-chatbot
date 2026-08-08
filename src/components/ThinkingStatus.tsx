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
  'Pulling the best bits',
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

type Props = {
  prompt?: string
  dark: boolean
}

export default function ThinkingStatus({ prompt = '', dark }: Props) {
  const steps = pickSteps(prompt)
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    const t = setInterval(() => {
      setI((v) => (v + 1) % steps.length)
    }, 1600)
    return () => clearInterval(t)
  }, [steps])

  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const isWorkspace = steps[i]?.includes('Workspace') || steps[i]?.includes('Drive')

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="relative flex h-8 w-8 items-center justify-center">
        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-500/20 animate-ping opacity-40" />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isWorkspace ? 'bg-blue-500' : 'bg-indigo-500'}`} />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-700'} h-5 overflow-hidden`}>
          <AnimatePresence mode="wait">
            <motion.span
              key={steps[i]}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="inline-flex items-center gap-1.5"
            >
              {isWorkspace && (
                <span className="inline-flex items-center gap-0.5 text-[13px]">
                  <span className="text-red-500">M</span>
                  <span className="text-blue-500">D</span>
                  <span className="text-green-500">G</span>
                </span>
              )}
              {steps[i]}
              <span className="inline-flex ml-0.5">
                <span className="animate-pulse-dot inline-block w-1 h-1 rounded-full bg-indigo-400 mx-[1px]" style={{ animationDelay: '0ms' }} />
                <span className="animate-pulse-dot inline-block w-1 h-1 rounded-full bg-indigo-400 mx-[1px]" style={{ animationDelay: '160ms' }} />
                <span className="animate-pulse-dot inline-block w-1 h-1 rounded-full bg-indigo-400 mx-[1px]" style={{ animationDelay: '320ms' }} />
              </span>
            </motion.span>
          </AnimatePresence>
        </div>
        <span className={`text-[11px] ${textMuted}`}>Quantumy is on it</span>
      </div>
    </div>
  )
}
