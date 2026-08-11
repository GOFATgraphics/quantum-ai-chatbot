import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ThumbsUp, ThumbsDown, Volume2, VolumeX, Share2, RotateCcw, Loader2 } from 'lucide-react'

type Props = {
  content: string
  dark: boolean
  onRegenerate?: () => void
}

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function MessageActions({ content, dark, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<'up' | 'down' | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [loadingSpeak, setLoadingSpeak] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const muted = dark
    ? 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.08]'
    : 'text-slate-400 hover:text-slate-700 hover:bg-black/[0.04]'
  const active = dark
    ? 'text-indigo-300 bg-indigo-500/15'
    : 'text-indigo-600 bg-indigo-50'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const stopSpeak = () => {
    try {
      audioRef.current?.pause()
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src)
    } catch {
      /* ignore */
    }
    audioRef.current = null
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
    setSpeaking(false)
    setLoadingSpeak(false)
  }

  const speak = async () => {
    if (speaking || loadingSpeak) {
      stopSpeak()
      return
    }
    const plain = stripMarkdown(content)
    if (!plain) return

    setLoadingSpeak(true)
    try {
      let language = 'en'
      try {
        const saved = localStorage.getItem('quantumy-language')
        if (saved === 'ha' || saved === 'en') language = saved
      } catch {
        /* ignore */
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plain.slice(0, 4000), language }),
      })

      if (!res.ok) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel()
          const u = new SpeechSynthesisUtterance(plain)
          u.lang = language === 'ha' ? 'ha' : 'en-US'
          u.onend = () => setSpeaking(false)
          u.onerror = () => setSpeaking(false)
          setLoadingSpeak(false)
          setSpeaking(true)
          window.speechSynthesis.speak(u)
          return
        }
        throw new Error('TTS failed')
      }

      const buf = await res.arrayBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setSpeaking(false)
        audioRef.current = null
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setSpeaking(false)
        audioRef.current = null
      }
      setLoadingSpeak(false)
      setSpeaking(true)
      await audio.play()
    } catch {
      setLoadingSpeak(false)
      setSpeaking(false)
    }
  }

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: content })
      } else {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={`inline-flex items-center gap-0.5 mt-2.5 px-1 py-0.5 rounded-full ${
        dark ? 'bg-white/[0.03]' : 'bg-black/[0.02]'
      }`}
    >
      <button type="button" onClick={copy} className={`p-1.5 rounded-full transition ${muted}`} title="Copy">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="block"
            >
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="block"
            >
              <Copy className="w-3.5 h-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      {onRegenerate && (
        <motion.button
          type="button"
          whileTap={{ rotate: -45, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          onClick={onRegenerate}
          className={`p-1.5 rounded-full transition ${muted}`}
          title="Regenerate"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </motion.button>
      )}
      <button type="button" onClick={share} className={`p-1.5 rounded-full transition ${muted}`} title="Share">
        <Share2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void speak()}
        className={`p-1.5 rounded-full transition ${speaking || loadingSpeak ? active : muted}`}
        title={speaking ? 'Stop' : 'Read aloud'}
        aria-label={speaking ? 'Stop reading' : 'Read aloud'}
      >
        {loadingSpeak ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : speaking ? (
          <VolumeX className="w-3.5 h-3.5" />
        ) : (
          <Volume2 className="w-3.5 h-3.5" />
        )}
      </button>
      <span className={`w-px h-3 mx-0.5 ${dark ? 'bg-white/10' : 'bg-black/8'}`} />
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => setLiked(liked === 'up' ? null : 'up')}
        className={`p-1.5 rounded-full transition ${liked === 'up' ? active : muted}`}
        title="Good response"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </motion.button>
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => setLiked(liked === 'down' ? null : 'down')}
        className={`p-1.5 rounded-full transition ${liked === 'down' ? active : muted}`}
        title="Bad response"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </motion.button>
    </motion.div>
  )
}
