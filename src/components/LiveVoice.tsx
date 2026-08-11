import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mic, MicOff, User, UserRound, Languages } from 'lucide-react'
import Logo from './Logo'

export type VoiceGender = 'male' | 'female'
export type VoiceLanguage = 'en' | 'ha'

type Props = {
  dark: boolean
  firstName: string
  onClose: () => void
  onAsk: (text: string) => Promise<string>
  preferredVoice?: VoiceGender
  onVoiceChange?: (v: VoiceGender) => void
  preferredLanguage?: VoiceLanguage
  onLanguageChange?: (l: VoiceLanguage) => void
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function transcribeWithElevenLabs(blob: Blob, language: VoiceLanguage): Promise<string> {
  const audioBase64 = await blobToBase64(blob)
  const res = await fetch('/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || 'audio/webm',
      language,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || 'Speech recognition failed')
  return (data.text || '').trim()
}

async function speakWithElevenLabs(
  text: string,
  gender: VoiceGender,
  language: VoiceLanguage,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  onEnd: () => void,
) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: gender, language }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'TTS failed')
    }
    const buf = await res.arrayBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
    if (audioRef.current) {
      try {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      } catch {
        /* ignore */
      }
    }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      onEnd()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      onEnd()
    }
    await audio.play()
  } catch (e) {
    // Browser fallback
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = language === 'ha' ? 'ha' : 'en-US'
      utter.onend = onEnd
      utter.onerror = onEnd
      window.speechSynthesis.speak(utter)
      return
    }
    onEnd()
  }
}

export default function LiveVoice({
  dark,
  firstName,
  onClose,
  onAsk,
  preferredVoice = 'female',
  onVoiceChange,
  preferredLanguage = 'en',
  onLanguageChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [caption, setCaption] = useState('')
  const [reply, setReply] = useState('')
  const [voice, setVoice] = useState<VoiceGender>(preferredVoice)
  const [language, setLanguage] = useState<VoiceLanguage>(preferredLanguage)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const busyRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false)
      setError('Microphone is not supported in this browser.')
    }
    return () => {
      try {
        mediaRecRef.current?.stop()
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      try {
        audioRef.current?.pause()
        window.speechSynthesis?.cancel()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const handleTurn = async (text: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setPhase('thinking')
    setError(null)
    setReply('')
    setCaption(text)
    try {
      const answer = await onAsk(text)
      const clean = (answer || '').replace(/\s+/g, ' ').trim()
      setReply(clean)
      setPhase('speaking')
      await speakWithElevenLabs(
        clean || (language === 'ha' ? 'Ban fahimta ba.' : 'Sorry, I did not catch that.'),
        voice,
        language,
        audioRef,
        () => {
          busyRef.current = false
          setPhase('idle')
          setCaption('')
        },
      )
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
      busyRef.current = false
      setPhase('idle')
    }
  }

  const startListening = useCallback(async () => {
    if (busyRef.current) return
    setError(null)
    setCaption('')
    setReply('')
    try {
      audioRef.current?.pause()
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : ''
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size < 500) {
          setPhase('idle')
          setError(language === 'ha' ? 'Ba a ji magana ba. Sake gwadawa.' : 'No speech detected. Try again.')
          return
        }
        setPhase('thinking')
        try {
          const text = await transcribeWithElevenLabs(blob, language)
          if (!text) {
            setPhase('idle')
            setError(language === 'ha' ? 'Ba a gane magana ba.' : 'Could not understand speech.')
            return
          }
          void handleTurn(text)
        } catch (e: any) {
          setError(e?.message || 'Transcription failed')
          setPhase('idle')
        }
      }
      mediaRecRef.current = rec
      rec.start()
      setPhase('listening')
    } catch (e: any) {
      setSupported(false)
      setError(
        e?.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : 'Could not start microphone',
      )
      setPhase('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, voice])

  const stopListening = useCallback(() => {
    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stop()
      }
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

  const changeLanguage = (l: VoiceLanguage) => {
    setLanguage(l)
    onLanguageChange?.(l)
    try {
      localStorage.setItem('quantumy-language', l)
    } catch {
      /* ignore */
    }
  }

  const statusLabel =
    phase === 'listening'
      ? language === 'ha'
        ? 'Ina saurare…'
        : 'Listening…'
      : phase === 'thinking'
        ? language === 'ha'
          ? 'Ina tunani…'
          : 'Thinking…'
        : phase === 'speaking'
          ? language === 'ha'
            ? 'Ina magana…'
            : 'Speaking…'
          : language === 'ha'
            ? `Sannu${firstName && firstName !== 'there' ? ` ${firstName}` : ''} — danna mic don magana`
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
              mediaRecRef.current?.stop()
              streamRef.current?.getTracks().forEach((t) => t.stop())
              audioRef.current?.pause()
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
        <span className={`text-sm font-semibold ${dark ? 'text-white/90' : 'text-slate-800'}`}>
          Live voice
        </span>
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

        {/* Language picker */}
        <div
          className={`mt-6 flex items-center gap-2 p-1 rounded-full ${
            dark ? 'bg-white/10' : 'bg-white/80 shadow-sm ring-1 ring-black/[0.04]'
          }`}
        >
          <button
            type="button"
            onClick={() => changeLanguage('en')}
            className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-semibold transition ${
              language === 'en'
                ? dark
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-900 text-white'
                : dark
                  ? 'text-white/70'
                  : 'text-slate-600'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            English
          </button>
          <button
            type="button"
            onClick={() => changeLanguage('ha')}
            className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-semibold transition ${
              language === 'ha'
                ? dark
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-900 text-white'
                : dark
                  ? 'text-white/70'
                  : 'text-slate-600'
            }`}
          >
            Hausa
          </button>
        </div>

        {/* Voice picker */}
        <div
          className={`mt-3 flex items-center gap-2 p-1 rounded-full ${
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
            else void startListening()
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
          {phase === 'listening'
            ? language === 'ha'
              ? 'Danna don aika'
              : 'Tap to send'
            : language === 'ha'
              ? 'Danna don magana'
              : 'Tap to speak'}
        </p>
      </div>
    </motion.div>
  )
}
