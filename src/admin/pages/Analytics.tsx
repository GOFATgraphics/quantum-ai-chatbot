import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, RefreshCw, AlertTriangle, Users, MessagesSquare, MessageSquare,
  StickyNote, Plug, TrendingUp, Clock, FolderKanban,
} from 'lucide-react'
import { adminFetch, relativeTime } from '../adminApi'

type Props = { dark: boolean }

type DayPoint = { date: string; count: number }

type Analytics = {
  generated_at: string
  window_days: number
  truncated: boolean
  totals: {
    users: number | null; conversations: number | null; messages: number | null
    notes: number | null; notes_open: number | null; projects: number | null; connectors: number | null
  }
  growth: { new_users_7d: number | null; new_users_30d: number | null; signups_per_day: DayPoint[] }
  activity: {
    dau: number; wau: number; mau: number
    messages_30d: number; user_messages_30d: number; assistant_messages_30d: number
    conversations_30d: number
    avg_messages_per_conversation: number; avg_messages_per_active_user: number
    messages_per_day: DayPoint[]; conversations_per_day: DayPoint[]
    by_hour_utc: { hour: number; count: number }[]
  }
  connectors: { by_provider: Record<string, number>; adoption_rate: number; users_with_connector: number }
  notes: {
    by_status: Record<string, number>; by_type: Record<string, number>
    by_priority: Record<string, number>; overdue: number
  }
  users: {
    id: string; email: string | null; name: string | null; is_admin: boolean
    created_at: string; last_active: string | null
    conversations: number; messages_30d: number; notes: number; notes_open: number
    connectors: string[]
  }[]
}

