import { motion } from 'framer-motion'
import Logo from './Logo'

type Props = {
  greeting: string
  dark: boolean
  onSuggestion?: (text: string) => void
}

export default function EmptyState({ greeting, dark }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center w-full max-w-md"
      >
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-7"
        >
          <Logo size={52} dark={dark} />
        </motion.div>
        <h1
          className={`text-[1.75rem] sm:text-[2rem] font-medium tracking-tight leading-[1.25] ${
            dark ? 'text-slate-50' : 'text-slate-900'
          }`}
        >
          {greeting}
        </h1>
      </motion.div>
    </div>
  )
}
