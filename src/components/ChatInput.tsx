import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Send, Plus, Zap, Square } from 'lucide-react'

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  isLoading: boolean
  dark: boolean
  errorHint?: string | null
  fastActive?: boolean
  onToggleFast?: () => void
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  dark,
  errorHint,
  fastActive,
  onToggleFast,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const baseValueRef = useRef('')

  useEffect(() => {
    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null
    setSpeechSupported(!!SR)
    if (!SR) return

    const rec: SpeechRecognition = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US'

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript || ''
        if (event.results[i].isFinal) finalText += piece
        else interim += piece
      }
      const next = (baseValueRef.current + ' ' + (finalText || interim)).replace(/\s+/g, ' ').trimStart()
      onChange(next)
      if (finalText) {
        baseValueRef.current = (baseValueRef.current + ' ' + finalText).replace(/\s+/g, ' ').trim()
      }
    }

    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec

    return () => {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [onChange])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [value])

  const toggleListen = () => {
    const rec = recognitionRef.current
    if (!rec || isLoading) return
    if (listening) {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      setListening(false)
      return
    }
    baseValueRef.current = value
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading) onSend()
    }
  }

  const iconBtn = dark
    ? 'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition bg-white/[0.08] text-slate-300 hover:bg-white/[0.12] disabled:opacity-40'
    : 'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition bg-white text-slate-600 hover:bg-white shadow-sm disabled:opacity-40'

  return (
    <div className="relative z-10 shrink-0 px-3 sm:px-5 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
      <div className="max-w-2xl mx-auto">
        {errorHint && (
          <p className={`text-xs text-center mb-1.5 ${dark ? 'text-amber-400/90' : 'text-amber-700'}`} role="status">
            {errorHint}
          </p>
        )}
        <div
          className={`glass-surface rounded-[28px] px-3 pt-2.5 pb-2 transition-shadow ${
            dark
              ? 'bg-[#1a1a22] border border-white/[0.08] shadow-lg shadow-black/30'
              : 'bg-[#f3f4f6] border border-black/[0.04] shadow-[0_4px_24px_rgba(0,0,0,0.06)]'
          }`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={listening ? 'Listening…' : 'Ask Anything'}
            className={`w-full resize-none bg-transparent border-0 outline-none text-[16px] leading-6 min-h-[28px] max-h-[140px] px-1 ${
              dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
            }`}
          />
          <div className="flex items-center gap-1.5 mt-1.5">
            <button type="button" disabled title="Attachments coming soon" className={iconBtn} aria-label="Add attachment">
              <Plus className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={onToggleFast}
              title="Fast responses"
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${
                fastActive
                  ? dark
                    ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30'
                    : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                  : dark
                    ? 'bg-white/[0.08] text-slate-200 hover:bg-white/[0.12]'
                    : 'bg-white text-slate-700 hover:bg-white shadow-sm'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Fast
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={toggleListen}
              disabled={!speechSupported || isLoading}
              title={
                !speechSupported
                  ? 'Voice input not supported in this browser'
                  : listening
                    ? 'Stop listening'
                    : 'Voice input'
              }
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${
                listening
                  ? dark
                    ? 'bg-rose-500/25 text-rose-300 ring-1 ring-rose-400/40'
                    : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                  : speechSupported
                    ? dark
                      ? 'bg-white/[0.08] text-slate-300 hover:bg-white/[0.12]'
                      : 'bg-white text-slate-600 hover:bg-white shadow-sm'
                    : dark
                      ? 'text-slate-500 opacity-40'
                      : 'text-slate-400 opacity-40'
              }`}
              aria-label={listening ? 'Stop voice input' : 'Voice input'}
              aria-pressed={listening}
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            {isLoading ? (
              <motion.button
                type="button"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={onStop}
                className={`h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${
                  dark
                    ? 'bg-white/15 text-white hover:bg-white/25 ring-1 ring-white/20'
                    : 'bg-slate-800 text-white hover:bg-slate-900'
                }`}
                aria-label="Stop generating"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </motion.button>
            ) : (
              <motion.button
                type="button"
                initial={false}
                animate={{ scale: 1, opacity: 1 }}
                onClick={onSend}
                disabled={!value.trim()}
                className="h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 text-white bg-slate-900 hover:bg-black disabled:opacity-40 transition dark:bg-white dark:text-slate-900"
                aria-label="Send"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
