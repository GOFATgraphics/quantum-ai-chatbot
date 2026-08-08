import { motion } from 'framer-motion'
import Logo from './Logo'

const SUGGESTIONS = [
  'Summarize my unread emails',
  'What is on my calendar this week?',
  'Search my Drive for recent docs',
  'Draft a short follow-up email',
]

type Props = {
  greeting: string
  dark: boolean
  onSuggestion: (text: string) => void
}

export default function EmptyState({ greeting, dark, onSuggestion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 pb-2">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center w-full max-w-lg"
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6"
        >
          <Logo size={56} dark={dark} />
        </motion.div>
        <h1
          className={`text-[1.85rem] sm:text-[2.1rem] font-normal tracking-tight ${
            dark ? 'text-slate-50' : 'text-slate-900'
          }`}
        >
          {greeting}
        </h1>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className={`text-left text-sm px-4 py-3 rounded-2xl transition border ${
                dark
                  ? 'bg-white/[0.04] border-white/10 text-slate-200 hover:bg-white/[0.08]'
                  : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
