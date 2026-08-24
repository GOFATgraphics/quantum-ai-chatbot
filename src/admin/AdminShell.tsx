import { useState } from 'react'
import { LayoutDashboard, Users, MessageSquare, Plug, Settings, ArrowLeft, Menu, X, Shield, BarChart3, StickyNote } from 'lucide-react'
import Logo from '../components/Logo'

export type AdminPage = 'overview' | 'analytics' | 'users' | 'conversations' | 'notes' | 'connectors' | 'settings'

type Props = {
  dark: boolean
  email: string | null
  activePage: AdminPage
  onNavigate: (page: AdminPage) => void
  onBackToApp: () => void
  children: React.ReactNode
}

const NAV: { id: AdminPage; label: string; icon: typeof LayoutDashboard; soon?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'connectors', label: 'Connectors', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings, soon: true },
]

export default function AdminShell({ dark, email, activePage, onNavigate, onBackToApp, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const navContent = (
    <>
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <Logo size={32} dark={dark} />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Quantumy Admin
          </div>
          <div className="text-[11px] truncate text-muted-foreground">
            {email || 'Admin'}
          </div>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 space-y-0.5">
        {NAV.map((item) => {
          const active = activePage === item.id
          const Icon = item.icon
          let btnClass = 'w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition '
          if (active) {
            btnClass += 'bg-accent text-accent-foreground'
          } else {
            btnClass += 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }
          if (item.soon) btnClass += ' opacity-50 cursor-not-allowed'

          return (
            <button
              key={item.id}
              type="button"
              disabled={item.soon}
              onClick={() => {
                if (item.soon) return
                onNavigate(item.id)
                setMobileOpen(false)
              }}
              className={btnClass}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.soon && (
                <span
                  className={
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-md ' +
                    'bg-muted text-muted-foreground'
                  }
                >
                  Soon
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <button
          type="button"
          onClick={onBackToApp}
          className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm transition text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to app
        </button>
      </div>
    </>
  )

  return (
    // #root is height-locked with overflow:hidden for the chat shell, so this
    // must be bounded (h-full, not min-h-dvh) or its content spills past the
    // clip and becomes unreachable.
    <div className="h-full min-h-0 overflow-hidden flex bg-settings-canvas text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-settings-surface border-border">
        {navContent}
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] flex flex-col md:hidden shadow-2xl bg-settings-surface">
            <div className="absolute top-3 right-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navContent}
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b backdrop-blur-sm border-border bg-settings-surface">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 shrink-0 text-foreground" />
            <h1 className="text-sm font-semibold truncate capitalize">{activePage}</h1>
          </div>
        </header>

        <main
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.5rem))]"
          data-scrollable="true"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
