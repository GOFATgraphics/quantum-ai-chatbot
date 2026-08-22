import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Pencil, RotateCw } from 'lucide-react'

type Props = {
  content: string
  dark: boolean
  disabled?: boolean
  onEdit: () => void
  onResend: () => void
}

function plainTextForCopy(content: string) {
  return content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/📎\s*\*\*[^*]+\*\*[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/---\s*File:[^-]+---[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/\[(?:Image|File) attached:[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function UserMessageActions({ content, disabled, onEdit, onResend }: Props) {
  const [copied, setCopied] = useState(false)

  const muted = 'text-muted-foreground hover:text-foreground hover:bg-accent'

  const copy = async () => {
    try {
      const text = plainTextForCopy(content)
      if (!text) return
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="msg-actions-bar inline-flex items-center gap-0.5 mt-1.5 px-1.5 py-0.5 rounded-full bg-muted ring-1 ring-border"
    >
      <button type="button" onClick={copy} className={`p-1.5 rounded-full transition ${muted}`} title="Copy">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="block">
              <Check className="w-3.5 h-3.5 text-foreground" />
            </motion.span>
          ) : (
            <motion.span key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="block">
              <Copy className="w-3.5 h-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className={`p-1.5 rounded-full transition ${muted} disabled:opacity-40`}
        title="Edit"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onResend}
        disabled={disabled}
        className={`p-1.5 rounded-full transition ${muted} disabled:opacity-40`}
        title="Resend"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}
