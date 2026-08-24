import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { type Connector } from '../../lib/supabase'
import { adminFetch } from '../adminApi'

type Props = { dark: boolean }

type Row = Connector & {
  owner_email?: string | null
  owner_name?: string | null
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  google_drive: 'Google Drive',
  google_sheets: 'Google Sheets',
  google_docs: 'Google Docs',
  google_calendar: 'Google Calendar',
  outlook: 'Outlook',
  excel: 'Excel Online',
}

export default function ConnectorsPage(_props: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // The route selects a fixed column list that excludes access_token and
      // refresh_token, so credentials never reach the browser.
      const { connectors, owners } = await adminFetch<{
        connectors: Connector[]
        owners: Record<string, { email: string | null; preferred_name: string | null }>
      }>('/api/admin/connectors')

      setRows(
        (connectors || []).map((r) => ({
          ...r,
          owner_email: owners?.[r.user_id]?.email ?? null,
          owner_name: owners?.[r.user_id]?.preferred_name ?? null,
        })),
      )
    } catch (e: any) {
      console.warn('Connectors load', e)
      setError(e?.message || 'Failed to load connectors')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const provider = (PROVIDER_LABELS[r.provider] || r.provider).toLowerCase()
      const account = (r.account_email || '').toLowerCase()
      const email = (r.owner_email || '').toLowerCase()
      const name = (r.owner_name || '').toLowerCase()
      const status = (r.status || '').toLowerCase()
      return provider.includes(q) || account.includes(q) || email.includes(q) || name.includes(q) || status.includes(q)
    })
  }, [rows, query])

  const connectedCount = rows.filter((r) => r.status === 'connected').length

  const cardBg = 'bg-card border-border shadow-sm'
  const muted = 'text-muted-foreground'
  const title = 'text-foreground'
  const rowHover = 'hover:bg-accent'
  const border = 'border-border'

  const statusClass = (status: string) => {
    if (status === 'connected') {
      return 'bg-secondary text-foreground'
    }
    if (status === 'error') {
      return 'bg-destructive/10 text-destructive'
    }
    return 'bg-muted text-muted-foreground'
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Connectors</h2>
          <p className={'mt-1 text-sm ' + muted}>
            {loading
              ? 'Loading…'
              : rows.length + ' total · ' + connectedCount + ' connected'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={
            'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 self-start ' +
            'bg-secondary text-secondary-foreground hover:bg-accent'
          }
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div
        className={
          'flex items-center gap-2 h-11 rounded-xl px-3 border ' +
          'bg-card border-border'
        }
      >
        <Search className={'w-4 h-4 shrink-0 ' + muted} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search provider, account, owner, status"
          className={
            'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm ' +
            'text-foreground placeholder:text-muted-foreground'
          }
          aria-label="Search connectors"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="p-1 rounded-lg hover:bg-accent" aria-label="Clear">
            <X className={'w-4 h-4 ' + muted} />
          </button>
        )}
      </div>

      {error && (
        <div
          className={
            'rounded-xl border px-4 py-3 text-sm ' +
            'border-destructive/30 bg-destructive/10 text-destructive'
          }
        >
          {error}
        </div>
      )}

      <div className={'rounded-2xl border overflow-hidden ' + cardBg}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={'border-b text-left ' + border}>
                <th className={'px-4 py-3 font-medium ' + muted}>Provider</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' hidden sm:table-cell'}>Account</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' hidden md:table-cell'}>Owner</th>
                <th className={'px-4 py-3 font-medium ' + muted}>Status</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' hidden lg:table-cell'}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className={'w-5 h-5 animate-spin mx-auto ' + muted} />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className={'px-4 py-12 text-center ' + muted}>
                    {query.trim() ? 'No matching connectors' : 'No connectors found'}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className={'border-b last:border-0 ' + border + ' ' + rowHover}>
                  <td className={'px-4 py-3 font-medium ' + title}>
                    {PROVIDER_LABELS[r.provider] || r.provider}
                  </td>
                  <td className={'px-4 py-3 hidden sm:table-cell ' + muted}>
                    <span className="truncate block max-w-[180px]">{r.account_email || '—'}</span>
                  </td>
                  <td className={'px-4 py-3 hidden md:table-cell'}>
                    <div className={'truncate max-w-[160px] ' + title}>{r.owner_name || '—'}</div>
                    <div className={'text-xs truncate ' + muted}>{r.owner_email || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={'text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ' + statusClass(r.status)}>
                      {r.status}
                    </span>
                  </td>
                  <td className={'px-4 py-3 whitespace-nowrap hidden lg:table-cell ' + muted}>
                    {formatDate(r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
