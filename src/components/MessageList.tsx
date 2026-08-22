import { useState, type RefObject, useEffect, useMemo, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText } from 'lucide-react'
import MessageActions from './MessageActions'
import UserMessageActions from './UserMessageActions'
import ThinkingStatus from './ThinkingStatus'
import { formatMarkdown } from '../lib/markdown'
import {
  getScrollParent,
  isNearBottom,
  scrollChatToBottom,
  scrollChatToBottomAfterLayout,
  NEAR_BOTTOM_PX,
} from '../lib/chatScroll'

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

const USER_SNIPPET_LEN = 220

const messageVariants = {
  user: {
    initial: { opacity: 0, y: 14, x: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, x: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.97 },
  },
  assistant: {
    initial: { opacity: 0, y: 12, x: -8, scale: 0.98 },
    animate: { opacity: 1, y: 0, x: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.97 },
  },
}

function parseUserContent(content: string): { type: 'text' | 'image' | 'file'; value: string; alt?: string }[] {
  const parts: { type: 'text' | 'image' | 'file'; value: string; alt?: string }[] = []
  const imgRe = /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+|https?:\/\/[^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(content)) !== null) {
    if (m.index > last) {
      const text = content.slice(last, m.index).trim()
      if (text) parts.push({ type: 'text', value: text })
    }
    const src = m[2].replace(/\s+/g, '')
    parts.push({ type: 'image', value: src, alt: m[1] || 'Image' })
    last = m.index + m[0].length
  }
  const rest = content.slice(last).trim()
  if (rest) {
    if (/^📎\s*\*\*/.test(rest) || /^---\s*File:/.test(rest) || /^\[File attached:/.test(rest) || /^\[Image attached:/.test(rest)) {
      parts.push({ type: 'file', value: rest })
    } else {
      parts.push({ type: 'text', value: rest })
    }
  }
  if (parts.length === 0 && content.trim()) {
    parts.push({ type: 'text', value: content })
  }
  return parts
}

function textOnlyFromContent(content: string) {
  return parseUserContent(content)
    .filter((s) => s.type === 'text')
    .map((s) => s.value)
    .join('\n\n')
    .trim()
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/20 text-white text-2xl leading-none flex items-center justify-center hover:bg-white/30"
        aria-label="Close"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  )
}

function UserBubble({
  content,
  dark,
  disabled,
  onEdit,
  onResend,
}: {
  content: string
  dark: boolean
  disabled?: boolean
  onEdit?: (text: string) => void
  onResend?: (text: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const segments = parseUserContent(content)

  const textOnly = textOnlyFromContent(content)
  const long = textOnly.length > USER_SNIPPET_LEN
  const shownText = !long || expanded ? textOnly : textOnly.slice(0, USER_SNIPPET_LEN).trimEnd() + '…'

  const startEdit = () => {
    setDraft(textOnly)
    setEditing(true)
  }

  const saveEdit = () => {
    const next = draft.trim()
    if (!next || next === textOnly) {
      setEditing(false)
      return
    }
    setEditing(false)
    onEdit?.(next)
  }

  return (
    <div className="flex flex-col items-end max-w-[85%]">
      <div
        className="glass-bubble w-full rounded-[22px] px-4 py-2.5 text-[15px] leading-[1.55] text-foreground"
      >
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, draft.split('\n').length + 1))}
              className="w-full resize-none bg-transparent border-0 outline-none text-[15px] leading-[1.55] min-h-[48px] text-foreground"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  saveEdit()
                }
              }}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[13px] font-medium px-3 py-1.5 rounded-full transition text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!draft.trim()}
                className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition disabled:opacity-40 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save & send
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {segments.map((seg, i) => {
              if (seg.type === 'image') {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setLightbox({ src: seg.value, alt: seg.alt || 'Attached image' })
                    }}
                    className="block overflow-hidden rounded-xl -mx-1 text-left w-full cursor-zoom-in"
                  >
                    <img
                      src={seg.value}
                      alt={seg.alt || 'Attached image'}
                      className="max-w-full max-h-[280px] object-contain rounded-xl pointer-events-none"
                      loading="lazy"
                    />
                  </button>
                )
              }
              if (seg.type === 'file') {
                const nameMatch =
                  seg.value.match(/\*\*([^*]+)\*\*/) ||
                  seg.value.match(/File:\s*([^\n-]+)/) ||
                  seg.value.match(/\[(?:File|Image) attached:\s*([^\]]+)\]/)
                const name = nameMatch?.[1]?.trim() || 'Attachment'
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium bg-secondary text-foreground"
                  >
                    <FileText className="w-4 h-4 shrink-0 opacity-70" />
                    <span className="truncate">{name}</span>
                  </div>
                )
              }
              return null
            })}
            {shownText && <div className="whitespace-pre-wrap break-words">{shownText}</div>}
          </div>
        )}
        {!editing && long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
        {lightbox && (
          <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
        )}
      </div>
      {!editing && (onEdit || onResend) && (
        <UserMessageActions
          content={content}
          dark={dark}
          disabled={disabled}
          onEdit={startEdit}
          onResend={() => onResend?.(textOnly || content)}
        />
      )}
    </div>
  )
}

const AssistantContent = memo(function AssistantContent({
  content,
  isStreamingThis,
}: {
  content: string
  isStreamingThis: boolean
}) {
  const html = useMemo(() => formatMarkdown(content), [content])
  if (!content) return null
  return (
    <div className="ai-content overflow-x-hidden break-words max-w-full">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {isStreamingThis && <span className="stream-caret" aria-hidden />}
    </div>
  )
})

