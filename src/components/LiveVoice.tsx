import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mic, MicOff, User, UserRound } from 'lucide-react'
import Logo from './Logo'

export type VoiceGender = 'male' | 'female'

type Props = {
  dark: boolean
  firstName: string
  onClose: () => void
  onAsk: (text: string) => Promise<string>
  preferredVoice?: VoiceGender
  onVoiceChange?: (v: VoiceGender) => void
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

function pickVoice(gender: VoiceGender): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  const en = voices.filter((v) => /en(-|_|$)/i.test(v.lang))
  const pool = en.length ? en : voices

  const femaleHints = /female|woman|girl|samantha|karen|moira|tessa|fiona|victoria|zira|susan|emma|amy|joanna|ivy|salli|kimberly|kendra|olivia|ava|aria|jenny|natural/i
  const maleHints = /male|man|boy|daniel|james|alex|fred|tom|david|mark|matthew|justin|joey|brian|guy|eric|ryan|arthur|thomas|aaron/i

  if (gender === 'female') {
    const hit =
      pool.find((v) => femaleHints.test(v.name)) ||
      pool.find((v) => /google uk english female|microsoft zira|samantha/i.test(v.name)) ||
      pool.find((v) => v.name.toLowerCase().includes('female'))
    return hit || pool[0] || null
  }

  const hit =
    pool.find((v) => maleHints.test(v.name) && !femaleHints.test(v.name)) ||
    pool.find((v) => /google uk english male|microsoft david|daniel|alex/i.test(v.name)) ||
    pool.find((v) => v.name.toLowerCase().includes('male'))
  return hit || pool[Math.min(1, pool.length - 1)] || pool[0] || null
}

function speakText(text: string, gender: VoiceGender, onEnd: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd()
    return null
  }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(gender)
  if (voice) utter.voice = voice
  utter.rate = 1.02
  utter.pitch = gender === 'female' ? 1.05 : 0.95
  utter.volume = 1
  utter.onend = onEnd
  utter.onerror = onEnd
  window.speechSynthesis.speak(utter)
  return utter
}

