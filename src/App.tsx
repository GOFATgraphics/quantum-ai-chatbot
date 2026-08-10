import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, Sun, Moon } from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project } from './lib/supabase'
import { useTheme } from './lib/theme'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Connectors from './components/Connectors'
import Onboarding from './components/Onboarding'
import Logo from './components/Logo'
import MessageList, { type ChatMessage } from './components/MessageList'
import EmptyState from './components/EmptyState'
import ChatInput, { type PendingFile } from './components/ChatInput'
import LiveVoice, { type VoiceGender } from './components/LiveVoice'
import InstallPWA from './components/InstallPWA'
import CommandPalette from './components/CommandPalette'

const MODELS = [
  { id: 'quantum-flash', name: 'Quantum Flash', badge: 'Fast' as string | null, anthropic: 'claude-haiku-4-5-20251001', blurb: 'Instant answers' },
  { id: 'quantum-lite', name: 'Quantum Lite', badge: null as string | null, anthropic: 'claude-sonnet-4-6', blurb: 'Balanced everyday work' },
  { id: 'quantum-pro', name: 'Quantum Pro', badge: 'Pro' as string | null, anthropic: 'claude-opus-4-6', blurb: 'Deep reasoning & complex tasks' },
]

function creativeGreeting(firstName: string) {
  const n = (firstName || '').trim()
  if (n && n.toLowerCase() !== 'there') return 'What can I help you with today, ' + n + '?'
  return 'What can I help you with today?'
}

