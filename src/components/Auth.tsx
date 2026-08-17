import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Loader2, ArrowRight } from 'lucide-react'
import Logo from './Logo'
import { GoogleIcon } from './BrandIcons'

type Props = {
  onSuccess: () => void
}

export default function Auth({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
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
        setMessage('Account created. You can sign in now.')
        setMode('login')
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError(null)
    setMessage(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
      // Browser redirects to Google now; onSuccess fires on return via the auth listener.
    } catch (err: any) {
      setError(err.message || 'Could not start Google sign-in')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-dvh w-full flex flex-col items-center justify-center relative overflow-hidden bg-[#131313] px-5 py-10">
      {/* Soft ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[320px] rounded-full bg-indigo-600/20 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[280px] h-[280px] rounded-full bg-violet-600/10 blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[400px]"
      >
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-full bg-indigo-500/30 blur-xl scale-125" />
            <Logo size={72} className="relative drop-shadow-2xl" dark />
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Quantumy</h1>
          <p className="mt-1.5 text-sm text-slate-400 max-w-[280px]">
            Your AI that remembers you, drafts email, and works across your tools.
          </p>
        </div>

        {/* Card */}
        <div className="relative">
          <div className="relative bg-[#1a1a1a] border-2 border-white/80 p-6 sm:p-7 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white tracking-tight">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {mode === 'login' ? 'Sign in to continue' : 'Start in under a minute'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full h-12 rounded-2xl bg-white text-slate-800 text-[15px] font-medium flex items-center justify-center gap-2.5 hover:bg-slate-100 transition disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <GoogleIcon size={18} />
                  Continue with Google
                </>
              )}
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-white/[0.05] border border-white/10 text-white text-[16px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition"
                  placeholder="you@email.com"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-white/[0.05] border border-white/10 text-white text-[16px] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition"
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
                className="group relative w-full h-12 rounded-2xl font-medium text-[15px] text-white overflow-hidden disabled:opacity-60 mt-1"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600" />
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

            <p className="mt-6 text-center text-sm text-slate-500">
              {mode === 'login' ? (
                <>
                  No account?{' '}
                  <button
                    type="button"
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
                    type="button"
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

        <p className="mt-8 text-center text-[11px] text-slate-600">
          <a href="/home.html" className="hover:text-slate-400 transition">About</a>
          {' · '}
          <a href="/privacy.html" className="hover:text-slate-400 transition">Privacy</a>
          {' · '}
          <a href="/terms.html" className="hover:text-slate-400 transition">Terms</a>
        </p>
      </motion.div>
    </div>
  )
}
