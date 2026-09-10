import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, RefreshCw, Users, MessageSquare, Plug, DollarSign,
  Database, TrendingUp, TrendingDown, StickyNote, Brain, FolderKanban,
  AlertTriangle, Zap, Server,
} from 'lucide-react'
import { adminFetch, relativeTime } from '../adminApi'

type Props = { dark: boolean }

type Counts = {
  users: number; admins: number; new_users: number
  conversations: number | null; messages: number | null; messages_today: number
  notes_open: number; notes_overdue: number
  memories: number | null; projects: number | null
  connectors: number; mcp_servers: number | null
}

type Spend = {
  total_usd: number; last_7d_usd: number; prev_7d_usd: number; change_pct: number | null
  turns: number; output_tokens: number; billed_input_tokens: number
  cache_hit_rate: number; avg_cost_per_turn: number; tool_calls: number; web_searches: number
}

type TopUser = {
  id: string; name: string | null; email: string | null; is_admin: boolean
  cost_usd: number; turns: number; last_used: string | null; share_pct: number
}

type Overview = {
  generated_at: string
  window_days: number
  usage_installed: boolean
  counts: Counts
  spend: Spend
  activity: { date: string; messages: number; turns: number; cost_usd: number }[]
  people: { active_7d: number; active_30d: number; dormant: number; top: TopUser[] }
  connectors: { provider: string; count: number }[]
  by_model: { key: string; cost_usd: number }[]
  by_endpoint: { key: string; cost_usd: number }[]
}

const money = (n: number | null | undefined) => {
  const v = Number(n) || 0
  if (v === 0) return '$0'
  if (v < 0.01) return '$' + v.toFixed(4)
  if (v < 100) return '$' + v.toFixed(2)
  return '$' + Math.round(v).toLocaleString()
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString())

const tokens = (n: number | null | undefined) => {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + 'k'
  return String(v)
}

const PROVIDER_LABEL: Record<string, string> = {
  gmail: 'Gmail', google_drive: 'Drive', google_docs: 'Docs',
  google_sheets: 'Sheets', google_calendar: 'Calendar', outlook: 'Outlook', excel: 'Excel',
}

/** Ranked colours, so the same person reads the same in the chart and the list. */
const USER_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

const CHART_H = 96

const card = 'rounded-2xl border bg-card border-border shadow-sm'
const muted = 'text-muted-foreground'

/** A headline number with its own supporting line, so a figure never sits alone without units. */
function Stat({
  label, value, hint, icon: Icon, tone, loading,
}: {
  label: string; value: string; hint?: string
  icon: any; tone?: 'default' | 'warn'; loading?: boolean
}) {
  return (
    <div className={card + ' p-4'}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={'w-4 h-4 shrink-0 ' + (tone === 'warn' ? 'text-destructive' : 'text-muted-foreground')} />
      </div>
      <div className={'mt-2 text-2xl font-semibold tabular-nums ' + (tone === 'warn' ? 'text-destructive' : 'text-foreground')}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin opacity-50" /> : value}
      </div>
      {hint && <div className={'mt-1 text-xs ' + muted}>{hint}</div>}
    </div>
  )
}

/**
 * Daily activity. Heights are in pixels off a fixed chart height rather than
 * percentages: a percentage resolves against the parent, and a flex item under
 * items-end takes its height from its content, so a percentage of it collapses
 * to nothing.
 */
function ActivityChart({ data, metric }: { data: Overview['activity']; metric: 'cost_usd' | 'messages' }) {
  const max = Math.max(1e-9, ...data.map((d) => Number(d[metric]) || 0))
  const fmt = metric === 'cost_usd' ? money : (n: number) => n.toLocaleString()
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: CHART_H }}>
        {data.map((d) => {
          const v = Number(d[metric]) || 0
          return (
            <div key={d.date} className="flex-1 flex flex-col justify-end group relative min-w-0">
              <div
                className={'rounded-sm ' + (v > 0 ? 'bg-foreground/70' : 'bg-border')}
                style={{ height: v > 0 ? Math.max(3, (v / max) * CHART_H) : 2 }}
              />
              <div
                className={
                  'pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap ' +
                  'opacity-0 group-hover:opacity-100 transition text-[10px] px-2 py-1 rounded shadow-lg ' +
                  'bg-popover text-popover-foreground border border-border'
                }
              >
                {d.date}: {fmt(v)}
                {metric === 'cost_usd' && d.turns > 0 && ` · ${d.turns} turns`}
              </div>
            </div>
          )
        })}
      </div>
      <div className={'flex justify-between mt-1.5 text-[10px] ' + muted}>
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  )
}

