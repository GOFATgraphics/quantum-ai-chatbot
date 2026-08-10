import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, Shield, X } from 'lucide-react'
import { supabase, type Profile } from '../../lib/supabase'

type Props = {
  dark: boolean
  currentUserId: string
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

export default function Users({ dark, currentUserId }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, email, preferred_name, is_admin, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(500)

      if (err) throw err
      setUsers((data || []) as Profile[])
    } catch (e: any) {
      console.warn('Users load error', e)
      setError(e?.message || 'Failed to load users')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const email = (u.email || '').toLowerCase()
      const name = (u.preferred_name || '').toLowerCase()
      return email.includes(q) || name.includes(q) || u.id.toLowerCase().includes(q)
    })
  }, [users, query])

  const toggleAdmin = async (u: Profile) => {
    if (u.id === currentUserId) {
      setError("You can't remove your own admin access from here.")
      return
    }
    const next = !u.is_admin
    const label = next ? 'grant admin to' : 'remove admin from'
    if (!window.confirm('Really ' + label + ' ' + (u.email || u.preferred_name || u.id) + '?')) return

    setTogglingId(u.id)
    setError(null)
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ is_admin: next, updated_at: new Date().toISOString() })
        .eq('id', u.id)

      if (err) throw err
      setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, is_admin: next } : p)))
    } catch (e: any) {
      console.warn('toggle admin', e)
      setError(e?.message || 'Failed to update admin. Check RLS allows admin UPDATE on profiles.')
    } finally {
      setTogglingId(null)
    }
  }

  const cardBg = dark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-200 shadow-sm'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const title = dark ? 'text-white' : 'text-slate-900'
  const rowHover = dark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'
  const border = dark ? 'border-white/5' : 'border-slate-100'

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Users</h2>
          <p className={'mt-1 text-sm ' + muted}>
            {loading ? 'Loading…' : users.length + ' profile' + (users.length === 1 ? '' : 's')}
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
          placeholder="Search by email, name, or id"
          className={
            'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm ' +
            (dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')
          }
          aria-label="Search users"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className={'p-1 rounded-lg ' + (dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')} aria-label="Clear search">
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
                <th className={'px-4 py-3 font-medium ' + muted}>User</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' hidden sm:table-cell'}>Joined</th>
                <th className={'px-4 py-3 font-medium ' + muted}>Role</th>
                <th className={'px-4 py-3 font-medium ' + muted + ' w-28'}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <Loader2 className={'w-5 h-5 animate-spin mx-auto ' + muted} />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className={'px-4 py-12 text-center ' + muted}>
                    {query.trim() ? 'No matching users' : 'No users found'}
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const name = u.preferred_name || (u.email ? u.email.split('@')[0] : 'User')
                const initial = name.charAt(0).toUpperCase()
                const isSelf = u.id === currentUserId
                const busy = togglingId === u.id
                return (
                  <tr key={u.id} className={'border-b last:border-0 ' + border + ' ' + rowHover}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className={'font-medium truncate ' + title}>
                            {name}
                            {isSelf ? <span className={'ml-1.5 text-xs font-normal ' + muted}>(you)</span> : null}
                          </div>
                          <div className={'text-xs truncate ' + muted}>{u.email || u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className={'px-4 py-3 ' + muted + ' hidden sm:table-cell'}>{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3">
                      {u.is_admin ? (
                        <span
                          className={
                            'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ' +
                            (dark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-700')
                          }
                        >
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      ) : (
                        <span className={'text-xs ' + muted}>User</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={() => toggleAdmin(u)}
                        className={
                          'text-xs font-medium px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 ' +
                          (u.is_admin
                            ? dark
                              ? 'bg-white/10 text-slate-300 hover:bg-white/15'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : dark
                              ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100')
                        }
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : u.is_admin ? 'Revoke' : 'Make admin'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className={'text-xs ' + (dark ? 'text-slate-600' : 'text-slate-400')}>
        You cannot revoke your own admin. Toggle needs an UPDATE policy for admins on profiles.
      </p>
    </div>
  )
}
