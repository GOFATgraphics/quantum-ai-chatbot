import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Loader2, RefreshCw, AlertTriangle, DollarSign, Coins, Database,
  Gauge, ChevronDown, ChevronRight, Zap,
} from 'lucide-react'
import { adminFetch, relativeTime } from '../adminApi'

type Props = { dark: boolean }

type Totals = {
  turns: number
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  tool_calls: number
  rounds: number
}

type Slice = { key: string; tokens: number }

type DayPoint = Totals & { date: string }

type UserUsage = Totals & {
  id: string
  email: string | null
  name: string | null
  is_admin: boolean
  last_used: string | null
  avg_peak_context_tokens: number
  max_peak_context_tokens: number
  avg_cost_per_turn: number
  breakdown: Slice[]
}

type Usage = {
  generated_at: string
  window_days: number
  truncated?: boolean
  not_installed?: boolean
  message?: string
  pricing_note?: string
  totals: Totals
  averages: {
    cost_per_turn: number; tokens_per_turn: number; output_per_turn: number
    rounds_per_turn: number; tool_calls_per_turn: number; duration_ms: number
  }
  cache: { hit_rate: number; read_tokens: number; write_tokens: number; estimated_savings_usd: number }
  context: {
    window: number; avg_peak_tokens: number; max_peak_tokens: number
    avg_fill_pct: number; max_fill_pct: number; breakdown: Slice[]; samples: number
  }
  by_day: DayPoint[]
  by_endpoint: Record<string, Totals>
  by_model: Record<string, Totals>
  users: UserUsage[]
  top_conversations: (Totals & { id: string; title: string; user: string | null; deleted: boolean })[]
}

/**
 * Colours are fixed per component so the same slice reads the same in the
 * overall bar and in every per-user bar below it.
 */
const SLICES: { key: string; label: string; color: string }[] = [
  { key: 'system_prompt', label: 'System prompt', color: 'bg-amber-500' },
  { key: 'user_context', label: 'Memory & project', color: 'bg-emerald-500' },
  { key: 'tools', label: 'Tool definitions', color: 'bg-violet-500' },
  { key: 'history', label: 'Conversation history', color: 'bg-sky-500' },
  { key: 'tool_results', label: 'Tool results', color: 'bg-rose-500' },
  { key: 'assistant', label: 'Assistant turns', color: 'bg-fuchsia-500' },
]

const tokenFmt = (n: number | null | undefined) => {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + 'k'
  return String(v)
}

const money = (n: number | null | undefined) => {
  const v = Number(n) || 0
  if (v === 0) return '$0'
  if (v < 0.01) return '$' + v.toFixed(4)
  if (v < 100) return '$' + v.toFixed(2)
  return '$' + Math.round(v).toLocaleString()
}

/**
 * The context-window bar: every prompt component as a share of the window,
 * with whatever is left shown as free space. Slices are estimates rescaled to
 * the real billed input, so the total is exact even though the split is not.
 */
