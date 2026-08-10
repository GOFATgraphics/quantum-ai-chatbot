import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  RefreshCw,
  Search,
  Shield,
  X,
  ChevronRight,
  ArrowLeft,
  MessageSquare,
  Calendar,
} from 'lucide-react'
import { supabase, type Profile, type Conversation, type DbMessage } from '../../lib/supabase'

type Props = {
  dark: boolean
  currentUserId: string
}

type DayGroup = {
  key: string
  label: string
  conversations: Conversation[]
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

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function dayKey(iso: string) {
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + day
  } catch {
    return iso.slice(0, 10)
  }
}

function dayLabel(key: string) {
  try {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const today = new Date()
    const todayKey = dayKey(today.toISOString())
    const yest = new Date()
    yest.setDate(yest.getDate() - 1)
    const yestKey = dayKey(yest.toISOString())
    if (key === todayKey) return 'Today'
    if (key === yestKey) return 'Yesterday'
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return key
  }
}

function displayName(u: Profile) {
  return u.preferred_name || (u.email ? u.email.split('@')[0] : 'User')
}

export default function Users({ dark, currentUserId }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [userChats, setUserChats] = useState<Conversation[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)

  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DbMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

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

  const loadUserChats = useCallback(async (userId: string) => {
    setChatsLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('conversations')
        .select('id, user_id, title, project_id, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(200)

      if (err) throw err
      setUserChats((data || []) as Conversation[])
    } catch (e: any) {
      console.warn('user chats', e)
      setError(e?.message || 'Failed to load conversations')
      setUserChats([])
    } finally {
      setChatsLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('messages')
        .select('id, conversation_id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500)

      if (err) throw err
      setMessages((data || []) as DbMessage[])
    } catch (e: any) {
      console.warn('messages', e)
      setError(e?.message || 'Failed to load messages')
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  const openUser = (u: Profile) => {
    setSelectedUser(u)
    setSelectedDay(null)
    setSelectedConv(null)
    setMessages([])
    setUserChats([])
    loadUserChats(u.id)
  }

  const backToUsers = () => {
    setSelectedUser(null)
    setSelectedDay(null)
    setSelectedConv(null)
    setUserChats([])
    setMessages([])
  }

  const openDay = (key: string) => {
    setSelectedDay(key)
    setSelectedConv(null)
    setMessages([])
  }

  const openConv = (c: Conversation) => {
    setSelectedConv(c)
    setMessages([])
    loadMessages(c.id)
  }

  const backFromConv = () => {
    setSelectedConv(null)
    setMessages([])
  }

  const backFromDay = () => {
    setSelectedDay(null)
    setSelectedConv(null)
    setMessages([])
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const email = (u.email || '').toLowerCase()
      const name = (u.preferred_name || '').toLowerCase()
      return email.includes(q) || name.includes(q) || u.id.toLowerCase().includes(q)
    })
  }, [users, query])

  const dayGroups: DayGroup[] = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const c of userChats) {
      const key = dayKey(c.updated_at || c.created_at)
      const list = map.get(key) || []
      list.push(c)
      map.set(key, list)
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, conversations]) => ({
        key,
        label: dayLabel(key),
        conversations,
      }))
  }, [userChats])

  const dayConversations = useMemo(() => {
    if (!selectedDay) return []
    return dayGroups.find((g) => g.key === selectedDay)?.conversations || []
  }, [dayGroups, selectedDay])

  const toggleAdmin = async (u: Profile, e?: React.MouseEvent) => {
    e?.stopPropagation()
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
      if (selectedUser?.id === u.id) setSelectedUser({ ...u, is_admin: next })
    } catch (err: any) {
      console.warn('toggle admin', err)
      setError(err?.message || 'Failed to update admin. Check RLS allows admin UPDATE on profiles.')
    } finally {
      setTogglingId(null)
    }
  }

  const cardBg = dark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-200 shadow-sm'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const title = dark ? 'text-white' : 'text-slate-900'
  const rowHover = dark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'
  const border = dark ? 'border-white/5' : 'border-slate-100'
  const chip = dark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'

  // ——— Message thread view ———
  if (selectedUser && selectedConv) {
    const name = displayName(selectedUser)
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={backFromConv}
            className={
              'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition ' +
              (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="min-w-0 flex-1">
            <div className={'text-sm font-semibold truncate ' + title}>{selectedConv.title || 'New chat'}</div>
            <div className={'text-xs truncate ' + muted}>
              {name}
              {selectedDay ? ' · ' + dayLabel(selectedDay) : ''}
            </div>
          </div>
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
          {messagesLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className={'w-5 h-5 animate-spin ' + muted} />
            </div>
          ) : messages.length === 0 ? (
            <div className={'py-16 text-center text-sm ' + muted}>No messages in this chat</div>
          ) : (
            <div className="p-4 space-y-3 max-h-[min(70dvh,640px)] overflow-y-auto">
              {messages.map((m) => {
                const isUser = m.role === 'user'
                return (
                  <div key={m.id} className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
                    <div
                      className={
                        'max-w-[min(100%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ' +
                        (isUser
                          ? dark
                            ? 'bg-indigo-500/25 text-indigo-50'
                            : 'bg-indigo-50 text-indigo-950'
                          : dark
                            ? 'bg-white/[0.06] text-slate-200'
                            : 'bg-slate-100 text-slate-800')
                      }
                    >
                      <div className={'text-[10px] font-medium uppercase tracking-wide mb-1 ' + muted}>
                        {isUser ? 'User' : 'Assistant'} · {formatTime(m.created_at)}
                      </div>
                      {m.content || '…'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ——— Day detail: list chats on that day ———
  if (selectedUser && selectedDay) {
    const name = displayName(selectedUser)
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={backFromDay}
            className={
              'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition ' +
              (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="min-w-0 flex-1">
            <div className={'text-sm font-semibold ' + title}>{dayLabel(selectedDay)}</div>
            <div className={'text-xs ' + muted}>
              {name} · {dayConversations.length} chat{dayConversations.length === 1 ? '' : 's'}
            </div>
          </div>
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
          {dayConversations.length === 0 ? (
            <div className={'py-12 text-center text-sm ' + muted}>No chats this day</div>
          ) : (
            <ul>
              {dayConversations.map((c) => (
                <li key={c.id} className={'border-b last:border-0 ' + border}>
                  <button
                    type="button"
                    onClick={() => openConv(c)}
                    className={'w-full text-left px-4 py-3.5 flex items-center gap-3 transition ' + rowHover}
                  >
                    <MessageSquare className={'w-4 h-4 shrink-0 ' + muted} />
                    <div className="min-w-0 flex-1">
                      <div className={'text-sm font-medium truncate ' + title}>{c.title || 'New chat'}</div>
                      <div className={'text-xs ' + muted}>
                        Updated {formatTime(c.updated_at || c.created_at)}
                      </div>
                    </div>
                    <ChevronRight className={'w-4 h-4 shrink-0 ' + muted} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ——— User detail: conversations by date ———
  if (selectedUser) {
    const name = displayName(selectedUser)
    const initial = name.charAt(0).toUpperCase()
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={backToUsers}
            className={
              'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition shrink-0 ' +
              (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
          >
            <ArrowLeft className="w-4 h-4" />
            Users
          </button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-base font-semibold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className={'text-lg font-semibold truncate ' + title}>{name}</div>
              <div className={'text-sm truncate ' + muted}>{selectedUser.email || selectedUser.id}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadUserChats(selectedUser.id)}
            disabled={chatsLoading}
            className={
              'h-9 w-9 rounded-xl flex items-center justify-center transition disabled:opacity-50 ' +
              (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
            aria-label="Refresh chats"
          >
            {chatsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedUser.is_admin && (
            <span
              className={
                'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ' +
                (dark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-700')
              }
            >
              <Shield className="w-3 h-3" />
              Admin
            </span>
          )}
          <span className={'text-[11px] font-medium px-2 py-0.5 rounded-md ' + chip}>
            Joined {formatDate(selectedUser.created_at)}
          </span>
          <span className={'text-[11px] font-medium px-2 py-0.5 rounded-md ' + chip}>
            {userChats.length} chat{userChats.length === 1 ? '' : 's'}
          </span>
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

        <div>
          <h3 className={'text-sm font-semibold mb-3 ' + title}>Conversations by date</h3>
          {chatsLoading && userChats.length === 0 ? (
            <div className="py-12 flex justify-center">
              <Loader2 className={'w-5 h-5 animate-spin ' + muted} />
            </div>
          ) : dayGroups.length === 0 ? (
            <div className={'rounded-2xl border py-12 text-center text-sm ' + cardBg + ' ' + muted}>
              No conversations yet
            </div>
          ) : (
            <div className="space-y-2">
              {dayGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => openDay(g.key)}
                  className={
                    'w-full rounded-2xl border px-4 py-3.5 flex items-center gap-3 text-left transition ' +
                    cardBg +
                    ' ' +
                    rowHover
                  }
                >
                  <div
                    className={
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ' +
                      (dark ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-600')
                    }
                  >
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={'text-sm font-semibold ' + title}>{g.label}</div>
                    <div className={'text-xs ' + muted}>
                      {g.conversations.length} chat{g.conversations.length === 1 ? '' : 's'}
                      {g.conversations[0]?.title
                        ? ' · ' + (g.conversations[0].title || '').slice(0, 40)
                        : ''}
                    </div>
                  </div>
                  <ChevronRight className={'w-4 h-4 shrink-0 ' + muted} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ——— User list ———
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Users</h2>
          <p className={'mt-1 text-sm ' + muted}>
            Tap a user to browse their chats by date
            {loading ? '' : ' · ' + users.length + ' profile' + (users.length === 1 ? '' : 's')}
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
          <button
            type="button"
            onClick={() => setQuery('')}
            className={'p-1 rounded-lg ' + (dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')}
            aria-label="Clear search"
          >
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
                const name = displayName(u)
                const initial = name.charAt(0).toUpperCase()
                const isSelf = u.id === currentUserId
                const busy = togglingId === u.id
                return (
                  <tr
                    key={u.id}
                    className={'border-b last:border-0 cursor-pointer ' + border + ' ' + rowHover}
                    onClick={() => openUser(u)}
                  >
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
                        <ChevronRight className={'w-4 h-4 shrink-0 sm:hidden ' + muted} />
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
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={(e) => toggleAdmin(u, e)}
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
        Tap a row to open that user&apos;s conversations grouped by date.
      </p>
    </div>
  )
}
