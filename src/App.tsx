import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  Plus,
  Mic,
  Send,
  X,
  Settings,
  LogOut,
  MessageSquare,
  Loader2,
  Trash2,
  GraduationCap,
  Cpu,
  PenLine,
  ArrowLeft,
  MoreHorizontal,
} from 'lucide-react'
import { supabase, type Conversation, type DbMessage } from './lib/supabase'
import Auth from './components/Auth'
import type { User, Session } from '@supabase/supabase-js'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type Model = {
  id: string
  name: string
  badge?: string
}

const MODELS: Model[] = [
  { id: 'quantum-2', name: 'Quantum 2' },
  { id: 'quantum-3', name: 'Quantum 3', badge: 'Pro' },
]

const CATEGORIES = [
  {
    id: 'emails',
    title: 'Emails',
    desc: 'Find and summarize messages',
    icon: MessageSquare,
    color: 'bg-blue-50 text-blue-600',
    prompt: 'Summarize my latest important emails',
  },
  {
    id: 'docs',
    title: 'Documents',
    desc: 'Search files and reports',
    icon: GraduationCap,
    color: 'bg-amber-50 text-amber-600',
    prompt: 'Help me find a document about recent orders',
  },
  {
    id: 'data',
    title: 'Data & Trades',
    desc: 'Orders, invoices, status',
    icon: Cpu,
    color: 'bg-emerald-50 text-emerald-600',
    prompt: 'Which trades or orders are still pending?',
  },
  {
    id: 'writing',
    title: 'Writing',
    desc: 'Drafts, replies, notes',
    icon: PenLine,
    color: 'bg-rose-50 text-rose-600',
    prompt: 'Help me draft a professional follow-up email',
  },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
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
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded-md bg-slate-100 text-[13px] font-mono">$1</code>')
    .replace(/^[•\-]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>')

  html = html.replace(/(<li[^>]*>.*?<\/li>)/gs, (match) => {
    if (match.includes('list-disc')) return `<ul class="my-2 space-y-1">${match}</ul>`
    return `<ol class="my-2 space-y-1">${match}</ol>`
  })

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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) loadConversations()
    else {
      setConversations([])
      setCurrentConversationId(null)
      setMessages([])
    }
  }, [user])

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
    if (!error && data) setConversations(data)
  }

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages(
        data.map((m: DbMessage) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      )
      setCurrentConversationId(conversationId)
      setMobileSidebar(false)
    }
  }

  const createNewConversation = async (firstMessage: string) => {
    if (!user) return null
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '')
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title })
      .select()
      .single()

    if (error || !data) {
      console.error('Failed to create conversation', error)
      return null
    }
    setConversations((prev) => [data, ...prev])
    setCurrentConversationId(data.id)
    return data.id
  }

  const saveMessage = async (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ) => {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role,
      content,
    })
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  }

  const deleteConversation = async (id: string) => {
    setDeletingId(id)
    try {
      await supabase.from('messages').delete().eq('conversation_id', id)
      await supabase.from('conversations').delete().eq('id', id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (currentConversationId === id) {
        setCurrentConversationId(null)
        setMessages([])
      }
    } catch (err) {
      console.error('Delete failed', err)
    } finally {
      setDeletingId(null)
    }
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript
        setInput((prev) => (prev ? prev + ' ' + transcript : transcript))
        setIsListening(false)
      }
      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)
      recognitionRef.current = recognition
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser.')
      return
    }
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const callAI = async (userMessage: string, history: Message[]) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ],
        }),
      })

      const data = await response.json()
      if (response.ok && data.content) return data.content

      console.error('API error:', data)
      return `⚠️ ${data?.error || 'AI error'}. Check ANTHROPIC_API_KEY in Vercel and redeploy.`
    } catch (err: any) {
      console.error('Proxy call failed:', err)
      return `⚠️ Could not reach the AI service. ${err.message || ''}`
    }
  }

  const handleSend = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim()
    if (!trimmed || isLoading || !user) return

    const userMsg: Message = { id: generateId(), role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
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
      const assistantMsg: Message = { id: generateId(), role: 'assistant', content: reply }
      setMessages((prev) => [...prev, assistantMsg])
      await saveMessage(convId, 'assistant', reply)
      loadConversations()
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setMessages([])
    setMobileSidebar(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setShowSettings(false)
  }

  const isEmpty = messages.length === 0 && !isLoading

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f0f4ff]">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!session || !user) {
    return <Auth onSuccess={() => {}} />
  }

  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0] || 'there'

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-b from-[#eef2ff] via-[#f8fafc] to-[#f1f5f9]">
      <aside className="hidden lg:flex w-[280px] flex-col border-r border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="h-16 flex items-center gap-2.5 px-5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
              <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
              <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
              <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
            </svg>
          </div>
          <span className="font-semibold text-slate-900 text-[15px] tracking-tight">Quantum</span>
        </div>

        <div className="px-4 mb-3">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 h-10 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition shadow-sm px-4"
          >
            <Plus className="w-4 h-4" />
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-0.5 pb-4">
          {conversations.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-12">No chats yet</p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 rounded-xl transition ${
                currentConversationId === conv.id ? 'bg-white shadow-sm' : 'hover:bg-white/60'
              }`}
            >
              <button
                onClick={() => loadMessages(conv.id)}
                className="flex-1 text-left px-3 py-2.5 text-[13px] flex items-center gap-2.5 min-w-0"
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                <span className="truncate text-slate-700">{conv.title || 'Untitled'}</span>
              </button>
              <button
                onClick={() => deleteConversation(conv.id)}
                disabled={deletingId === conv.id}
                className="opacity-0 group-hover:opacity-100 p-2 mr-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                title="Delete chat"
              >
                {deletingId === conv.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-slate-100/80">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2.5 h-10 rounded-xl px-3 text-slate-600 hover:bg-white text-sm transition"
          >
            <Settings className="w-4 h-4" />
            <span className="truncate">{user.email}</span>
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed left-0 top-0 bottom-0 w-[300px] bg-white z-50 flex flex-col lg:hidden shadow-2xl"
            >
              <div className="h-16 flex items-center justify-between px-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                      <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                      <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                      <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
                    </svg>
                  </div>
                  <span className="font-semibold text-slate-900">Quantum</span>
                </div>
                <button onClick={() => setMobileSidebar(false)} className="p-2 rounded-full hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="px-4 mb-3">
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center gap-2 h-10 rounded-xl bg-slate-900 text-white text-sm font-medium px-4"
                >
                  <Plus className="w-4 h-4" />
                  New chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center rounded-xl ${
                      currentConversationId === conv.id ? 'bg-slate-100' : ''
                    }`}
                  >
                    <button
                      onClick={() => loadMessages(conv.id)}
                      className="flex-1 text-left px-3 py-2.5 text-sm flex items-center gap-2.5 min-w-0"
                    >
                      <MessageSquare className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate text-slate-700">{conv.title || 'Untitled'}</span>
                    </button>
                    <button
                      onClick={() => deleteConversation(conv.id)}
                      className="p-2 mr-1 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-2">
            {!isEmpty ? (
              <button
                onClick={startNewChat}
                className="p-2 -ml-1 rounded-full hover:bg-white/80 transition lg:hidden"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
            ) : (
              <button
                onClick={() => setMobileSidebar(true)}
                className="p-2 -ml-1 rounded-full hover:bg-white/80 transition lg:hidden"
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
            )}

            <div className="flex items-center bg-white/80 backdrop-blur rounded-full p-1 shadow-sm border border-white">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m)}
                  className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedModel.id === m.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m.name}
                  {m.badge && selectedModel.id === m.id && (
                    <span className="ml-1 text-[10px] opacity-80">{m.badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-white/80 transition text-slate-500"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 lg:px-6 h-full">
            <AnimatePresence mode="wait">
              {isEmpty ? (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center justify-center min-h-[calc(100%-2rem)] py-8 text-center"
                >
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-slate-500 text-sm mb-2"
                  >
                    {getGreeting()}, {displayName}!
                  </motion.p>

                  <motion.h1
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-[28px] sm:text-3xl font-semibold text-slate-900 tracking-tight leading-tight mb-10"
                  >
                    What are we going<br className="sm:hidden" /> to do today?
                  </motion.h1>

                  <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                    {CATEGORIES.map((cat, i) => {
                      const Icon = cat.icon
                      return (
                        <motion.button
                          key={cat.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 + i * 0.06 }}
                          onClick={() => handleSend(cat.prompt)}
                          className="text-left p-4 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <div className={`w-9 h-9 rounded-xl ${cat.color} flex items-center justify-center mb-3`}>
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <div className="text-sm font-semibold text-slate-900 mb-0.5">{cat.title}</div>
                          <div className="text-xs text-slate-500 leading-snug">{cat.desc}</div>
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-6 space-y-5 pb-4"
                >
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}

                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                          <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" />
                        </svg>
                      </div>
                      <div className="flex gap-1.5 items-center h-8">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" style={{ animationDelay: '160ms' }} />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" style={{ animationDelay: '320ms' }} />
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <div className="px-4 lg:px-6 pb-5 pt-2 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-white/90 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/50 rounded-2xl px-2 py-2 focus-within:shadow-xl transition-shadow">
              <button className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 transition">
                <Plus className="w-5 h-5" />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type prompt…"
                rows={1}
                className="flex-1 resize-none bg-transparent py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 leading-relaxed max-h-32 outline-none"
                style={{ minHeight: '40px' }}
              />

              <button
                onClick={toggleListening}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                  isListening ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>

              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                  input.trim() && !isLoading
                    ? 'bg-slate-900 text-white shadow-md hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-300'
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
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-3xl z-50 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-full hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-medium text-slate-400 mb-1">Signed in as</p>
                  <p className="text-sm text-slate-900 truncate">{user.email}</p>
                </div>

                <button
                  onClick={handleSignOut}
                  className="w-full h-11 rounded-2xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
            <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" />
          </svg>
        </div>
      )}

      <div
        className={`max-w-[85%] px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-slate-900 text-white rounded-2xl rounded-br-md shadow-md'
            : 'bg-white/90 backdrop-blur border border-white text-slate-800 rounded-2xl rounded-bl-md shadow-sm'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div
            className="break-words"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
          />
        )}
      </div>
    </motion.div>
  )
}
