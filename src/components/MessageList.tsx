import { useState, type RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText } from 'lucide-react'
import MessageActions from './MessageActions'
import ThinkingStatus from './ThinkingStatus'
import { formatMarkdown } from '../lib/markdown'

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

/** Split user content into text segments and image attachments */
function parseUserContent(content: string): { type: 'text' | 'image' | 'file'; value: string; alt?: string }[] {
  const parts: { type: 'text' | 'image' | 'file'; value: string; alt?: string }[] = []
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(content)) !== null) {
    if (m.index > last) {
      const text = content.slice(last, m.index).trim()
      if (text) parts.push({ type: 'text', value: text })
    }
    parts.push({ type: 'image', value: m[2], alt: m[1] || 'Image' })
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

function UserBubble({ content, dark }: { content: string; dark: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const segments = parseUserContent(content)

  const textOnly = segments
    .filter((s) => s.type === 'text')
    .map((s) => s.value)
    .join('\n\n')
  const long = textOnly.length > USER_SNIPPET_LEN
  const shownText = !long || expanded ? textOnly : textOnly.slice(0, USER_SNIPPET_LEN).trimEnd() + '…'

  return (
    <div
      className={`glass-bubble max-w-[85%] rounded-[22px] px-4 py-2.5 text-[15px] leading-[1.55] ${
        dark ? 'text-slate-50' : 'text-slate-900'
      }`}
    >
      <div className="space-y-2">
        {segments.map((seg, i) => {
          if (seg.type === 'image') {
            return (
              <a
                key={i}
                href={seg.value}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-xl -mx-1"
              >
                <img
                  src={seg.value}
                  alt={seg.alt || 'Attached image'}
                  className="max-w-full max-h-[280px] object-contain rounded-xl"
                  loading="lazy"
                />
              </a>
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
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium ${
                  dark ? 'bg-white/10 text-slate-200' : 'bg-slate-100/80 text-slate-700'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate">{name}</span>
              </div>
            )
          }
          return null
        })}
        {shownText && (
          <div className="whitespace-pre-wrap break-words">{shownText}</div>
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1.5 text-[13px] font-semibold ${
            dark ? 'text-indigo-300 hover:text-indigo-200' : 'text-indigo-600 hover:text-indigo-700'
          }`}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

type Props = {
  messages: ChatMessage[]
  isLoading: boolean
  lastUserPrompt: string
  dark: boolean
  messagesEndRef: RefObject<HTMLDivElement>
  onRegenerate?: () => void
  thoughtSeconds?: number | null
  thinkActive?: boolean
  deepSearchActive?: boolean
}

export default function MessageList({
  messages,
  isLoading,
  lastUserPrompt,
  dark,
  messagesEndRef,
  onRegenerate,
  thoughtSeconds,
  thinkActive,
  deepSearchActive,
}: Props) {
  const last = messages[messages.length - 1]
  const streaming =
    isLoading && last?.role === 'assistant' && !!last.content

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-5 py-4 pb-6 space-y-6">
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
                <UserBubble content={msg.content} dark={dark} />
              ) : (
                <div className="max-w-[95%] min-w-0">
                  <div
                    className={`text-[15.5px] leading-[1.65] tracking-[-0.01em] ${
                      dark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {msg.content ? (
                      <div className="ai-content">
                        <span
                          dangerouslySetInnerHTML={{
                            __html: formatMarkdown(msg.content),
                          }}
                        />
                        {isStreamingThis && (
                          <span
                            className="stream-caret"
                            aria-hidden
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                  {msg.content && !isStreamingThis && (
                    <>
                      {isLast && thoughtSeconds != null && thoughtSeconds > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className={`mt-2 text-[12px] font-medium ${
                            dark ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {thinkActive
                            ? `Thought for ${thoughtSeconds}s`
                            : deepSearchActive
                              ? `Researched for ${thoughtSeconds}s`
                              : `Responded in ${thoughtSeconds}s`}
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
          !(last?.role === 'assistant' && last?.content) && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              <ThinkingStatus
                prompt={lastUserPrompt}
                dark={dark}
                thinkActive={thinkActive}
                deepSearchActive={deepSearchActive}
              />
            </motion.div>
          )}
      </AnimatePresence>

      <div ref={messagesEndRef} />
    </div>
  )
}
