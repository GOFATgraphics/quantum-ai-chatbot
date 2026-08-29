import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Plus, Square, Mic, MicOff, X, FileText, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import VoiceWaveform from './VoiceWaveform'
import { officeKind, isLegacyOffice, parseOfficeFile } from '../lib/officeParse'
import { isAudioFile, transcribeAudioFile, formatDuration } from '../lib/audioTranscribe'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: 'Bearer ' + token } : {}
}

export type PendingFile = {
  name: string
  type: string
  text?: string
  dataUrl?: string
}

export type VoiceLanguage = 'en' | 'ha'

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  isLoading: boolean
  dark: boolean
  errorHint?: string | null
  pendingFiles?: PendingFile[]
  onFilesChange?: (files: PendingFile[]) => void
  onFocusChange?: (focused: boolean) => void
  language?: VoiceLanguage
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function compressImageDataUrl(file: File, maxSide = 1280, quality = 0.82): Promise<{ dataUrl: string; type: string }> {
  const raw = await readAsDataURL(file)
  if (file.size < 350_000 && !file.type.includes('png')) {
    return { dataUrl: raw, type: file.type || 'image/jpeg' }
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSide || height > maxSide) {
        if (width >= height) {
          height = Math.round((height * maxSide) / width)
          width = maxSide
        } else {
          width = Math.round((width * maxSide) / height)
          height = maxSide
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve({ dataUrl: raw, type: file.type || 'image/jpeg' })
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      const usePng = file.type === 'image/png' && file.size < 800_000
      const outType = usePng ? 'image/png' : 'image/jpeg'
      const dataUrl = usePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality)
      resolve({ dataUrl, type: outType })
    }
    img.onerror = () => resolve({ dataUrl: raw, type: file.type || 'image/jpeg' })
    img.src = raw
  })
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

