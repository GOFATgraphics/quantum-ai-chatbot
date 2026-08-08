import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  Plus,
  Mic,
  Send,
  ChevronDown,
  X,
  Sparkles,
  Settings,
  LogOut,
  MessageSquare,
  Loader2,
  PanelLeftClose,
  PanelLeft,
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
  description: string
}

const MODELS: Model[] = [
  { id: 'quantum-3', name: 'Quantum 3', description: 'Most capable' },
  { id: 'quantum-2', name: 'Quantum 2', description: 'Balanced' },
  { id: 'quantum-fast', name: 'Quantum Fast', description: 'Speed focused' },
]

const DEMO_RESPONSES = [
  "That's a great question! Based on current trends, I'd recommend focusing on LinkedIn for professional reach, Instagram Reels for engagement, and targeted email sequences for retention.",
  "Here's a strong campaign concept: **\"Work Smarter, Not Longer\"**. It speaks directly to remote professionals dealing with burnout while positioning your app as the solution for reclaiming time.",
  "For slogans, try:\n• \"Your time, optimized.\"\n• \"Less busy. More impact.\"\n• \"Reclaim your day.\"\n\nThe first one feels clean and premium.",
  "I can help refine that further. Would you like channel-specific messaging, a content calendar outline, or ad creative ideas next?",
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

/** Lightweight markdown → HTML for assistant messages */
function formatMarkdown(text: string) {
  let html = text
    // Escape HTML
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')

    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic *text*
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    // Inline code `code`
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-[13px] font-mono">$1</code>')
    // Unordered lists
    .replace(/^[•\-]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Numbered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li[^>]*>.*?<\/li>)/gs, (match) => {
    if (match.includes('list-disc')) {
      return `<ul class="my-2 space-y-1">${match}</ul>`
    }
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
  const [selectedModel, setSelectedModel] = useState(MODELS[0])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)

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
    if (user) {
      loadConversations()
    } else {
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

      if (response.ok) {
        const data = await response.json()
        return data.content || 'Sorry, I could not generate a response.'
      }
    } catch (err) {
      console.error('Proxy call failed:', err)
    }

    await new Promise((r) => setTimeout(r, 900 + Math.random() * 800))
    const lower = userMessage.toLowerCase()
    if (lower.includes('slogan') || lower.includes('tagline')) return DEMO_RESPONSES[2]
    if (lower.includes('channel') || lower.includes('platform') || lower.includes('focus'))
      return DEMO_RESPONSES[0]
    if (lower.includes('campaign') || lower.includes('marketing') || lower.includes('idea'))
      return DEMO_RESPONSES[1]
    return DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)]
  }

  const handleSend = async () => {
    const trimmed = input.trim()
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
        {
          id: generateId(),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        },
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
      <div className="flex items-center justify-center h-screen bg-[#0a0a0b]">
        <Loader2 className="w-7 h-7 animate-spin text-slate-500" />
      </div>
    )
  }

  if (!session || !user) {
    return <Auth onSuccess={() => {}} />
  }

  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0] || 'there'

  return (
    <div className="flex h-screen bg-[#fafafa] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200/80 bg-white transition-all duration-300 ${
          sidebarOpen ? 'w-[260px]' : 'w-[68px]'
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100">
          {sidebarOpen && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                  <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                  <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                  <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
                </svg>
              </div>
              <span className="font-semibold text-slate-900 text-[15px]">Quantum</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={startNewChat}
            className={`w-full flex items-center gap-2 h-9 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition ${
              sidebarOpen ? 'px-3 justify-start' : 'justify-center'
            }`}
          >
            <Plus className="w-4 h-4" />
            {sidebarOpen && 'New chat'}
          </button>
        </div>

        {sidebarOpen && (
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-10 px-4">
                No conversations yet
              </p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadMessages(conv.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition flex items-center gap-2.5 ${
                  currentConversationId === conv.id
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                <span className="truncate">{conv.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        )}

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => setShowSettings(true)}
            className={`w-full flex items-center gap-2.5 h-9 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition ${
              sidebarOpen ? 'px-3' : 'justify-center'
            }`}
          >
            <Settings className="w-4 h-4" />
            {sidebarOpen && <span className="truncate">{user.email}</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
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
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] bg-white z-50 flex flex-col lg:hidden shadow-2xl"
            >
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                      <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                      <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                      <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
                    </svg>
                  </div>
                  <span className="font-semibold text-slate-900">Quantum</span>
                </div>
                <button
                  onClick={() => setMobileSidebar(false)}
                  className="p-1.5 rounded-md hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-3">
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center gap-2 px-3 h-9 rounded-lg bg-slate-900 text-white text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  New chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadMessages(conv.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition flex items-center gap-2.5 ${
                      currentConversationId === conv.id
                        ? 'bg-slate-100 text-slate-900 font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-60" />
                    <span className="truncate">{conv.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebar(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5 text-slate-700" />
            </button>
            <span className="text-sm font-medium text-slate-500 hidden sm:block">
              {currentConversationId
                ? conversations.find((c) => c.id === currentConversationId)?.title || 'Chat'
                : 'New conversation'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 lg:px-6">
            <AnimatePresence mode="wait">
              {isEmpty ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-6 shadow-lg shadow-slate-900/10">
                    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                      <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                      <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                      <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
                    </svg>
                  </div>

                  <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                    {getGreeting()}, {displayName}
                  </h1>
                  <p className="text-slate-500 text-[15px] max-w-sm">
                    Ask me anything. I can help with your emails, documents, data, and more.
                  </p>

                  <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                    {[
                      'What did I receive about the wheat order?',
                      'Show me invoices from last month',
                      'Summarize my latest emails',
                      'Which trades are still pending?',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setInput(suggestion)
                          inputRef.current?.focus()
                        }}
                        className="text-left px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="messages"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-8 space-y-6"
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
                      <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
                          <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" />
                        </svg>
                      </div>
                      <div className="flex gap-1.5 items-center h-7">
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

        <div className="border-t border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="max-w-3xl mx-auto px-4 lg:px-6 py-4">
            <div className="relative">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm focus-within:border-slate-300 focus-within:shadow-md transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything…"
                  rows={1}
                  className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] text-slate-900 placeholder:text-slate-400 leading-relaxed max-h-40 outline-none"
                  style={{ minHeight: '48px' }}
                />

                <div className="flex items-center justify-between px-3 pb-3">
                  <button
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {selectedModel.name}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={toggleListening}
                      className={`p-2 rounded-lg transition ${
                        isListening
                          ? 'bg-red-50 text-red-600'
                          : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                    >
                      <Mic className="w-4 h-4" />
                    </button>

                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className={`p-2 rounded-lg transition ${
                        input.trim() && !isLoading
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {showModelPicker && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowModelPicker(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-40"
                    >
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setSelectedModel(model)
                            setShowModelPicker(false)
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center justify-between ${
                            selectedModel.id === model.id ? 'bg-slate-50' : ''
                          }`}
                        >
                          <div>
                            <div className="text-sm font-medium text-slate-900">{model.name}</div>
                            <div className="text-xs text-slate-500">{model.description}</div>
                          </div>
                          {selectedModel.id === model.id && (
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <p className="text-center text-[11px] text-slate-400 mt-3">
              Quantum can make mistakes. Verify important information.
            </p>
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
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl z-50 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-1">Signed in as</p>
                  <p className="text-sm text-slate-900 truncate">{user.email}</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed">
                  <p className="font-medium text-slate-800 mb-1">API key is secure</p>
                  <p className="text-[13px]">
                    Your Anthropic key lives only on the server and is never exposed to the browser.
                  </p>
                </div>

                <button
                  onClick={handleSignOut}
                  className="w-full h-10 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2"
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
            <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" />
          </svg>
        </div>
      )}

      <div
        className={`max-w-[80%] px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-slate-900 text-white rounded-2xl rounded-br-md'
            : 'bg-white border border-slate-200/80 text-slate-800 rounded-2xl rounded-bl-md shadow-sm'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div
            className="break-words prose-sm"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
          />
        )}
      </div>
    </motion.div>
  )
}
