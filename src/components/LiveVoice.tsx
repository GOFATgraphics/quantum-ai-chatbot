import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Languages } from 'lucide-react'
import Logo from './Logo'

export type VoiceLanguage = 'en' | 'ha'

type Props = {
  dark: boolean
  firstName: string
  onClose: () => void
  onAsk: (text: string) => Promise<string>
  preferredLanguage?: VoiceLanguage
  onLanguageChange?: (l: VoiceLanguage) => void
  /** Stream already granted on Speak tap (required for reliable iOS mic). */
  initialStream?: MediaStream | null
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

function pickRecorderMime(): string {
  const candidates = [
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  for (const m of candidates) {
    try {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ignore */
    }
  }
  return ''
}

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

function voiceFriendlyText(text: string, language: VoiceLanguage): string {
  let t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return language === 'ha' ? 'Ban fahimta ba.' : 'Sorry, I did not catch that.'
  t = t
    .replace(/\u2014/g, ',')
    .replace(/\u2013/g, '-')
    .replace(/\u2015/g, ',')
    .replace(/--+/g, ',')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>~]/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 320) {
    const cut = t.slice(0, 320)
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    t = lastStop > 60 ? cut.slice(0, lastStop + 1) : cut + '…'
  }
  return t
}

async function unlockAudio(
  silentAudioRef: React.MutableRefObject<HTMLAudioElement | null>,
  audioCtxRef: React.MutableRefObject<AudioContext | null>,
) {
  try {
    if (!silentAudioRef.current) {
      const silent =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      const a = new Audio(silent)
      a.volume = 0.01
      silentAudioRef.current = a
    }
    await silentAudioRef.current.play().catch(() => {})
    silentAudioRef.current.pause()
  } catch {
    /* ignore */
  }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (Ctx) {
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
    }
  } catch {
    /* ignore */
  }
}

async function speakWithElevenLabs(
  text: string,
  language: VoiceLanguage,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  onEnd: () => void,
  onError?: (msg: string) => void,
) {
  const spoken = voiceFriendlyText(text, language)
  try {
    // No voice_id here — api/tts uses ELEVENLABS_VOICE_* from Vercel env
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: spoken,
        language,
        chunk: true,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || data.details || 'TTS failed')
    }
    const buf = await res.arrayBuffer()
    if (!buf.byteLength) throw new Error('Empty audio')
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
    audio.setAttribute('playsinline', 'true')
    ;(audio as any).playsInline = true
    audioRef.current = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      onEnd()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      onError?.('Audio playback failed')
      onEnd()
    }
    try {
      await audio.play()
    } catch {
      onError?.(
        language === 'ha'
          ? 'Danna allo don ba da izinin sauti.'
          : 'Tap the screen to allow sound.',
      )
      URL.revokeObjectURL(url)
      onEnd()
    }
  } catch (e: any) {
    onError?.(e?.message || 'Could not play voice')
    onEnd()
  }
}

