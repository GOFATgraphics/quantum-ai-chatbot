import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

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
        setMessage('Check your email for the confirmation link (if enabled).')
        // Auto switch to login after successful signup in many setups
        setMode('login')
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-soft">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 8L16 4L24 8V16L16 20L8 16V8Z" fill="white" fillOpacity="0.95" />
              <path d="M16 12L24 8V16L16 20V12Z" fill="white" fillOpacity="0.7" />
              <path d="M8 16L16 12V20L8 24V16Z" fill="white" fillOpacity="0.5" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-center text-slate-900 mb-1">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="text-center text-slate-500 text-sm mb-8">
          {mode === 'login'
            ? 'Sign in to continue to Quantum'
            : 'Start using your AI assistant'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
          {message && (
            <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{message}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setMessage(null)
                }}
                className="text-slate-900 font-medium hover:underline"
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
                className="text-slate-900 font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </motion.div>
    </div>
  )
}