/** Minimal inline bar chart — no chart library, scales to the tallest bar. */
function Bars({ data, label }: { data: DayPoint[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col justify-end group relative">
            <div
              className="rounded-sm transition-all bg-foreground/70"
              style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
            />
            <div
              className={
                'pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap ' +
                'opacity-0 group-hover:opacity-100 transition text-[10px] px-1.5 py-0.5 rounded ' +
                'bg-popover text-popover-foreground'
              }
            >
              {d.date.slice(5)}: {d.count} {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  )
}

export default function Analytics(_props: Props) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminFetch<Analytics>('/api/admin/analytics'))
    } catch (e: any) {
      setError(e?.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const cardBg = 'bg-card border-border shadow-sm'
  const muted = 'text-muted-foreground'
  const faint = 'text-muted-foreground'
  const title = 'text-foreground'
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString())

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className={'w-6 h-6 animate-spin ' + muted} />
      </div>
    )
  }

  const cards = data
    ? [
        { label: 'Total users', value: fmt(data.totals.users), hint: `+${fmt(data.growth.new_users_7d)} this week`, icon: Users },
        { label: 'Conversations', value: fmt(data.totals.conversations), hint: `${fmt(data.activity.conversations_30d)} in ${data.window_days}d`, icon: MessageSquare },
        { label: 'Messages', value: fmt(data.totals.messages), hint: `${fmt(data.activity.messages_30d)} in ${data.window_days}d`, icon: MessagesSquare },
        { label: 'Notes', value: fmt(data.totals.notes), hint: `${fmt(data.totals.notes_open)} open · ${fmt(data.notes.overdue)} overdue`, icon: StickyNote },
        { label: 'Active today', value: fmt(data.activity.dau), hint: `${fmt(data.activity.wau)} weekly · ${fmt(data.activity.mau)} monthly`, icon: TrendingUp },
        { label: 'Connectors', value: fmt(data.totals.connectors), hint: `${data.connectors.adoption_rate}% of users`, icon: Plug },
        { label: 'Projects', value: fmt(data.totals.projects), hint: 'All workspaces', icon: FolderKanban },
        { label: 'Msgs / chat', value: String(data.activity.avg_messages_per_conversation), hint: `${data.activity.avg_messages_per_active_user} per active user`, icon: Clock },
      ]
    : []

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Analytics</h2>
          <p className={'mt-1 text-sm ' + muted}>
            Product-wide metrics{data ? ` · last ${data.window_days} days · updated ${relativeTime(data.generated_at)}` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={
            'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 ' +
            'bg-secondary text-secondary-foreground hover:bg-accent'
          }
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div
          className={
            'rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ' +
            'border-destructive/30 bg-destructive/10 text-destructive'
          }
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <>
          {data.truncated && (
            <div
              className={
                'rounded-xl border px-4 py-3 text-sm ' +
                'border-border bg-muted text-muted-foreground'
              }
            >
              Message volume hit the per-request row cap, so {data.window_days}-day figures are a floor, not exact.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((c) => {
              const Icon = c.icon
              return (
                <div key={c.label} className={'rounded-2xl border p-4 ' + cardBg}>
                  <div className="flex items-center justify-between gap-2">
                    <div className={'text-[11px] font-medium uppercase tracking-wider ' + faint}>{c.label}</div>
                    <Icon className={'w-4 h-4 shrink-0 ' + faint} />
                  </div>
                  <div className={'mt-2 text-2xl font-semibold tabular-nums ' + title}>{c.value}</div>
                  <div className={'mt-1 text-xs ' + faint}>{c.hint}</div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>Messages per day</h3>
              <Bars data={data.activity.messages_per_day} label="msgs" />
              <p className={'mt-3 text-xs ' + faint}>
                {fmt(data.activity.user_messages_30d)} from users · {fmt(data.activity.assistant_messages_30d)} from Quantumy
              </p>
            </div>
            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>New chats per day</h3>
              <Bars data={data.activity.conversations_per_day} label="chats" />
            </div>
            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>Signups per day</h3>
              <Bars data={data.growth.signups_per_day} label="signups" />
              <p className={'mt-3 text-xs ' + faint}>
                {fmt(data.growth.new_users_30d)} new in {data.window_days} days
              </p>
            </div>
            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>Activity by hour (UTC)</h3>
              <Bars
                data={data.activity.by_hour_utc.map((h) => ({ date: String(h.hour).padStart(2, '0') + '-00', count: h.count }))}
                label="msgs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>Connector adoption</h3>
              {Object.keys(data.connectors.by_provider).length === 0 ? (
                <p className={'text-sm ' + muted}>No connected accounts.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.connectors.by_provider)
                    .sort((a, b) => b[1] - a[1])
                    .map(([provider, count]) => (
                      <div key={provider} className="flex items-center gap-3">
                        <span className="text-sm flex-1 text-foreground">
                          {provider.replace(/_/g, ' ')}
                        </span>
                        <div className="h-1.5 w-28 rounded-full overflow-hidden bg-muted">
                          <div
                            className="h-full bg-foreground/70"
                            style={{ width: `${(count / Math.max(1, data.totals.users || 1)) * 100}%` }}
                          />
                        </div>
                        <span className={'text-sm tabular-nums w-8 text-right ' + muted}>{count}</span>
                      </div>
                    ))}
                </div>
              )}
              <p className={'mt-3 text-xs ' + faint}>
                {data.connectors.users_with_connector} of {fmt(data.totals.users)} users have at least one
              </p>
            </div>

            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>Notes breakdown</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ['By status', data.notes.by_status],
                  ['By type', data.notes.by_type],
                ].map(([heading, obj]) => (
                  <div key={heading as string}>
                    <div className={'text-[11px] font-medium uppercase tracking-wider mb-1.5 ' + faint}>
                      {heading as string}
                    </div>
                    {Object.entries(obj as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-foreground">{k.replace(/_/g, ' ')}</span>
                        <span className={'tabular-nums ' + muted}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {data.notes.overdue > 0 && (
                <p className="mt-3 text-xs text-destructive">
                  {data.notes.overdue} open note{data.notes.overdue === 1 ? '' : 's'} past due
                </p>
              )}
            </div>
          </div>

          <div className={'rounded-2xl border overflow-hidden ' + cardBg}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className={'text-sm font-semibold ' + title}>Per-user activity</h3>
              <p className={'mt-0.5 text-xs ' + faint}>Ranked by messages in the last {data.window_days} days</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={'text-left ' + faint}>
                    {['User', 'Msgs 30d', 'Chats', 'Notes', 'Connectors', 'Last active'].map((h) => (
                      <th key={h} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-2.5 min-w-[180px]">
                        <div className="font-medium truncate text-foreground">
                          {u.name || u.email || u.id.slice(0, 8)}
                          {u.is_admin && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground">
                              admin
                            </span>
                          )}
                        </div>
                        {u.name && u.email && <div className={'text-[11px] truncate ' + faint}>{u.email}</div>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground">{u.messages_30d}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground">{u.conversations}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground">
                        {u.notes}{u.notes_open > 0 && <span className={faint}> ({u.notes_open} open)</span>}
                      </td>
                      <td className={'px-4 py-2.5 ' + muted}>
                        {u.connectors.length === 0 ? '—' : u.connectors.length}
                      </td>
                      <td className={'px-4 py-2.5 whitespace-nowrap ' + muted}>{relativeTime(u.last_active)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
