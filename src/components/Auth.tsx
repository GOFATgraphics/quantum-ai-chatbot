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
    <div className="min-h-dvh w-full flex flex-col items-center justify-center relative overflow-hidden bg-background px-5 py-10">
      {/* Soft ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[320px] rounded-full bg-foreground/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[280px] h-[280px] rounded-full bg-foreground/5 blur-[80px]" />
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
            <div className="absolute inset-0 rounded-full bg-foreground/15 blur-xl scale-125" />
            <Logo size={72} className="relative drop-shadow-2xl" dark />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Quantumy</h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-[280px]">
            Your AI that remembers you, drafts email, and works across your tools.
          </p>
        </div>

        {/* Card */}
        <div className="relative">
          <div className="absolute -inset-px rounded-[24px] bg-gradient-to-b from-foreground/15 via-foreground/5 to-transparent opacity-70" />
          <div className="relative rounded-[24px] bg-card/95 backdrop-blur-xl border border-border p-6 sm:p-7 shadow-2xl shadow-black/40">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === 'login' ? 'Sign in to continue' : 'Start in under a minute'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full h-12 rounded-2xl bg-secondary text-foreground text-[15px] font-medium flex items-center justify-center gap-2.5 hover:bg-accent transition disabled:opacity-60"
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
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-input border border-input text-foreground text-[16px] placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition"
                  placeholder="you@email.com"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-input border border-input text-foreground text-[16px] placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition"
                  placeholder="••••••••"
                />
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3.5 py-2.5"
                  >
                    {error}
                  </motion.div>
                )}
                {message && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-foreground bg-secondary border border-border rounded-xl px-3.5 py-2.5"
                  >
                    {message}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full h-12 rounded-2xl font-medium text-[15px] text-primary-foreground overflow-hidden disabled:opacity-60 mt-1"
              >
                <div className="absolute inset-0 bg-primary" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-primary-foreground/10" />
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

            <p className="mt-6 text-center text-sm text-muted-foreground">
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
                    className="text-foreground font-medium hover:text-muted-foreground transition"
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
                    className="text-foreground font-medium hover:text-muted-foreground transition"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          <a href="/home.html" className="hover:text-foreground transition">About</a>
          {' · '}
          <a href="/privacy.html" className="hover:text-foreground transition">Privacy</a>
          {' · '}
          <a href="/terms.html" className="hover:text-foreground transition">Terms</a>
        </p>
      </motion.div>
    </div>
  )
}
