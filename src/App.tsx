import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  Bot,
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
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function generateId() {
  return Math.random().toString(36).slice(2, 11)
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
  const [showSidebar, setShowSidebar] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [saving, setSaving] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Auth state
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

  // Load conversations when user logs in
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

    if (!error && data) {
      setConversations(data)
    }
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
    }
  }

  const createNewConversation = async (firstMessage: string) => {
    if (!user) return null

    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '')

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title,
      })
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

    // Touch updated_at
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

  // Web Speech API
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
          model: 'grok-3',
          messages: [
            ...history.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: 'user', content: userMessage },
          ],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return data.content || 'Sorry, I could not generate a response.'
      }
      console.warn('API proxy returned', response.status)
    } catch (err) {
      console.error('Proxy call failed:', err)
    }

    // Demo fallback
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

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setSaving(true)

    try {
      let convId = currentConversationId

      if (!convId) {
        convId = await createNewConversation(trimmed)
        if (!convId) throw new Error('Could not create conversation')
      }

      // Save user message
      await saveMessage(convId, 'user', trimmed)

      const reply = await callAI(trimmed, messages)
      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: reply,
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Save assistant message
      await saveMessage(convId, 'assistant', reply)

      // Refresh conversation list so title/updated_at are fresh
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
      setSaving(false)
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
    setShowSidebar(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setShowSettings(false)
  }

  const isEmpty = messages.length === 0 && !isLoading

  // Loading auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  // Not logged in
  if (!session || !user) {
    return <Auth onSuccess={() => {}} />
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'there'

  return (
    <div className="flex h-full max-w-lg mx-auto bg-white relative overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setShowSidebar(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-white z-50 flex flex-col shadow-xl"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Chats</h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-3">
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  <Plus className="w-4 h-4" />
                  New chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
                {conversations.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">No conversations yet</p>
                )}
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      loadMessages(conv.id)
                      setShowSidebar(false)
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition flex items-start gap-2 ${
                      currentConversationId === conv.id
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{conv.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="safe-top bg-white" />

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100/80 bg-white/90 backdrop-blur-md sticky top-0 z-20">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-2 -ml-1 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5 text-slate-700" strokeWidth={1.75} />
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <span>Free plan</span>
            <span className="text-slate-300">·</span>
            <span className="text-blue-600 underline underline-offset-2 decoration-blue-600/40">
              Upgrade
            </span>
          </button>

          <button
            className="p-2 -mr-1 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="AI"
          >
            <Bot className="w-5 h-5 text-slate-700" strokeWidth={1.75} />
          </button>
        </header>

        {/* Chat area */}
        <main className="flex-1 overflow-y-auto chat-scroll px-4 relative">
          <AnimatePresence mode="wait">
            {isEmpty ? (
              <motion.div
                key="greeting"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                  className="mb-6"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-soft">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path
                        d="M8 8L16 4L24 8V16L16 20L8 16V8Z"
                        fill="white"
                        fillOpacity="0.95"
                      />
                      <path
                        d="M16 12L24 8V16L16 20V12Z"
                        fill="white"
                        fillOpacity="0.7"
                      />
                      <path
                        d="M8 16L16 12V20L8 24V16Z"
                        fill="white"
                        fillOpacity="0.5"
                      />
                    </svg>
                  </div>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-semibold text-slate-900 tracking-tight"
                >
                  {getGreeting()}, {displayName}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="mt-2 text-slate-500 text-sm max-w-[240px]"
                >
                  How can I help you today?
                </motion.p>
              </motion.div>
            ) : (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-4 space-y-4"
              >
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-bubble">
                      <div className="flex gap-1.5 items-center h-5">
                        <span
                          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot"
                          style={{ animationDelay: '0ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot"
                          style={{ animationDelay: '160ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot"
                          style={{ animationDelay: '320ms' }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Input */}
        <div className="safe-bottom border-t border-slate-100 bg-white/95 backdrop-blur-md px-3 pt-3 pb-3">
          <div className="flex items-end gap-2">
            <button
              className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors mb-0.5"
              aria-label="Attach"
            >
              <Plus className="w-5 h-5 text-slate-600" strokeWidth={2} />
            </button>

            <div className="flex-1 relative">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl overflow-hidden focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-100 transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="How can I help you today?"
                  rows={1}
                  className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[15px] text-slate-900 placeholder:text-slate-400 leading-relaxed max-h-32"
                  style={{ minHeight: '44px' }}
                />

                <div className="flex items-center justify-between px-3 pb-2.5">
                  <button
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors py-1 px-1.5 rounded-md hover:bg-slate-100"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{selectedModel.name}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={toggleListening}
                      className={`p-1.5 rounded-full transition-colors ${
                        isListening
                          ? 'bg-red-100 text-red-600'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                      aria-label="Voice input"
                    >
                      <Mic className="w-4 h-4" strokeWidth={2} />
                    </button>

                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className={`p-1.5 rounded-full transition-all ${
                        input.trim() && !isLoading
                          ? 'bg-slate-900 text-white shadow-sm hover:bg-slate-800'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                      aria-label="Send"
                    >
                      <Send className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {showModelPicker && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-30"
                      onClick={() => setShowModelPicker(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                      className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-40"
                    >
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setSelectedModel(model)
                            setShowModelPicker(false)
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between ${
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
          </div>
        </div>
      </div>

      {/* Settings */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-50"
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-3xl z-50 p-6 safe-bottom"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Settings
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-800 mb-1">Signed in as</p>
                  <p className="truncate">{user.email}</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 leading-relaxed">
                  <p className="font-medium text-slate-800 mb-1">API Key is secure</p>
                  <p>
                    Your xAI API key lives only on the server (Vercel Environment Variables). It is
                    never sent to the browser.
                  </p>
                </div>

                <button
                  onClick={handleSignOut}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>

                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition"
                >
                  Done
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
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] px-4 py-2.5 text-[15px] leading-relaxed shadow-bubble ${
          isUser
            ? 'bg-slate-900 text-white rounded-2xl rounded-br-md'
            : 'bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </motion.div>
  )
}
