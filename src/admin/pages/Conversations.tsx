import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

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

export default function Conversations({ dark }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('conversations')
        .select('id, title, user_id, project_id, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(300)

      if (err) throw err
      const list = (data || []) as Row[]

      const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))]
      const profileMap: Record<string, { email: string | null; preferred_name: string | null }> = {}

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, preferred_name')
          .in('id', userIds)
        for (const p of profiles || []) {
          profileMap[p.id] = { email: p.email, preferred_name: p.preferred_name }
        }
      }

      setRows(
        list.map((r) => ({
          ...r,
          owner_email: profileMap[r.user_id]?.email ?? null,
          owner_name: profileMap[r.user_id]?.preferred_name ?? null,
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

  const cardBg = dark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-200 shadow-sm'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const title = dark ? 'text-white' : 'text-slate-900'
  const rowHover = dark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'
  const border = dark ? 'border-white/5' : 'border-slate-100'

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
            (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
          }
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div
        className={
          'flex items-center gap-2 h-11 rounded-xl px-3 border ' +
          (dark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200')
        }
      >
        <Search className={'w-4 h-4 shrink-0 ' + muted} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, owner email, or id"
          className={
            'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm ' +
            (dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')
          }
          aria-label="Search conversations"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className={'p-1 rounded-lg ' + (dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')} aria-label="Clear">
            <X className={'w-4 h-4 ' + muted} />
          </button>
        )}
      </div>

      {error && (
        <div
          className={
            'rounded-xl border px-4 py-3 text-sm ' +
            (dark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800')
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