type Props = {
  messages: ChatMessage[]
  isLoading: boolean
  lastUserPrompt: string
  dark: boolean
  messagesEndRef: RefObject<HTMLDivElement>
  conversationId?: string | null
  onRegenerate?: () => void
  onSuggestion?: (text: string) => void
  /** Edit a prior user message and resend from that point */
  onEditUser?: (messageId: string, newText: string) => void
  /** Resend a user message as a new turn */
  onResendUser?: (text: string) => void
  thoughtSeconds?: number | null
  toolStatus?: string | null
  suggestions?: string[]
}

export default function MessageList({
  messages,
  isLoading,
  lastUserPrompt,
  dark,
  messagesEndRef,
  conversationId = null,
  onRegenerate,
  onSuggestion,
  onEditUser,
  onResendUser,
  thoughtSeconds,
  toolStatus,
  suggestions = [],
}: Props) {
  const last = messages[messages.length - 1]
  const streaming = isLoading && last?.role === 'assistant' && !!last.content

  const stickToBottomRef = useRef(true)
  const lastConvRef = useRef<string | null>(null)
  const lastContentLenRef = useRef(0)

  useEffect(() => {
    const end = messagesEndRef.current
    const scroller = getScrollParent(end)
    if (!scroller) return

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        stickToBottomRef.current = isNearBottom(scroller, NEAR_BOTTOM_PX)
      })
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [messagesEndRef, conversationId, messages.length > 0])

  useEffect(() => {
    const convKey = conversationId ?? (messages[0]?.id ?? null)
    const switched = convKey !== lastConvRef.current
    if (switched) {
      lastConvRef.current = convKey
      stickToBottomRef.current = true
      lastContentLenRef.current = 0
    }
    if (messages.length === 0) return
    if (!switched && isLoading) return

    scrollChatToBottomAfterLayout(messagesEndRef.current, { force: true, behavior: 'auto' })
  }, [conversationId, messages.length > 0 ? messages[0]?.id : null, messages.length, messagesEndRef])

  useEffect(() => {
    if (messages.length === 0) return
    const contentLen = last?.content?.length ?? 0
    const contentGrew = contentLen > lastContentLenRef.current
    lastContentLenRef.current = contentLen

    const shouldFollow =
      stickToBottomRef.current && (isLoading || contentGrew || !!toolStatus || messages.length > 0)

    if (!shouldFollow) return

    const behavior: ScrollBehavior = isLoading ? 'auto' : 'smooth'
    scrollChatToBottom(messagesEndRef.current, { force: false, behavior })
  }, [messages, isLoading, toolStatus, last?.content, messagesEndRef])

  useEffect(() => {
    const reflow = () => {
      if (!stickToBottomRef.current) return
      scrollChatToBottom(messagesEndRef.current, { force: true, behavior: 'auto' })
    }
    const vv = window.visualViewport
    vv?.addEventListener('resize', reflow)
    vv?.addEventListener('scroll', reflow)
    window.addEventListener('resize', reflow)
    return () => {
      vv?.removeEventListener('resize', reflow)
      vv?.removeEventListener('scroll', reflow)
      window.removeEventListener('resize', reflow)
    }
  }, [messagesEndRef])

  useEffect(() => {
    if (!isLoading) return
    stickToBottomRef.current = true
    scrollChatToBottomAfterLayout(messagesEndRef.current, { force: true, behavior: 'auto' })
  }, [isLoading === true ? '1' : '0', messagesEndRef])

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-4 pb-6 space-y-6 overflow-x-hidden w-full max-w-full">
      <AnimatePresence initial={false} mode="popLayout">
        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1
          const isStreamingThis = streaming && isLast && msg.role === 'assistant'
          const variants = msg.role === 'user' ? messageVariants.user : messageVariants.assistant

          return (
            <motion.div
              key={msg.id}
              layout
              initial={variants.initial}
              animate={variants.animate}
              exit={variants.exit}
              transition={{
                duration: 0.32,
                ease: [0.22, 1, 0.36, 1],
                layout: { duration: 0.25 },
              }}
              className={msg.role === 'user' ? 'flex justify-end' : ''}
            >
              {msg.role === 'user' ? (
                <UserBubble
                  content={msg.content}
                  dark={dark}
                  disabled={isLoading}
                  onEdit={onEditUser ? (text) => onEditUser(msg.id, text) : undefined}
                  onResend={onResendUser}
                />
              ) : (
                <div className="max-w-[95%] min-w-0">
                  <div
                    className="text-[15.5px] leading-[1.65] tracking-[-0.01em] min-w-0 overflow-x-hidden break-words text-foreground"
                  >
                    <AssistantContent content={msg.content} isStreamingThis={isStreamingThis} />
                  </div>
                  {msg.content && !isStreamingThis && (
                    <>
                      {isLast && thoughtSeconds != null && thoughtSeconds > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className="mt-2 text-[12px] font-medium text-muted-foreground"
                        >
                          {`Responded in ${thoughtSeconds}s`}
                        </motion.div>
                      )}
                      <MessageActions
                        content={msg.content}
                        dark={dark}
                        onRegenerate={isLast && msg.role === 'assistant' ? onRegenerate : undefined}
                      />
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>

      <AnimatePresence>
        {isLoading &&
          (!(last?.role === 'assistant' && last?.content) || !!toolStatus) && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              <ThinkingStatus prompt={lastUserPrompt} dark={dark} toolLabel={toolStatus} />
            </motion.div>
          )}
      </AnimatePresence>

      {!isLoading && suggestions.length > 0 && onSuggestion && (
        <div className="flex flex-wrap gap-2 pt-1 pb-2 max-w-full overflow-x-hidden">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="text-[13px] font-medium px-3 py-1.5 rounded-full transition border bg-secondary border-border text-foreground hover:bg-accent shadow-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div ref={messagesEndRef} className="h-px w-full shrink-0" aria-hidden />
    </div>
  )
}
