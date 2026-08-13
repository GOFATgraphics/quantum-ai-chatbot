import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, StickyNote, Check, Loader2 } from 'lucide-react'
import { supabase, type Note } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  user: User
  onClose: () => void
}

type StatusFilter = 'open' | 'done' | 'all'

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function Notes({ dark, user, onClose }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [text, setText] = useState('')
  const [project, setProject] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setNotes((data as Note[]) || [])
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user.id])

  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) if (n.project) set.add(n.project)
    return Array.from(set).sort()
  }, [notes])

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false
      if (projectFilter && n.project !== projectFilter) return false
      return true
    })
  }, [notes, statusFilter, projectFilter])

  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const hover = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const chipActive = dark
    ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30'
    : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
  const chip = `px-3 h-8 rounded-full text-[13px] font-medium transition shrink-0 ${dark ? 'text-slate-300' : 'text-slate-600'}`

  const submit = async () => {
    const n = text.trim()
    if (!n || saving) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({ user_id: user.id, note: n, project: project.trim() || null })
        .select()
        .single()
      if (!error && data) {
        setNotes((p) => [data as Note, ...p])
        setText('')
        setProject('')
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (n: Note) => {
    setBusyId(n.id)
    const nextStatus = n.status === 'open' ? 'done' : 'open'
    try {
      const { error } = await supabase
        .from('notes')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', n.id)
      if (!error) setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, status: nextStatus } : x)))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (!error) setNotes((p) => p.filter((x) => x.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={`flex flex-col h-full ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
          <StickyNote className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Notes</h2>
          <p className={`text-[13px] ${muted}`}>Things you asked Quantumy to save</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center ${hover}`}
          aria-label="Close notes"
        >
          <X className={`w-5 h-5 ${dark ? 'text-slate-300' : 'text-slate-600'}`} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="mb-4">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={`w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-[14px] font-medium transition ${
                dark ? 'bg-white/[0.08] hover:bg-white/[0.12] text-slate-100' : 'bg-slate-900 text-white hover:bg-black'
              }`}
            >
              <Plus className="w-4 h-4" />
              New note
            </button>
          ) : (
            <div className={`rounded-2xl p-3 space-y-2 ${dark ? 'bg-white/[0.05] ring-1 ring-white/10' : 'bg-black/[0.03] ring-1 ring-black/5'}`}>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowForm(false)
                    setText('')
                    setProject('')
                  }
                }}
                placeholder="Note"
                rows={2}
                className={`w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel ${
                  dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Project (optional)"
                className={`w-full h-10 rounded-xl px-3 text-[14px] outline-none glass-panel ${
                  dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setText('')
                    setProject('')
                  }}
                  className={`flex-1 h-9 rounded-xl text-[13px] font-medium ${hover} ${muted}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!text.trim() || saving}
                  className="flex-1 h-9 rounded-xl text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
          {(['open', 'done', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`${chip} ${statusFilter === s ? chipActive : hover}`}
            >
              {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'All'}
            </button>
          ))}
          {projects.length > 0 && (
            <>
              <span className={`w-px h-4 mx-0.5 shrink-0 ${dark ? 'bg-white/10' : 'bg-black/10'}`} />
              <button
                type="button"
                onClick={() => setProjectFilter(null)}
                className={`${chip} ${!projectFilter ? chipActive : hover}`}
              >
                All projects
              </button>
              {projects.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProjectFilter(p)}
                  className={`${chip} ${projectFilter === p ? chipActive : hover}`}
                >
                  {p}
                </button>
              ))}
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className={`w-5 h-5 animate-spin ${muted}`} />
          </div>
        ) : filtered.length === 0 ? (
          <p className={`text-sm px-1 py-6 text-center ${muted}`}>
            {notes.length === 0
              ? 'No notes yet. Ask Quantumy to "add a note" mid-chat, or add one here.'
              : 'No notes match this filter.'}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className={`group flex items-start gap-3 rounded-2xl px-3.5 py-3 mb-1.5 ${hover}`}
              >
                <button
                  type="button"
                  onClick={() => toggleStatus(n)}
                  disabled={busyId === n.id}
                  aria-label={n.status === 'open' ? 'Mark done' : 'Mark open'}
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition ${
                    n.status === 'done'
                      ? 'bg-emerald-500 text-white'
                      : dark
                        ? 'ring-1 ring-white/25'
                        : 'ring-1 ring-slate-300'
                  }`}
                >
                  {n.status === 'done' && <Check className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] leading-snug ${n.status === 'done' ? `line-through ${muted}` : ''}`}>
                    {n.note}
                  </p>
                  <div className={`flex items-center gap-2 mt-1 text-[12px] ${muted}`}>
                    {n.project && (
                      <span className={`px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
                        {n.project}
                      </span>
                    )}
                    <span>{timeAgo(n.created_at)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={busyId === n.id}
                  className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                  aria-label="Delete note"
                >
                  {busyId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
