import { motion, useReducedMotion } from 'framer-motion'
import Logo from './Logo'

type Props = {
  greeting: string
  dark: boolean
  /** True while the composer is focused / user is typing */
  composing?: boolean
}

export default function EmptyState({ greeting, dark, composing = false }: Props) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex flex-col items-center justify-center w-full px-5 relative">
      <div className="quantum-particles absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`quantum-particle quantum-particle-${i}`} />
        ))}
      </div>

      {/*
        Soft nudge only — header stays fixed in App.
        Orbit + greeting shift a little when composing, then return on blur.
      */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{
          opacity: 1,
          y: composing ? -8 : 0,
          scale: composing ? 0.99 : 1,
        }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center w-full max-w-lg"
      >
        <div className="relative mb-5">
          <motion.div
            className={`absolute inset-0 -m-8 rounded-full blur-3xl ${
              dark
                ? 'bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-sky-500/10'
                : 'bg-gradient-to-br from-indigo-400/35 via-violet-400/25 to-sky-300/15'
            }`}
            animate={{
              scale: composing ? 1.06 : 1,
              opacity: composing ? 0.9 : 1,
            }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
            aria-hidden
          />
          {!reduceMotion && (
            <>
              <motion.div
                className="absolute pointer-events-none rounded-full border border-indigo-400/25"
                style={{ width: 96, height: 96, left: '50%', top: '50%', marginLeft: -48, marginTop: -48 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                aria-hidden
              >
                <span
                  className={`absolute w-2 h-2 rounded-full -top-1 left-1/2 -translate-x-1/2 ${
                    dark
                      ? 'bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]'
                      : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]'
                  }`}
                />
              </motion.div>
              <motion.div
                className="absolute pointer-events-none rounded-full border border-violet-400/15"
                style={{ width: 112, height: 112, left: '50%', top: '50%', marginLeft: -56, marginTop: -56 }}
                animate={{ rotate: -360 }}
                transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
                aria-hidden
              >
                <span
                  className={`absolute w-1.5 h-1.5 rounded-full top-1/2 -right-0.5 -translate-y-1/2 ${
                    dark ? 'bg-violet-300' : 'bg-violet-500'
                  }`}
                />
              </motion.div>
            </>
          )}
          <motion.div
            animate={
              reduceMotion
                ? { scale: 1 }
                : { scale: composing ? [1, 1.02, 1] : [1, 1.04, 1] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: composing ? 2.8 : 4.5, repeat: Infinity, ease: 'easeInOut' }
            }
            className="relative"
          >
            <Logo size={64} dark={dark} animated={!reduceMotion} />
          </motion.div>
        </div>

        <h1
          className={`text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.025em] leading-[1.25] max-w-md ${
            dark ? 'text-white' : 'text-slate-900'
          }`}
        >
          {greeting}
        </h1>
      </motion.div>
    </div>
  )
}