export default function LiveVoice({
  dark,
  firstName,
  onClose,
  onAsk,
  preferredLanguage = 'en',
  onLanguageChange,
  initialStream = null,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [caption, setCaption] = useState('')
  const [reply, setReply] = useState('')
  const [language, setLanguage] = useState<VoiceLanguage>(preferredLanguage)
  const [error, setError] = useState<string | null>(null)

  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const ownsStreamRef = useRef(false)
  const phaseRef = useRef<Phase>('idle')
  const busyRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const silentAudioRef = useRef<HTMLAudioElement | null>(null)
  const languageRef = useRef<VoiceLanguage>(preferredLanguage)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const speechSeenRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const continuousRef = useRef(true)
  const startListeningRef = useRef<(() => Promise<void>) | null>(null)
  const maxListenTimerRef = useRef<number | null>(null)
  const initialStreamRef = useRef(initialStream)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    languageRef.current = language
  }, [language])

  const stopSilenceWatch = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    speechSeenRef.current = false
  }

  const stopListening = useCallback(() => {
    stopSilenceWatch()
    if (maxListenTimerRef.current) {
      window.clearTimeout(maxListenTimerRef.current)
      maxListenTimerRef.current = null
    }
    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stop()
      }
    } catch {
      /* ignore */
    }
  }, [])

  const scheduleListen = useCallback((delay = 220) => {
    if (!continuousRef.current) return
    window.setTimeout(() => {
      if (!continuousRef.current) return
      if (busyRef.current) return
      if (phaseRef.current === 'listening' || phaseRef.current === 'thinking' || phaseRef.current === 'speaking')
        return
      void startListeningRef.current?.()
    }, delay)
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
      const clean = (answer || '')
        .replace(/\u2014/g, ',')
        .replace(/\u2013/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
      setReply(clean)
      setPhase('speaking')
      await speakWithElevenLabs(
        clean,
        languageRef.current,
        audioRef,
        () => {
          busyRef.current = false
          setPhase('idle')
          setCaption('')
          scheduleListen(220)
        },
        (msg) => setError(msg),
      )
    } catch (e: any) {
      setError(e?.message || 'Something went wrong')
      busyRef.current = false
      setPhase('idle')
      scheduleListen(700)
    }
  }

  const startListening = useCallback(async () => {
    if (!continuousRef.current) return
    if (busyRef.current) return
    if (phaseRef.current === 'listening') return
    setError(null)
    await unlockAudio(silentAudioRef, audioCtxRef)

    try {
      audioRef.current?.pause()
    } catch {
      /* ignore */
    }

    try {
      let stream = streamRef.current
      if (!stream || stream.getTracks().every((t) => t.readyState === 'ended')) {
        if (initialStreamRef.current && initialStreamRef.current.getTracks().some((t) => t.readyState === 'live')) {
          stream = initialStreamRef.current
          ownsStreamRef.current = false
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          })
          ownsStreamRef.current = true
        }
        streamRef.current = stream
      }

      stream.getAudioTracks().forEach((t) => {
        t.enabled = true
      })

      try {
        const ctx =
          audioCtxRef.current ||
          new (window.AudioContext || (window as any).webkitAudioContext)()
        audioCtxRef.current = ctx
        if (ctx.state === 'suspended') await ctx.resume()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        speechSeenRef.current = false

        const data = new Uint8Array(analyser.frequencyBinCount)
        const SILENCE_MS = 520
        const SPEECH_THRESHOLD = 8

        const tick = () => {
          if (phaseRef.current !== 'listening') return
          analyser.getByteFrequencyData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) sum += data[i]
          const avg = sum / data.length

          if (avg > SPEECH_THRESHOLD) {
            speechSeenRef.current = true
            if (silenceTimerRef.current) {
              window.clearTimeout(silenceTimerRef.current)
              silenceTimerRef.current = null
            }
          } else if (speechSeenRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = window.setTimeout(() => stopListening(), SILENCE_MS)
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch {
        /* analyser optional */
      }

      if (typeof MediaRecorder === 'undefined') {
        setError('Recording is not supported on this browser.')
        setPhase('idle')
        return
      }

      const mime = pickRecorderMime()
      let rec: MediaRecorder
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      } catch {
        rec = new MediaRecorder(stream)
      }

      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onerror = () => {
        setError('Recording error')
        setPhase('idle')
        scheduleListen(600)
      }
      rec.onstop = async () => {
        stopSilenceWatch()
        if (maxListenTimerRef.current) {
          window.clearTimeout(maxListenTimerRef.current)
          maxListenTimerRef.current = null
        }

        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' })
        chunksRef.current = []

        if (blob.size < 600) {
          setPhase('idle')
          scheduleListen(180)
          return
        }

        setPhase('thinking')
        try {
          const text = await transcribeWithElevenLabs(blob, languageRef.current)
          if (!text) {
            setPhase('idle')
            scheduleListen(250)
            return
          }
          void handleTurn(text)
        } catch (e: any) {
          setError(e?.message || 'Transcription failed')
          setPhase('idle')
          scheduleListen(700)
        }
      }

      mediaRecRef.current = rec
      try {
        rec.start(150)
      } catch {
        rec.start()
      }
      setPhase('listening')

      maxListenTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current === 'listening') stopListening()
      }, 9000)
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? languageRef.current === 'ha'
            ? 'Ba a ba da izinin makirufo ba. Kunna shi a Settings.'
            : 'Microphone permission denied. Enable it in Settings → Safari.'
          : e?.message || 'Could not start microphone',
      )
      setPhase('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopListening, scheduleListen])

  startListeningRef.current = startListening

  useEffect(() => {
    continuousRef.current = true
    initialStreamRef.current = initialStream || null
    if (initialStream) streamRef.current = initialStream

    void startListening()

    return () => {
      continuousRef.current = false
      try {
        mediaRecRef.current?.stop()
      } catch {
        /* ignore */
      }
      stopSilenceWatch()
      if (maxListenTimerRef.current) window.clearTimeout(maxListenTimerRef.current)
      try {
        audioRef.current?.pause()
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeLanguage = (l: VoiceLanguage) => {
    setLanguage(l)
    onLanguageChange?.(l)
    try {
      localStorage.setItem('quantumy-language', l)
    } catch {
      /* ignore */
    }
  }

  const onScreenTap = () => {
    void unlockAudio(silentAudioRef, audioCtxRef)
    if (phase === 'idle' && !busyRef.current) scheduleListen(40)
  }

  const statusLabel =
    phase === 'listening'
      ? language === 'ha'
        ? 'Ina saurare… yi magana yanzu'
        : 'Listening… speak now'
      : phase === 'thinking'
        ? language === 'ha'
          ? 'Ina tunani…'
          : 'Thinking…'
        : phase === 'speaking'
          ? language === 'ha'
            ? 'Ina magana…'
            : 'Speaking…'
          : language === 'ha'
            ? `Sannu${firstName && firstName !== 'there' ? ` ${firstName}` : ''}…`
            : `Hi${firstName && firstName !== 'there' ? ` ${firstName}` : ''}…`

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
      onClick={onScreenTap}
    >
      <div className="pt-[env(safe-area-inset-top)] px-4 h-14 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            continuousRef.current = false
            try {
              mediaRecRef.current?.stop()
              audioRef.current?.pause()
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
                ? { scale: [1, 1.14, 1], opacity: [0.35, 0.65, 0.35] }
                : phase === 'speaking'
                  ? { scale: [1, 1.1, 1], opacity: [0.3, 0.55, 0.3] }
                  : { scale: 1, opacity: 0.28 }
            }
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className={`absolute inset-0 -m-10 rounded-full blur-2xl ${
              phase === 'listening'
                ? 'bg-rose-400/50'
                : phase === 'speaking'
                  ? 'bg-indigo-400/45'
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
          <p className={`mt-3 text-sm text-center px-2 ${dark ? 'text-rose-300' : 'text-rose-600'}`}>{error}</p>
        )}

        <div
          className={`mt-6 flex items-center gap-2 p-1 rounded-full ${
            dark ? 'bg-white/10' : 'bg-white/80 shadow-sm ring-1 ring-black/[0.04]'
          }`}
          onClick={(e) => e.stopPropagation()}
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
      </div>

      <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-6">
        <p className={`text-[12px] text-center max-w-xs ${dark ? 'text-white/45' : 'text-slate-400'}`}>
          {phase === 'listening'
            ? language === 'ha'
              ? 'Yi magana, idan ka tsaya, za a amsa da murya'
              : 'Speak, pause, and it answers with voice'
            : language === 'ha'
              ? 'Rufe da ×'
              : 'Close with ×'}
        </p>
      </div>
    </motion.div>
  )
}
