import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, ThumbsUp, ThumbsDown, Share2, RotateCcw } from 'lucide-react'

type Props = {
  content: string
  dark: boolean
  onRegenerate?: () => void
}

export default function MessageActions({ content, dark, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<'up' | 'down' | null>(null)

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
