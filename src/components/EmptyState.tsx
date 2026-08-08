import { motion } from 'framer-motion'
import Logo from './Logo'

type Props = {
  greeting: string
  dark: boolean
  onSuggestion?: (text: string) => void
}

export default function EmptyState({ greeting, dark }: Props) {
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
              dark
                ? 'bg-indigo-500/20'
                : 'bg-violet-400/25'
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
      </motion.div>
    </div>
  )
}
