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
  Key,
} from 'lucide-react'

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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState(MODELS[0])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('quantum_api_key') || import.meta.env.VITE_XAI_API_KEY || '')
  const [userName] = useState('Mithila')
  const [isListening, setIsListening] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  useEffect(() => {
    if (apiKey) localStorage.setItem('quantum_api_key', apiKey)
  }, [apiKey])

  // Web Speech API setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
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
    // Real API call if key present
    if (apiKey) {
      try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'grok-3',
            messages: [
              {
                role: 'system',
                content:
                  'You are Quantum, a premium, helpful, and concise AI assistant. Respond in a clear, professional yet friendly tone. Use markdown when helpful. Keep answers focused and high-quality.',
              },
              ...history.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            max_tokens: 1024,
          }),
        })

        if (!response.ok) throw new Error('API error')
        const data = await response.json()
        return data.choices[0]?.message?.content || 'Sorry, I could not generate a response.'
      } catch (err) {
        console.error(err)
        // Fallback to demo
      }
    }

    // Demo / fallback intelligent responses
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 800))
    const lower = userMessage.toLowerCase()
    if (lower.includes('slogan') || lower.includes('tagline')) {
      return DEMO_RESPONSES[2]
    }
    if (lower.includes('channel') || lower.includes('platform') || lower.includes('focus')) {
      return DEMO_RESPONSES[0]
    }
    if (lower.includes('campaign') || lower.includes('marketing') || lower.includes('idea')) {
      return DEMO_RESPONSES[1]
    }
    return DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)]
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const reply = await callAI(trimmed, messages)
      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: reply,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
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

  const isEmpty = messages.length === 0 && !isLoading

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto bg-white relative overflow-hidden">
      {/* Status bar spacer for mobile feel */}
      <div className="safe-top bg-white" />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100/80 bg-white/90 backdrop-blur-md sticky top-0 z-20">
        <button
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

      {/* Main content */}
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
              {/* Logo */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                className="mb-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-soft">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
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
                {getGreeting()}, {userName}
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
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" style={{ animationDelay: '160ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" style={{ animationDelay: '320ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Input area */}
      <div className="safe-bottom border-t border-slate-100 bg-white/95 backdrop-blur-md px-3 pt-3 pb-3">
        <div className="flex items-end gap-2">
          {/* Plus button */}
          <button
            className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors mb-0.5"
            aria-label="Attach"
          >
            <Plus className="w-5 h-5 text-slate-600" strokeWidth={2} />
          </button>

          {/* Input container */}
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

              {/* Bottom controls inside input */}
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

            {/* Model picker dropdown */}
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

      {/* Settings modal */}
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
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                    <Key className="w-4 h-4" />
                    API Key (xAI / OpenAI compatible)
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="xai-... or sk-..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Stored locally. Leave empty for demo mode.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-full py-3 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition"
                  >
                    Done
                  </button>
                </div>
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
      className={`flex ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
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
