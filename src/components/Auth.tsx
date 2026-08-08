import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Loader2, ArrowRight, Sparkles } from 'lucide-react'

type Props = {
  onSuccess: () => void
}

export default function Auth({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSuccess()
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created. You can now sign in.')
        setMode('login')
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex relative overflow-hidden bg-[#05050a]">
      {/* Animated glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-indigo-600/20 blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/3 -right-24 w-[380px] h-[380px] rounded-full bg-violet-600/15 blur-[100px]"
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-0 left-1/3 w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-[80px]"
        />
      </div>

      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[48%] relative items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 max-w-md"
        >
          <div className="relative mb-10">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/40 blur-xl" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 border border-white/10">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
              </svg>
            </div>
          </div>

          <h1 className="text-4xl xl:text-5xl font-semibold text-white tracking-tight leading-[1.15] mb-5">
            Your AI that<br />
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
              knows your work
            </span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-10">
            Connect email, documents, and data. Ask anything. Get answers instantly.
          </p>

          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Powered by Claude · Secured by Supabase</span>
          </div>
        </motion.div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          {/* Glass card */}
          <div className="relative">
            <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-b from-white/20 via-white/5 to-transparent opacity-60" />
            <div className="relative rounded-3xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-8 shadow-2xl shadow-black/40">
              {/* Mobile logo */}
              <div className="lg:hidden flex justify-center mb-8">
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-indigo-500/50 blur-lg" />
                  <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                      <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                      <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                      <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="mb-7">
                <h2 className="text-2xl font-semibold text-white tracking-tight">
                  {mode === 'login' ? 'Welcome back' : 'Create account'}
                </h2>
                <p className="mt-1.5 text-slate-400 text-sm">
                  {mode === 'login'
                    ? 'Sign in to continue to Quantum'
                    : 'Start using your personal AI assistant'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-white/[0.04] border border-white/10 text-white text-[15px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-white/[0.04] border border-white/10 text-white text-[15px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="••••••••"
                  />
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5"
                    >
                      {error}
                    </motion.div>
                  )}
                  {message && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3.5 py-2.5"
                    >
                      {message}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full h-12 rounded-xl font-medium text-[15px] text-white overflow-hidden disabled:opacity-60 mt-2"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_100%] group-hover:animate-shimmer" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-white/10" />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {mode === 'login' ? 'Sign in' : 'Create account'}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                      </>
                    )}
                  </span>
                </button>
              </form>

              <p className="mt-7 text-center text-sm text-slate-500">
                {mode === 'login' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      onClick={() => {
                        setMode('signup')
                        setError(null)
                        setMessage(null)
                      }}
                      className="text-indigo-300 font-medium hover:text-indigo-200 transition"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      onClick={() => {
                        setMode('login')
                        setError(null)
                        setMessage(null)
                      }}
                      className="text-indigo-300 font-medium hover:text-indigo-200 transition"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
