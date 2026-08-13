import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ThumbsUp, ThumbsDown, Volume2, VolumeX, Share2, RotateCcw, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: 'Bearer ' + token } : {}
}

type Props = {
  content: string
  dark: boolean
  onRegenerate?: () => void
}

function stripMarkdown(text: string) {
  return text
    .replace(/\u2014/g, ',')
    .replace(/\u2013/g, '-')
    .replace(/\u2015/g, ',')
    .replace(/--+/g, ',')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>~]/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split into ~380-char spoken chunks on sentence boundaries for fast first audio. */
function chunkForSpeech(text: string, maxLen = 380): string[] {
  const plain = text.trim()
  if (!plain) return []
  if (plain.length <= maxLen) return [plain]

  const parts: string[] = []
  let rest = plain
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      parts.push(rest.trim())
      break
    }
    const window = rest.slice(0, maxLen)
    let cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('; '),
    )
    if (cut < 40) cut = window.lastIndexOf(', ')
    if (cut < 40) cut = window.lastIndexOf(' ')
    if (cut < 20) cut = maxLen
    else cut = cut + 1
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  return parts.filter(Boolean)
}

async function fetchTtsChunk(text: string, language: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    signal,
    body: JSON.stringify({
      text,
      language,
      chunk: true,
      stream: false,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || data.details || 'TTS failed')
  }
  return res.arrayBuffer()
}

function playBuffer(buf: ArrayBuffer, audioRef: React.MutableRefObject<HTMLAudioElement | null>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
      const audio = new Audio(url)
      audio.setAttribute('playsinline', 'true')
      ;(audio as any).playsInline = true
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        reject(new Error('Audio playback failed'))
      }
      void audio.play().catch(reject)
    } catch (e) {
      reject(e)
    }
  })
}

export default function MessageActions({ content, dark, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<'up' | 'down' | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [loadingSpeak, setLoadingSpeak] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stopFlagRef = useRef(false)

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
    stopFlagRef.current = true
    try {
      abortRef.current?.abort()
    } catch {
      /* ignore */
    }
    abortRef.current = null
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

  const speakBrowserFallback = (plain: string, language: string) => {
    if (!('speechSynthesis' in window)) return false
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(plain.slice(0, 1200))
    u.lang = language === 'ha' ? 'ha' : 'en-US'
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setLoadingSpeak(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
    return true
  }

  const speak = async () => {
    if (speaking || loadingSpeak) {
      stopSpeak()
      return
    }
    const plain = stripMarkdown(content)
    if (!plain) return

    stopFlagRef.current = false
    setLoadingSpeak(true)

    let language = 'en'
    try {
      const saved = localStorage.getItem('quantumy-language')
      if (saved === 'ha' || saved === 'en') language = saved
    } catch {
      /* ignore */
    }

    const chunks = chunkForSpeech(plain, 380)
    const ac = new AbortController()
    abortRef.current = ac

    try {
      // Prefetch first chunk only — start audio ASAP
      let nextBuf: ArrayBuffer | null = await fetchTtsChunk(chunks[0], language, ac.signal)
      if (stopFlagRef.current) return

      setLoadingSpeak(false)
      setSpeaking(true)

      for (let i = 0; i < chunks.length; i++) {
        if (stopFlagRef.current) break
        const buf = nextBuf
        nextBuf = null
        if (!buf) break

        // Prefetch the following chunk while this one plays
        const prefetch =
          i + 1 < chunks.length
            ? fetchTtsChunk(chunks[i + 1], language, ac.signal).catch(() => null)
            : Promise.resolve(null)

        try {
          await playBuffer(buf, audioRef)
        } catch {
          // If first chunk fails, try browser TTS once
          if (i === 0) {
            if (speakBrowserFallback(plain, language)) return
          }
          break
        }

        if (stopFlagRef.current) break
        nextBuf = await prefetch
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        /* user stopped */
      } else if (!stopFlagRef.current) {
        // Full fallback
        if (!speakBrowserFallback(plain, language)) {
          setLoadingSpeak(false)
          setSpeaking(false)
        }
        return
      }
    } finally {
      abortRef.current = null
      if (!stopFlagRef.current) {
        setSpeaking(false)
        setLoadingSpeak(false)
      }
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
