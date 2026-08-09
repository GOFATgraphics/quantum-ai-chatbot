import { motion } from 'framer-motion'
import { Mail, FileSpreadsheet, Calendar, Sparkles } from 'lucide-react'
import Logo from './Logo'

type Props = {
  greeting: string
  dark: boolean
  onSuggestion?: (text: string) => void
}

const SUGGESTIONS = [
  { icon: Mail, text: 'Summarize my unread emails' },
  { icon: FileSpreadsheet, text: 'Find last month\u2019s spreadsheet' },
  { icon: Calendar, text: 'What\u2019s on my calendar today?' },
  { icon: Sparkles, text: 'Draft a follow-up for a client' },
]

export default function EmptyState({ greeting, dark, onSuggestion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center w-full max-w-lg"
      >
        <div className="relative mb-7">
          <div
            className={`absolute inset-0 -m-8 rounded-full blur-3xl ${
              dark
                ? 'bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-sky-500/10'
                : 'bg-gradient-to-br from-indigo-400/35 via-violet-400/25 to-sky-300/15'
            }`}
            aria-hidden
          />
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <Logo size={64} dark={dark} animated />
          </motion.div>
        </div>

        <h1
          className={`text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.025em] leading-[1.25] max-w-md ${
            dark ? 'text-white' : 'text-slate-900'
          }`}
        >
          {greeting}
        </h1>

        <p
          className={`mt-3 text-[14px] leading-relaxed max-w-sm ${
            dark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          Connect your tools and let Quantumy handle email, docs, and schedules.
        </p>

        {onSuggestion && (
          <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-md">
            {SUGGESTIONS.map((s, i) => {
              const Icon = s.icon
              return (
                <motion.button
                  key={s.text}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.06, duration: 0.35 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSuggestion(s.text)}
                  className={`chip glass-chip ${
                    dark ? 'text-slate-200' : 'text-slate-700'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      dark ? 'text-indigo-300' : 'text-indigo-500'
                    }`}
                  />
                  {s.text}
                </motion.button>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}
