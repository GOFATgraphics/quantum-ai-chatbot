import type { RefObject } from 'react'
import EmptyState from './EmptyState'
import MessageList, { type ChatMessage } from './MessageList'
import ChatInput, { type PendingFile } from './ChatInput'

type Props = {
  isEmpty: boolean
  greeting: string
  dark: boolean
  messages: ChatMessage[]
  isLoading: boolean
  lastUserPrompt: string
  messagesEndRef: RefObject<HTMLDivElement>
  thoughtSeconds: number | null
  onRegenerate: () => void
  input: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  onSpeak: () => void
  errorHint: string | null
  pendingFiles: PendingFile[]
  onFilesChange: (files: PendingFile[]) => void
}

export default function ChatShell(p: Props) {
  const inputProps = {
    value: p.input,
    onChange: p.onChange,
    onSend: p.onSend,
    onStop: p.onStop,
    onSpeak: p.onSpeak,
    isLoading: p.isLoading,
    dark: p.dark,
    errorHint: p.errorHint,
    pendingFiles: p.pendingFiles,
    onFilesChange: p.onFilesChange,
  }

  return (
    <>
      <main
        className={`relative z-10 flex-1 min-h-0 ${
          p.isEmpty
            ? 'flex flex-col items-center justify-center overflow-hidden'
            : 'overflow-y-auto'
        }`}
      >
        {p.isEmpty ? (
          <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
            <EmptyState greeting={p.greeting} dark={p.dark} />
            {/* Desktop / laptop: typing bar centered under greeting */}
            <div className="hidden md:block w-full mt-8">
              <ChatInput {...inputProps} />
            </div>
          </div>
        ) : (
          <MessageList
            messages={p.messages}
            isLoading={p.isLoading}
            lastUserPrompt={p.lastUserPrompt}
            dark={p.dark}
            messagesEndRef={p.messagesEndRef}
            thoughtSeconds={p.thoughtSeconds}
            onRegenerate={p.onRegenerate}
          />
        )}
      </main>

      {/* Mobile: bottom bar when empty; always bottom when chatting */}
      <div className={p.isEmpty ? 'md:hidden' : undefined}>
        <ChatInput {...inputProps} />
      </div>
    </>
  )
}