export default function App() {
  const { dark, setDark, cycleTheme, themeMode } = useTheme()
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [selectedModel] = useState(MODELS[1])
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showLiveVoice, setShowLiveVoice] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [greetingLine, setGreetingLine] = useState('')
  const [lastUserPrompt] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const user = session?.user
  const firstName =
    user?.user_metadata?.preferred_name || user?.email?.split('@')?.[0] || 'there'
  const needsOnboarding = !!user && user.user_metadata?.onboarding_complete !== true

  useEffect(() => {
    if (!user) return
    supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setConversations(data as Conversation[])
      })
  }, [user])

  useEffect(() => {
    if (messages.length === 0) setGreetingLine((g) => g || creativeGreeting(firstName))
  }, [firstName, messages.length])

  const startNewChat = () => {
    abortRef.current?.abort()
    setIsLoading(false)
    setCurrentConversationId(null)
    setMessages([])
    setMobileSidebar(false)
    setErrorHint(null)
    setGreetingLine(creativeGreeting(firstName))
  }

  const loadMessages = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    setMobileSidebar(false)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (data) {
      setMessages(data.map((m: DbMessage) => ({ id: m.id, role: m.role, content: m.content })))
    }
  }

  const deleteConversation = async (id: string) => {
    setDeletingId(id)
    try {
      await supabase.from('messages').delete().eq('conversation_id', id)
      await supabase.from('conversations').delete().eq('id', id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (currentConversationId === id) startNewChat()
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-white">
        <Logo size={56} dark={false} />
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!session || !user) return <Auth onSuccess={() => {}} />

  if (needsOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          supabase.auth.getSession().then(({ data }) => setSession(data.session))
        }}
      />
    )
  }

  const isEmpty = messages.length === 0 && !isLoading

  const sidebarProps = {
    dark,
    user,
    conversations,
    projects: [] as Project[],
    currentConversationId,
    currentProjectId: null as string | null,
    deletingId,
    onNewChat: startNewChat,
    onSelectChat: loadMessages,
    onDeleteChat: deleteConversation,
    onOpenSettings: () => {
      setShowSettings(true)
      setMobileSidebar(false)
    },
    onOpenConnectors: () => {
      setShowConnectors(true)
      setMobileSidebar(false)
    },
    onOpenProjects: () => {},
    onSelectProject: (_id: string | null) => {},
    onOpenCommandPalette: () => {
      setShowCommandPalette(true)
      setMobileSidebar(false)
    },
  }

  return (
    <div className="app-root-shell flex overflow-hidden overscroll-none bg-transparent">
      <div className="hidden lg:flex w-[300px] shrink-0">
        <Sidebar {...sidebarProps} />
      </div>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/25 z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 32, stiffness: 360 }}
              className={
                dark
                  ? 'fixed inset-y-0 left-0 z-50 w-[min(320px,90vw)] lg:hidden shadow-2xl bg-[#16161f]'
                  : 'fixed inset-y-0 left-0 z-50 w-[min(320px,90vw)] lg:hidden shadow-2xl bg-white'
              }
            >
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div
        className={
          'chat-shell-locked flex-1 flex flex-col min-w-0 min-h-0 h-full relative overflow-hidden overscroll-none ' +
          (isEmpty ? 'chat-shell-empty ' : '') +
          (dark ? '' : 'bg-white')
        }
      >
        <header className="glass-header shrink-0 pt-[env(safe-area-inset-top)] z-30">
          <div className="h-14 grid grid-cols-[1fr_auto_1fr] items-center px-3 gap-2">
            <div className="flex items-center justify-start min-w-0">
              <button
                onClick={() => setMobileSidebar(true)}
                className={
                  dark
                    ? 'glass-btn lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition text-slate-200'
                    : 'glass-btn lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition text-slate-700'
                }
                aria-label="Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center">
              <span className={dark ? 'text-sm font-medium text-slate-100' : 'text-sm font-medium text-slate-800'}>
                {selectedModel.name}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              <button
                type="button"
                onClick={cycleTheme}
                className={
                  dark
                    ? 'glass-btn w-10 h-10 rounded-full flex items-center justify-center transition text-slate-200'
                    : 'glass-btn w-10 h-10 rounded-full flex items-center justify-center transition text-slate-700'
                }
                aria-label={'Theme: ' + themeMode}
              >
                {dark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
              {!isEmpty && (
                <button
                  onClick={startNewChat}
                  className={
                    dark
                      ? 'glass-btn w-10 h-10 rounded-full flex items-center justify-center transition text-slate-200'
                      : 'glass-btn w-10 h-10 rounded-full flex items-center justify-center transition text-slate-700'
                  }
                  aria-label="New chat"
                >
                  <PenLine className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
          {isEmpty ? (
            <div className="relative flex-1 min-h-0 overflow-hidden w-full">
              <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
                <div className="w-full max-w-lg">
                  <EmptyState
                    greeting={greetingLine || creativeGreeting(firstName)}
                    dark={dark}
                    composing={composerFocused}
                  />
                </div>
              </div>
            </div>
          ) : (
            <main className="flex-1 overflow-y-auto min-h-0" data-scrollable="true">
              <MessageList
                messages={messages}
                isLoading={isLoading}
                lastUserPrompt={lastUserPrompt}
                dark={dark}
                messagesEndRef={messagesEndRef}
                thoughtSeconds={null}
                thinkActive={false}
                deepSearchActive={false}
                onRegenerate={() => {}}
              />
            </main>
          )}

          <div className="shrink-0">
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={() => {}}
              onStop={() => abortRef.current?.abort()}
              onSpeak={() => setShowLiveVoice(true)}
              isLoading={isLoading}
              dark={dark}
              errorHint={errorHint}
              pendingFiles={pendingFiles}
              onFilesChange={setPendingFiles}
              onFocusChange={setComposerFocused}
            />
          </div>
        </div>

        <InstallPWA dark={dark} />
      </div>

      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        dark={dark}
        conversations={conversations}
        projects={[]}
        currentConversationId={currentConversationId}
        currentProjectId={null}
        onNewChat={startNewChat}
        onSelectChat={loadMessages}
        onSelectProject={() => {}}
        onOpenSettings={() => setShowSettings(true)}
        onOpenConnectors={() => setShowConnectors(true)}
        onToggleTheme={() => setDark((d) => !d)}
      />

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <Settings
                dark={dark}
                glass={true}
                user={user}
                onClose={() => setShowSettings(false)}
                onSignOut={async () => {
                  await supabase.auth.signOut()
                  setShowSettings(false)
                }}
                onToggleTheme={() => setDark((d) => !d)}
                onToggleGlass={() => {}}
                onOpenConnectors={() => {
                  setShowSettings(false)
                  setShowConnectors(true)
                }}
                onProfileUpdated={() => {
                  supabase.auth.getSession().then(({ data }) => setSession(data.session))
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConnectors && session?.access_token && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50"
            onClick={() => setShowConnectors(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <Connectors dark={dark} accessToken={session.access_token} onClose={() => setShowConnectors(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLiveVoice && (
          <LiveVoice
            dark={dark}
            firstName={firstName}
            preferredVoice={voiceGender}
            onVoiceChange={setVoiceGender}
            onClose={() => setShowLiveVoice(false)}
            onAsk={async () => 'Voice is temporarily simplified during deploy recovery.'}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
