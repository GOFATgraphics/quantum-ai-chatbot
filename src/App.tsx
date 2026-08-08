import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Mic, Send, X,
  Loader2, PenLine,
  ChevronDown, Copy, Check, ThumbsUp, ThumbsDown, Volume2,
  Sparkles,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import { formatMarkdown } from './lib/markdown'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Logo from './components/Logo'
import Settings from './components/Settings'
import Connectors from './components/Connectors'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

const MODELS = [
  { id: 'quantum-3', name: 'Quantum 3', badge: null as string | null },
  { id: 'quantum-3-pro', name: 'Quantum 3 Pro', badge: 'Pro' },
]

const SUGGESTIONS = [
  'Summarize my unread emails',
  'Find recent Drive files',
  'Draft a short email',
  'What should I focus on today?',
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyGreeting(firstName: string) {
  const h = new Date().getHours()
  if (h < 12) return `Good morning, ${firstName}`
  if (h < 17) return `Your move, ${firstName}!`
  return `Evening, ${firstName}`
}

function MessageActions({ content, dark }: { content: string; dark: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const muted = dark
    ? 'text-slate-500 hover:text-slate-300 hover:bg-white/8'
    : 'text-slate-400 hover:text-slate-600 hover:bg-black/5'
  return (
    <div className="flex items-center gap-0.5 mt-2">
      {[
        { onClick: copy, label: 'Copy', icon: copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" /> },
        { onClick: undefined, label: 'Good', icon: <ThumbsUp className="w-3.5 h-3.5" /> },
        { onClick: undefined, label: 'Bad', icon: <ThumbsDown className="w-3.5 h-3.5" /> },
        { onClick: undefined, label: 'Read', icon: <Volume2 className="w-3.5 h-3.5" /> },
      ].map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className={`p-1.5 rounded-full transition ${muted}`}
          aria-label={a.label}
        >
          {a.icon}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(MODELS[0])
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#0a0a0f' : '#f8f9fc')
  }, [dark])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const user = session?.user
  const firstName =
    user?.user_metadata?.full_name?.split(' ')?.[0] ||
    user?.user_metadata?.name?.split(' ')?.[0] ||
    user?.email?.split('@')?.[0] ||
    'there'

  const loadConversations = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (data) setConversations(data as Conversation[])
  }, [user])

  const loadProjects = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
    if (data) setProjects(data as Project[])
  }, [user])

  useEffect(() => {
    if (user) {
      loadConversations()
      loadProjects()
    }
  }, [user, loadConversations, loadProjects])

  const loadMessages = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    setMobileSidebar(false)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data.map((m: DbMessage) => ({ id: m.id, role: m.role, content: m.content })))
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setMessages([])
    setMobileSidebar(false)
  }

  const ensureConversation = async (firstUserText: string) => {
    if (currentConversationId) return currentConversationId
    const title = makeChatTitle(firstUserText)
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title, project_id: currentProjectId || null })
      .select()
      .single()
    if (error || !data) throw error || new Error('Could not create conversation')
    setCurrentConversationId(data.id)
    setConversations((prev) => [data as Conversation, ...prev])
    return data.id as string
  }

  const saveMessage = async (conversationId: string, role: 'user' | 'assistant', content: string) => {
    await supabase.from('messages').insert({ conversation_id: conversationId, role, content })
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
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

  const createProject = async (name: string) => {
    if (!user || !name.trim()) return
    const { data } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: name.trim() })
      .select()
      .single()
    if (data) {
      setProjects((p) => [data as Project, ...p])
      setCurrentProjectId(data.id)
    }
  }

  const deleteProject = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id)
    setProjects((p) => p.filter((x) => x.id !== id))
    if (currentProjectId === id) setCurrentProjectId(null)
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  const callAI = async (userMessage: string, history: Message[]) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }],
        firstName,
        projectId: currentProjectId,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.content) return data.content as string
    throw new Error(data.error || data.message || 'Request failed')
  }

  const handleSend = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim()
    if (!trimmed || isLoading || !user) return
    const userMsg: Message = { id: generateId(), role: 'user', content: trimmed }
    setMessages((p) => [...p, userMsg])
    setInput('')
    setIsLoading(true)
    try {
      const convId = await ensureConversation(trimmed)
      await saveMessage(convId, 'user', trimmed)
      const reply = await callAI(trimmed, messages)
      setMessages((p) => [...p, { id: generateId(), role: 'assistant', content: reply }])
      await saveMessage(convId, 'assistant', reply)
      await loadConversations()
    } catch {
      setMessages((p) => [
        ...p,
        { id: generateId(), role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [input])

  const isEmpty = messages.length === 0 && !isLoading
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const shellBg = dark ? 'bg-[#0a0a0f]' : 'bg-[#f8f9fc]'

  if (authLoading) {
    return (
      <div className={`flex flex-col items-center justify-center h-dvh gap-4 ${shellBg}`}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
          <Logo size={56} className="opacity-90" />
        </motion.div>
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!session || !user) return <Auth onSuccess={() => {}} />

  const sidebarProps = {
    dark,
    user,
    conversations,
    projects,
    currentConversationId,
    currentProjectId,
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
    onSelectProject: setCurrentProjectId,
    onCreateProject: createProject,
    onDeleteProject: deleteProject,
  }

  return (
    <div className={`flex h-dvh overflow-hidden ${shellBg}`}>
      <div className="hidden lg:flex w-[280px] shrink-0">
        <Sidebar {...sidebarProps} />
      </div>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 30, stiffness: 340 }}
              className="fixed inset-y-0 left-0 z-50 w-[min(300px,88vw)] lg:hidden"
            >
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative">
        <header className="pt-[env(safe-area-inset-top)] shrink-0 z-10">
          <div className="h-14 flex items-center justify-between px-2 sm:px-4">
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => setMobileSidebar(true)}
                className={`p-2.5 rounded-full transition lg:hidden ${dark ? 'hover:bg-white/8' : 'hover:bg-black/5'}`}
                aria-label="Menu"
              >
                <Menu className={`w-5 h-5 ${textMuted}`} />
              </button>

              <div className="relative min-w-0">
                <button
                  onClick={() => setShowModelMenu((v) => !v)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[15px] font-medium transition min-w-0 ${dark ? 'hover:bg-white/8' : 'hover:bg-black/5'}`}
                >
                  <span className={`${textMain} truncate`}>{selectedModel.name}</span>
                  {selectedModel.badge && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${dark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                      {selectedModel.badge}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 shrink-0 ${textMuted}`} />
                </button>
                <AnimatePresence>
                  {showModelMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowModelMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className={`absolute left-0 top-full mt-1 z-30 min-w-[180px] rounded-2xl py-1.5 shadow-xl border ${
                          dark ? 'bg-[#16161f] border-white/10' : 'bg-white border-black/5'
                        }`}
                      >
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setSelectedModel(m)
                              setShowModelMenu(false)
                            }}
                            className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between transition ${
                              dark ? 'hover:bg-white/5' : 'hover:bg-black/[0.03]'
                            } ${selectedModel.id === m.id ? (dark ? 'text-indigo-300' : 'text-indigo-600') : textMain}`}
                          >
                            <span className="font-medium">{m.name}</span>
                            {m.badge && <span className={`text-[10px] ${textMuted}`}>{m.badge}</span>}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <button
              onClick={startNewChat}
              className={`p-2.5 rounded-full transition ${dark ? 'hover:bg-white/8' : 'hover:bg-black/5'}`}
              aria-label="New chat"
            >
              <PenLine className={`w-5 h-5 ${textMuted}`} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-4">
          <div className="max-w-2xl mx-auto">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-11rem)] pb-8 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center"
                >
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="mb-6"
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dark ? 'bg-gradient-to-br from-indigo-500/20 to-violet-500/10' : 'bg-gradient-to-br from-indigo-50 to-violet-50'}`}>
                      <Logo size={36} />
                    </div>
                  </motion.div>
                  <h1 className={`text-[1.65rem] sm:text-[1.85rem] font-medium tracking-tight ${textMain}`}>
                    {emptyGreeting(firstName)}
                  </h1>
                  <p className={`mt-2 text-[15px] ${textMuted}`}>What can I help you with?</p>

                  <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md px-1">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.button
                        key={s}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 + i * 0.05, duration: 0.35 }}
                        onClick={() => handleSend(s)}
                        className={`text-left text-[13.5px] px-4 py-3.5 rounded-2xl transition border ${
                          dark
                            ? 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] text-slate-200'
                            : 'bg-white border-black/[0.04] hover:bg-white shadow-sm text-slate-700'
                        }`}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="space-y-5 py-3 pb-6">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className={msg.role === 'user' ? 'flex justify-end' : ''}
                    >
                      <Bubble message={msg} dark={dark} />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`inline-flex items-center gap-2 text-sm ${textMuted}`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                    </span>
                    Thinking…
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        <div className="shrink-0 px-3 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          <div className="max-w-2xl mx-auto">
            <motion.div
              layout
              className={`flex items-end gap-1.5 rounded-[28px] pl-2 pr-2 py-1.5 shadow-lg border ${
                dark
                  ? 'bg-[#16161f] border-white/[0.08] shadow-black/40'
                  : 'bg-white border-black/[0.06] shadow-slate-200/80'
              }`}
            >
              <button
                type="button"
                className={`p-2.5 rounded-full shrink-0 transition ${dark ? 'hover:bg-white/8 text-slate-400' : 'hover:bg-black/5 text-slate-500'}`}
                aria-label="Attach"
              >
                <Sparkles className="w-5 h-5" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask Quantumy…"
                className={`flex-1 resize-none bg-transparent border-0 outline-none text-[15px] leading-6 py-2.5 max-h-[140px] ${textMain} placeholder:text-slate-400`}
              />
              {!input.trim() ? (
                <button
                  type="button"
                  className={`p-2.5 rounded-full shrink-0 transition ${dark ? 'hover:bg-white/8 text-slate-400' : 'hover:bg-black/5 text-slate-500'}`}
                  aria-label="Voice"
                >
                  <Mic className="w-5 h-5" />
                </button>
              ) : (
                <motion.button
                  type="button"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={() => handleSend()}
                  disabled={isLoading}
                  className="p-2.5 rounded-full shrink-0 text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition shadow-md shadow-indigo-600/25"
                  aria-label="Send"
                >
                  <Send className="w-[18px] h-[18px]" />
                </motion.button>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 max-h-[85vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Settings
                dark={dark}
                user={user}
                onSignOut={async () => {
                  await supabase.auth.signOut()
                  setShowSettings(false)
                }}
                onToggleTheme={() => setDark((d) => !d)}
                onOpenConnectors={() => {
                  setShowSettings(false)
                  setShowConnectors(true)
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConnectors(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 max-h-[85vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className={`font-medium text-lg ${textMain}`}>Connectors</h2>
                <button type="button" onClick={() => setShowConnectors(false)} className={`p-2 rounded-full ${dark ? 'hover:bg-white/8' : 'hover:bg-black/5'} ${textMuted}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Connectors dark={dark} accessToken={session.access_token} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Bubble({ message, dark }: { message: Message; dark: boolean }) {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-[22px] rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed ${
          dark ? 'bg-[#2a2a35] text-slate-100' : 'bg-[#e8eaf0] text-slate-900'
        }`}
      >
        {message.content}
      </div>
    )
  }
  return (
    <div className="max-w-[95%] sm:max-w-[92%]">
      <div className={`text-[15px] leading-relaxed ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <div className="ai-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }} />
      </div>
      <MessageActions content={message.content} dark={dark} />
    </div>
  )
}
