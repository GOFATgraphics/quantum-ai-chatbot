import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, RefreshCw, Search, StickyNote, AlertTriangle,
  ChevronLeft, ChevronRight, Tag, CalendarClock,
} from 'lucide-react'
import { adminFetch, formatDateTime } from '../adminApi'

type Props = { dark: boolean }

type AdminNote = {
  id: string
  user_id: string
  note: string
  project: string | null
  status: string
  note_type: string
  priority: string
  due_date: string | null
  tags: string[] | null
  trade_ref: string | null
  created_at: string
  updated_at: string
  owner: { email: string | null; name: string | null } | null
}

type Resp = {
  notes: AdminNote[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

const STATUSES = ['all', 'open', 'done', 'dismissed']
const TYPES = ['all', 'action_item', 'trade_note', 'decision', 'alert']
const PRIORITIES = ['all', 'high', 'medium', 'low']

const PAGE = 50

export default function AdminNotes({ dark }: Props) {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('all')
  const [noteType, setNoteType] = useState('all')
  const [priority, setPriority] = useState('all')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => { setOffset(0) }, [debounced, status, noteType, priority])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch<Resp>('/api/admin/notes', {
        limit: PAGE,
        offset,
        search: debounced || undefined,
        status,
        note_type: noteType,
        priority,
      })
      setData(res)
    } catch (e: any) {
      setError(e?.message || 'Failed to load notes')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [offset, debounced, status, noteType, priority])

  useEffect(() => { void load() }, [load])

  const cardBg = dark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-200 shadow-sm'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const title = dark ? 'text-white' : 'text-slate-900'
  const inputCls =
    'h-9 px-3 rounded-xl text-sm border outline-none transition ' +
    (dark
      ? 'bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-500'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400')

  const badge = (text: string, tone: 'default' | 'warn' | 'danger' | 'ok' = 'default') => {
    const tones = {
      default: dark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600',
      ok: dark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
      warn: dark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700',
      danger: dark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-700',
    }
    return (
      <span className={'text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap ' + tones[tone]}>
        {text}
      </span>
    )
  }

  const isOverdue = (n: AdminNote) =>
    n.status === 'open' && n.due_date && new Date(n.due_date).getTime() < Date.now()

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className={'text-xl font-semibold tracking-tight ' + title}>User notes</h2>
          <p className={'mt-1 text-sm ' + muted}>
            Notes across all accounts{data ? ` · ${data.total.toLocaleString()} total` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={
            'h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 ' +
            (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
          }
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div className={'rounded-2xl border p-3 flex flex-wrap items-center gap-2 ' + cardBg}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className={'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ' + muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search note text…"
            className={inputCls + ' w-full pl-9'}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
        <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className={inputCls}>
          {TYPES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All types' : s.replace('_', ' ')}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
          {PRIORITIES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All priorities' : s}</option>)}
        </select>
      </div>

      {error && (
        <div
          className={
            'rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ' +
            (dark ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-800')
          }
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className={'w-6 h-6 animate-spin ' + muted} />
        </div>
      ) : data && data.notes.length === 0 ? (
        <div className={'rounded-2xl border p-10 text-center ' + cardBg}>
          <StickyNote className={'w-8 h-8 mx-auto mb-3 ' + muted} />
          <p className={'text-sm ' + muted}>No notes match these filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.notes.map((n) => (
            <div key={n.id} className={'rounded-2xl border p-4 ' + cardBg}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={'text-[13px] font-medium ' + title}>
                      {n.owner?.name || n.owner?.email || 'Unknown user'}
                    </span>
                    {n.owner?.name && n.owner?.email && (
                      <span className={'text-[11px] ' + muted}>{n.owner.email}</span>
                    )}
                  </div>
                  <p className={'text-sm leading-relaxed whitespace-pre-wrap break-words ' + (dark ? 'text-slate-200' : 'text-slate-800')}>
                    {n.note}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {badge(n.status, n.status === 'open' ? 'warn' : n.status === 'done' ? 'ok' : 'default')}
                  {n.priority === 'high' && badge('high', 'danger')}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {badge(n.note_type?.replace('_', ' ') || 'note')}
                {n.project && badge(n.project)}
                {n.trade_ref && badge(n.trade_ref)}
                {n.tags?.map((t) => (
                  <span key={t} className={'text-[11px] flex items-center gap-1 ' + muted}>
                    <Tag className="w-3 h-3" />{t}
                  </span>
                ))}
                {n.due_date && (
                  <span
                    className={
                      'text-[11px] flex items-center gap-1 ' +
                      (isOverdue(n) ? (dark ? 'text-red-300' : 'text-red-600') : muted)
                    }
                  >
                    <CalendarClock className="w-3 h-3" />
                    due {formatDateTime(n.due_date)}
                    {isOverdue(n) ? ' · overdue' : ''}
                  </span>
                )}
                <span className={'text-[11px] ml-auto ' + muted}>
                  updated {formatDateTime(n.updated_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.total > PAGE && (
        <div className="flex items-center justify-between gap-3">
          <span className={'text-xs ' + muted}>
            {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              className={
                'h-9 w-9 rounded-xl flex items-center justify-center transition disabled:opacity-40 ' +
                (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!data.has_more || loading}
              onClick={() => setOffset((o) => o + PAGE)}
              className={
                'h-9 w-9 rounded-xl flex items-center justify-center transition disabled:opacity-40 ' +
                (dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
