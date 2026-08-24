import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Users, MessageSquare, MessagesSquare, Plug } from 'lucide-react'
import { adminFetch } from '../adminApi'

type Props = {
  dark: boolean
}

type Stats = {
  users: number | null
  conversations: number | null
  messagesToday: number | null
  connectors: number | null
}

export default function Overview(_props: Props) {
  const [stats, setStats] = useState<Stats>({
    users: null,
    conversations: null,
    messagesToday: null,
    connectors: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // Counted server-side. In the browser these are RLS-scoped to the
      // caller, which returns a small plausible number rather than an error.
      const data = await adminFetch<{
        users: number | null; conversations: number | null
        messagesToday: number | null; connectors: number | null
      }>('/api/admin/overview')
      setStats({
        users: data.users,
        conversations: data.conversations,
        messagesToday: data.messagesToday,
        connectors: data.connectors,
      })
      setUpdatedAt(new Date())
    } catch (e: any) {
      setError(e?.message || 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const fmt = (n: number | null) => {
    if (n === null) return '—'
    return n.toLocaleString()
  }

  const cards = [
    {
      label: 'Total users',
      value: fmt(stats.users),
      hint: 'Rows in profiles',
      icon: Users,
    },
    {
      label: 'Conversations',
      value: fmt(stats.conversations),
      hint: 'All chats',
      icon: MessageSquare,
    },
    {
      label: 'Messages today',
      value: fmt(stats.messagesToday),
      hint: 'Since midnight local',
      icon: MessagesSquare,
    },
    {
      label: 'Active connectors',
      value: fmt(stats.connectors),
      hint: 'Status = connected',
      icon: Plug,
    },
  ]

  const cardBg = 'bg-card border-border shadow-sm'
  const muted = 'text-muted-foreground'
  const title = 'text-foreground'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Overview</h2>
          <p className={'mt-1 text-sm ' + muted}>
            Live counts from Supabase. Refresh anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={
            'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 ' +
            'bg-secondary text-secondary-foreground hover:bg-accent'
          }
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className={'rounded-2xl border p-4 ' + cardBg}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {c.label}
                </div>
                <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
              </div>
              <div className={'mt-2 text-2xl font-semibold tabular-nums ' + title}>
                {loading && stats.users === null ? (
                  <Loader2 className="w-5 h-5 animate-spin opacity-50" />
                ) : (
                  c.value
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.hint}
              </div>
            </div>
          )
        })}
      </div>

      <div className={'rounded-2xl border p-5 ' + cardBg}>
        <h3 className={'text-sm font-semibold ' + title}>About these numbers</h3>
        <p className={'mt-1.5 text-sm leading-relaxed ' + muted}>
          Product-wide totals, counted on the server with the service role and gated by an{' '}
          <code className={'text-xs px-1.5 py-0.5 rounded bg-muted'}>is_admin</code> check on every
          request. They are deliberately not read from the browser: RLS scopes every table to its
          owner, so a client-side count would quietly return your own rows and look like the whole
          product. Widening RLS instead would expose those rows to anyone holding an admin session
          token, so the service-role key stays server-side.
        </p>
        {updatedAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Last updated {updatedAt.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  )
}
