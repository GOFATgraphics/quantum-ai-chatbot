import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Plus, Square, AudioLines, Mic, MicOff, X, FileText, Image as ImageIcon } from 'lucide-react'

type PendingFile = { name: string; type: string; text?: string }

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  onSpeak?: () => void
  isLoading: boolean
  dark: boolean
  errorHint?: string | null
  pendingFiles?: PendingFile[]
  onFilesChange?: (files: PendingFile[]) => void
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  onSpeak,
  isLoading,
  dark,
  errorHint,
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
      if (!isLoading && (value.trim() || pendingFiles.length > 0)) onSend()
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

  const toolBtn = dark
    ? 'bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]'
    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-100'

  return (
    <div className="relative z-10 shrink-0 px-3 sm:px-5 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
          className={`glass-surface rounded-[26px] px-3 pt-3 pb-2.5 transition-all duration-200 ${
            dark
              ? `bg-[#16161f]/92 border shadow-xl shadow-black/40 ${
                  focused || listening
                    ? 'border-indigo-400/30 shadow-indigo-500/10'
                    : 'border-white/[0.08]'
                }`
              : `bg-white/90 border shadow-[0_12px_40px_rgba(79,70,229,0.08)] ${
                  focused || listening
                    ? 'border-indigo-300/50 shadow-[0_12px_40px_rgba(99,102,241,0.12)]'
                    : 'border-white/80'
                }`
          }`}
        >
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 px-0.5">
              {pendingFiles.map((f, idx) => (
                <span
                  key={`${f.name}-${idx}`}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full ${
                    dark ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-700'
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
            placeholder={listening ? 'Listening…' : 'Ask anything'}
            className={`w-full resize-none bg-transparent border-0 outline-none text-[16px] leading-6 min-h-[28px] max-h-[140px] px-1 ${
              dark
                ? 'text-slate-50 placeholder:text-slate-500'
                : 'text-slate-900 placeholder:text-slate-400'
            }`}
          />

          <div className="mt-2.5 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,text/*"
              className="hidden"
              onChange={onFileSelected}
            />

            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                onClick={onPickFiles}
                disabled={isLoading}
                title="Attach files"
                className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-40 ${toolBtn}`}
                aria-label="Add attachment"
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>

              <button
                type="button"
                onClick={toggleListen}
                disabled={!speechSupported || isLoading}
                title={listening ? 'Stop dictation' : 'Dictate with mic'}
                className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-40 ${
                  listening
                    ? dark
                      ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/40'
                      : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : toolBtn
                }`}
                aria-label={listening ? 'Stop listening' : 'Speech to text'}
                aria-pressed={listening}
              >
                {listening ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
              </button>
            </div>

            <div className="shrink-0">
              {isLoading ? (
                <motion.button
                  type="button"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={onStop}
                  className={`h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold transition ${
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
                  className={`h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold transition ${
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
                  onClick={onSpeak}
                  className={`h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold transition ${
                    dark
                      ? 'bg-white text-slate-900 hover:bg-slate-100'
                      : 'bg-slate-900 text-white hover:bg-black shadow-md shadow-slate-900/20'
                  }`}
                  aria-label="Start live voice conversation"
                >
                  <AudioLines className="w-4 h-4" />
                  Speak
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
