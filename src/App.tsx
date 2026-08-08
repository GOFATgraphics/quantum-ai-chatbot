import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Plus, Mic, Send, X,
  Loader2, PenLine, ArrowLeft,
  ChevronDown, Copy, Check, ThumbsUp, ThumbsDown, Volume2,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import { formatMarkdown } from './lib/markdown'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Logo from './components/Logo'
import Settings from './components/Settings'
import Connectors from './components/Connectors'

// NOTE: Full App restored for build - if Settings/Connectors imports fail, see repo

type Message = { id: string; role: 'user' | 'assistant'; content: string }

const MODELS = [
  { id: 'quantum-3', name: 'Quantum 3', badge: null as string | null },
  { id: 'quantum-3-pro', name: 'Quantum 3 Pro', badge: 'Pro' },
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
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
  const muted = dark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
  return (
    <div className="flex items-center gap-1 mt-2 opacity-70">
      <button type="button" onClick={copy} className={`p-1.5 rounded-lg transition ${muted}`} aria-label="Copy">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button type="button" className={`p-1.5 rounded-lg transition ${muted}`} aria-label="Good response">
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`p-1.5 rounded-lg transition ${muted}`} aria-label="Bad response">
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={`p-1.5 rounded-lg transition ${muted}`} aria-label="Read aloud">
        <Volume2 className="w-3.5 h-3.5" />
      </button>
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
    if (meta) meta.setAttribute('content', dark ? '#07070c' : '#f0f2f8')
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
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  const isEmpty = messages.length === 0 && !isLoading
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-[#05050a]">
        <Logo size={56} className="opacity-90" dark />
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
    <div className={`flex h-dvh overflow-hidden ${dark ? 'bg-[#07070c]' : 'bg-[#f0f2f8'}`}>
      <div className="hidden lg:flex">
        <Sidebar {...sidebarProps} />
      </div>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        <header className="pt-[env(safe-area-inset-top)] shrink-0 z-10">
          <div className="h-14 lg:h-16 flex items-center justify-between px-3 lg:px-6">
            <div className="flex items-center gap-2 min-w-0">
              {!isEmpty ? (
                <button
                  onClick={startNewChat}
                  className={`p-2 rounded-full transition lg:hidden shrink-0 glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}
                >
                  <ArrowLeft className={`w-5 h-5 ${textMuted}`} />
                </button>
              ) : (
                <button
                  onClick={() => setMobileSidebar(true)}
                  className={`p-2 rounded-full transition lg:hidden shrink-0 glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}
                >
                  <Menu className={`w-5 h-5 ${textMuted}`} />
                </button>
              )}

              <div className="relative min-w-0">
                <button
                  onClick={() => setShowModelMenu((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium glass-card min-w-0 ${dark ? 'glass-card-dark' : 'glass-card-light'}`}
                >
                  <span className={`${textMain} truncate`}>{selectedModel.name}</span>
                  {selectedModel.badge && (
                    <span className={`text-[10px] shrink-0 ${textMuted}`}>{selectedModel.badge}</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${textMuted}`} />
                </button>
                {showModelMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowModelMenu(false)} />
                    <div
                      className={`absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-xl py-1 glass-modal ${dark ? 'glass-modal-dark' : 'glass-modal-light'}`}
                    >
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedModel(m)
                            setShowModelMenu(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${dark ? 'hover:bg-white/5' : 'hover:bg-white/50'} ${selectedModel.id === m.id ? (dark ? 'text-indigo-300' : 'text-indigo-600') : textMain}`}
                        >
                          <span>{m.name}</span>
                          {m.badge && <span className={`text-[10px] ${textMuted}`}>{m.badge}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={startNewChat}
              className={`hidden lg:flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'} ${textMuted}`}
            >
              <PenLine className="w-4 h-4" />
              New chat
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-4 lg:px-6">
          <div className="max-w-3xl mx-auto pb-4">
            {isEmpty ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center min-h-[calc(100%-2rem)] py-8 text-center"
              >
                <Logo size={64} className="mb-5 drop-shadow-lg" dark={dark} />
                <h1 className={`text-[26px] sm:text-[32px] font-medium tracking-tight leading-tight ${textMain}`}>
                  {getTimeGreeting()}, {firstName}
                </h1>
                <p className={`mt-2 text-sm ${textMuted}`}>What can I help you with?</p>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {['Summarize my unread emails', 'Find recent Drive files', 'Draft a short email', 'What should I focus on today?'].map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className={`text-left text-sm px-4 py-3 rounded-2xl transition glass-card ${dark ? 'glass-card-dark hover:bg-white/5' : 'glass-card-light hover:bg-white/80'} ${textMain}`}
                      >
                        {s}
                      </button>
                    )
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="space-y-6 py-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                    <Bubble message={msg} dark={dark} />
                  </div>
                ))}
                {isLoading && (
                  <div className={`inline-flex items-center gap-2 text-sm ${textMuted}`}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking…
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>

        <div className="shrink-0 px-3 sm:px-4 lg:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="max-w-3xl mx-auto">
            <div className={`flex items-end gap-2 rounded-3xl px-3 py-2 glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message Quantumy…"
                className={`flex-1 resize-none bg-transparent border-0 outline-none text-[15px] leading-6 py-2 max-h-40 ${textMain} placeholder:opacity-60`}
              />
              <button type="button" className={`p-2 rounded-full shrink-0 ${textMuted}`} aria-label="Voice">
                <Mic className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-full shrink-0 text-white bg-gradient-to-r from-indigo-600 to-violet-600 disabled:opacity-40 transition"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowSettings(false)}>
          <div className={`w-full max-w-md rounded-2xl p-4 ${dark ? 'bg-slate-900' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <Settings dark={dark} onClose={() => setShowSettings(false)} onToggleDark={() => setDark((d) => !d)} />
          </div>
        </div>
      )}

      {showConnectors && session?.access_token && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowConnectors(false)}>
          <div className={`w-full max-w-md rounded-2xl p-4 max-h-[80vh] overflow-y-auto ${dark ? 'bg-slate-900' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`font-medium ${textMain}`}>Connectors</h2>
              <button type="button" onClick={() => setShowConnectors(false)} className={textMuted}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <Connectors dark={dark} accessToken={session.access_token} />
          </div>
        </div>
      )}
    </div>
  )
}

function Bubble({ message, dark }: { message: Message; dark: boolean }) {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div className="max-w-[85%] sm:max-w-[75%] rounded-3xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed bg-indigo-600 text-white">
        {message.content}
      </div>
    )
  }
  return (
    <div className="max-w-[95%] sm:max-w-[90%]">
      <div className={`text-[15px] leading-relaxed ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <div className="ai-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }} />
      </div>
      <MessageActions content={message.content} dark={dark} />
    </div>
  )
}
