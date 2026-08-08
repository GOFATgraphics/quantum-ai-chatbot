import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Loader2, ArrowRight } from 'lucide-react'

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
    <div className="min-h-screen w-full flex bg-[#0a0a0b]">
      {/* Left decorative panel – desktop only */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f1115] to-black" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `radial-gradient(circle at 30% 40%, rgba(99,102,241,0.15) 0%, transparent 50%),
                            radial-gradient(circle at 70% 60%, rgba(168,85,247,0.1) 0%, transparent 45%)`
        }} />

        <div className="relative z-10 px-16 max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center mb-10">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
              <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
              <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
            </svg>
          </div>

          <h1 className="text-4xl font-semibold text-white tracking-tight leading-tight mb-4">
            Your AI that<br />actually knows your work
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Connect your tools. Ask anything. Get instant answers from your emails, documents, and data.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-10">
            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
                <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
                <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
              </svg>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-white tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-2 text-slate-400 text-[15px]">
              {mode === 'login'
                ? 'Sign in to continue to Quantum'
                : 'Start using your personal AI assistant'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-4 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[15px] placeholder:text-slate-500 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[15px] placeholder:text-slate-500 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">
                {error}
              </div>
            )}
            {message && (
              <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3.5 py-2.5">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-white text-slate-900 font-medium text-[15px] hover:bg-slate-100 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                    setMessage(null)
                  }}
                  className="text-white font-medium hover:underline"
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
                  className="text-white font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
