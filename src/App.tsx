import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Mic, Send, X, Plus,
  Loader2, PenLine,
  ChevronDown, Copy, Check, ThumbsUp, ThumbsDown, Volume2, Share,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import { formatMarkdown } from './lib/markdown'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Connectors from './components/Connectors'
import ThinkingStatus from './components/ThinkingStatus'

type Message = { id: string; role: 'user' | 'assistant'; content: string }

const MODELS = [
  { id: 'quantum-3', name: 'Quantum 3', badge: null as string | null },
  { id: 'quantum-3-pro', name: 'Quantum 3 Pro', badge: 'Pro' },
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyLine(firstName: string) {
  const h = new Date().getHours()
  if (h < 12) return `Good morning, ${firstName}`
  if (h < 18) return `Your move, ${firstName}!`
  return `Evening, ${firstName}`
}

function SparkleMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id="sp" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="0.35" stopColor="#9B72CB" />
          <stop offset="0.65" stopColor="#D96570" />
          <stop offset="1" stopColor="#F2A60C" />
        </linearGradient>
      </defs>
      <path
        d="M24 4c1.2 8.5 7.5 14.8 16 16-8.5 1.2-14.8 7.5-16 16-1.2-8.5-7.5-14.8-16-16 8.5-1.2 14.8-7.5 16-16z"
        fill="url(#sp)"
      />
    </svg>
  )
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
    user?.user_metadata?.full_name?.split(' ')?.[0] ||
    user?.user_metadata?.name?.split(' ')?.[0] ||
    user?.email?.split('@')?.[0] ||
    'there'

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

  const startNewChat = () => { setCurrentConversationId(null); setMessages([]); setMobileSidebar(false) }

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
        <SparkleMark size={48} />
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!session || !user) return <Auth onSuccess={() => {}} />

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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] z-0" style={{ background: 'linear-gradient(to top, rgba(186,220,255,0.45) 0%, rgba(230,240,255,0.2) 40%, transparent 100%)' }} />
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
            <div className="flex flex-col items-center justify-center min-h-full px-6 pb-28">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center text-center">
                <motion.div animate={{ scale: [1, 1.06, 1], rotate: [0, 2, -2, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="mb-5">
                  <SparkleMark size={44} />
                </motion.div>
                <h1 className={`text-[1.75rem] sm:text-[2rem] font-normal tracking-tight ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {emptyLine(firstName)}
                </h1>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-3 pb-6 space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                    {msg.role === 'user' ? (
                      <div className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${dark ? 'bg-[#2a2a35] text-slate-100' : 'bg-[#f0f1f5] text-slate-900'}`}>
                        {msg.content}
                      </div>
                    ) : (
                      <div className="max-w-[95%]">
                        <div className={`text-[15px] leading-relaxed ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
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

        <div className="relative z-10 shrink-0 px-3 sm:px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <div className={`flex items-end gap-1 rounded-[28px] pl-1.5 pr-1.5 py-1.5 ${dark ? 'bg-[#1c1c24] border border-white/[0.08]' : 'bg-white border border-black/[0.06] shadow-[0_2px_16px_rgba(0,0,0,0.08)]'}`}>
              <button type="button" className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${dark ? 'text-slate-400 hover:bg-white/8' : 'text-slate-500 hover:bg-black/[0.04]'}`} aria-label="Add">
                <Plus className="w-5 h-5" />
              </button>
              <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1} placeholder="Ask Quantumy" className={`flex-1 resize-none bg-transparent border-0 outline-none text-[16px] leading-6 py-2.5 max-h-[140px] ${dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'}`} />
              {!input.trim() ? (
                <button type="button" className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${dark ? 'text-slate-400 hover:bg-white/8' : 'text-slate-500 hover:bg-black/[0.04]'}`} aria-label="Voice">
                  <Mic className="w-5 h-5" />
                </button>
              ) : (
                <motion.button type="button" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={() => handleSend()} disabled={isLoading} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-40 transition" aria-label="Send">
                  <Send className="w-[18px] h-[18px]" />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40" onClick={() => setShowSettings(false)}>
            <motion.div initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }} className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 max-h-[85vh] overflow-y-auto ${dark ? 'bg-[#12121a]' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
              <Settings dark={dark} user={user} onSignOut={async () => { await supabase.auth.signOut(); setShowSettings(false) }} onToggleTheme={() => setDark((d) => !d)} onOpenConnectors={() => { setShowSettings(false); setShowConnectors(true) }} />
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