/** Share of spend as one bar, which reads faster than a column of percentages. */
function ShareBar({ users, total }: { users: TopUser[]; total: number }) {
  if (total <= 0) return null
  return (
    <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-muted">
      {users.map((u, i) => (
        <div
          key={u.id}
          style={{ width: `${(u.cost_usd / total) * 100}%`, backgroundColor: USER_COLORS[i % USER_COLORS.length] }}
          title={`${u.name || u.email || u.id.slice(0, 8)}: ${money(u.cost_usd)}`}
        />
      ))}
    </div>
  )
}

export default function Overview(_props: Props) {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<'cost_usd' | 'messages'>('cost_usd')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminFetch<Overview>('/api/admin/overview'))
    } catch (e: any) {
      setError(e?.message || 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const c = data?.counts
  const s = data?.spend
  const trendUp = (s?.change_pct ?? 0) > 0

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Overview</h2>
          <p className={'mt-1 text-sm ' + muted}>
            Last {data?.window_days ?? 30} days
            {data?.generated_at && <> · updated {relativeTime(data.generated_at)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-accent"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3 text-sm border-destructive/30 bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* The four questions worth answering first: what it costs, whether
              that is rising, who is actually here, and how much of the bill
              caching is already saving. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Spend"
              value={money(s!.total_usd)}
              hint={
                s!.change_pct === null
                  ? `${money(s!.last_7d_usd)} in the last 7 days`
                  : `${money(s!.last_7d_usd)} last 7d, ${Math.abs(s!.change_pct)}% ${trendUp ? 'up' : 'down'}`
              }
              icon={s!.change_pct === null ? DollarSign : trendUp ? TrendingUp : TrendingDown}
              tone={trendUp && (s!.change_pct ?? 0) > 50 ? 'warn' : 'default'}
            />
            <Stat
              label="Active users"
              value={`${data.people.active_7d} / ${c!.users}`}
              hint={`${data.people.active_30d} this month · ${data.people.dormant} dormant`}
              icon={Users}
            />
            <Stat
              label="Messages today"
              value={num(c!.messages_today)}
              hint={`${num(c!.messages)} all time · ${num(c!.conversations)} chats`}
              icon={MessageSquare}
            />
            <Stat
              label="Cache hit rate"
              value={`${s!.cache_hit_rate}%`}
              hint={`${tokens(s!.billed_input_tokens)} billed input`}
              icon={Zap}
            />
          </div>

          {/* Activity */}
          <div className={card}>
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Daily activity</h3>
                <p className={'mt-0.5 text-xs ' + muted}>
                  {s!.turns.toLocaleString()} billed turns · {money(s!.avg_cost_per_turn)} average
                </p>
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                {([['cost_usd', 'Cost'], ['messages', 'Messages']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMetric(key)}
                    className={
                      'px-3 py-1.5 text-xs font-medium transition ' +
                      (metric === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent')
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 py-4">
              <ActivityChart data={data.activity} metric={metric} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Who the spend belongs to */}
            <div className={card}>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Who is spending it</h3>
                <p className={'mt-0.5 text-xs ' + muted}>Share of the last {data.window_days} days</p>
              </div>
              <div className="px-5 py-4">
                {data.people.top.length === 0 ? (
                  <p className={'text-sm py-4 ' + muted}>No usage recorded yet.</p>
                ) : (
                  <>
                    <ShareBar users={data.people.top} total={s!.total_usd} />
                    <div className="mt-4 space-y-2.5">
                      {data.people.top.map((u, i) => (
                        <div key={u.id} className="flex items-center gap-2.5 text-sm">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: USER_COLORS[i % USER_COLORS.length] }}
                          />
                          <span className="flex-1 min-w-0 truncate text-foreground">
                            {u.name || u.email || u.id.slice(0, 8)}
                            {u.is_admin && (
                              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-foreground">
                                admin
                              </span>
                            )}
                          </span>
                          <span className={'tabular-nums text-xs w-10 text-right ' + muted}>{u.share_pct}%</span>
                          <span className="tabular-nums font-medium text-foreground w-16 text-right">
                            {money(u.cost_usd)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Where it goes */}
            <div className={card}>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Where it goes</h3>
                <p className={'mt-0.5 text-xs ' + muted}>By model and by endpoint</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="space-y-2">
                  <p className={'text-[11px] font-medium uppercase tracking-wider ' + muted}>Model</p>
                  {data.by_model.length === 0 && <p className={'text-sm ' + muted}>—</p>}
                  {data.by_model.map((m) => (
                    <div key={m.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{m.key.replace('claude-', '')}</span>
                      <span className={'tabular-nums shrink-0 ' + muted}>{money(m.cost_usd)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className={'text-[11px] font-medium uppercase tracking-wider ' + muted}>Endpoint</p>
                  {data.by_endpoint.length === 0 && <p className={'text-sm ' + muted}>—</p>}
                  {data.by_endpoint.map((e) => (
                    <div key={e.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate capitalize text-foreground">{e.key}</span>
                      <span className={'tabular-nums shrink-0 ' + muted}>{money(e.cost_usd)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 pb-4 pt-1 border-t border-border mt-1 grid grid-cols-3 gap-3 text-sm">
                {[
                  ['Tool calls', num(s!.tool_calls)],
                  ['Web searches', num(s!.web_searches)],
                  ['Output', tokens(s!.output_tokens)],
                ].map(([k, v]) => (
                  <div key={k as string} className="pt-3">
                    <p className={'text-[11px] ' + muted}>{k}</p>
                    <p className="tabular-nums font-medium text-foreground">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* What is connected, and what the workspace holds */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}>
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Connected accounts</h3>
                <p className={'mt-0.5 text-xs ' + muted}>
                  {c!.connectors} live connection{c!.connectors === 1 ? '' : 's'}
                  {c!.mcp_servers ? ` · ${c!.mcp_servers} MCP server${c!.mcp_servers === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <div className="px-5 py-4">
                {data.connectors.length === 0 ? (
                  <p className={'text-sm py-2 ' + muted}>Nothing connected yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.connectors.map((x) => (
                      <div
                        key={x.provider}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm"
                      >
                        <Plug className={'w-3.5 h-3.5 ' + muted} />
                        <span className="text-foreground">{PROVIDER_LABEL[x.provider] || x.provider}</span>
                        <span className={'tabular-nums text-xs ' + muted}>{x.count}</span>
                      </div>
                    ))}
                    {!!c!.mcp_servers && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm">
                        <Server className={'w-3.5 h-3.5 ' + muted} />
                        <span className="text-foreground">MCP</span>
                        <span className={'tabular-nums text-xs ' + muted}>{c!.mcp_servers}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Open notes"
                value={num(c!.notes_open)}
                hint={c!.notes_overdue > 0 ? `${c!.notes_overdue} overdue` : 'None overdue'}
                icon={c!.notes_overdue > 0 ? AlertTriangle : StickyNote}
                tone={c!.notes_overdue > 0 ? 'warn' : 'default'}
              />
              <Stat label="Saved memories" value={num(c!.memories)} hint="Facts across all users" icon={Brain} />
              <Stat label="Projects" value={num(c!.projects)} hint="Workspaces in use" icon={FolderKanban} />
              <Stat
                label="New users"
                value={num(c!.new_users)}
                hint={`in ${data.window_days} days · ${c!.admins} admin${c!.admins === 1 ? '' : 's'}`}
                icon={Database}
              />
            </div>
          </div>

          {!data.usage_installed && (
            <div className={'rounded-xl border px-4 py-3 text-sm border-border bg-muted ' + muted}>
              Token usage is not recorded yet. Run supabase/token-usage.sql to populate the spend figures.
            </div>
          )}

          <p className={'text-xs ' + muted}>
            Counted server-side with the service role and gated by an is_admin check. Costs are
            estimates at Anthropic list price. Trend compares the last 7 days with the 7 before it.
          </p>
        </>
      )}
    </div>
  )
}
