import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Plus, Mic, Send, X,
  Loader2, PenLine, ArrowLeft,
  Moon, Sun, ChevronDown,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project } from './lib/supabase'
import { formatMarkdown } from './lib/markdown'
import { getFirstName, getTimeGreeting } from './lib/names'
import Auth from './components/Auth'
import Connectors from './components/Connectors'
import Settings from './components/Settings'
import Sidebar from './components/Sidebar'
import Logo from './components/Logo'
import MessageActions from './components/MessageActions'
import ThinkingStatus from './components/ThinkingStatus'
import type { User, Session } from '@supabase/supabase-js'

type Message = { id: string; role: 'user' | 'assistant'; content: string }
type Model = { id: string; name: string; badge?: string }

const MODELS: Model[] = [
  { id: 'quantum-2', name: 'Quantum 2' },
  { id: 'quantum-3', name: 'Quantum 3', badge: 'Pro' },
]

function generateId() {
  return Math.random().toString(36).slice(2, 11)
}

function ModalShell({
  dark,
  title,
  onClose,
  children,
}: {
  dark: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-md z-50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className={`fixed z-50 left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:h-auto sm:max-h-[min(88dvh,720px)] flex flex-col rounded-3xl overflow-hidden glass-modal ${dark ? 'glass-modal-dark' : 'glass-modal-light'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className={`text-lg font-semibold ${textMain}`}>{title}</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-white/70'}`}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6 min-h-0">{children}</div>
      </motion.div>
    </>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState(MODELS[1])
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('quantum-theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('quantum-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') || params.get('connector_error')) {
      setShowConnectors(true)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadConversations()
      loadProjects()
    } else {
      setConversations([])
      setProjects([])
      setCurrentConversationId(null)
      setCurrentProjectId(null)
      setMessages([])
    }
  }, [user])

  const loadConversations = async () => {
    const { data, error } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false })
    if (!error && data) setConversations(data)
  }

  const loadProjects = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
    if (!error && data) setProjects(data)
  }

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
    if (!error && data) {
      setMessages(data.map((m: DbMessage) => ({ id: m.id, role: m.role, content: m.content })))
      setCurrentConversationId(conversationId)
      setMobileSidebar(false)
    }
  }

  const createNewConversation = async (firstMessage: string) => {
    if (!user) return null
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '')
    const payload: Record<string, unknown> = { user_id: user.id, title }
    if (currentProjectId) payload.project_id = currentProjectId
    const { data, error } = await supabase.from('conversations').insert(payload).select().single()
    if (error || !data) { console.error(error); return null }
    setConversations((p) => [data, ...p])
    setCurrentConversationId(data.id)
    return data.id
  }

  const createProject = async (name: string) => {
    if (!user) return
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
    const color = colors[projects.length % colors.length]
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name, color })
      .select()
      .single()
    if (!error && data) {
      setProjects((p) => [data, ...p])
      setCurrentProjectId(data.id)
    }
  }

  const deleteProject = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id)
    setProjects((p) => p.filter((x) => x.id !== id))
    if (currentProjectId === id) setCurrentProjectId(null)
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
      setConversations((p) => p.filter((c) => c.id !== id))
      if (currentConversationId === id) { setCurrentConversationId(null); setMessages([]) }
    } finally { setDeletingId(null) }
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, isLoading, scrollToBottom])

  useEffect(() => {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SR) {
      const r = new SR()
      r.continuous = false
      r.interimResults = false
      r.lang = 'en-US'
      r.onresult = (e: SpeechRecognitionEvent) => {
        const t = e.results[0][0].transcript
        setInput((p) => (p ? p + ' ' + t : t))
        setIsListening(false)
      }
      r.onerror = () => setIsListening(false)
      r.onend = () => setIsListening(false)
      recognitionRef.current = r
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) { alert('Speech recognition not supported.'); return }
    if (isListening) { recognitionRef.current.stop(); setIsListening(false) }
    else { recognitionRef.current.start(); setIsListening(true) }
  }

  const firstName = getFirstName(user?.user_metadata?.full_name, user?.email)

  const callAI = async (userMessage: string, history: Message[]) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }],
          firstName,
          projectId: currentProjectId,
        }),
      })
      const data = await response.json()
      if (response.ok && data.content) return data.content
      return `⚠️ ${data?.error || 'AI error'}. Check ANTHROPIC_API_KEY in Vercel.`
    } catch (err: any) {
      return `⚠️ Could not reach AI. ${err.message || ''}`
    }
  }

  const handleSend = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim()
    if (!trimmed || isLoading || !user) return
    const userMsg: Message = { id: generateId(), role: 'user', content: trimmed }
    setMessages((p) => [...p, userMsg])
    setInput('')
    setLoadingPrompt(trimmed)
    setIsLoading(true)
    try {
      let convId = currentConversationId
      if (!convId) {
        convId = await createNewConversation(trimmed)
        if (!convId) throw new Error('Could not create conversation')
      }
      await saveMessage(convId, 'user', trimmed)
      const reply = await callAI(trimmed, messages)
      setMessages((p) => [...p, { id: generateId(), role: 'assistant', content: reply }])
      await saveMessage(convId, 'assistant', reply)
      loadConversations()
    } catch {
      setMessages((p) => [...p, { id: generateId(), role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setIsLoading(false)
      setLoadingPrompt('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const startNewChat = () => { setCurrentConversationId(null); setMessages([]); setMobileSidebar(false) }
  const handleSignOut = async () => { await supabase.auth.signOut(); setShowSettings(false) }
  const openSettings = () => { setShowSettings(true); setMobileSidebar(false) }
  const openConnectors = () => {
    setShowSettings(false)
    setShowConnectors(true)
    setMobileSidebar(false)
  }
  const isEmpty = messages.length === 0 && !isLoading

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!session || !user) return <Auth onSuccess={() => {}} />

  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'

  const activeProject = projects.find((p) => p.id === currentProjectId)

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
    onOpenSettings: openSettings,
    onOpenConnectors: openConnectors,
    onSelectProject: (id: string | null) => {
      setCurrentProjectId(id)
      setCurrentConversationId(null)
      setMessages([])
      setMobileSidebar(false)
    },
    onCreateProject: createProject,
    onDeleteProject: deleteProject,
  }

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden">
      <aside className={`hidden lg:flex w-[300px] flex-col min-h-0 border-r ${dark ? 'border-white/5' : 'border-white/40'}`}>
        <Sidebar {...sidebarProps} />
      </aside>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileSidebar(false)} />
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', damping: 32, stiffness: 340 }} className="fixed left-0 top-0 bottom-0 w-[min(100%,320px)] z-50 flex flex-col lg:hidden shadow-2xl">
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        <header className="h-14 lg:h-16 flex items-center justify-between px-3 lg:px-6 shrink-0 z-10">
          <div className="flex items-center gap-2">
            {!isEmpty ? (
              <button onClick={startNewChat} className={`p-2 rounded-full transition lg:hidden glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}>
                <ArrowLeft className={`w-5 h-5 ${textMuted}`} />
              </button>
            ) : (
              <button onClick={() => setMobileSidebar(true)} className={`p-2 rounded-full transition lg:hidden glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}>
                <Menu className={`w-5 h-5 ${textMuted}`} />
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowModelMenu((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}
              >
                <span className={textMain}>{selectedModel.name}</span>
                {selectedModel.badge && <span className={`text-[10px] ${textMuted}`}>{selectedModel.badge}</span>}
                <ChevronDown className={`w-3.5 h-3.5 ${textMuted}`} />
              </button>
              {showModelMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowModelMenu(false)} />
                  <div className={`absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-xl py-1 glass-modal ${dark ? 'glass-modal-dark' : 'glass-modal-light'}`}>
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

            {activeProject && (
              <span className={`hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: activeProject.color || '#6366f1' }} />
                <span className={textMuted}>{activeProject.name}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={startNewChat} className={`p-2 rounded-full transition glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`} title="New chat">
              <PenLine className={`w-4 h-4 ${textMuted}`} />
            </button>
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-full transition glass-card ${dark ? 'glass-card-dark text-amber-300' : 'glass-card-light text-slate-500'}`}>
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          <div className="max-w-2xl mx-auto px-4 lg:px-6 h-full">
            <AnimatePresence mode="wait">
              {isEmpty ? (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center justify-center min-h-[calc(100%-2rem)] py-10 text-center"
                >
                  <Logo size={64} className="mb-6 drop-shadow-lg" />
                  <h1 className={`text-[28px] sm:text-[34px] font-medium tracking-tight leading-tight ${textMain}`}>
                    Any new ideas<br className="sm:hidden" /> to explore?
                  </h1>
                  <p className={`mt-3 text-sm ${textMuted}`}>
                    {getTimeGreeting()}, {firstName}
                  </p>
                  {activeProject && (
                    <p className={`mt-2 text-xs ${textMuted}`}>
                      Workspace · {activeProject.name}
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4 space-y-6 pb-6">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} dark={dark} />
                  ))}
                  {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <ThinkingStatus prompt={loadingPrompt} dark={dark} />
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Input — larger bubble, more space above keyboard (Gemini-style) */}
        <div className="px-3 lg:px-6 pt-2 shrink-0 z-10 pb-[max(1.35rem,calc(env(safe-area-inset-bottom)+0.5rem))]">
          <div className="max-w-2xl mx-auto">
            <div
              className={`flex items-end gap-1.5 rounded-[28px] pl-2.5 pr-2 py-2 transition-all glass-input ${
                dark ? 'glass-input-dark' : 'glass-input-light'
              }`}
            >
              <button
                className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
                  dark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-white/50'
                }`}
              >
                <Plus className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Quantumy"
                rows={1}
                className={`flex-1 resize-none bg-transparent py-3 text-[16px] leading-relaxed max-h-36 outline-none placeholder:text-slate-400 ${textMain}`}
                style={{ minHeight: '44px' }}
              />
              <button
                onClick={toggleListening}
                className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
                  isListening
                    ? 'bg-red-500/15 text-red-400'
                    : dark
                      ? 'text-slate-400 hover:bg-white/5'
                      : 'text-slate-500 hover:bg-white/50'
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
                  input.trim() && !isLoading
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/25'
                    : dark
                      ? 'bg-white/10 text-slate-500'
                      : 'bg-white/50 text-slate-400'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <ModalShell dark={dark} title="Settings" onClose={() => setShowSettings(false)}>
            <Settings
              dark={dark}
              user={user}
              onSignOut={handleSignOut}
              onToggleTheme={() => setDark(!dark)}
              onOpenConnectors={openConnectors}
            />
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConnectors && session?.access_token && (
          <ModalShell dark={dark} title="Connectors" onClose={() => setShowConnectors(false)}>
            <Connectors dark={dark} accessToken={session.access_token} />
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  )
}

function MessageBubble({ message, dark }: { message: Message; dark: boolean }) {
  const isUser = message.role === 'user'
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div
          className={`max-w-[85%] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words rounded-[22px] glass-card ${
            dark ? 'glass-card-dark text-slate-100' : 'glass-card-light text-slate-900'
          }`}
        >
          {message.content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-start max-w-full"
    >
      <div className={`w-full text-[15px] leading-relaxed break-words ${textMain}`}>
        <div className="ai-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }} />
      </div>
      <MessageActions content={message.content} dark={dark} />
    </motion.div>
  )
}