function ContextBar({ breakdown, windowSize, compact }: { breakdown: Slice[]; windowSize: number; compact?: boolean }) {
  const map = new Map(breakdown.map((b) => [b.key, Number(b.tokens) || 0]))
  const used = SLICES.reduce((sum, s) => sum + (map.get(s.key) || 0), 0)
  const free = Math.max(0, windowSize - used)
  const denom = Math.max(1, Math.max(windowSize, used))
  const pct = (n: number) => (n / denom) * 100

  return (
    <div>
      <div className={'flex w-full rounded-full overflow-hidden bg-muted ' + (compact ? 'h-2' : 'h-3.5')}>
        {SLICES.map((s) => {
          const v = map.get(s.key) || 0
          if (v <= 0) return null
          return (
            <div
              key={s.key}
              className={s.color}
              style={{ width: `${pct(v)}%` }}
              title={`${s.label}: ${tokenFmt(v)} tokens (${pct(v).toFixed(1)}%)`}
            />
          )
        })}
        {free > 0 && <div className="bg-muted flex-1" title={`Free space: ${tokenFmt(free)} tokens`} />}
      </div>

      {!compact && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            ...SLICES.map((s) => ({ ...s, tokens: map.get(s.key) || 0 })),
            // Only meaningful when the bar is measured against the model window;
            // per-user bars are scaled to the prompt itself and have no slack.
            ...(free > 0 ? [{ key: '__free', label: 'Free space', color: 'bg-muted border border-border', tokens: free }] : []),
          ].map((s) => (
            <div key={s.key} className="flex items-center gap-2.5 text-sm">
              <span className={'w-2.5 h-2.5 rounded-sm shrink-0 ' + s.color} />
              <span className="flex-1 truncate text-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">{tokenFmt(s.tokens)}</span>
              <span className="tabular-nums w-12 text-right text-muted-foreground">
                {pct(s.tokens).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Daily spend, scaled to the most expensive day in the window. */
function CostBars({ data }: { data: DayPoint[] }) {
  const max = Math.max(0.000001, ...data.map((d) => d.cost_usd))
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col justify-end group relative">
            <div
              className="rounded-sm transition-all bg-foreground/70"
              style={{ height: `${Math.max(2, (d.cost_usd / max) * 100)}%` }}
            />
            <div
              className={
                'pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap ' +
                'opacity-0 group-hover:opacity-100 transition text-[10px] px-1.5 py-0.5 rounded ' +
                'bg-popover text-popover-foreground'
              }
            >
              {d.date.slice(5)}: {money(d.cost_usd)} · {d.turns} turns
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

export default function Usage(_props: Props) {
  const [data, setData] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminFetch<Usage>('/api/admin/usage', { days }))
    } catch (e: any) {
      setError(e?.message || 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { void load() }, [load])

  const cardBg = 'bg-card border-border shadow-sm'
  const faint = 'text-muted-foreground'
  const title = 'text-foreground'

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const cards = data && !data.not_installed
    ? [
        {
          label: 'Estimated cost', value: money(data.totals.cost_usd),
          hint: `${money(data.averages.cost_per_turn)} per turn`, icon: DollarSign,
        },
        {
          label: 'Tokens billed', value: tokenFmt(data.totals.total_tokens),
          hint: `${tokenFmt(data.averages.tokens_per_turn)} per turn`, icon: Coins,
        },
        {
          label: 'Model turns', value: data.totals.turns.toLocaleString(),
          hint: `${data.averages.rounds_per_turn} API calls · ${data.averages.tool_calls_per_turn} tools each`, icon: Zap,
        },
        {
          label: 'Cache hit rate', value: `${data.cache.hit_rate}%`,
          hint: `saving ~${money(data.cache.estimated_savings_usd)}`, icon: Database,
        },
      ]
    : []

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>Token usage</h2>
          <p className={'mt-1 text-sm ' + faint}>
            What Quantumy spends on the model{data ? ` · last ${data.window_days} days · updated ${relativeTime(data.generated_at)}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-border">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={
                  'h-9 px-3 text-sm font-medium transition ' +
                  (days === d ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:bg-accent/50')
                }
              >
                {d}d
              </button>
            ))}
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

      {data?.not_installed && (
        <div className={'rounded-2xl border p-6 ' + cardBg}>
          <h3 className={'text-sm font-semibold ' + title}>Usage tracking is not set up yet</h3>
          <p className={'mt-2 text-sm ' + faint}>{data.message}</p>
        </div>
      )}

      {data && !data.not_installed && (
        <>
          {data.totals.turns === 0 && (
            <div className={'rounded-xl border px-4 py-3 text-sm border-border bg-muted ' + faint}>
              No usage recorded in this window yet. Tracking starts at the deploy that added it — there is no
              history before that.
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

          <div className={'rounded-2xl border p-5 ' + cardBg}>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3 className={'text-sm font-semibold ' + title}>Context window</h3>
                <p className={'mt-0.5 text-xs ' + faint}>
                  Average of the largest request in each turn · {tokenFmt(data.context.avg_peak_tokens)} of{' '}
                  {tokenFmt(data.context.window)} tokens ({data.context.avg_fill_pct}% full)
                </p>
              </div>
              <div className="text-right">
                <div className={'text-[11px] uppercase tracking-wider ' + faint}>Fullest turn</div>
                <div className={'text-sm font-semibold tabular-nums ' + title}>
                  {tokenFmt(data.context.max_peak_tokens)} · {data.context.max_fill_pct}%
                </div>
              </div>
            </div>
            <ContextBar breakdown={data.context.breakdown} windowSize={data.context.window} />
            <p className={'mt-4 text-xs ' + faint}>
              Slice sizes are measured from the prompt and rescaled to the tokens Anthropic actually billed, so the
              total is exact and the split is close. Based on {data.context.samples.toLocaleString()} turns.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>Spend per day</h3>
              <CostBars data={data.by_day} />
              <p className={'mt-3 text-xs ' + faint}>{data.pricing_note}</p>
            </div>

            <div className={'rounded-2xl border p-5 ' + cardBg}>
              <h3 className={'text-sm font-semibold mb-3 ' + title}>How the bill splits</h3>
              <div className="space-y-2.5">
                {[
                  ['Fresh input', data.totals.input_tokens],
                  ['Cache reads', data.totals.cache_read_input_tokens],
                  ['Cache writes', data.totals.cache_creation_input_tokens],
                  ['Output', data.totals.output_tokens],
                ].map(([label, value]) => {
                  const v = value as number
                  const pct = data.totals.total_tokens > 0 ? (v / data.totals.total_tokens) * 100 : 0
                  return (
                    <div key={label as string} className="flex items-center gap-3">
                      <span className="text-sm flex-1 text-foreground">{label as string}</span>
                      <div className="h-1.5 w-28 rounded-full overflow-hidden bg-muted">
                        <div className="h-full bg-foreground/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={'text-sm tabular-nums w-14 text-right ' + faint}>{tokenFmt(v)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {Object.entries(data.by_endpoint).map(([ep, t]) => (
                  <div key={ep} className="flex items-center justify-between gap-2">
                    <span className="text-foreground capitalize">{ep}</span>
                    <span className={'tabular-nums ' + faint}>{money(t.cost_usd)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={'rounded-2xl border overflow-hidden ' + cardBg}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className={'text-sm font-semibold ' + title}>Per-user spend</h3>
              <p className={'mt-0.5 text-xs ' + faint}>
                Ranked by cost · click a row for that user's context breakdown
              </p>
            </div>
            {data.users.length === 0 ? (
              <p className={'px-5 py-6 text-sm ' + faint}>No per-user usage recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={'text-left ' + faint}>
                      {['User', 'Cost', 'Per turn', 'Turns', 'Tokens', 'Avg context', 'Last used', ''].map((h) => (
                        <th key={h} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => {
                      const open = expanded === u.id
                      return (
                        <Fragment key={u.id}>
                          <tr
                            className="border-t border-border cursor-pointer hover:bg-accent/40 transition"
                            onClick={() => setExpanded(open ? null : u.id)}
                          >
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
                            <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{money(u.cost_usd)}</td>
                            <td className={'px-4 py-2.5 tabular-nums ' + faint}>{money(u.avg_cost_per_turn)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-foreground">{u.turns.toLocaleString()}</td>
                            <td className={'px-4 py-2.5 tabular-nums ' + faint}>{tokenFmt(u.total_tokens)}</td>
                            <td className={'px-4 py-2.5 tabular-nums ' + faint}>
                              {tokenFmt(u.avg_peak_context_tokens)}
                            </td>
                            <td className={'px-4 py-2.5 whitespace-nowrap ' + faint}>{relativeTime(u.last_used)}</td>
                            <td className={'px-4 py-2.5 ' + faint}>
                              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-t border-border bg-muted/40">
                              <td colSpan={8} className="px-4 py-4">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                  <div className="lg:col-span-2">
                                    <div className={'text-[11px] font-medium uppercase tracking-wider mb-2 ' + faint}>
                                      What fills their prompt · avg {tokenFmt(u.avg_peak_context_tokens)}, peak{' '}
                                      {tokenFmt(u.max_peak_context_tokens)}
                                    </div>
                                    {/* Scaled to this user's own typical prompt rather than the model
                                        window: percentages read as share of what they send, which is
                                        what tells you where their spend goes. */}
                                    <ContextBar breakdown={u.breakdown} windowSize={0} />
                                  </div>
                                  <div className="space-y-1.5">
                                    {[
                                      ['Fresh input', tokenFmt(u.input_tokens)],
                                      ['Cache reads', tokenFmt(u.cache_read_input_tokens)],
                                      ['Cache writes', tokenFmt(u.cache_creation_input_tokens)],
                                      ['Output', tokenFmt(u.output_tokens)],
                                      ['Tool calls', u.tool_calls.toLocaleString()],
                                      ['API calls', u.rounds.toLocaleString()],
                                    ].map(([k, v]) => (
                                      <div key={k} className="flex items-center justify-between gap-2 text-sm">
                                        <span className="text-foreground">{k}</span>
                                        <span className={'tabular-nums ' + faint}>{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={'rounded-2xl border overflow-hidden ' + cardBg}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className={'text-sm font-semibold ' + title}>Most expensive chats</h3>
              <p className={'mt-0.5 text-xs ' + faint}>
                Long threads resend their history every turn, so cost compounds
              </p>
            </div>
            {data.top_conversations.length === 0 ? (
              <p className={'px-5 py-6 text-sm ' + faint}>Nothing recorded yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.top_conversations.map((c) => (
                  <div key={c.id} className="px-5 py-2.5 flex items-center gap-3">
                    <Gauge className={'w-4 h-4 shrink-0 ' + faint} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate text-foreground">
                        {c.title}
                        {c.deleted && <span className={'ml-2 text-[11px] ' + faint}>(deleted)</span>}
                      </div>
                      <div className={'text-[11px] truncate ' + faint}>
                        {c.user || 'Unknown'} · {c.turns} turns · {tokenFmt(c.total_tokens)} tokens
                      </div>
                    </div>
                    <div className="text-sm tabular-nums font-medium text-foreground">{money(c.cost_usd)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.truncated && (
            <div className={'rounded-xl border px-4 py-3 text-sm border-border bg-muted ' + faint}>
              Usage volume hit the per-request row cap, so these figures are a floor, not exact.
            </div>
          )}
        </>
      )}
    </div>
  )
}
