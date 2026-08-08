import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Plus, Mic, Send, X, LogOut, MessageSquare,
  Loader2, GraduationCap, Cpu, PenLine, ArrowLeft,
  MoreHorizontal, Moon, Sun,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage } from './lib/supabase'
import Auth from './components/Auth'
import Connectors from './components/Connectors'
import Sidebar from './components/Sidebar'
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

function formatMarkdown(text: string) {
  let html = text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^[•\-]\s+(.+)$/gm, '<li class="ml-1 list-disc">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-1 list-decimal">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>')
  html = html.replace(/(<li[^>]*>.*?<\/li>)/gs, (m) =>
    m.includes('list-disc') ? `<ul class="my-2 space-y-1">${m}</ul>` : `<ol class="my-2 space-y-1">${m}</ol>`
  )
  return `<p>${html}</p>`
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState(MODELS[1])
  const [showSettings, setShowSettings] = useState(false)
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
      setShowSettings(true)
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
  const isEmpty = messages.length === 0 && !isLoading

  if (authLoading) {
    return (
      <div className={`flex items-center justify-center h-dvh ${dark ? 'bg-[#0a0a0f]' : 'bg-[#f0f4ff]'}`}>
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!session || !user) return <Auth onSuccess={() => {}} />

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'there'

  const shell = dark ? 'bg-[#0a0a0f] text-slate-100' : 'bg-gradient-to-b from-[#eef2ff] via-[#f8fafc] to-[#f1f5f9] text-slate-900'
  const card = dark ? 'bg-white/[0.04] border border-white/10 hover:border-indigo-500/30 hover:shadow-indigo-500/10' : 'bg-white/95 border border-white shadow-sm hover:shadow-lg hover:shadow-indigo-500/10 hover:ring-1 hover:ring-indigo-500/20'
  const inputBar = dark ? 'bg-white/[0.05] border border-white/10 shadow-xl shadow-indigo-500/5 focus-within:border-indigo-500/40 focus-within:ring-2 focus-within:ring-indigo-500/20' : 'bg-white/95 border border-white shadow-xl shadow-indigo-500/10 focus-within:ring-2 focus-within:ring-indigo-500/20'
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
    onOpenConnectors: openSettings,
  }

  return (
    <div className={`flex h-dvh max-h-dvh overflow-hidden transition-colors duration-300 ${shell}`}>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex w-[300px] flex-col border-r min-h-0 ${dark ? 'border-white/5' : 'border-slate-200/80'}`}>
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
              className="fixed left-0 top-0 bottom-0 w-[min(100%,320px)] z-50 flex flex-col lg:hidden shadow-2xl"
            >
              <Sidebar
                {...sidebarProps}
                showClose
                onClose={() => setMobileSidebar(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-8 shrink-0 z-10">
          <div className="flex items-center gap-2">
            {!isEmpty ? (
              <button onClick={startNewChat} className={`p-2 -ml-1 rounded-full transition lg:hidden ${dark ? 'hover:bg-white/10' : 'hover:bg-white/80'}`}>
                <ArrowLeft className={`w-5 h-5 ${textMuted}`} />
              </button>
            ) : (
              <button onClick={() => setMobileSidebar(true)} className={`p-2 -ml-1 rounded-full transition lg:hidden ${dark ? 'hover:bg-white/10' : 'hover:bg-white/80'}`}>
                <Menu className={`w-5 h-5 ${textMuted}`} />
              </button>
            )}

            <div className={`flex items-center rounded-full p-1 shadow-sm border ${dark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-white'}`}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setSelectedModel(m)} className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${selectedModel.id === m.id ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20' : textMuted}`}>
                  {m.name}
                  {m.badge && selectedModel.id === m.id && <span className="ml-1 text-[10px] opacity-80">{m.badge}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-full transition ${dark ? 'hover:bg-white/10 text-amber-300' : 'hover:bg-white/80 text-slate-500'}`} title={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full transition ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-white/80 text-slate-500'}`}>
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          <div className="max-w-2xl mx-auto px-4 lg:px-6 h-full">
            <AnimatePresence mode="wait">
              {isEmpty ? (
                <motion.div key="welcome" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center justify-center min-h-[calc(100%-2rem)] py-8 text-center">
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className={`text-sm mb-2 ${textMuted}`}>
                    {getGreeting()}, {displayName}!
                  </motion.p>
                  <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={`text-[28px] sm:text-3xl font-semibold tracking-tight leading-tight mb-10 ${textMain}`}>
                    What are we going<br className="sm:hidden" /> to do today?
                  </motion.h1>
                  <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                    {CATEGORIES.map((cat, i) => {
                      const Icon = cat.icon
                      return (
                        <motion.button key={cat.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.06 }} onClick={() => handleSend(cat.prompt)} className={`text-left p-4 rounded-2xl backdrop-blur transition-all hover:scale-[1.02] active:scale-[0.98] ${card}`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${dark ? cat.dark : cat.light}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className={`text-sm font-semibold mb-0.5 ${textMain}`}>{cat.title}</div>
                          <div className={`text-xs leading-snug ${textMuted}`}>{cat.desc}</div>
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 space-y-5 pb-4">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} dark={dark} />
                  ))}
                  {isLoading && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="absolute inset-0 rounded-full bg-indigo-500/40 blur-md" />
                        <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" /></svg>
                        </div>
                      </div>
                      <div className="flex gap-1.5 items-center h-8">
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

        <div className="px-4 lg:px-6 pt-2 shrink-0 z-10 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <div className={`flex items-end gap-2 rounded-2xl px-2 py-2 transition-all ${inputBar}`}>
              <button className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'text-slate-500 hover:bg-white/5' : 'text-slate-400 hover:bg-slate-50'}`}>
                <Plus className="w-5 h-5" />
              </button>
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type prompt…" rows={1} className={`flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed max-h-32 outline-none placeholder:text-slate-500 ${textMain}`} style={{ minHeight: '40px' }} />
              <button onClick={toggleListening} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${isListening ? 'bg-red-500/15 text-red-400' : dark ? 'text-slate-500 hover:bg-white/5' : 'text-slate-400 hover:bg-slate-50'}`}>
                <Mic className="w-5 h-5" />
              </button>
              <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${input.trim() && !isLoading ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:from-indigo-500 hover:to-violet-500' : dark ? 'bg-white/5 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowSettings(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-3xl z-50 p-6 shadow-2xl ${dark ? 'bg-[#12121a] border border-white/10' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-lg font-semibold ${textMain}`}>Settings</h2>
                <button onClick={() => setShowSettings(false)} className={`p-1.5 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="space-y-5">
                <div className={`rounded-2xl p-4 ${dark ? 'bg-white/5' : 'bg-slate-50'}`}>
                  <p className={`text-xs font-medium mb-1 ${textMuted}`}>Signed in as</p>
                  <p className={`text-sm truncate ${textMain}`}>{user.email}</p>
                </div>

                {session?.access_token && (
                  <Connectors dark={dark} accessToken={session.access_token} />
                )}

                <button onClick={() => setDark(!dark)} className={`w-full h-11 rounded-2xl border text-sm font-medium transition flex items-center justify-center gap-2 ${dark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {dark ? 'Switch to light mode' : 'Switch to dark mode'}
                </button>
                <button onClick={handleSignOut} className={`w-full h-11 rounded-2xl border text-sm font-medium transition flex items-center justify-center gap-2 ${dark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function MessageBubble({ message, dark }: { message: Message; dark: boolean }) {
  const isUser = message.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="absolute inset-0 rounded-full bg-indigo-500/40 blur-md" />
          <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" /></svg>
          </div>
        </div>
      )}
      <div className={`max-w-[85%] px-4 py-3 text-[15px] leading-relaxed ${
        isUser
          ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl rounded-br-md shadow-lg shadow-indigo-500/20'
          : dark
            ? 'bg-white/[0.06] border border-white/10 text-slate-200 rounded-2xl rounded-bl-md shadow-md'
            : 'bg-white/95 backdrop-blur-xl border border-white text-slate-800 rounded-2xl rounded-bl-md shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/5'
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="break-words ai-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }} />
        )}
      </div>
    </motion.div>
  )
}
