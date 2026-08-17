import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Props = {
  open: boolean
  onClose: () => void
  label: string
  /** 'narrow' matches Settings/Connectors/Projects; 'wide' matches the full dashboards. */
  width?: 'narrow' | 'wide'
  children: React.ReactNode
}

const SHEET_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }

/** Shared full-screen sheet modal: Escape-to-close, dialog semantics, and one consistent transition, used by every panel opened from the sidebar/header. */
export default function Sheet({ open, onClose, label, width = 'narrow', children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const maxWidth = width === 'wide' ? 'sm:max-w-[880px]' : 'sm:max-w-[430px]'
  const maxHeight = width === 'wide' ? 'h-[min(94dvh,860px)]' : 'h-[min(92dvh,720px)]'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SHEET_TRANSITION}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 24 }}
            transition={SHEET_TRANSITION}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`glass-sheet w-full ${maxWidth} ${maxHeight} rounded-t-[28px] sm:rounded-[28px] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