export default function ChatInput({
  value, onChange, onSend, onStop, isLoading, dark, errorHint,
  pendingFiles = [], onFilesChange, onFocusChange, language = 'en',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // Transcription is the one attachment path slow enough to need its own
  // progress: an hour-long recording is dozens of sequential requests.
  const [fileBusy, setFileBusy] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const baseValueRef = useRef('')

  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    )
    return () => {
      try { mediaRecRef.current?.stop() } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [value])

  const setComposerFocus = (next: boolean) => {
    setFocused(next)
    onFocusChange?.(next)
  }

  const stopDictation = () => {
    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') mediaRecRef.current.stop()
    } catch { /* ignore */ }
  }

  const toggleListen = async () => {
    if (isLoading || dictating) return
    if (listening) {
      stopDictation()
      return
    }
    baseValueRef.current = value
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setMicStream(stream)
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
        setMicStream(null)
        setListening(false)
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size < 400) return
        setDictating(true)
        try {
          const audioBase64 = await blobToBase64(blob)
          const res = await fetch('/api/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm', language }),
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.text) {
            const next = (baseValueRef.current + ' ' + data.text).replace(/\s+/g, ' ').trim()
            onChange(next)
          }
        } catch { /* ignore */ } finally {
          setDictating(false)
        }
      }
      mediaRecRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
      setMicStream(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && (value.trim() || pendingFiles.length > 0)) onSend()
    }
  }

  // Sending mid-transcription would attach a half-finished transcript.
  const hasText = (!!value.trim() || pendingFiles.length > 0) && !fileBusy
  const onPickFiles = () => fileInputRef.current?.click()

  /**
   * The one place attachments are handled, whatever brought them in — the file
   * picker, a paste, or a drop. Keeping it list-based rather than tied to the
   * input event is what lets the other two routes exist at all.
   */
  const addFiles = async (list: File[] | FileList | null) => {
    if (!list?.length || !onFilesChange) return
    const MAX_ATTACHMENTS = 5
    const room = Math.max(0, MAX_ATTACHMENTS - pendingFiles.length)
    if (room === 0) {
      setFileError(`You can attach ${MAX_ATTACHMENTS} files at a time — remove one first.`)
      return
    }
    const next: PendingFile[] = [...pendingFiles]
    const picked = Array.from(list).slice(0, room)
    const imageCount = picked.filter((f) => f.type.startsWith('image/')).length + next.filter((f) => f.dataUrl).length
    const maxSide = imageCount >= 3 ? 1024 : 1280
    const quality = imageCount >= 3 ? 0.72 : 0.82
    const rejected: string[] = []
    for (const file of picked) {
      // Audio is split and streamed in pieces rather than sent whole, so the
      // blanket limit does not apply to it.
      if (file.size > 10_000_000 && !isAudioFile(file)) { rejected.push(`${file.name} is over 10MB`); continue }
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      if (isPdf) {
        // The whole message is one request body, and Vercel rejects bodies over
        // ~4.5MB before the function runs. Base64 inflates a file by a third,
        // so anything past ~3MB raw cannot be sent — say so rather than
        // attaching something that will fail on send.
        if (file.size > 3_000_000) {
          rejected.push(`${file.name} is too large to send (${(file.size / 1_000_000).toFixed(1)}MB, limit 3MB)`)
          continue
        }
        try {
          const dataUrl = await readAsDataURL(file)
          next.push({ name: file.name, type: 'application/pdf', dataUrl })
        } catch {
          rejected.push(`${file.name} could not be read`)
        }
      } else if (isAudioFile(file)) {
        if (file.size > 200_000_000) {
          rejected.push(`${file.name} is too large to transcribe (${(file.size / 1_000_000).toFixed(0)}MB)`)
          continue
        }
        try {
          setFileBusy(`Transcribing ${file.name}...`)
          const result = await transcribeAudioFile(file, ({ done, total }) => {
            setFileBusy(
              total > 1
                ? `Transcribing ${file.name} - part ${Math.min(done + 1, total)} of ${total}...`
                : `Transcribing ${file.name}...`,
            )
          })
          if (!result.text.trim()) {
            next.push({
              name: file.name,
              type: file.type || 'audio/mpeg',
              text: `[Audio attached: ${file.name} - transcribed, but no speech was found in it. Tell the user rather than guessing at its contents.]`,
            })
            rejected.push(`${file.name} had no speech in it`)
          } else {
            const parts = [formatDuration(result.durationSec), result.diarized ? 'speakers labelled' : ''].filter(Boolean)
            const header = `\u{1F3A4} **${file.name}**${parts.length ? ` (${parts.join(' \u00B7 ')})` : ''} - transcript`
            const note = result.truncated
              ? '\n\n[Only the first hour of this recording was transcribed. Do not treat this as the whole recording.]'
              : ''
            // Speech recognition reports no confidence, and its errors land on
            // exactly the fields that carry the meaning: company names, ports,
            // prices, quantities, dates. Quoting a transcript back verbatim
            // presents a machine's best guess as a record of what was said, and
            // a misheard digit in a price is indistinguishable from a correct
            // one. The model is told what it is holding.
            const caveat =
              '\n\n[This is an automatic transcription, not a recording of what was certainly said. ' +
              'Names, figures, dates and place names are the least reliable parts of any transcript and ' +
              'are frequently wrong in ways that read as plausible. Do not quote it back as verbatim. ' +
              'When repeating any name, number, currency amount, quantity or date from it, mark it as ' +
              'needing confirmation against the audio or a written source.]'
            next.push({
              name: file.name,
              type: file.type || 'audio/mpeg',
              text: `${header}\n\`\`\`\n${result.text}\n\`\`\`${note}${caveat}`,
            })
          }
        } catch (err: any) {
          next.push({
            name: file.name,
            type: file.type || 'audio/mpeg',
            text: `[Audio attached: ${file.name} - could not be transcribed, so its contents are NOT available. Tell the user it could not be read instead of guessing.]`,
          })
          rejected.push(`${file.name}: ${err?.message || 'could not be transcribed'}`)
        } finally {
          setFileBusy(null)
        }
      } else if (file.type.startsWith('image/')) {
        try {
          const { dataUrl, type } = await compressImageDataUrl(file, maxSide, quality)
          next.push({ name: file.name, type, dataUrl })
        } catch {
          next.push({ name: file.name, type: file.type, text: `[Image attached: ${file.name}]` })
        }
      } else if (officeKind(file)) {
        const kind = officeKind(file)!
        try {
          const parsed = await parseOfficeFile(file, kind)
          if (!parsed.text.trim()) {
            next.push({
              name: file.name,
              type: file.type || 'application/octet-stream',
              text: `[File attached: ${file.name} — opened, but no readable text was found in it. Tell the user rather than guessing at its contents.]`,
            })
            rejected.push(`${file.name} had no readable text`)
          } else {
            const header = `📎 **${file.name}**`
            const note = parsed.truncated
              ? `\n\n[Truncated: showing the first ${parsed.text.length.toLocaleString()} of ${parsed.totalChars.toLocaleString()} characters. Do not treat this as the whole document.]`
              : ''
            next.push({
              name: file.name,
              type: file.type || 'application/octet-stream',
              text: `${header}\n\`\`\`\n${parsed.text}\n\`\`\`${note}`,
            })
          }
        } catch {
          next.push({
            name: file.name,
            type: file.type || 'application/octet-stream',
            text: `[File attached: ${file.name} — could not be read, so its contents are NOT available. Tell the user it could not be read instead of guessing.]`,
          })
          rejected.push(`${file.name} could not be parsed`)
        }
      } else if (isLegacyOffice(file)) {
        next.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          text: `[File attached: ${file.name} — this is a legacy Office format and cannot be read. Its contents are NOT available.]`,
        })
        rejected.push(`${file.name} is a legacy format — re-save it as .docx, .xlsx or .pptx`)
      } else if (file.type.startsWith('text/') || /\.(txt|md|csv|json|ts|tsx|js|jsx|py|html|css)$/i.test(file.name)) {
        const body = await file.text()
        next.push({ name: file.name, type: file.type || 'text/plain', text: body.slice(0, 40_000) })
      } else {
        // Not a format we can actually read. Say so in the attachment itself,
        // so the model never answers as though it had seen the contents.
        next.push({
          name: file.name,
          type: file.type || 'application/octet-stream',
          text: `[File attached: ${file.name} — this format cannot be read, so its contents are NOT available. Tell the user it could not be read instead of guessing.]`,
        })
        rejected.push(`${file.name} can't be read yet — try PDF, an image, or a text file`)
      }
    }
    onFilesChange(next.slice(0, MAX_ATTACHMENTS))
    setFileError(rejected.length ? rejected.join(' · ') : null)
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    // Cleared before awaiting, so picking the same file twice in a row still
    // fires a change event the second time.
    const files = list ? Array.from(list) : []
    e.target.value = ''
    await addFiles(files)
  }

  /**
   * Screenshots arrive on the clipboard as files with no name, which is the
   * common case this exists for — the paste is only intercepted when it
   * actually carries one, so pasting text is untouched.
   */
  const onPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || [])
    const files = items
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f)
    if (files.length === 0) return
    e.preventDefault()
    await addFiles(
      files.map((f) =>
        // A pasted screenshot has no filename; give it one so the chip and the
        // model both have something to refer to.
        f.name && f.name !== 'image.png'
          ? f
          : new File([f], `pasted-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }),
      ),
    )
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    await addFiles(e.dataTransfer?.files || null)
  }

  const removeFile = (idx: number) => {
    if (!onFilesChange) return
    onFilesChange(pendingFiles.filter((_, i) => i !== idx))
  }

  const toolBtn = 'glass-btn text-muted-foreground'
  const placeholder =
    listening
      ? language === 'ha' ? 'Ina saurare…' : 'Listening…'
      : dictating
        ? language === 'ha' ? 'Ana fassara…' : 'Transcribing…'
        : 'Ask anything'

  return (
    <div
      className="composer-footer relative z-10 shrink-0 px-3 sm:px-5 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      onDragOver={(e) => {
        // Only react to an actual file drag; dragging selected text over the
        // composer should still behave like text.
        if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        // Fires for every child crossed on the way through, so ignore anything
        // that is still inside the composer.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="max-w-2xl mx-auto">
        <AnimatePresence>
          {errorHint && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="glass-chip text-xs text-center mb-2 px-3 py-1.5 rounded-full mx-auto w-fit text-destructive"
              role="status"
            >
              {errorHint}
            </motion.p>
          )}
          {fileBusy && (
            <motion.p
              key="file-busy"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="glass-chip text-xs text-center mb-2 px-3 py-1.5 rounded-full mx-auto w-fit text-muted-foreground"
              role="status"
            >
              {fileBusy}
            </motion.p>
          )}
          {fileError && (
            <motion.p
              key="file-error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="glass-chip text-xs text-center mb-2 px-3 py-1.5 rounded-full mx-auto w-fit text-destructive"
              role="status"
              onClick={() => setFileError(null)}
            >
              {fileError}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.div
          animate={{
            boxShadow: focused || listening
              ? '0 0 0 1px hsl(var(--ring) / 0.2), 0 8px 28px -6px rgba(0,0,0,0.25)'
              : '0 0 0 0px transparent',
          }}
          transition={{ duration: 0.25 }}
          className={
            'glass-surface composer-surface rounded-[26px] px-3 pt-2.5 pb-2 transition-shadow ' +
            (dragging ? 'ring-2 ring-primary/60' : '')
          }
        >
          <AnimatePresence initial={false}>
            {pendingFiles.length > 0 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex flex-wrap gap-2 mb-2 px-0.5">
                  {pendingFiles.map((f, idx) => (
                    <motion.div
                      key={`${f.name}-${idx}`}
                      initial={{ opacity: 0, scale: 0.85, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      className={`relative group rounded-xl overflow-hidden glass-panel ${f.dataUrl ? 'w-[72px] h-[72px]' : ''}`}
                    >
                      {f.dataUrl ? (
                        <img src={f.dataUrl} alt={f.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 text-foreground">
                          {f.type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5 shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
                          <span className="max-w-[120px] truncate">{f.name}</span>
                        </span>
                      )}
                      <button type="button" onClick={() => removeFile(idx)} className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/50 text-white" aria-label={`Remove ${f.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(listening || dictating) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col items-center gap-1.5 mb-2 px-2 py-2 rounded-2xl bg-muted">
                  <VoiceWaveform stream={micStream} active={listening} dark={dark} bars={28} />
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {dictating
                      ? (language === 'ha' ? 'Ana fassara…' : 'Transcribing…')
                      : (language === 'ha' ? 'Ina saurare — tap to stop' : 'Listening — tap mic to stop')}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0 flex flex-col">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onFocus={() => {
                  setComposerFocus(true)
                  const pin = () => {
                    window.scrollTo(0, 0)
                    document.documentElement.scrollTop = 0
                    document.body.scrollTop = 0
                  }
                  pin()
                  requestAnimationFrame(pin)
                  setTimeout(pin, 50)
                  setTimeout(pin, 250)
                }}
                onBlur={() => setComposerFocus(false)}
                rows={1}
                placeholder={placeholder}
                className="w-full resize-none bg-transparent border-0 outline-none text-[16px] leading-6 min-h-[28px] max-h-[140px] px-1 py-1.5 text-foreground placeholder:text-muted-foreground"
              />

              <div className="flex items-center gap-1.5 pt-1">
                <input ref={fileInputRef} type="file" multiple accept="application/pdf,.pdf,.docx,.xlsx,.xlsm,.pptx,audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.flac,.amr,image/jpeg,image/png,image/gif,image/webp,image/*,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,text/*" className="hidden" onChange={onFileSelected} />
                <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onPickFiles} disabled={isLoading} title="Attach files" className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-40 ${toolBtn}`} aria-label="Add attachment">
                  <Plus className="w-[18px] h-[18px]" />
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => void toggleListen()}
                  disabled={!speechSupported || isLoading || dictating}
                  title={listening ? 'Stop dictation' : 'Dictate with mic'}
                  className={`relative h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-40 ${
                    listening || dictating
                      ? 'bg-primary text-primary-foreground'
                      : toolBtn
                  }`}
                  aria-label={listening ? 'Stop listening' : 'Speech to text'}
                  aria-pressed={listening}
                >
                  {listening && (
                    <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-primary" aria-hidden />
                  )}
                  {dictating ? (
                    <span className="w-3.5 h-3.5 rounded-sm border-2 border-current border-t-transparent animate-spin" />
                  ) : listening ? (
                    <MicOff className="w-[18px] h-[18px] relative" />
                  ) : (
                    <Mic className="w-[18px] h-[18px]" />
                  )}
                </motion.button>
              </div>
            </div>

            <div className="shrink-0 pb-0.5">
              <AnimatePresence mode="wait" initial={false}>
                {isLoading ? (
                  <motion.button key="stop" type="button" initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }} transition={{ duration: 0.15 }} whileTap={{ scale: 0.96 }} onClick={onStop} className="h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold transition bg-secondary text-foreground hover:bg-accent ring-1 ring-border shadow-md shadow-black/10" aria-label="Stop generating">
                    <Square className="w-3 h-3 fill-current" /> Stop
                  </motion.button>
                ) : (
                  <motion.button key="send" type="button" initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }} transition={{ duration: 0.15 }} whileTap={{ scale: 0.94 }} onClick={onSend} disabled={!hasText} className="h-10 px-4 rounded-full flex items-center gap-1.5 text-[14px] font-semibold transition disabled:opacity-40 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-black/10" aria-label="Send">
                    <Send className="w-3.5 h-3.5" /> Send
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
