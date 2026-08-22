import { motion, useReducedMotion } from 'framer-motion'

type Props = {
  greeting: string
  dark: boolean
  /** True while the composer is focused / user is typing */
  composing?: boolean
}

export default function EmptyState({ greeting, composing = false }: Props) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex flex-col items-center justify-center w-full px-5 relative">
      <div className="quantum-particles absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`quantum-particle quantum-particle-${i}`} />
        ))}
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{
          opacity: 1,
          y: composing ? -6 : 0,
        }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center w-full max-w-lg"
      >
        <h1
          className="empty-greeting text-[1.75rem] sm:text-[2.05rem] font-semibold tracking-[-0.03em] leading-[1.22] max-w-md text-foreground"
        >
          {greeting}
        </h1>
      </motion.div>
    </div>
  )
}
