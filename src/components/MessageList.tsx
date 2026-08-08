import type { RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Logo from './Logo'
import MessageActions from './MessageActions'
import ThinkingStatus from './ThinkingStatus'
import { formatMarkdown } from '../lib/markdown'

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

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
      <AnimatePresence initial={false}>
        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1
          const isStreamingThis = streaming && isLast && msg.role === 'assistant'

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={msg.role === 'user' ? 'flex justify-end' : ''}
            >
              {msg.role === 'user' ? (
                <div
                  className={`max-w-[85%] rounded-[22px] px-4 py-2.5 text-[15px] leading-[1.55] shadow-sm ${
                    dark
                      ? 'bg-gradient-to-br from-[#2c2c38] to-[#242430] text-slate-50 border border-white/[0.06]'
                      : 'bg-white/90 text-slate-900 border border-black/[0.04] shadow-[0_2px_12px_rgba(15,23,42,0.04)]'
                  }`}
                >
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[95%] flex gap-3">
                  <div
                    className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${
                      dark
                        ? 'bg-white/[0.06] ring-1 ring-white/10'
                        : 'bg-white/80 ring-1 ring-black/[0.04] shadow-sm'
                    }`}
                  >
                    <Logo size={22} dark={dark} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
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
                              className={`inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom rounded-full animate-pulse ${
                                dark ? 'bg-indigo-300' : 'bg-indigo-500'
                              }`}
                              aria-hidden
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                    {msg.content && !isStreamingThis && (
                      <>
                        {isLast && thoughtSeconds != null && thoughtSeconds > 0 && (
                          <div
                            className={`mt-2 text-[12px] font-medium ${
                              dark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {thinkActive
                              ? `Thought for ${thoughtSeconds}s`
                              : deepSearchActive
                                ? `Researched for ${thoughtSeconds}s`
                                : `Responded in ${thoughtSeconds}s`}
                          </div>
                        )}
                        <MessageActions
                          content={msg.content}
                          dark={dark}
                          onRegenerate={isLast && msg.role === 'assistant' ? onRegenerate : undefined}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>

      {isLoading &&
        !(last?.role === 'assistant' && last?.content) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                dark
                  ? 'bg-white/[0.06] ring-1 ring-white/10'
                  : 'bg-white/80 ring-1 ring-black/[0.04] shadow-sm'
              }`}
            >
              <Logo size={22} dark={dark} />
            </div>
            <ThinkingStatus
              prompt={lastUserPrompt}
              dark={dark}
              thinkActive={thinkActive}
              deepSearchActive={deepSearchActive}
            />
          </motion.div>
        )}

      <div ref={messagesEndRef} />
    </div>
  )
}
