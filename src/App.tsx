import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Plus, Mic, Send, X, LogOut, MessageSquare,
  Loader2, GraduationCap, Cpu, PenLine, ArrowLeft,
  Moon, Sun, ChevronDown,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage } from './lib/supabase'
import { formatMarkdown } from './lib/markdown'
import Auth from './components/Auth'
import Connectors from './components/Connectors'
import Sidebar from './components/Sidebar'
import Logo from './components/Logo'
import MessageActions from './components/MessageActions'
import type { User, Session } from '@supabase/supabase-js'

type Message = { id: string; role: 'user' | 'assistant'; content: string }
type Model = { id: string; name: string; badge?: string }

const MODELS: Model[] = [
  { id: 'quantum-2', name: 'Quantum 2' },
  { id: 'quantum-3', name: 'Quantum 3', badge: 'Pro' },
]

const CATEGORIES = [
  { id: 'emails', title: 'Emails', desc: 'Find and summarize messages', icon: MessageSquare, light: 'bg-blue-50 text-blue-600', dark: 'bg-blue-500/15 text-blue-400', prompt: 'Summarize my latest important emails' },
  { id: 'docs', title: 'Documents', desc: 'Search files and reports', icon: GraduationCap, light: 'bg-amber-50 text-amber-600', dark: 'bg-amber-500/15 text-amber-400', prompt: 'Help me find a document about recent orders' },
  { id: 'data', title: 'Data & Trades', desc: 'Orders, invoices, status', icon: Cpu, light: 'bg-emerald-50 text-emerald-600', dark: 'bg-emerald-500/15 text-emerald-400', prompt: 'Which trades or orders are still pending?' },
  { id: 'writing', title: 'Writing', desc: 'Drafts, replies, notes', icon: PenLine, light: 'bg-rose-50 text-rose-600', dark: 'bg-rose-500/15 text-rose-400', prompt: 'Help me draft a professional follow-up email' },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

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
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className={`fixed z-50 left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] bottom-[max(1rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:h-auto sm:max-h-[min(85dvh,640px)] flex flex-col rounded-3xl shadow-2xl overflow-hidden ${dark ? 'bg-[#12121a] border border-white/10' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className={`text-lg font-semibold ${textMain}`}>{title}</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
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
  const [selectedModel, setSelectedModel] = useState(MODELS[1])
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
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
    if (user) loadConversations()
    else { setConversations([]); setCurrentConversationId(null); setMessages([]) }
  }, [user])

  const loadConversations = async () => {
    const { data, error } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false })
    if (!error && data) setConversations(data)
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
    const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title }).select().single()
    if (error || !data) { console.error(error); return null }
    setConversations((p) => [data, ...p])
    setCurrentConversationId(data.id)
    return data.id
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
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const startNewChat = () => { setCurrentConversationId(null); setMessages([]); setMobileSidebar(false) }
  const handleSignOut = async () => { await supabase.auth.signOut(); setShowSettings(false) }
  const openSettings = () => { setShowSettings(true); setMobileSidebar(false) }
  const openConnectors = () => { setShowConnectors(true); setMobileSidebar(false) }
  const isEmpty = messages.length === 0 && !isLoading

  if (authLoading) {
    return (
      <div className={`flex items-center justify-center h-dvh ${dark ? 'bg-[#0a0a0f]' : 'bg-[#f7f8fa]'}`}>
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!session || !user) return <Auth onSuccess={() => {}} />

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'there'

  const shell = dark ? 'bg-[#0a0a0f] text-slate-100' : 'bg-[#f7f8fa] text-slate-900'
  const inputBar = dark
    ? 'bg-[#16161c] border border-white/10 shadow-lg focus-within:border-indigo-500/30'
    : 'bg-white border border-slate-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.06)] focus-within:border-slate-300'
  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'

  const sidebarProps = {
    dark,
    user,
    conversations,
    currentConversationId,
    deletingId,
    onNewChat: startNewChat,
    onSelectChat: loadMessages,
    onDeleteChat: deleteConversation,
    onOpenSettings: openSettings,
    onOpenConnectors: openConnectors,
  }

  return (
    <div className={`flex h-dvh max-h-dvh overflow-hidden transition-colors duration-300 ${shell}`}>
      <aside className={`hidden lg:flex w-[300px] flex-col border-r min-h-0 ${dark ? 'border-white/5 bg-[#0f0f16]' : 'border-slate-200/70 bg-white'}`}>
        <Sidebar {...sidebarProps} />
      </aside>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileSidebar(false)} />
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
              <button onClick={startNewChat} className={`p-2 rounded-full transition lg:hidden ${dark ? 'hover:bg-white/10' : 'hover:bg-white'}`}>
                <ArrowLeft className={`w-5 h-5 ${textMuted}`} />
              </button>
            ) : (
              <button onClick={() => setMobileSidebar(true)} className={`p-2 rounded-full transition lg:hidden ${dark ? 'hover:bg-white/10 bg-white/5' : 'hover:bg-white bg-white shadow-sm'}`}>
                <Menu className={`w-5 h-5 ${textMuted}`} />
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowModelMenu((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${dark ? 'hover:bg-white/5' : 'hover:bg-white'}`}
              >
                <span className={textMain}>{selectedModel.name}</span>
                {selectedModel.badge && <span className={`text-[10px] ${textMuted}`}>{selectedModel.badge}</span>}
                <ChevronDown className={`w-3.5 h-3.5 ${textMuted}`} />
              </button>
              {showModelMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowModelMenu(false)} />
                  <div className={`absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-xl border py-1 shadow-lg ${dark ? 'bg-[#16161c] border-white/10' : 'bg-white border-slate-200'}`}>
                    {MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m)
                          setShowModelMenu(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} ${selectedModel.id === m.id ? (dark ? 'text-indigo-300' : 'text-indigo-600') : textMain}`}
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

          <div className="flex items-center gap-1">
            <button onClick={startNewChat} className={`p-2 rounded-full transition ${dark ? 'hover:bg-white/10' : 'hover:bg-white shadow-sm bg-white/80'}`} title="New chat">
              <PenLine className={`w-4 h-4 ${textMuted}`} />
            </button>
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-full transition ${dark ? 'hover:bg-white/10 text-amber-300' : 'hover:bg-white text-slate-500'}`}>
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
                  <Logo size={56} className="mb-5 drop-shadow-md" />
                  <h1 className={`text-[26px] sm:text-[32px] font-medium tracking-tight leading-tight ${textMain}`}>
                    Any new ideas<br className="sm:hidden" /> to explore?
                  </h1>
                  <p className={`mt-3 text-sm ${textMuted}`}>
                    {getGreeting()}, {displayName}
                  </p>

                  <div className="mt-10 grid grid-cols-2 gap-2.5 w-full max-w-md">
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleSend(cat.prompt)}
                          className={`text-left p-3.5 rounded-2xl transition active:scale-[0.98] ${dark ? 'bg-white/[0.04] border border-white/10 hover:bg-white/[0.07]' : 'bg-white border border-slate-200/80 hover:border-slate-300 shadow-sm'}`}
                        >
                          <Icon className={`w-4 h-4 mb-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`} />
                          <div className={`text-[13px] font-medium ${textMain}`}>{cat.title}</div>
                          <div className={`text-[11px] mt-0.5 leading-snug ${textMuted}`}>{cat.desc}</div>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4 space-y-6 pb-6">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} dark={dark} />
                  ))}
                  {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
                      <Logo size={28} />
                      <div className="flex gap-1.5 items-center h-7">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse-dot" style={{ animationDelay: '160ms' }} />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse-dot" style={{ animationDelay: '320ms' }} />
                      </div>
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <div className="px-3 lg:px-6 pt-1 shrink-0 z-10 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <div className={`flex items-end gap-1.5 rounded-full pl-2 pr-1.5 py-1.5 transition-all ${inputBar}`}>
              <button className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Plus className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Quantumy"
                rows={1}
                className={`flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed max-h-32 outline-none placeholder:text-slate-400 ${textMain}`}
                style={{ minHeight: '40px' }}
              />
              <button
                onClick={toggleListening}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${isListening ? 'bg-red-500/15 text-red-400' : dark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <Mic className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                  input.trim() && !isLoading
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : dark
                      ? 'bg-white/10 text-slate-500'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className={`text-center text-[11px] mt-2 ${textMuted}`}>
              Quantumy is AI and can make mistakes.
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <ModalShell dark={dark} title="Settings" onClose={() => setShowSettings(false)}>
            <div className="space-y-4">
              <div className={`rounded-2xl p-4 ${dark ? 'bg-white/5' : 'bg-slate-50'}`}>
                <p className={`text-xs font-medium mb-1 ${textMuted}`}>Signed in as</p>
                <p className={`text-sm truncate ${textMain}`}>{user.email}</p>
              </div>
              <button onClick={() => setDark(!dark)} className={`w-full h-11 rounded-2xl border text-sm font-medium transition flex items-center justify-center gap-2 ${dark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {dark ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>
              <button onClick={handleSignOut} className={`w-full h-11 rounded-2xl border text-sm font-medium transition flex items-center justify-center gap-2 ${dark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
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
          className={`max-w-[85%] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words rounded-[22px] ${
            dark ? 'bg-white/10 text-slate-100' : 'bg-[#e8e8ed] text-slate-900'
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
