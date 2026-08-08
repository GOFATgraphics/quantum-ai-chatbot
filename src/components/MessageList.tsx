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
}

export default function MessageList({ messages, isLoading, lastUserPrompt, dark, messagesEndRef }: Props) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-3 pb-4 space-y-5">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={msg.role === 'user' ? 'flex justify-end' : ''}
          >
            {msg.role === 'user' ? (
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  dark ? 'bg-[#2a2a35] text-slate-100' : 'bg-[#f0f1f5] text-slate-900'
                }`}
              >
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%] flex gap-2.5">
                <div className="shrink-0 mt-0.5">
                  <Logo size={28} dark={dark} className="rounded-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] leading-relaxed ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
                    <div className="ai-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                  </div>
                  {msg.content && <MessageActions content={msg.content} dark={dark} />}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {isLoading && !(messages.length && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
          <Logo size={28} dark={dark} />
          <ThinkingStatus prompt={lastUserPrompt} dark={dark} />
        </motion.div>
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
