import { useEffect, useState } from 'react'
import { Loader2, Link2, Unlink, Check } from 'lucide-react'
import { supabase, CONNECTOR_CATALOG, type Connector } from '../lib/supabase'
import {
  GmailIcon, DriveIcon, SheetsIcon, DocsIcon, CalendarIcon, OutlookIcon, ExcelIcon,
} from './BrandIcons'

type Props = {
  dark: boolean
  accessToken: string
}

const BRAND: Record<string, React.ReactNode> = {
  gmail: <GmailIcon size={26} />,
  google_drive: <DriveIcon size={26} />,
  google_sheets: <SheetsIcon size={26} />,
  google_docs: <DocsIcon size={26} />,
  google_calendar: <CalendarIcon size={26} />,
  outlook: <OutlookIcon size={26} />,
  excel: <ExcelIcon size={26} />,
}

export default function Connectors({ dark, accessToken }: Props) {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('connectors')
      .select('id, user_id, provider, account_email, status, scopes, created_at, updated_at')
      .eq('status', 'connected')
    if (!err && data) setConnectors(data as Connector[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') || params.get('connector_error')) {
      load()
      const url = new URL(window.location.href)
      url.searchParams.delete('connected')
      url.searchParams.delete('connector_error')
      window.history.replaceState({}, '', url.pathname)
    }
  }, [])

  const getConnected = (provider: string) =>
    connectors.find((c) => c.provider === provider && c.status === 'connected')

  const connect = async (provider: string) => {
    setError(null)
    setBusy(provider)
    try {
      const res = await fetch(`/api/connectors/google-start?provider=${provider}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start connection')
      }
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message || 'Failed to connect')
      setBusy(null)
    }
  }

  const disconnect = async (provider: string) => {
    setError(null)
    setBusy(provider)
    try {
      const res = await fetch('/api/connectors/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Disconnect failed')
      setConnectors((prev) => prev.filter((c) => c.provider !== provider))
    } catch (e: any) {
      setError(e.message || 'Failed to disconnect')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className={`text-xs leading-relaxed ${textMuted}`}>
        Connect sources one at a time. Quantumy only accesses what you explicitly connect.
      </p>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {CONNECTOR_CATALOG.map((item) => {
            const connected = getConnected(item.provider)
            const isBusy = busy === item.provider

            return (
              <div
                key={item.provider}
                className={`glass-card flex items-center gap-3 rounded-2xl p-3 ${dark ? 'glass-card-dark' : 'glass-card-light'}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${dark ? 'bg-white/10' : 'bg-white shadow-sm'}`}>
                  {BRAND[item.provider]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-medium ${textMain}`}>{item.name}</span>
                    {connected && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                        <Check className="w-3 h-3" /> Connected
                      </span>
                    )}
                    {!item.available && !connected && (
                      <span className={`text-[10px] ${textMuted}`}>Soon</span>
                    )}
                  </div>
                  {connected?.account_email ? (
                    <p className={`text-xs truncate ${textMuted}`}>{connected.account_email}</p>
                  ) : (
                    <p className={`text-xs ${textMuted}`}>{item.description}</p>
                  )}
                </div>

                {item.available ? (
                  connected ? (
                    <button
                      onClick={() => disconnect(item.provider)}
                      disabled={isBusy}
                      className={`shrink-0 h-8 px-3 rounded-xl text-xs font-medium transition flex items-center gap-1.5 ${dark ? 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10' : 'bg-white/60 border border-white/80 text-slate-600 hover:bg-white'}`}
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => connect(item.provider)}
                      disabled={isBusy}
                      className="shrink-0 h-8 px-3 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Connect
                    </button>
                  )
                ) : (
                  <span className={`shrink-0 text-xs ${textMuted}`}>—</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
