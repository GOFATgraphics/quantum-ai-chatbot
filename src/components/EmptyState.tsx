import { motion } from 'framer-motion'
import Logo from './Logo'

const SUGGESTIONS = [
  'Draft a polite follow-up email',
  'Summarize my unread emails',
  'Help me plan my day',
  'Remember that I prefer short answers',
]

type Props = {
  greeting: string
  dark: boolean
  onSuggestion?: (text: string) => void
}

export default function EmptyState({ greeting, dark, onSuggestion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center w-full max-w-md"
      >
        <div className="relative mb-8">
          <div
            className={`absolute inset-0 -m-6 rounded-full blur-2xl opacity-60 ${
              dark ? 'bg-indigo-500/20' : 'bg-violet-400/25'
            }`}
            aria-hidden
          />
          <motion.div
            animate={{ scale: [1, 1.045, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <Logo size={56} dark={dark} />
          </motion.div>
        </div>
        <h1
          className={`text-[1.8rem] sm:text-[2.05rem] font-medium tracking-[-0.02em] leading-[1.22] ${
            dark ? 'text-white' : 'text-slate-900'
          }`}
        >
          {greeting}
        </h1>
        {onSuggestion && (
          <div className="mt-8 flex flex-col items-center gap-2 w-full">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className={`w-full max-w-sm text-[14px] px-4 py-2.5 rounded-full transition ${
                  dark
                    ? 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.1] ring-1 ring-white/10'
                    : 'bg-white/80 text-slate-700 hover:bg-white shadow-sm ring-1 ring-black/[0.04]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
