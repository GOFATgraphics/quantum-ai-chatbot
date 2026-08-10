import { useEffect, useState } from 'react'
import { Loader2, ShieldOff } from 'lucide-react'
import { supabase, getMyProfile, type Profile } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import Logo from '../components/Logo'
import AdminShell, { type AdminPage } from './AdminShell'
import Overview from './pages/Overview'

export default function AdminApp() {
  const { dark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [page, setPage] = useState<AdminPage>('overview')

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)

      if (data.session?.user) {
        const p = await getMyProfile()
        if (mounted) setProfile(p)
      }
      if (mounted) setLoading(false)
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      if (s?.user) {
        const p = await getMyProfile()
        setProfile(p)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const goToApp = () => {
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div
        className={
          dark
            ? 'min-h-dvh flex flex-col items-center justify-center gap-4 bg-[#0c0c10]'
            : 'min-h-dvh flex flex-col items-center justify-center gap-4 bg-slate-50'
        }
      >
        <Logo size={48} dark={dark} />
        <Loader2 className={dark ? 'w-5 h-5 animate-spin text-slate-500' : 'w-5 h-5 animate-spin text-slate-400'} />
      </div>
    )
  }

  if (!session?.user) {
    window.location.href = '/'
    return null
  }

  if (!profile?.is_admin) {
    return (
      <div
        className={
          dark
            ? 'min-h-dvh flex flex-col items-center justify-center px-6 bg-[#0c0c10] text-slate-100'
            : 'min-h-dvh flex flex-col items-center justify-center px-6 bg-slate-50 text-slate-900'
        }
      >
        <div
          className={
            dark
              ? 'w-full max-w-sm rounded-2xl border p-6 text-center bg-white/[0.03] border-white/10'
              : 'w-full max-w-sm rounded-2xl border p-6 text-center bg-white border-slate-200 shadow-sm'
          }
        >
          <div
            className={
              dark
                ? 'mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-red-500/10 text-red-400'
                : 'mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-red-50 text-red-600'
            }
          >
            <ShieldOff className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className={dark ? 'mt-2 text-sm text-slate-400' : 'mt-2 text-sm text-slate-500'}>
            Your account does not have admin privileges.
          </p>
          <button
            type="button"
            onClick={goToApp}
            className="mt-5 w-full h-11 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition"
          >
            Back to Quantumy
          </button>
        </div>
      </div>
    )
  }

  return (
    <AdminShell dark={dark} email={profile.email} activePage={page} onNavigate={setPage} onBackToApp={goToApp}>
      {page === 'overview' && <Overview dark={dark} />}
      {page !== 'overview' && (
        <div className={dark ? 'text-sm text-slate-400' : 'text-sm text-slate-500'}>
          This section is coming in a later batch.
        </div>
      )}
    </AdminShell>
  )
}
