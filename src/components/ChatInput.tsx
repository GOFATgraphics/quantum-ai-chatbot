import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Mic, Send, Plus, Zap } from 'lucide-react'

type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
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
  isLoading,
  dark,
  errorHint,
  fastActive,
  onToggleFast,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [value])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
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
            placeholder="Ask Anything"
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
              disabled
              title="Voice input coming soon"
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition opacity-40 ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}
              aria-label="Voice input"
            >
              <Mic className="w-5 h-5" />
            </button>
            <motion.button
              type="button"
              initial={false}
              animate={{ scale: 1, opacity: 1 }}
              onClick={onSend}
              disabled={isLoading || !value.trim()}
              className="h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 text-white bg-slate-900 hover:bg-black disabled:opacity-40 transition dark:bg-white dark:text-slate-900"
              aria-label="Send"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
