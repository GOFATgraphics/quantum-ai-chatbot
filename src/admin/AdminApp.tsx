import { useEffect, useState } from 'react'
import { Loader2, ShieldOff } from 'lucide-react'
import { supabase, getMyProfile, type Profile } from '../lib/supabase'
import { useTheme } from '../lib/theme'
import Logo from '../components/Logo'
import AdminShell, { type AdminPage } from './AdminShell'
import Overview from './pages/Overview'
import Analytics from './pages/Analytics'
import Users from './pages/Users'
import Conversations from './pages/Conversations'
import AdminNotes from './pages/Notes'
import ConnectorsPage from './pages/Connectors'

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
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-settings-canvas">
        <Logo size={48} dark={dark} />
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session?.user) {
    window.location.href = '/'
    return null
  }

  if (!profile?.is_admin) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 overflow-y-auto bg-settings-canvas text-foreground">
        <div className="w-full max-w-sm rounded-2xl border p-6 text-center bg-card border-border shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-destructive/10 text-destructive">
            <ShieldOff className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account does not have admin privileges.
          </p>
          <button
            type="button"
            onClick={goToApp}
            className="mt-5 w-full h-11 rounded-xl text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 transition"
          >
            Back to Quantumy
          </button>
        </div>
      </div>
    )
  }

  return (
    <AdminShell
      dark={dark}
      email={profile.email}
      activePage={page}
      onNavigate={setPage}
      onBackToApp={goToApp}
    >
      {page === 'overview' && <Overview dark={dark} />}
      {page === 'analytics' && <Analytics dark={dark} />}
      {page === 'users' && <Users dark={dark} currentUserId={profile.id} />}
      {page === 'conversations' && <Conversations dark={dark} />}
      {page === 'notes' && <AdminNotes dark={dark} />}
      {page === 'connectors' && <ConnectorsPage dark={dark} />}
      {page === 'settings' && (
        <div className="text-sm text-muted-foreground">
          Settings is coming in a later batch.
        </div>
      )}
    </AdminShell>
  )
}
