import { useEffect, useState } from 'react'
import Logo from './Logo'

const DEFAULT_STEPS = [
  'Thinking',
  'Gathering context',
  'Working on it',
]

const EMAIL_STEPS = [
  'Checking your inbox',
  'Scanning messages',
  'Sorting what matters',
  'Writing a summary',
]

const SEARCH_STEPS = [
  'Searching',
  'Digging through results',
  'Pulling the best bits',
]

function pickSteps(prompt: string): string[] {
  const p = prompt.toLowerCase()
  if (/email|inbox|gmail|mail|message/.test(p)) return EMAIL_STEPS
  if (/search|find|look up|document|file/.test(p)) return SEARCH_STEPS
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
    }, 1800)
    return () => clearInterval(t)
  }, [steps])

  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-indigo-500/30 blur-md animate-pulse" />
        <Logo size={28} className="relative animate-bounce-soft" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span key={i} className="inline-block animate-fade-up">
            {steps[i]}
          </span>
          <span className="inline-flex ml-0.5">
            <span className="animate-pulse-dot inline-block w-1 h-1 rounded-full bg-indigo-400 mx-[1px]" style={{ animationDelay: '0ms' }} />
            <span className="animate-pulse-dot inline-block w-1 h-1 rounded-full bg-indigo-400 mx-[1px]" style={{ animationDelay: '160ms' }} />
            <span className="animate-pulse-dot inline-block w-1 h-1 rounded-full bg-indigo-400 mx-[1px]" style={{ animationDelay: '320ms' }} />
          </span>
        </span>
        <span className={`text-[11px] ${textMuted}`}>Quantumy is on it</span>
      </div>
    </div>
  )
}