export default function LiveVoice({
  dark,
  firstName,
  onClose,
  onAsk,
  preferredVoice = 'female',
  onVoiceChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [caption, setCaption] = useState('')
  const [reply, setReply] = useState('')
  const [voice, setVoice] = useState<VoiceGender>(preferredVoice)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  const recRef = useRef<SpeechRecognition | null>(null)
  const baseRef = useRef('')
  const phaseRef = useRef<Phase>('idle')
  const busyRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const load = () => window.speechSynthesis?.getVoices()
    load()
    window.speechSynthesis?.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load)
  }, [])

  useEffect(() => {
    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null
    if (!SR) {
      setSupported(false)
      setError('Voice is not supported in this browser. Try Safari or Chrome.')
      return
    }

    const rec: SpeechRecognition = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US'

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let finalText = ''
      const start = (event as SpeechRecognitionEvent & { resultIndex?: number }).resultIndex ?? 0
      for (let i = start; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript || ''
        if (event.results[i].isFinal) finalText += piece
        else interim += piece
      }
      const shown = (baseRef.current + ' ' + (finalText || interim)).replace(/\s+/g, ' ').trim()
      setCaption(shown)
      if (finalText) {
        baseRef.current = (baseRef.current + ' ' + finalText).replace(/\s+/g, ' ').trim()
      }
    }

    rec.onerror = (e: any) => {
      if (e?.error === 'aborted' || e?.error === 'no-speech') {
        if (phaseRef.current === 'listening') setPhase('idle')
        return
      }
      setError(e?.error === 'not-allowed' ? 'Microphone permission denied.' : 'Voice error. Try again.')
      setPhase('idle')
    }

    rec.onend = () => {
      if (phaseRef.current !== 'listening') return
      const text = baseRef.current.trim()
      if (!text || busyRef.current) {
        setPhase('idle')
        return
      }
      void handleTurn(text)
    }

    recRef.current = rec
    return () => {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
      recRef.current = null
      try {
        window.speechSynthesis?.cancel()
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTurn = async (text: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setPhase('thinking')
    setError(null)
    setReply('')
    try {
      const answer = await onAsk(text)
      const clean = (answer || '').replace(/\s+/g, ' ').trim()
      setReply(clean)
      setPhase('speaking')
      speakText(clean || 'Sorry, I did not catch that.', voice, () => {
        busyRef.current = false
        setPhase('idle')
        baseRef.current = ''
        setCaption('')
      })
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
      busyRef.current = false
      setPhase('idle')
    }
  }

  const startListening = useCallback(() => {
    if (!recRef.current || busyRef.current) return
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
    baseRef.current = ''
    setCaption('')
    setReply('')
    setError(null)
    try {
      recRef.current.start()
      setPhase('listening')
    } catch {
      setError('Could not start microphone')
      setPhase('idle')
    }
  }, [])

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
  }, [])

  const changeVoice = (g: VoiceGender) => {
    setVoice(g)
    onVoiceChange?.(g)
    try {
      localStorage.setItem('quantumy-voice', g)
    } catch {
      /* ignore */
    }
  }

  const statusLabel =
    phase === 'listening'
      ? 'Listening…'
      : phase === 'thinking'
        ? 'Thinking…'
        : phase === 'speaking'
          ? 'Speaking…'
          : `Hi${firstName && firstName !== 'there' ? ` ${firstName}` : ''} — tap the mic to talk`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col"
      style={{
        background: dark
          ? 'radial-gradient(ellipse at 50% 30%, #1e1b4b 0%, #0a0a0f 55%, #050508 100%)'
          : 'radial-gradient(ellipse at 50% 30%, #e0e7ff 0%, #eef2ff 45%, #f8fafc 100%)',
      }}
    >
      <div className="pt-[env(safe-area-inset-top)] px-4 h-14 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => {
            try {
              recRef.current?.abort()
              window.speechSynthesis?.cancel()
            } catch {
              /* ignore */
            }
            onClose()
          }}
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            dark ? 'bg-white/10 text-white' : 'bg-white/80 text-slate-700 shadow-sm'
          }`}
          aria-label="Close live voice"
        >
          <X className="w-5 h-5" />
        </button>
        <span className={`text-sm font-semibold ${dark ? 'text-white/90' : 'text-slate-800'}`}>Live voice</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <div className="relative mb-8">
          <motion.div
            animate={
              phase === 'listening'
                ? { scale: [1, 1.12, 1], opacity: [0.35, 0.55, 0.35] }
                : phase === 'speaking'
                  ? { scale: [1, 1.08, 1], opacity: [0.3, 0.5, 0.3] }
                  : { scale: 1, opacity: 0.25 }
            }
            transition={{ duration: phase === 'idle' ? 3 : 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className={`absolute inset-0 -m-10 rounded-full blur-2xl ${
              phase === 'listening'
                ? 'bg-rose-400/40'
                : phase === 'speaking'
                  ? 'bg-indigo-400/40'
                  : dark
                    ? 'bg-indigo-500/30'
                    : 'bg-violet-400/30'
            }`}
          />
          <motion.div
            animate={phase === 'thinking' ? { rotate: 360 } : { rotate: 0 }}
            transition={phase === 'thinking' ? { duration: 2.2, repeat: Infinity, ease: 'linear' } : {}}
            className="relative"
          >
            <Logo size={72} dark={dark} />
          </motion.div>
        </div>

        <p className={`text-center text-[15px] font-medium mb-3 ${dark ? 'text-white/80' : 'text-slate-700'}`}>
          {statusLabel}
        </p>

        <AnimatePresence mode="wait">
          {(caption || reply) && (
            <motion.p
              key={caption || reply}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`text-center text-[17px] leading-relaxed max-w-md px-2 ${
                dark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {phase === 'speaking' || phase === 'thinking' ? reply || caption : caption}
            </motion.p>
          )}
        </AnimatePresence>

        {error && (
          <p className={`mt-3 text-sm text-center ${dark ? 'text-rose-300' : 'text-rose-600'}`}>{error}</p>
        )}

        {/* Voice picker */}
        <div
          className={`mt-8 flex items-center gap-2 p-1 rounded-full ${
            dark ? 'bg-white/10' : 'bg-white/80 shadow-sm ring-1 ring-black/[0.04]'
          }`}
        >
          <button
            type="button"
            onClick={() => changeVoice('female')}
            className={`h-10 px-4 rounded-full flex items-center gap-2 text-[13px] font-semibold transition ${
              voice === 'female'
                ? dark
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-900 text-white'
                : dark
                  ? 'text-white/70'
                  : 'text-slate-600'
            }`}
          >
            <UserRound className="w-4 h-4" />
            Woman
          </button>
          <button
            type="button"
            onClick={() => changeVoice('male')}
            className={`h-10 px-4 rounded-full flex items-center gap-2 text-[13px] font-semibold transition ${
              voice === 'male'
                ? dark
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-900 text-white'
                : dark
                  ? 'text-white/70'
                  : 'text-slate-600'
            }`}
          >
            <User className="w-4 h-4" />
            Man
          </button>
        </div>
      </div>

      <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={!supported || phase === 'thinking' || phase === 'speaking'}
          onClick={() => {
            if (phase === 'listening') stopListening()
            else startListening()
          }}
          className={`w-[72px] h-[72px] rounded-full flex items-center justify-center transition shadow-lg disabled:opacity-40 ${
            phase === 'listening'
              ? 'bg-rose-500 text-white shadow-rose-500/30'
              : dark
                ? 'bg-white text-slate-900'
                : 'bg-slate-900 text-white shadow-slate-900/25'
          }`}
          aria-label={phase === 'listening' ? 'Stop listening' : 'Start talking'}
        >
          {phase === 'listening' ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
        </button>
        <p className={`text-[12px] ${dark ? 'text-white/45' : 'text-slate-400'}`}>
          {phase === 'listening' ? 'Tap to send' : 'Tap to speak'}
        </p>
      </div>
    </motion.div>
  )
}
