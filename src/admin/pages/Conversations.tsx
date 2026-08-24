import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { adminFetch } from '../adminApi'

type Props = { dark: boolean }

type Row = {
  id: string
  title: string | null
  user_id: string
  project_id: string | null
  created_at: string
  updated_at: string
  owner_email?: string | null
  owner_name?: string | null
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function Conversations(_props: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // Owners are resolved server-side; RLS would hide every row but the
      // admin's own if this ran in the browser.
      const { conversations } = await adminFetch<{
        conversations: (Row & { owner: { email: string | null; name: string | null } | null })[]
      }>('/api/admin/conversations')

      setRows(
        (conversations || []).map((r) => ({
          ...r,
          owner_email: r.owner?.email ?? null,
          owner_name: r.owner?.name ?? null,
        })),
      )
    } catch (e: any) {
      console.warn('Conversations load', e)
      setError(e?.message || 'Failed to load conversations')
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
      const title = (r.title || '').toLowerCase()
      const email = (r.owner_email || '').toLowerCase()
      const name = (r.owner_name || '').toLowerCase()
      return title.includes(q) || email.includes(q) || name.includes(q) || r.id.includes(q)
    })
  }, [rows, query])

  const cardBg = 'bg-card border-border shadow-sm'
  const muted = 'text-muted-foreground'
  const title = 'text-foreground'
  const rowHover = 'hover:bg-accent'
  const border = 'border-border'

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Conversations</h2>
          <p className={'mt-1 text-sm ' + muted}>
            {loading ? 'Loading…' : rows.length + ' recent chat' + (rows.length === 1 ? '' : 's')}
            {query.trim() && !loading ? ' · ' + filtered.length + ' match' + (filtered.length === 1 ? '' : 'es') : ''}
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
          placeholder="Search title, owner email, or id"
          className={
            'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm ' +
            'text-foreground placeholder:text-muted-foreground'
          }
          aria-label="Search conversations"
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
                <th className={'px-4 py-3 font-medium ' + muted}>Title</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' hidden md:table-cell'}>Owner</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' hidden sm:table-cell'}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center">
                    <Loader2 className={'w-5 h-5 animate-spin mx-auto ' + muted} />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className={'px-4 py-12 text-center ' + muted}>
                    {query.trim() ? 'No matching conversations' : 'No conversations found'}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className={'border-b last:border-0 ' + border + ' ' + rowHover}>
                  <td className="px-4 py-3">
                    <div className={'font-medium truncate max-w-[280px] ' + title}>{r.title || 'New chat'}</div>
                    <div className={'text-xs truncate md:hidden ' + muted}>
                      {r.owner_name || r.owner_email || r.user_id.slice(0, 8)}
                    </div>
                  </td>
                  <td className={'px-4 py-3 hidden md:table-cell'}>
                    <div className={'truncate max-w-[200px] ' + title}>{r.owner_name || '—'}</div>
                    <div className={'text-xs truncate ' + muted}>{r.owner_email || r.user_id.slice(0, 8) + '…'}</div>
                  </td>
                  <td className={'px-4 py-3 whitespace-nowrap hidden sm:table-cell ' + muted}>
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
