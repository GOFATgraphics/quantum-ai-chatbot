import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Loader2, PenLine, Sun, Moon } from 'lucide-react'
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
import LiveVoice, { type VoiceLanguage } from './components/LiveVoice'
import InstallPWA from './components/InstallPWA'
import CommandPalette from './components/CommandPalette'
import ProjectsWorkspace from './components/ProjectsWorkspace'

// Single model — fast + capable for tools/Gmail/memory
const MODEL = { id: 'quantumy', name: 'Quantumy', anthropic: 'claude-sonnet-5' as const }

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function creativeGreeting(firstName: string) {
  const n = (firstName || '').trim()
  if (n && n.toLowerCase() !== 'there') return 'What can I help you with today, ' + n + '?'
  return 'What can I help you with today?'
}

function buildUserContent(text: string, files: PendingFile[]): string {
  const parts: string[] = []
  if (text.trim()) parts.push(text.trim())
  for (const f of files) {
    if (f.type.startsWith('image/') && f.dataUrl) parts.push('![' + f.name + '](' + f.dataUrl + ')')
    else if (f.type.startsWith('text/') || f.text) {
      const body = (f.text || '').slice(0, 40_000)
      parts.push('📎 **' + f.name + '**\n```\n' + body + '\n```')
    } else parts.push('📎 **' + f.name + '** _(file attached)_')
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
  const [glass, setGlass] = useState(() => { try { return localStorage.getItem('quantumy-glass') !== '0' } catch { return true } })
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

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const thinkStartedAt = useRef<number | null>(null)
  const [thoughtSeconds, setThoughtSeconds] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)
  const [showLiveVoice, setShowLiveVoice] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [thinkActive, setThinkActive] = useState(false)
  const [deepSearchActive, setDeepSearchActive] = useState(false)
  const [glowDone, setGlowDone] = useState(false)
  const thinkActiveRef = useRef(false)
  const deepSearchActiveRef = useRef(false)
  useEffect(() => { thinkActiveRef.current = thinkActive }, [thinkActive])
  useEffect(() => { deepSearchActiveRef.current = deepSearchActive }, [deepSearchActive])
  const [composerFocused, setComposerFocused] = useState(false)
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(() => {
    try {
      const v = localStorage.getItem('quantumy-language')
      if (v === 'en' || v === 'ha') return v
    } catch { /* ignore */ }
    return 'en'
  })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lastUserPrompt, setLastUserPrompt] = useState('')
  const [greetingLine, setGreetingLine] = useState('')
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const currentConversationIdRef = useRef<string | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { currentConversationIdRef.current = currentConversationId }, [currentConversationId])
  useEffect(() => {
    document.documentElement.classList.toggle('glass-on', glass)
    try { localStorage.setItem('quantumy-glass', glass ? '1' : '0') } catch {}
  }, [glass])

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const vv = window.visualViewport
      if (vv) {
        root.style.setProperty('--app-vh', Math.round(vv.height) + 'px')
        root.style.setProperty('--app-offset', Math.round(vv.offsetTop) + 'px')
      } else {
        root.style.setProperty('--app-vh', window.innerHeight + 'px')
        root.style.setProperty('--app-offset', '0px')
      }
    }
    apply()
    const vv = window.visualViewport
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])

  useEffect(() => {
    const empty = messages.length === 0 && !isLoading
    document.documentElement.classList.toggle('is-empty-chat', empty)
    return () => document.documentElement.classList.remove('is-empty-chat')
  }, [messages.length, isLoading])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setShowCommandPalette((v) => !v)
        return
      }
      if (mod && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        const t = e.target as HTMLElement | null
        const tag = t?.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return
        e.preventDefault()
        setShowCommandPalette(false)
        setShowProjects(false)
        setMessages([])
        setCurrentConversationId(null)
        setIsLoading(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (isLoading) {
      setGlowDone(false)
      return
    }
    if (messages.length === 0) return
    setGlowDone(true)
    const t = window.setTimeout(() => setGlowDone(false), 700)
    return () => clearTimeout(t)
  }, [isLoading])

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
    const { data } = await supabase.from('conversations').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(50)
    if (data) setConversations(data as Conversation[])
  }, [user])

  const loadProjects = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('projects').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
    if (data) setProjects(data as Project[])
  }, [user])

  useEffect(() => { if (user) { loadConversations(); loadProjects() } }, [user, loadConversations, loadProjects])

  const createProject = async (name: string) => {
    if (!user) return
    const { data, error } = await supabase.from('projects').insert({ user_id: user.id, name: name.trim() }).select().single()
    if (error || !data) throw error || new Error('Could not create project')
    setProjects((prev) => [data as Project, ...prev])
    setCurrentProjectId(data.id)
  }

  const deleteProject = async (id: string) => {
    if (!user) return
    await supabase.from('conversations').update({ project_id: null }).eq('project_id', id).eq('user_id', user.id)
    await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (currentProjectId === id) setCurrentProjectId(null)
  }

  const loadMessages = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    setMobileSidebar(false)
    setErrorHint(null)
    setComposerFocused(false)
    setIsLoading(false)
    setToolStatus(null)
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
    if (data) {
      // MessageList pins to bottom when conversationId / messages update
      setMessages(data.map((m: DbMessage) => ({ id: m.id, role: m.role, content: m.content })))
    }
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
      if (!source || source.length < 8) source = assistantText.replace(/\s+/g, ' ').trim().slice(0, 80)
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

  const streamAI = async (userMessage: string, history: ChatMessage[], assistantId: string) => {
    const model = MODEL
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
    if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        messages: [
          ...history.map((m) => ({
            role: m.role,
            content:
              m.role === 'user'
                ? String(m.content || '')
                    .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '[Image attached]')
                : m.content,
          })),
          { role: 'user', content: userMessage },
        ],
        firstName,
        projectId: currentProjectId,
        model: model.anthropic,
        modelId: model.id,
        stream: true,
        think: thinkActiveRef.current,
        deepSearch: deepSearchActiveRef.current,
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
              const names = Array.isArray(evt.tools) ? evt.tools.filter(Boolean) : []
              const label = names.length ? names.join(' · ') : (evt.tool || 'Working…')
              setToolStatus(String(label))
              continue
            } else if (typeof evt.delta === 'string') {
              setToolStatus(null)
              full += evt.delta
              setMessages((p) => p.map((m) => (m.id === assistantId ? { ...m, content: full } : m)))
            } else if (typeof evt.content === 'string') {
              setToolStatus(null)
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
      const model = MODEL
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token
      const history = messagesRef.current.slice(-12).map((m) => ({ role: m.role, content: m.content }))
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
          think: thinkActiveRef.current,
          deepSearch: deepSearchActiveRef.current,
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
    [session?.access_token, firstName, currentProjectId],
  )

  const handleStop = useCallback(() => { abortRef.current?.abort() }, [])

  const openLiveVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      voiceStreamRef.current = stream
    } catch {
      voiceStreamRef.current = null
    }
    setShowLiveVoice(true)
  }

  const closeLiveVoice = () => {
    setShowLiveVoice(false)
    try {
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop())
    } catch { /* ignore */ }
    voiceStreamRef.current = null
  }

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
    setToolStatus(null)
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
      setToolStatus(null)
      // Keep partial text if any; otherwise drop the empty assistant bubble
      setMessages((p) => {
        const m = p.find((x) => x.id === assistantId)
        if (!m || !m.content.trim()) return p.filter((x) => x.id !== assistantId)
        return p
      })
    } finally {
      if (thinkStartedAt.current) {
        setThoughtSeconds(Math.max(1, Math.round((Date.now() - thinkStartedAt.current) / 1000)))
        thinkStartedAt.current = null
      }
      setIsLoading(false)
      setToolStatus(null)
      abortRef.current = null
    }
  }

  const isEmpty = messages.length === 0 && !isLoading
  const glowMode = isLoading ? 'thinking' : glowDone ? 'done' : 'idle'

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
    onOpenProjects: () => { setShowProjects(true); setMobileSidebar(false) },
    onSelectProject: setCurrentProjectId,
    onOpenCommandPalette: () => { setShowCommandPalette(true); setMobileSidebar(false) },
  }

  return (
    <div className={'app-root-shell flex overflow-hidden overscroll-none ' + (dark ? 'bg-transparent' : 'bg-transparent')}>
      <div className="hidden lg:flex w-[300px] shrink-0"><Sidebar {...sidebarProps} /></div>
      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/25 z-40 lg:hidden" onClick={() => setMobileSidebar(false)} />
            <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', damping: 32, stiffness: 360 }} className={'fixed inset-y-0 left-0 z-50 w-[min(320px,90vw)] lg:hidden shadow-2xl ' + (dark ? 'bg-[#16161f]' : 'bg-white')}>
              <Sidebar {...sidebarProps} showClose onClose={() => setMobileSidebar(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <div className={'chat-shell-locked flex-1 flex flex-col min-w-0 min-h-0 h-full relative overflow-hidden overflow-x-hidden overscroll-none ' + (isEmpty ? 'chat-shell-empty ' : '') + (dark ? '' : 'bg-white')}>
        <div className={'chat-glow chat-glow--' + glowMode} aria-hidden>
          <div className="chat-glow-orb chat-glow-orb-a" />
          <div className="chat-glow-orb chat-glow-orb-b" />
          <div className="chat-glow-orb chat-glow-orb-c" />
        </div>
        <header className="glass-header shrink-0 pt-[env(safe-area-inset-top)] z-30">
          <div className="h-14 grid grid-cols-[1fr_auto_1fr] items-center px-3 gap-2">
            <div className="flex items-center justify-start min-w-0">
              <button onClick={() => setMobileSidebar(true)} className={'glass-btn lg:hidden w-10 h-10 rounded-full flex items-center justify-center transition ' + (dark ? 'text-slate-200' : 'text-slate-700')} aria-label="Menu">
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center">
              <div className={'flex items-center gap-1.5 px-3 h-10 rounded-full text-[14px] font-medium ' + (dark ? 'text-slate-100' : 'text-slate-800')}>
                <span className="truncate max-w-[140px] sm:max-w-none">{MODEL.name}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              <button type="button" onClick={cycleTheme} className={'glass-btn w-10 h-10 rounded-full flex items-center justify-center transition ' + (dark ? 'text-slate-200' : 'text-slate-700')} aria-label={'Theme: ' + themeMode}>
                {dark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
              {!isEmpty && (
                <button onClick={startNewChat} className={'glass-btn w-10 h-10 rounded-full flex items-center justify-center transition ' + (dark ? 'text-slate-200' : 'text-slate-700')} aria-label="New chat">
                  <PenLine className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </header>
        <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
          {isEmpty ? (
            <div className="flex-1 flex items-center justify-center px-4">
              <EmptyState greeting={greetingLine || creativeGreeting(firstName)} dark={dark} composing={composerFocused} />
            </div>
          ) : (
            <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0" data-scrollable="true">
              <MessageList
                messages={messages}
                isLoading={isLoading}
                lastUserPrompt={lastUserPrompt}
                dark={dark}
                messagesEndRef={messagesEndRef}
                conversationId={currentConversationId}
                thoughtSeconds={thoughtSeconds}
                thinkActive={thinkActive}
                deepSearchActive={deepSearchActive}
                toolStatus={toolStatus}
                onRegenerate={() => { if (lastUserPrompt) handleSend(lastUserPrompt) }}
                onSuggestion={(s) => { setInput(s); void handleSend(s) }}
              />
            </main>
          )}
          <div className="shrink-0">
            <ChatInput value={input} onChange={setInput} onSend={() => handleSend()} onStop={handleStop} onSpeak={() => void openLiveVoice()} language={voiceLanguage} isLoading={isLoading} dark={dark} errorHint={errorHint} pendingFiles={pendingFiles} onFilesChange={setPendingFiles} onFocusChange={setComposerFocused} thinkActive={thinkActive} deepSearchActive={deepSearchActive} onThinkChange={setThinkActive} onDeepSearchChange={setDeepSearchActive} />
          </div>
        </div>
        <InstallPWA dark={dark} />
      </div>
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} dark={dark} conversations={conversations} projects={projects} currentConversationId={currentConversationId} currentProjectId={currentProjectId} onNewChat={startNewChat} onSelectChat={loadMessages} onSelectProject={setCurrentProjectId} onOpenSettings={() => setShowSettings(true)} onOpenConnectors={() => setShowConnectors(true)} onToggleTheme={() => setDark((d) => !d)} />
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => setShowSettings(false)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 24 }} className="glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <Settings dark={dark} glass={glass} user={user} onClose={() => setShowSettings(false)} onSignOut={async () => { await supabase.auth.signOut(); setShowSettings(false) }} onToggleTheme={() => setDark((d) => !d)} onToggleGlass={() => setGlass((g) => !g)} onOpenConnectors={() => { setShowSettings(false); setShowConnectors(true) }} onProfileUpdated={(name) => { setGreetingLine(creativeGreeting(name)); supabase.auth.getSession().then(({ data }) => setSession(data.session)) }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showConnectors && session?.access_token && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => setShowConnectors(false)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 24 }} className="glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <Connectors dark={dark} accessToken={session.access_token} onClose={() => setShowConnectors(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showLiveVoice && (
          <LiveVoice dark={dark} firstName={firstName} preferredLanguage={voiceLanguage} onLanguageChange={setVoiceLanguage} onClose={closeLiveVoice} onAsk={askForVoice} initialStream={voiceStreamRef.current} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showProjects && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => setShowProjects(false)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 24 }} className="glass-sheet w-full sm:max-w-[430px] h-[min(92dvh,720px)] rounded-t-[28px] sm:rounded-[28px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <ProjectsWorkspace dark={dark} projects={projects} conversations={conversations} currentProjectId={currentProjectId} onClose={() => setShowProjects(false)} onSelectProject={setCurrentProjectId} onCreateProject={createProject} onDeleteProject={deleteProject} onNewChat={() => { setShowProjects(false); startNewChat() }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
