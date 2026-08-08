import { useEffect, useState } from 'react'
import { Loader2, Link2, Unplug } from 'lucide-react'
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
      const isMs = provider === 'outlook' || provider === 'excel'
      const startPath = isMs
        ? `/api/connectors/microsoft-start?provider=${provider}`
        : `/api/connectors/google-start?provider=${provider}`
      const res = await fetch(startPath, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start connection')
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
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json().catch(() => ({}))
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
      <p className={`text-sm ${textMuted}`}>
        Connect your work tools so Quantumy can search mail, files, calendar, Outlook, and Excel.
      </p>
      {error && (
        <div className={`rounded-xl px-3 py-2 text-sm ${dark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className={`w-5 h-5 animate-spin ${textMuted}`} /></div>
      ) : (
        <div className="space-y-2">
          {CONNECTOR_CATALOG.map((item) => {
            const connected = getConnected(item.provider)
            const isBusy = busy === item.provider
            return (
              <div
                key={item.provider}
                className={`flex items-center gap-3 rounded-2xl p-3 ${dark ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-slate-50 border border-slate-100'}`}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm">
                  {BRAND[item.provider]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${textMain}`}>{item.name}</p>
                  <p className={`text-xs truncate ${textMuted}`}>
                    {connected?.account_email || item.description}
                  </p>
                  {!item.available && !connected && (
                    <p className="text-[11px] text-slate-400 mt-0.5">Coming soon</p>
                  )}
                </div>
                {item.available ? (
                  connected ? (
                    <button
                      type="button"
                      onClick={() => disconnect(item.provider)}
                      disabled={isBusy}
                      className="shrink-0 h-8 px-3 rounded-xl text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 flex items-center gap-1.5"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => connect(item.provider)}
                      disabled={isBusy}
                      className="shrink-0 h-8 px-3 rounded-xl text-xs font-medium text-white bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 flex items-center gap-1.5"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Connect
                    </button>
                  )
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
