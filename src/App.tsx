import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Mic, Send, X, Plus,
  Loader2, PenLine,
  ChevronDown, Copy, Check, ThumbsUp, ThumbsDown, Volume2, Share, Zap, AudioLines,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import { formatMarkdown } from './lib/markdown'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Connectors from './components/Connectors'
import ThinkingStatus from './components/ThinkingStatus'
import Onboarding from './components/Onboarding'
import Logo from './components/Logo'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

const MODELS = [
  { id: 'quantum-3', name: 'Quantum 3', badge: null as string | null },
  { id: 'quantum-3-pro', name: 'Quantum 3 Pro', badge: 'Pro' },
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const GREETINGS = [
  (n: string) => `What should we tackle, ${n}?`,
  (n: string) => `What are you working on, ${n}?`,
  (n: string) => `Where should we start, ${n}?`,
  (n: string) => `What's on your mind, ${n}?`,
  (n: string) => `Ready when you are, ${n}.`,
  (n: string) => `What can we move forward today, ${n}?`,
  (n: string) => `Tell me what matters most right now, ${n}.`,
  (n: string) => `How can I help you focus, ${n}?`,
]

function creativeGreeting(firstName: string) {
  const n = firstName || 'there'
  const i = Math.floor(Math.random() * GREETINGS.length)
  return GREETINGS[i](n)
}

function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  const btn = 'p-2 rounded-full text-slate-500 hover:bg-black/[0.05] transition'
  return (
    <div className="flex items-center gap-0.5 mt-1.5 -ml-1">
      <button type="button" onClick={copy} className={btn} aria-label="Copy">
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </button>
      <button type="button" className={btn} aria-label="Share"><Share className="w-4 h-4" /></button>
      <button type="button" className={btn} aria-label="Read aloud"><Volume2 className="w-4 h-4" /></button>
      <button type="button" className={btn} aria-label="Good"><ThumbsUp className="w-4 h-4" /></button>
      <button type="button" className={btn} aria-label="Bad"><ThumbsDown className="w-4 h-4" /></button>
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useState(false)
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
  const [lastUserPrompt, setLastUserPrompt] = useState('')
  const [greetingLine, setGreetingLine] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#0a0a0f' : '#ffffff')
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
    user?.user_metadata?.preferred_name ||
    user?.user_metadata?.full_name?.split(' ')?.[0] ||
    user?.user_metadata?.name?.split(' ')?.[0] ||
    user?.email?.split('@')?.[0] ||
    'there'

  const needsOnboarding = !!user && user.user_metadata?.onboarding_complete !== true

  const loadConversations = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false }).limit(50)
    if (data) setConversations(data as Conversation[])
  }, [user])

  const loadProjects = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
    if (data) setProjects(data as Project[])
  }, [user])

  useEffect(() => {
    if (user) { loadConversations(); loadProjects() }
  }, [user, loadConversations, loadProjects])

  const loadMessages = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    setMobileSidebar(false)
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
    if (data) setMessages(data.map((m: DbMessage) => ({ id: m.id, role: m.role, content: m.content })))
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setMessages([])
    setMobileSidebar(false)
    setGreetingLine(creativeGreeting(firstName))
  }

  useEffect(() => {
    if (messages.length === 0) {
      setGreetingLine((g) => g || creativeGreeting(firstName))
    }
  }, [firstName, messages.length])

  const ensureConversation = async (firstUserText: string) => {
    if (currentConversationId) return currentConversationId
    const title = makeChatTitle(firstUserText)
    const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title, project_id: currentProjectId || null }).select().single()
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
    } finally { setDeletingId(null) }
  }

  const createProject = async (name: string) => {
    if (!user || !name.trim()) return
    const { data } = await supabase.from('projects').insert({ user_id: user.id, name: name.trim() }).select().single()
    if (data) { setProjects((p) => [data as Project, ...p]); setCurrentProjectId(data.id) }
  }

  const deleteProject = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id)
    setProjects((p) => p.filter((x) => x.id !== id))
    if (currentProjectId === id) setCurrentProjectId(null)
  }

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])
  useEffect(() => { scrollToBottom() }, [messages, isLoading, scrollToBottom])

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
    setLastUserPrompt(trimmed)
    setIsLoading(true)
    try {
      const convId = await ensureConversation(trimmed)
      await saveMessage(convId, 'user', trimmed)
      const reply = await callAI(trimmed, messages)
      setMessages((p) => [...p, { id: generateId(), role: 'assistant', content: reply }])
      await saveMessage(convId, 'assistant', reply)
      await loadConversations()
    } catch {
      setMessages((p) => [...p, { id: generateId(), role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally { setIsLoading(false) }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [input])

  const isEmpty = messages.length === 0 && !isLoading

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

  const sidebarProps = {
    dark, user, conversations, projects, currentConversationId, currentProjectId, deletingId,
    onNewChat: startNewChat, onSelectChat: loadMessages, onDeleteChat: deleteConversation,
    onOpenSettings: () => { setShowSettings(true); setMobileSidebar(false) },
    onOpenConnectors: () => { setShowConnectors(true); setMobileSidebar(false) },
    onSelectProject: setCurrentProjectId, onCreateProject: createProject, onDeleteProject: deleteProject,
  }

  return (
    <div className={`flex h-dvh overflow-hidden ${dark ? 'bg-[#0a0a0f]' : 'bg-white'}`}>
      <div className="hidden lg:flex w-[300px] shrink-0"><Sidebar {...sidebarProps} /></div>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/25 z-40 lg:hidden" onClick={() => setMobileSidebar(false)} />
            <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', damping: 32, stiffness: 360 }} className="fixed inset-y-0 left-0 z-50 w-[min(320px,90vw)] lg:hidden bg-white shadow-2xl">
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative">
        {isEmpty && !dark && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] z-0" style={{ background: 'linear-gradient(to top, rgba(186,220,255,0.28) 0%, rgba(230,240,255,0.12) 45%, transparent 100%)' }} />
        )}

        <header className="relative z-10 pt-[env(safe-area-inset-top)] shrink-0">
          <div className="h-14 flex items-center justify-between px-3">
            <div className="flex items-center gap-1 min-w-0">
              <button onClick={() => setMobileSidebar(true)} className={`lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-black/[0.05] text-slate-700'}`} aria-label="Menu">
                <Menu className="w-5 h-5" />
              </button>
              <div className="relative">
                <button onClick={() => setShowModelMenu((v) => !v)} className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-[15px] font-medium transition ${dark ? 'text-slate-100 hover:bg-white/8' : 'text-slate-800 hover:bg-black/[0.04]'}`}>
                  {selectedModel.name}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>
                <AnimatePresence>
                  {showModelMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowModelMenu(false)} />
                      <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.15 }} className={`absolute left-0 top-full mt-1 z-30 min-w-[180px] rounded-2xl py-1 shadow-lg border ${dark ? 'bg-[#16161f] border-white/10' : 'bg-white border-black/[0.06]'}`}>
                        {MODELS.map((m) => (
                          <button key={m.id} onClick={() => { setSelectedModel(m); setShowModelMenu(false) }} className={`w-full text-left px-4 py-2.5 text-sm ${dark ? 'hover:bg-white/5 text-slate-100' : 'hover:bg-black/[0.03] text-slate-800'}`}>
                            {m.name}
                            {m.badge && <span className="ml-2 text-[10px] text-slate-400">{m.badge}</span>}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <button onClick={startNewChat} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-black/[0.05] text-slate-700'}`} aria-label="New chat">
              <PenLine className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="relative z-10 flex-1 overflow-y-auto min-h-0">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full px-6 pb-2">
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center text-center">
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} className="mb-6">
                  <Logo size={56} dark={dark} />
                </motion.div>
                <h1 className={`text-[1.85rem] sm:text-[2.1rem] font-normal tracking-tight ${dark ? 'text-slate-50' : 'text-slate-900'`}>
                  {greetingLine || creativeGreeting(firstName)}
                </h1>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-3 pb-4 space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                    {msg.role === 'user' ? (
                      <div className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${dark ? 'bg-[#2a2a35] text-slate-100' : 'bg-[#f0f1f5] text-slate-900'}`}>
                        {msg.content}
                      </div>
                    ) : (
                      <div className="max-w-[95%]">
                        <div className={`text-[15px] leading-relaxed ${dark ? 'text-slate-100' : 'text-slate-900'`}>
                          <div className="ai-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                        </div>
                        <MessageActions content={msg.content} />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ThinkingStatus prompt={lastUserPrompt} dark={dark} />
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <div className="relative z-10 shrink-0 px-3 sm:px-5 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <div className={`rounded-[28px] px-3 pt-2.5 pb-2 transition-shadow ${dark ? 'bg-[#1a1a22] border border-white/[0.08] shadow-lg shadow-black/30' : 'bg-[#f3f4f6] border border-black/[0.04] shadow-[0_4px_24px_rgba(0,0,0,0.06)]'}`}>
              <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1} placeholder="Ask Anything" className={`w-full resize-none bg-transparent border-0 outline-none text-[16px] leading-6 min-h-[28px] max-h-[140px] px-1 ${dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'}`} />
              <div className="flex items-center gap-1.5 mt-1.5">
                <button type="button" className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${dark ? 'bg-white/[0.08] text-slate-300 hover:bg-white/[0.12]' : 'bg-white text-slate-600 hover:bg-white shadow-sm'}`} aria-label="Add">
                  <Plus className="w-[18px] h-[18px]" />
                </button>
                <button type="button" className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${dark ? 'bg-white/[0.08] text-slate-200 hover:bg-white/[0.12]' : 'bg-white text-slate-700 hover:bg-white shadow-sm'}`}>
                  <Zap className="w-3.5 h-3.5" />
                  Fast
                </button>
                <div className="flex-1" />
                <button type="button" className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${dark ? 'text-slate-400 hover:bg-white/8' : 'text-slate-500 hover:bg-black/[0.04]'}`} aria-label="Voice input">
                  <Mic className="w-5 h-5" />
                </button>
                {input.trim() ? (
                  <motion.button type="button" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={() => handleSend()} disabled={isLoading} className="h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 text-white bg-slate-900 hover:bg-black disabled:opacity-40 transition dark:bg-white dark:text-slate-900" aria-label="Send">
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </motion.button>
                ) : (
                  <button type="button" className={`h-9 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium shrink-0 transition ${dark ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-black'}`} aria-label="Speak">
                    <AudioLines className="w-4 h-4" />
                    Speak
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40" onClick={() => setShowSettings(false)}>
            <motion.div initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }} className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 max-h-[85vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
              <Settings
                dark={dark}
                user={user}
                onSignOut={async () => { await supabase.auth.signOut(); setShowSettings(false) }}
                onToggleTheme={() => setDark((d) => !d)}
                onOpenConnectors={() => { setShowSettings(false); setShowConnectors(true) }}
                onProfileUpdated={(name) => {
                  setGreetingLine(creativeGreeting(name))
                  supabase.auth.getSession().then(({ data }) => setSession(data.session))
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConnectors && session?.access_token && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40" onClick={() => setShowConnectors(false)}>
            <motion.div initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }} className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 max-h-[85vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`font-medium text-lg ${dark ? 'text-slate-100' : 'text-slate-900'}`}>Connectors</h2>
                <button type="button" onClick={() => setShowConnectors(false)} className="p-2 rounded-full hover:bg-black/5 text-slate-500"><X className="w-5 h-5" /></button>
              </div>
              <Connectors dark={dark} accessToken={session.access_token} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
