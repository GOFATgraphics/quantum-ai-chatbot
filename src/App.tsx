import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, ChevronDown, Check, Sun, Moon } from 'lucide-react'
import { supabase, type Conversation, type DbMessage, type Project, makeChatTitle } from './lib/supabase'
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

// Redeploy trigger — scroll lock for empty chat

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

function creativeGreeting(firstName: string) {
  const n = (firstName || '').trim()
  if (n && n.toLowerCase() !== 'there') {
    return `What can I help you with today, ${n}?`
  }
  return 'What can I help you with today?'
}

function buildUserContent(text: string, files: PendingFile[]): string {
  const parts: string[] = []
  if (text.trim()) parts.push(text.trim())
  for (const f of files) {
    if (f.type.startsWith('image/') && f.dataUrl) {
      parts.push(`![${f.name}](${f.dataUrl})`)
    } else if (f.type.startsWith('text/') || f.text) {
      const body = (f.text || '').slice(0, 40_000)
      parts.push(`📎 **${f.name}**\n\`\`\`\n${body}\n\`\`\``)
    } else {
      parts.push(`📎 **${f.name}** _(file attached)_`)
    }
  }
  return parts.join('\n\n')
}

function stripAttachmentsForTitle(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/📎\s*\*\*[^*]+\*\*[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/---\s*File:[^-]+---[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/\[Image attached:[^\]]+\]/g, '')
    .replace(/\[File attached:[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function App() {
  const { dark, setDark, cycleTheme, themeMode } = useTheme()
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
    return MODELS[1]
  })
  const selectedModelRef = useRef(selectedModel)
  useEffect(() => { selectedModelRef.current = selectedModel }, [selectedModel])

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const thinkStartedAt = useRef<number | null>(null)
  const [thoughtSeconds, setThoughtSeconds] = useState<number | null>(null)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [showLiveVoice, setShowLiveVoice] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(() => {
    try {
      const v = localStorage.getItem('quantumy-voice')
      if (v === 'male' || v === 'female') return v
    } catch { /* ignore */ }
    return 'female'
  })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lastUserPrompt, setLastUserPrompt] = useState('')
  const [greetingLine, setGreetingLine] = useState('')
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const currentConversationIdRef = useRef<string | null>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { currentConversationIdRef.current = currentConversationId }, [currentConversationId])
  useEffect(() => {
    document.documentElement.classList.toggle('glass-on', glass)
    try { localStorage.setItem('quantumy-glass', glass ? '1' : '0') } catch {}
  }, [glass])

  // New-chat empty shell must never scroll (focus / keyboard / wheel / touch)
  useEffect(() => {
    const empty = messages.length === 0 && !isLoading
    if (!empty) return
    const pin = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0
    }
    pin()
    const onScroll = (e: Event) => {
      pin()
      e.preventDefault()
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.closest?.('textarea'))) return
      if (t?.closest?.('[data-scrollable="true"]')) return
      if (e.cancelable) e.preventDefault()
    }
    window.addEventListener('scroll', onScroll, { passive: false, capture: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [messages.length, isLoading])

  useEffect(() => {
    if (!showModelMenu) { setMenuPos(null); return }
    const update = () => {
      const el = modelBtnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 4, left: r.left + r.width / 2 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [showModelMenu])

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
    setComposerFocused(false)
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
    setComposerFocused(false)
    setGreetingLine(creativeGreeting(firstName))
  }

  useEffect(() => {
    if (messages.length === 0) setGreetingLine((g) => g || creativeGreeting(firstName))
  }, [firstName, messages.length])

  useEffect(() => {
    if (!user || needsOnboarding) return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setShowCommandPalette((v) => !v)
        return
      }
      if (mod && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault()
        setShowCommandPalette(false)
        startNewChat()
        return
      }
      if (e.key === '/' && !mod && !isTyping) {
        e.preventDefault()
        setShowCommandPalette(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, needsOnboarding, firstName])

  const ensureConversation = async (firstUserText: string) => {
    if (currentConversationId) return currentConversationId
    const clean = stripAttachmentsForTitle(firstUserText)
    const title = makeChatTitle(clean || 'New chat')
    const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title, project_id: currentProjectId || null }).select().single()
    if (error || !data) throw error || new Error('Could not create conversation')
    setCurrentConversationId(data.id)
    setConversations((prev) => [data as Conversation, ...prev])
    return data.id as string
  }

  const refineConversationTitle = async (conversationId: string, userText: string, assistantText: string) => {
    try {
      const userClean = stripAttachmentsForTitle(userText)
      let source = userClean
      if (!source || source.length < 8) {
        source = assistantText.replace(/\s+/g, ' ').trim().slice(0, 80)
      }
      const title = makeChatTitle(source)
      if (!title || title === 'New chat') return
      await supabase.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', conversationId)
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title } : c)))
    } catch { /* best-effort */ }
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

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  }, [])
  const prevMsgCount = useRef(0)
  useEffect(() => {
    const count = messages.length
    const last = messages[count - 1]
    if (count > prevMsgCount.current && last?.role === 'user') scrollToBottom(true)
    prevMsgCount.current = count
  }, [messages, scrollToBottom])

  const streamAI = async (userMessage: string, history: ChatMessage[], assistantId: string) => {
    const model = selectedModelRef.current
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const stripImg = (s: string) => s.replace(
      /!\[[^\]]*\]\(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+\)/g,
      (match) => {
        const nameMatch = match.match(/!\[([^\]]*)\]/)
        return `[Image attached: ${nameMatch?.[1] || 'image'}]`
      },
    )
    const apiUserMessage = stripImg(userMessage)
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        messages: [...history.map((m) => ({ role: m.role, content: stripImg(m.content) })), { role: 'user', content: apiUserMessage }],
        firstName,
        projectId: currentProjectId,
        model: model.anthropic,
        modelId: model.id,
        stream: true,
        think: false,
        deepSearch: false,
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
      if (err?.name === 'AbortError') return full
      throw err
    }
    if (!full.trim()) throw new Error('Empty response')
    return full
  }

  const askForVoice = useCallback(
    async (userMessage: string): Promise<string> => {
      const model = selectedModelRef.current
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const stripImg = (s: string) => s.replace(
        /!\[[^\]]*\]\(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+\)/g,
        (match) => {
          const nameMatch = match.match(/!\[([^\]]*)\]/)
          return `[Image attached: ${nameMatch?.[1] || 'image'}]`
        },
      )
      const history = messagesRef.current.slice(-12).map((m) => ({ role: m.role, content: stripImg(m.content) }))
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [...history, { role: 'user', content: userMessage }],
          firstName,
          projectId: currentProjectId,
          model: model.anthropic,
          modelId: model.id,
          stream: false,
          think: false,
          deepSearch: false,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || 'Request failed')
      const text = (data.content || '').trim()
      if (!text) throw new Error('Empty response')
      try {
        const convId = await ensureConversation(userMessage)
        await saveMessage(convId, 'user', userMessage)
        await saveMessage(convId, 'assistant', text)
        setMessages((p) => [
          ...p,
          { id: generateId(), role: 'user', content: userMessage },
          { id: generateId(), role: 'assistant', content: text },
        ])
        await refineConversationTitle(convId, userMessage, text)
        await loadConversations()
      } catch { /* best-effort */ }
      return text
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.access_token, firstName, currentProjectId],
  )

  const selectModel = (m: (typeof MODELS)[number]) => {
    setSelectedModel(m)
    selectedModelRef.current = m
    try { localStorage.setItem('quantumy-model', m.id) } catch { /* ignore */ }
    setShowModelMenu(false)
  }

  const handleStop = useCallback(() => { abortRef.current?.abort() }, [])

  const handleSend = async (overrideText?: string) => {
    const textPart = (overrideText ?? input).trim()
    const files = pendingFiles
    const content = buildUserContent(textPart, files)
    if (!content || isLoading || !user) return
    const history = messages
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content }
    const assistantId = generateId()
    setMessages((p) => [...p, userMsg, { id: assistantId, role: 'assistant', content: '' }])
    setInput('')
    setPendingFiles([])
    setLastUserPrompt(content)
    setErrorHint(null)
    setComposerFocused(false)
    setIsLoading(true)
    thinkStartedAt.current = Date.now()
    setThoughtSeconds(null)
    let convId: string | null = null
    try {
      convId = await ensureConversation(content)
      await saveMessage(convId, 'user', content)
      const reply = await streamAI(content, history, assistantId)
      if (reply && reply.trim()) {
        await saveMessage(convId, 'assistant', reply)
        if (history.length === 0) await refineConversationTitle(convId, content, reply)
      } else {
        setMessages((p) => p.filter((m) => m.id !== assistantId))
      }
      await loadConversations()
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const partial = messagesRef.current.find((m) => m.id === assistantId)?.content || ''
        if (partial.trim() && convId) {
          try { await saveMessage(convId, 'assistant', partial) } catch { /* best-effort */ }
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
    onOpenCommandPalette: () => { setShowCommandPalette(true); setMobileSidebar(false) },
  }

  return (
    <div className={`flex h-dvh max-h-dvh overflow-hidden overscroll-none ${dark ? 'bg-transparent' : 'bg-transparent'}`}>
      <div className="hidden lg:flex w-[300px] shrink-0"><Sidebar {...sidebarProps} /></div>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/25 z-40 lg:hidden" onClick={() => setMobileSidebar(false)} />
            <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', damping: 32, stiffness: 360 }} className={`fixed inset-y-0 left-0 z-50 w-[min(320px,90vw)] lg:hidden shadow-2xl ${dark ? "bg-[#16161f]" : "bg-white"}`}>
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className={`chat-shell-locked flex-1 flex flex-col min-w-0 min-h-0 h-full relative overflow-hidden overscroll-none ${isEmpty ? 'chat-shell-empty' : ''} ${dark ? '' : 'bg-white'}`}>
        <div
          className={`chat-glow ${isLoading ? 'chat-glow--thinking' : isEmpty ? 'chat-glow--idle' : 'chat-glow--done'}`}
          aria-hidden="true"
        >
          <span className="chat-glow-orb chat-glow-orb-a" />
          <span className="chat-glow-orb chat-glow-orb-b" />
          <span className="chat-glow-orb chat-glow-orb-c" />
        </div>

        <header className={`glass-header sticky top-0 pt-[env(safe-area-inset-top)] shrink-0 ${showModelMenu ? 'z-50' : 'z-30'}`}>
          <div className="h-14 grid grid-cols-[1fr_auto_1fr] items-center px-3 gap-2">
            <div className="flex items-center justify-start min-w-0">
              <button
                onClick={() => setMobileSidebar(true)}
                className={`glass-btn lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'text-slate-200' : 'text-slate-700'}`}
                aria-label="Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center">
              <button
                ref={modelBtnRef}
                type="button"
                onClick={() => setShowModelMenu((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={showModelMenu}
                className={`glass-btn flex items-center gap-1.5 px-3 h-10 rounded-full text-[14px] font-medium transition ${dark ? 'text-slate-100' : 'text-slate-800'}`}
              >
                <span className="truncate max-w-[140px] sm:max-w-none">{selectedModel.name}</span>
                {selectedModel.badge && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${dark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                    {selectedModel.badge}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${showModelMenu ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              <button
                type="button"
                onClick={cycleTheme}
                className={`glass-btn w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'text-slate-200' : 'text-slate-700'}`}
                aria-label={`Theme: ${themeMode}`}
                title={`Theme: ${themeMode}`}
              >
                {dark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
              {!isEmpty && (
                <button
                  onClick={startNewChat}
                  className={`glass-btn w-10 h-10 rounded-full flex items-center justify-center transition ${dark ? 'text-slate-200' : 'text-slate-700'}`}
                  aria-label="New chat"
                >
                  <PenLine className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        <AnimatePresence>
          {showModelMenu && menuPos && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setShowModelMenu(false)} />
              <div style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, transform: 'translateX(-50%)', zIndex: 70 }}>
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className={`glass-menu w-[min(260px,calc(100vw-24px))] rounded-2xl py-1 ${dark ? 'text-slate-100' : 'text-slate-800'}`}
                >
                  <div className={`px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Model</div>
                  {MODELS.map((m) => {
                    const active = selectedModel.id === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); selectModel(m) }}
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
                              }`}>{m.badge}</span>
                            )}
                          </div>
                          <div className={`text-[12px] mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{m.blurb}</div>
                        </div>
                        {active && <Check className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-indigo-300' : 'text-indigo-600'}`} />}
                      </button>
                    )
                  })}
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
          {isEmpty ? (
            <div className="relative flex-1 min-h-0 overflow-hidden overscroll-none w-full pointer-events-none">
              <div
                className={`absolute inset-x-0 top-0 bottom-0 flex flex-col items-center px-4 overflow-hidden overscroll-none transition-[padding] duration-300 ${
                  composerFocused
                    ? 'pt-[min(8vh,56px)] sm:pt-[min(10vh,72px)]'
                    : 'pt-[min(14vh,100px)] sm:pt-[min(16vh,120px)]'
                }`}
              >
                <div className="w-full max-w-lg pointer-events-auto shrink-0">
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
                thoughtSeconds={thoughtSeconds}
                thinkActive={false}
                deepSearchActive={false}
                onRegenerate={() => { if (lastUserPrompt) handleSend(lastUserPrompt) }}
              />
            </main>
          )}

          <div className="shrink-0">
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={() => handleSend()}
              onStop={handleStop}
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
        projects={projects}
        currentConversationId={currentConversationId}
        currentProjectId={currentProjectId}
        onNewChat={startNewChat}
        onSelectChat={loadMessages}
        onSelectProject={setCurrentProjectId}
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0.9, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={`glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] sm:h-[min(85vh,680px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden`}
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
              className={`glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] sm:h-[min(85vh,680px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden`}
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
            onAsk={askForVoice}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
