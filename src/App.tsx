import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, ChevronDown, Check } from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Connectors from './components/Connectors'
import Onboarding from './components/Onboarding'
import Logo from './components/Logo'
import MessageList, { type ChatMessage } from './components/MessageList'
import EmptyState from './components/EmptyState'
import ChatInput from './components/ChatInput'
import InstallPWA from './components/InstallPWA'

const MODELS = [
  {
    id: 'quantum-flash',
    name: 'Quantum Flash',
    badge: 'Fast' as string | null,
    anthropic: 'claude-haiku-4-5-20251001',
    blurb: 'Instant answers',
  },
  {
    id: 'quantum-lite',
    name: 'Quantum Lite',
    badge: null as string | null,
    anthropic: 'claude-sonnet-4-6',
    blurb: 'Balanced everyday work',
  },
  {
    id: 'quantum-pro',
    name: 'Quantum Pro',
    badge: 'Pro' as string | null,
    anthropic: 'claude-opus-4-6',
    blurb: 'Deep reasoning & complex tasks',
  },
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
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)](n)
}

export default function App() {
  const [dark, setDark] = useState(false)
  const [glass, setGlass] = useState(() => {
    try { return localStorage.getItem('quantumy-glass') !== '0' } catch { return true }
  })
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(() => {
    try {
      const saved = localStorage.getItem('quantumy-model')
      const found = MODELS.find((m) => m.id === saved)
      if (found) return found
    } catch { /* ignore */ }
    return MODELS[1] // Quantum Lite
  })
  const [thinkActive, setThinkActive] = useState(false)
  const [deepSearchActive, setDeepSearchActive] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<{ name: string; type: string; text?: string }[]>([])
  const thinkStartedAt = useRef<number | null>(null)
  const [thoughtSeconds, setThoughtSeconds] = useState<number | null>(null)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lastUserPrompt, setLastUserPrompt] = useState('')
  const [greetingLine, setGreetingLine] = useState('')
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const currentConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.classList.toggle('glass-on', glass)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#0a0a0f' : '#eef2ff')
    try { localStorage.setItem('quantumy-glass', glass ? '1' : '0') } catch {}
  }, [dark, glass])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setAuthLoading(false) })
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

  useEffect(() => { if (user) { loadConversations(); loadProjects() } }, [user, loadConversations, loadProjects])

  const loadMessages = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    setMobileSidebar(false)
    setErrorHint(null)
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
    if (data) setMessages(data.map((m: DbMessage) => ({ id: m.id, role: m.role, content: m.content })))
  }

  const startNewChat = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
    setCurrentConversationId(null)
    setMessages([])
    setMobileSidebar(false)
    setErrorHint(null)
    setGreetingLine(creativeGreeting(firstName))
  }

  useEffect(() => {
    if (messages.length === 0) setGreetingLine((g) => g || creativeGreeting(firstName))
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

  const streamAI = async (userMessage: string, history: ChatMessage[], assistantId: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }],
        firstName,
        projectId: currentProjectId,
        model: selectedModel.anthropic,
        modelId: selectedModel.id,
        stream: true,
        think: thinkActive,
        deepSearch: deepSearchActive,
      }),
    })

    const ctype = response.headers.get('content-type') || ''

    if (!ctype.includes('text/event-stream')) {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || data.hint || 'Request failed')
      if (!data.content) throw new Error(data.error || 'Empty response')
      setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: data.content } : m)))
      return data.content as string
    }

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || data.message || 'Request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() || ''
        for (const line of parts) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const evt = JSON.parse(payload)
            if (evt.error) throw new Error(evt.error)
            if (evt.status === 'tool_use') {
              full = ''
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: '' } : m)))
            } else if (typeof evt.delta === 'string') {
              full += evt.delta
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: full } : m)))
            } else if (typeof evt.content === 'string') {
              full = evt.content
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: full } : m)))
            }
          } catch (e: any) {
            if (e?.message && e.message !== 'Unexpected end of JSON input') {
              if (String(e.message).includes('error') || !String(e.message).includes('JSON')) throw e
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return full
      }
      throw err
    }

    if (!full.trim()) throw new Error('Empty response')
    return full
  }

  const selectModel = (m: (typeof MODELS)[number]) => {
    setSelectedModel(m)
    try { localStorage.setItem('quantumy-model', m.id) } catch { /* ignore */ }
    if (m.id === 'quantum-flash') setThinkActive(false)
    setShowModelMenu(false)
  }

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleSend = async (overrideText?: string) => {
    let trimmed = (overrideText ?? input).trim()
    if (pendingFiles.length > 0) {
      const fileBlock = pendingFiles
        .map((f) => `--- File: ${f.name} ---\n${f.text || ''}`)
        .join('\n\n')
      trimmed = trimmed
        ? `${trimmed}\n\n${fileBlock}`
        : fileBlock
    }
    if (!trimmed || isLoading || !user) return
    const history = messages
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: trimmed }
    const assistantId = generateId()
    setMessages((p) => [...p, userMsg, { id: assistantId, role: 'assistant', content: '' }])
    setInput('')
    setPendingFiles([])
    setLastUserPrompt(trimmed)
    setErrorHint(null)
    setIsLoading(true)
    thinkStartedAt.current = Date.now()
    setThoughtSeconds(null)
    let convId: string | null = null
    try {
      convId = await ensureConversation(trimmed)
      await saveMessage(convId, 'user', trimmed)
      const reply = await streamAI(trimmed, history, assistantId)
      if (reply && reply.trim()) {
        await saveMessage(convId, 'assistant', reply)
      } else {
        setMessages((p) => p.filter((m) => m.id !== assistantId))
      }
      await loadConversations()
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const partial = messagesRef.current.find((m) => m.id === assistantId)?.content || ''
        if (partial.trim() && convId) {
          try {
            await saveMessage(convId, 'assistant', partial)
          } catch {
            /* best-effort */
          }
        } else if (!partial.trim()) {
          setMessages((p) => p.filter((m) => m.id !== assistantId))
        }
        return
      }
      const hint = err?.message || 'Something went wrong. Please try again.'
      setErrorHint(hint)
      setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: hint } : m)))
    } finally {
      if (thinkStartedAt.current) {
        setThoughtSeconds(Math.max(1, Math.round((Date.now() - thinkStartedAt.current) / 1000)))
        thinkStartedAt.current = null
      }
      setIsLoading(false)
      abortRef.current = null
    }
  }

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
    return <Onboarding onComplete={() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }} />
  }

  const sidebarProps = {
    dark, user, conversations, projects, currentConversationId, currentProjectId, deletingId,
    onNewChat: startNewChat, onSelectChat: loadMessages, onDeleteChat: deleteConversation,
    onOpenSettings: () => { setShowSettings(true); setMobileSidebar(false) },
    onOpenConnectors: () => { setShowConnectors(true); setMobileSidebar(false) },
    onSelectProject: setCurrentProjectId, onCreateProject: createProject, onDeleteProject: deleteProject,
  }

  return (
    <div className={`flex h-dvh overflow-hidden ${dark ? 'bg-transparent' : 'bg-transparent'}`}>
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
        <header className="relative z-10 pt-[env(safe-area-inset-top)] shrink-0">
          <div className="h-14 flex items-center justify-between px-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <button onClick={() => setMobileSidebar(true)} className={`lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-white/70 text-slate-700 shadow-sm hover:bg-white'}`} aria-label="Menu">
                <Menu className="w-5 h-5" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowModelMenu((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={showModelMenu}
                  className={`flex items-center gap-1.5 px-3 h-10 rounded-full text-[14px] font-medium transition ${dark ? 'bg-white/10 text-slate-100 hover:bg-white/15' : 'bg-white/70 text-slate-800 shadow-sm hover:bg-white'}`}
                >
                  <span className="truncate max-w-[140px] sm:max-w-none">{selectedModel.name}</span>
                  {selectedModel.badge && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${dark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                      {selectedModel.badge}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${showModelMenu ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showModelMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowModelMenu(false)} />
                      <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.15 }} className={`absolute left-0 top-full mt-1 z-30 min-w-[220px] rounded-2xl py-1 shadow-lg border ${dark ? 'bg-[#16161f] border-white/10' : 'bg-white border-black/[0.06]'}`}>
                        <div className={`px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                          Model
                        </div>
                        {MODELS.map((m) => {
                          const active = selectedModel.id === m.id
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => selectModel(m)}
                              className={`w-full text-left px-4 py-2.5 flex items-start gap-2 ${dark ? 'hover:bg-white/5 text-slate-100' : 'hover:bg-black/[0.03] text-slate-800'} ${active ? (dark ? 'bg-white/8' : 'bg-black/[0.04]') : ''}`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{m.name}</span>
                                  {m.badge && (
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                      m.id === 'quantum-pro'
                                        ? dark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-50 text-violet-700'
                                        : dark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {m.badge}
                                    </span>
                                  )}
                                </div>
                                <div className={`text-[12px] mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {m.blurb}
                                </div>
                              </div>
                              {active && (
                                <Check className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-indigo-300' : 'text-indigo-600'}`} />
                              )}
                            </button>
                          )
                        })}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={startNewChat} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-white/70 text-slate-700 shadow-sm hover:bg-white'}`} aria-label="New chat">
                <PenLine className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex-1 overflow-y-auto min-h-0">
          {isEmpty ? (
            <EmptyState
              greeting={greetingLine || creativeGreeting(firstName)}
              dark={dark}
              onSuggestion={(text) => handleSend(text)}
            />
          ) : (
            <MessageList
              messages={messages}
              isLoading={isLoading}
              lastUserPrompt={lastUserPrompt}
              dark={dark}
              messagesEndRef={messagesEndRef}
              thoughtSeconds={thoughtSeconds}
              thinkActive={thinkActive}
              deepSearchActive={deepSearchActive}
              onRegenerate={() => {
                if (lastUserPrompt) handleSend(lastUserPrompt)
              }}
            />
          )}
        </main>

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => handleSend()}
          onStop={handleStop}
          isLoading={isLoading}
          dark={dark}
          errorHint={errorHint}
          fastActive={selectedModel.id === 'quantum-flash' && !thinkActive}
          onToggleFast={() => {
            setThinkActive(false)
            selectModel(MODELS[0]) // Flash
          }}
          thinkActive={thinkActive}
          onToggleThink={() => {
            setThinkActive((v) => {
              const next = !v
              if (next) selectModel(MODELS[2]) // Pro for deep reasoning
              return next
            })
          }}
          deepSearchActive={deepSearchActive}
          onToggleDeepSearch={() => setDeepSearchActive((v) => !v)}
          pendingFiles={pendingFiles}
          onFilesChange={setPendingFiles}
        />

        <InstallPWA dark={dark} />
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={`w-full sm:max-w-[430px] h-[min(92dvh,720px)] sm:h-[min(85vh,680px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-2xl ${
                dark ? 'bg-[#0a0a0c]' : 'bg-[#f2f2f7]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <Settings
                dark={dark}
                glass={glass}
                user={user}
                onClose={() => setShowSettings(false)}
                onSignOut={async () => { await supabase.auth.signOut(); setShowSettings(false) }}
                onToggleTheme={() => setDark((d) => !d)}
                onToggleGlass={() => setGlass((g) => !g)}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setShowConnectors(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={`w-full sm:max-w-[430px] h-[min(92dvh,720px)] sm:h-[min(85vh,680px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-2xl ${
                dark ? 'bg-[#0a0a0c]' : 'bg-[#f2f2f7]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <Connectors
                dark={dark}
                accessToken={session.access_token}
                onClose={() => setShowConnectors(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
