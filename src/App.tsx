import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Logo from './components/Logo'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setAuthLoading(false) })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-white">
        <Logo size={56} dark={false} />
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!session) return <Auth onSuccess={() => {}} />

  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 p-6 bg-white">
      <Logo size={56} dark={false} />
      <p className="text-slate-600 text-center max-w-sm">
        App is being restored. Please refresh in a moment.
      </p>
    </div>
  )
}
