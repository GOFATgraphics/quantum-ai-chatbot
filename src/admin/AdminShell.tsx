import { useState } from 'react'
import { LayoutDashboard, Users, MessageSquare, Plug, Settings, ArrowLeft, Menu, X, Shield } from 'lucide-react'
import Logo from '../components/Logo'

export type AdminPage = 'overview' | 'users' | 'conversations' | 'connectors' | 'settings'

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
  { id: 'users', label: 'Users', icon: Users },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare, soon: true },
  { id: 'connectors', label: 'Connectors', icon: Plug, soon: true },
  { id: 'settings', label: 'Settings', icon: Settings, soon: true },
]

export default function AdminShell({ dark, email, activePage, onNavigate, onBackToApp, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const navContent = (
    <>
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <Logo size={32} dark={dark} />
        <div className="min-w-0">
          <div className={'text-sm font-semibold tracking-tight ' + (dark ? 'text-white' : 'text-slate-900')}>
            Quantumy Admin
          </div>
          <div className={'text-[11px] truncate ' + (dark ? 'text-slate-500' : 'text-slate-400')}>
            {email || 'Admin'}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map((item) => {
          const active = activePage === item.id
          const Icon = item.icon
          let btnClass = 'w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition '
          if (active) {
            btnClass += dark ? 'bg-white/10 text-white' : 'bg-indigo-50 text-indigo-700'
          } else {
            btnClass += dark
              ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
                    (dark ? 'bg-white/10 text-slate-500' : 'bg-slate-100 text-slate-400')
                  }
                >
                  Soon
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className={'p-3 border-t ' + (dark ? 'border-white/5' : 'border-slate-100')}>
        <button
          type="button"
          onClick={onBackToApp}
          className={
            'w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm transition ' +
            (dark ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-100')
          }
        >
          <ArrowLeft className="w-4 h-4" />
          Back to app
        </button>
      </div>
    </>
  )

  return (
    <div className={'min-h-dvh flex ' + (dark ? 'bg-[#0c0c10] text-slate-100' : 'bg-slate-50 text-slate-900')}>
      <aside
        className={
          'hidden md:flex w-60 shrink-0 flex-col border-r ' +
          (dark ? 'bg-[#111114] border-white/5' : 'bg-white border-slate-200')
        }
      >
        {navContent}
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
          <aside
            className={
              'fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] flex flex-col md:hidden shadow-2xl ' +
              (dark ? 'bg-[#111114]' : 'bg-white')
            }
          >
            <div className="absolute top-3 right-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className={
                  'w-9 h-9 rounded-full flex items-center justify-center ' +
                  (dark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100')
                }
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navContent}
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className={
            'h-14 shrink-0 flex items-center gap-3 px-4 border-b backdrop-blur-sm ' +
            (dark ? 'border-white/5 bg-[#111114]/80' : 'border-slate-200 bg-white/80')
          }
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={
              'md:hidden w-9 h-9 rounded-full flex items-center justify-center ' +
              (dark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100')
            }
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Shield className={'w-4 h-4 shrink-0 ' + (dark ? 'text-indigo-400' : 'text-indigo-600')} />
            <h1 className="text-sm font-semibold truncate capitalize">{activePage}</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
