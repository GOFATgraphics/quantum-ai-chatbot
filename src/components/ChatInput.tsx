import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Plus, Square, AudioLines, Mic, MicOff, X, FileText, Image as ImageIcon } from 'lucide-react'

export type PendingFile = {
  name: string
  type: string
  text?: string
  /** data URL for images so we can preview & show in chat */
  dataUrl?: string
}

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

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
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
      if (file.size > 4_000_000) continue
      if (file.type.startsWith('image/')) {
        try {
          const dataUrl = await readAsDataURL(file)
          next.push({ name: file.name, type: file.type, dataUrl })
        } catch {
          next.push({ name: file.name, type: file.type, text: `[Image attached: ${file.name}]` })
        }
      } else if (file.type.startsWith('text/') || /\.(txt|md|csv|json|ts|tsx|js|jsx|py|html|css)$/i.test(file.name)) {
        const text = await file.text()
        next.push({ name: file.name, type: file.type || 'text/plain', text: text.slice(0, 40_000) })
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

  const iconBtn = `h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-40 ${
    dark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-500 hover:bg-black/[0.04]'
  }`

  /*
   * Use filter: drop-shadow instead of box-shadow.
   * iOS Safari draws a 1px hairline around elements that combine
   * border-radius + opaque background + box-shadow. drop-shadow avoids it.
   */
  const pillShadow = focused || listening
    ? dark
      ? 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))'
      : 'drop-shadow(0 6px 18px rgba(15,23,42,0.14))'
    : dark
      ? 'drop-shadow(0 3px 12px rgba(0,0,0,0.4))'
      : 'drop-shadow(0 3px 12px rgba(15,23,42,0.1))'

  return (
    <div className="composer-footer relative z-10 shrink-0 px-3 sm:px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="max-w-2xl mx-auto">
        {errorHint && (
          <p
            className={`text-xs text-center mb-2 px-3 py-1.5 rounded-full mx-auto w-fit ${
              dark ? 'bg-white/10 text-amber-300' : 'bg-amber-50 text-amber-800'
            }`}
            role="status"
          >
            {errorHint}
          </p>
        )}

        {/* Outer wrapper carries the drop-shadow so the pill itself has no box-shadow */}
        <div style={{ filter: pillShadow, WebkitFilter: pillShadow }}>
          <div
            className={`composer-surface rounded-full px-2.5 py-1.5 flex items-end gap-1 ${
              dark ? 'bg-[#1c1c24]' : 'bg-white'
            }`}
            style={{
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              WebkitBoxShadow: 'none',
              // Force own compositing layer — kills iOS subpixel fringe
              transform: 'translateZ(0)',
              WebkitTransform: 'translateZ(0)',
              isolation: 'isolate',
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
            }}
          >
            {pendingFiles.length > 0 && (
              <div className="absolute left-3 right-3 bottom-full mb-2 flex flex-wrap gap-2">
                {pendingFiles.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className={`relative group rounded-xl overflow-hidden ${
                      dark ? 'bg-white/10' : 'bg-slate-100'
                    } ${f.dataUrl ? 'w-[64px] h-[64px]' : ''}`}
                  >
                    {f.dataUrl ? (
                      <img src={f.dataUrl} alt={f.name} className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 ${
                          dark ? 'text-slate-200' : 'text-slate-700'
                        }`}
                      >
                        {f.type.startsWith('image/') ? (
                          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="max-w-[120px] truncate">{f.name}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/50 text-white"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
              className={iconBtn}
              aria-label="Add attachment"
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={1}
              placeholder={listening ? 'Listening…' : 'Ask anything'}
              className={`flex-1 min-w-0 resize-none bg-transparent border-0 outline-none text-[16px] leading-6 min-h-[36px] max-h-[120px] py-2 px-1 ${
                dark
                  ? 'text-slate-50 placeholder:text-slate-500'
                  : 'text-slate-900 placeholder:text-slate-400'
              }`}
            />

            <button
              type="button"
              onClick={toggleListen}
              disabled={!speechSupported || isLoading}
              title={listening ? 'Stop dictation' : 'Dictate with mic'}
              className={`${iconBtn} ${
                listening
                  ? dark
                    ? 'bg-rose-500/25 text-rose-200'
                    : 'bg-rose-50 text-rose-600'
                  : ''
              }`}
              aria-label={listening ? 'Stop listening' : 'Speech to text'}
              aria-pressed={listening}
            >
              {listening ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
            </button>

            <div className="shrink-0 pl-0.5">
              {isLoading ? (
                <motion.button
                  type="button"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={onStop}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition ${
                    dark
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-900 text-white'
                  }`}
                  aria-label="Stop generating"
                >
                  <Square className="w-3 h-3 fill-current" />
                </motion.button>
              ) : hasText ? (
                <motion.button
                  type="button"
                  initial={false}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onSend}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition ${
                    dark
                      ? 'bg-white text-slate-900'
                      : 'bg-slate-900 text-white'
                  }`}
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  initial={false}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onSpeak}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition ${
                    dark
                      ? 'bg-indigo-500/30 text-indigo-200'
                      : 'bg-indigo-50 text-indigo-600'
                  }`}
                  aria-label="Start live voice conversation"
                >
                  <AudioLines className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
