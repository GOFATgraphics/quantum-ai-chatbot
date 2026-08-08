import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Send, Plus, Zap, Square, AudioLines, Brain, Globe, X, FileText, Image as ImageIcon } from 'lucide-react'

type PendingFile = { name: string; type: string; text?: string }

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
  thinkActive?: boolean
  onToggleThink?: () => void
  deepSearchActive?: boolean
  onToggleDeepSearch?: () => void
  pendingFiles?: PendingFile[]
  onFilesChange?: (files: PendingFile[]) => void
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
  thinkActive,
  onToggleThink,
  deepSearchActive,
  onToggleDeepSearch,
  pendingFiles = [],
  onFilesChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [focused, setFocused] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const baseValueRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const start = (event as SpeechRecognitionEvent & { resultIndex?: number }).resultIndex ?? 0
      for (let i = start; i < event.results.length; i++) {
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
      if (!isLoading && value.trim()) onSend()
    }
  }

  const hasText = !!value.trim() || pendingFiles.length > 0

  const onPickFiles = () => fileInputRef.current?.click()

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list?.length || !onFilesChange) return
    const next: PendingFile[] = [...pendingFiles]
    for (const file of Array.from(list).slice(0, 5)) {
      if (file.size > 2_000_000) continue
      if (file.type.startsWith('text/') || /\.(txt|md|csv|json|ts|tsx|js|jsx|py|html|css)$/i.test(file.name)) {
        const text = await file.text()
        next.push({ name: file.name, type: file.type || 'text/plain', text: text.slice(0, 40_000) })
      } else if (file.type.startsWith('image/')) {
        next.push({ name: file.name, type: file.type, text: `[Image attached: ${file.name}]` })
      } else {
        next.push({ name: file.name, type: file.type || 'application/octet-stream', text: `[File attached: ${file.name}]` })
      }
    }
    onFilesChange(next.slice(0, 5))
    e.target.value = ''
  }

  const removeFile = (idx: number) => {
    if (!onFilesChange) return
    onFilesChange(pendingFiles.filter((_, i) => i !== idx))
  }

  const softBtn = dark
    ? 'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition bg-white/[0.07] text-slate-200 hover:bg-white/[0.12] disabled:opacity-40'
    : 'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition bg-white text-slate-600 shadow-sm ring-1 ring-black/[0.03] hover:bg-white disabled:opacity-40'

  return (
    <div className="relative z-10 shrink-0 px-3 sm:px-5 pt-1 pb-2">
      <div className="max-w-2xl mx-auto">
        {errorHint && (
          <p
            className={`text-xs text-center mb-2 px-3 py-1.5 rounded-full mx-auto w-fit ${
              dark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'
            }`}
            role="status"
          >
            {errorHint}
          </p>
        )}
        <div
          className={`glass-surface rounded-[28px] px-3.5 pt-3.5 pb-2.5 transition-all duration-200 ${
            dark
              ? `bg-[#16161f]/92 border shadow-xl shadow-black/40 ${
                  focused || listening
                    ? 'border-indigo-400/30 shadow-indigo-500/10'
                    : 'border-white/[0.08]'
                }`
              : `bg-white/80 border shadow-[0_12px_40px_rgba(79,70,229,0.08)] ${
                  focused || listening
                    ? 'border-indigo-300/50 shadow-[0_12px_40px_rgba(99,102,241,0.12)]'
                    : 'border-white/70'
                }`
          }`}
        >
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 px-1">
              {pendingFiles.map((f, idx) => (
                <span
                  key={`${f.name}-${idx}`}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full ${
                    dark
                      ? 'bg-white/10 text-slate-200'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {f.type.startsWith('image/') ? (
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="opacity-60 hover:opacity-100"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={1}
            placeholder={listening ? 'Listening…' : 'Ask Anything'}
            className={`w-full resize-none bg-transparent border-0 outline-none text-[16px] leading-6 min-h-[28px] max-h-[140px] px-1 ${
              dark
                ? 'text-slate-50 placeholder:text-slate-500'
                : 'text-slate-900 placeholder:text-slate-400'
            }`}
          />
          <div className="flex items-center gap-1.5 mt-2.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,text/*"
              className="hidden"
              onChange={onFileSelected}
            />
            <button
              type="button"
              onClick={onPickFiles}
              disabled={isLoading}
              title="Attach files"
              className={softBtn}
              aria-label="Add attachment"
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={onToggleFast}
              title="Fast responses"
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${
                fastActive
                  ? dark
                    ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/35'
                    : 'bg-white text-slate-800 shadow-sm ring-1 ring-black/[0.05]'
                  : dark
                    ? 'bg-white/[0.07] text-slate-200 hover:bg-white/[0.11]'
                    : 'bg-white/90 text-slate-700 shadow-sm ring-1 ring-black/[0.03]'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${fastActive ? (dark ? 'text-indigo-300' : 'text-indigo-500') : ''}`} />
              Fast
            </button>
            <button
              type="button"
              onClick={onToggleThink}
              title="Think — deeper step-by-step reasoning"
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${
                thinkActive
                  ? dark
                    ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/35'
                    : 'bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-200'
                  : dark
                    ? 'bg-white/[0.07] text-slate-200 hover:bg-white/[0.11]'
                    : 'bg-white/90 text-slate-700 shadow-sm ring-1 ring-black/[0.03]'
              }`}
            >
              <Brain className={`w-3.5 h-3.5 ${thinkActive ? (dark ? 'text-violet-300' : 'text-violet-600') : ''}`} />
              Think
            </button>
            <button
              type="button"
              onClick={onToggleDeepSearch}
              title="DeepSearch — thorough research-style answers"
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${
                deepSearchActive
                  ? dark
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35'
                    : 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-200'
                  : dark
                    ? 'bg-white/[0.07] text-slate-200 hover:bg-white/[0.11]'
                    : 'bg-white/90 text-slate-700 shadow-sm ring-1 ring-black/[0.03]'
              }`}
            >
              <Globe className={`w-3.5 h-3.5 ${deepSearchActive ? (dark ? 'text-sky-300' : 'text-sky-600') : ''}`} />
              DeepSearch
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
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.08]'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-black/[0.04]'
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
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={onStop}
                className={`h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold shrink-0 transition ${
                  dark
                    ? 'bg-white/15 text-white hover:bg-white/25 ring-1 ring-white/15'
                    : 'bg-slate-900 text-white hover:bg-black shadow-md shadow-slate-900/15'
                }`}
                aria-label="Stop generating"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </motion.button>
            ) : hasText ? (
              <motion.button
                type="button"
                initial={false}
                animate={{ scale: 1, opacity: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={onSend}
                className={`h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold shrink-0 transition ${
                  dark
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-slate-900 text-white hover:bg-black shadow-md shadow-slate-900/20'
                }`}
                aria-label="Send"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </motion.button>
            ) : (
              <motion.button
                type="button"
                initial={false}
                animate={{ scale: 1, opacity: 1 }}
                whileTap={{ scale: 0.97 }}
                onClick={toggleListen}
                disabled={!speechSupported}
                className={`h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold shrink-0 transition disabled:opacity-40 ${
                  dark
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-slate-900 text-white hover:bg-black shadow-md shadow-slate-900/20'
                }`}
                aria-label="Speak"
              >
                <AudioLines className="w-4 h-4" />
                Speak
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
