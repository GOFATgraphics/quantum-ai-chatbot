import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, StickyNote, Check, Loader2, EyeOff, AlertTriangle,
  ChevronDown, ChevronRight, Tag, ListChecks, Search,
} from 'lucide-react'
import { supabase, type Note, type NoteType, type NotePriority, type Project, type ChecklistItem } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  user: User
  projects: Project[]
  currentProjectId: string | null
  onClose: () => void
}

type StatusFilter = 'open' | 'done' | 'dismissed' | 'all'
const UNTAGGED = '__untagged__'

const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  action_item: 'Action',
  trade_note: 'Trade',
  decision: 'Decision',
  alert: 'Alert',
}

const PRIORITY_DOT: Record<NotePriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-neutral-400',
}

function checklistOf(n: Note): ChecklistItem[] {
  return Array.isArray(n.checklist) ? n.checklist : []
}

function dueLabel(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now()
  const overdue = ms < 0
  const days = Math.round(Math.abs(ms) / 86_400_000)
  if (overdue) return { text: days === 0 ? 'due today' : `${days}d overdue`, overdue: true }
  if (days === 0) return { text: 'due today', overdue: false }
  return { text: `due in ${days}d`, overdue: false }
}

export default function NotesDashboard({ dark, user, projects, currentProjectId, onClose }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [projectFilter, setProjectFilter] = useState<string | null>(currentProjectId)
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [text, setText] = useState('')
  const [projectName, setProjectName] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('action_item')
  const [priority, setPriority] = useState<NotePriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [checklistInput, setChecklistInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null)
  const [newItemText, setNewItemText] = useState('')

  useEffect(() => { setProjectFilter(currentProjectId) }, [currentProjectId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) resetForm()
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm, onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (!cancelled) {
        if (!error) setNotes((data as Note[]) || [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false
      if (projectFilter && n.project_id !== projectFilter) return false
      if (topicFilter) {
        if (topicFilter === UNTAGGED) {
          if (n.tags && n.tags.length > 0) return false
        } else if (!n.tags?.includes(topicFilter)) return false
      }
      if (q) {
        const hay = `${n.note} ${(n.tags || []).join(' ')} ${n.project || ''} ${n.trade_ref || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [notes, statusFilter, projectFilter, topicFilter, search])

  const topics = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) {
      if (statusFilter !== 'all' && n.status !== statusFilter) continue
      if (projectFilter && n.project_id !== projectFilter) continue
      for (const t of n.tags || []) set.add(t)
    }
    return Array.from(set).sort()
  }, [notes, statusFilter, projectFilter])

  const grouped = useMemo(() => {
    if (topicFilter || search.trim()) return null
    const groups = new Map<string, Note[]>()
    for (const t of topics) groups.set(t, [])
    const untagged: Note[] = []
    for (const n of filtered) {
      if (!n.tags || n.tags.length === 0) { untagged.push(n); continue }
      for (const t of n.tags) {
        if (!groups.has(t)) groups.set(t, [])
        groups.get(t)!.push(n)
      }
    }
    const entries = Array.from(groups.entries()).filter(([, rows]) => rows.length > 0)
    if (untagged.length > 0) entries.push([UNTAGGED, untagged])
    return entries
  }, [filtered, topics, topicFilter, search])

  const stats = useMemo(() => {
    const open = notes.filter((n) => n.status === 'open')
    const overdue = open.filter((n) => n.due_date && new Date(n.due_date).getTime() < Date.now())
    const allTopics = new Set<string>()
    for (const n of notes) for (const t of n.tags || []) allTopics.add(t)
    return { open: open.length, overdue: overdue.length, topics: allTopics.size }
  }, [notes])

  const muted = dark ? 'text-neutral-400' : 'text-neutral-500'
  const hover = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const card = dark ? 'bg-white/[0.04] ring-1 ring-white/10' : 'bg-black/[0.02] ring-1 ring-black/5'
  const chipActive = dark ? 'bg-white/12 text-white ring-1 ring-white/20' : 'bg-black/[0.08] text-black ring-1 ring-black/10'
  const chip = `px-3 h-8 rounded-full text-[13px] font-medium transition shrink-0 ${dark ? 'text-neutral-300' : 'text-neutral-600'}`
  const fieldClass = `w-full h-10 rounded-xl px-3 text-[14px] outline-none glass-panel ${dark ? 'text-neutral-100 placeholder:text-neutral-500' : 'text-neutral-900 placeholder:text-neutral-400'}`
  const primaryBtn = dark ? 'bg-white text-black hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-black'

  const resetForm = () => {
    setShowForm(false); setText(''); setProjectName(''); setNoteType('action_item')
    setPriority('medium'); setDueDate(''); setTagsInput(''); setChecklistInput(''); setFormError(null)
  }

  const submit = async () => {
    const n = text.trim()
    if (!n || saving) return
    setSaving(true); setFormError(null)
    try {
      const matchedProject = projectName.trim()
        ? projects.find((p) => p.name.toLowerCase() === projectName.trim().toLowerCase()) : null
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      const checklist: ChecklistItem[] = checklistInput.split('\n').map((l) => l.trim()).filter(Boolean)
        .map((t) => ({ id: crypto.randomUUID(), text: t, done: false }))
      const { data, error } = await supabase.from('notes').insert({
        user_id: user.id, note: n,
        project: matchedProject ? matchedProject.name : projectName.trim() || null,
        project_id: matchedProject ? matchedProject.id : projectFilter,
        note_type: noteType, priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        tags: tags.length ? tags : null, checklist,
      }).select().single()
      if (error) { setFormError(error.message || 'Could not save note'); return }
      if (data) { setNotes((p) => [data as Note, ...p]); resetForm() }
    } finally { setSaving(false) }
  }

  const setStatus = async (n: Note, status: Note['status']) => {
    setBusyId(n.id)
    try {
      const { error } = await supabase.from('notes').update({ status, updated_at: new Date().toISOString() }).eq('id', n.id)
      if (!error) setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, status } : x)))
    } finally { setBusyId(null) }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (!error) setNotes((p) => p.filter((x) => x.id !== id))
    } finally { setBusyId(null) }
  }

  const toggleChecklistItem = async (n: Note, itemId: string) => {
    const newChecklist = checklistOf(n).map((it) => (it.id === itemId ? { ...it, done: !it.done } : it))
    setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, checklist: newChecklist } : x)))
    await supabase.from('notes').update({ checklist: newChecklist, updated_at: new Date().toISOString() }).eq('id', n.id)
  }

  const removeChecklistItem = async (n: Note, itemId: string) => {
    const newChecklist = checklistOf(n).filter((it) => it.id !== itemId)
    setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, checklist: newChecklist } : x)))
    await supabase.from('notes').update({ checklist: newChecklist, updated_at: new Date().toISOString() }).eq('id', n.id)
  }

  const addChecklistItem = async (n: Note) => {
    const t = newItemText.trim()
    if (!t) return
    const newChecklist = [...checklistOf(n), { id: crypto.randomUUID(), text: t, done: false }]
    setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, checklist: newChecklist } : x)))
    setNewItemText(''); setAddingItemTo(null)
    await supabase.from('notes').update({ checklist: newChecklist, updated_at: new Date().toISOString() }).eq('id', n.id)
  }

  const NoteRow = ({ n }: { n: Note }) => {
    const due = n.due_date ? dueLabel(n.due_date) : null
    const isOverdue = !!due?.overdue && n.status === 'open'
    const isExpanded = expanded.has(n.id)
    const list = checklistOf(n)
    const checklistDone = list.filter((it) => it.done).length
    const projectObj = n.project_id ? projects.find((p) => p.id === n.project_id) : null
    return (
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        className={`group rounded-2xl mb-1.5 px-3.5 py-3 ${isOverdue ? (dark ? 'bg-rose-500/[0.07]' : 'bg-rose-50/70') : hover}`}>
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => setStatus(n, n.status === 'open' ? 'done' : 'open')} disabled={busyId === n.id}
            aria-label={n.status === 'open' ? 'Mark done' : 'Mark open'}
            className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition ${
              n.status === 'done' ? 'bg-emerald-500 text-white'
                : n.status === 'dismissed' ? (dark ? 'bg-white/10 text-neutral-500' : 'bg-black/[0.06] text-neutral-400')
                : dark ? 'ring-1 ring-white/25' : 'ring-1 ring-neutral-300'}`}>
            {n.status === 'done' && <Check className="w-3 h-3" />}
            {n.status === 'dismissed' && <EyeOff className="w-3 h-3" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-[14px] leading-snug ${n.status !== 'open' ? `line-through ${muted}` : ''}`}>{n.note}</p>
            <div className={`flex flex-wrap items-center gap-1.5 mt-1.5 text-[12px] ${muted}`}>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[n.priority]}`} />{NOTE_TYPE_LABEL[n.note_type]}
              </span>
              {projectObj && <span className={`px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>{projectObj.name}</span>}
              {n.trade_ref && <span className={`px-1.5 py-0.5 rounded-md font-mono ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>{n.trade_ref}</span>}
              {due && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${isOverdue ? 'bg-rose-500/15 text-rose-500' : dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
                  {isOverdue && <AlertTriangle className="w-3 h-3" />}{due.text}
                </span>
              )}
              {n.tags && n.tags.length > 0 && !topicFilter && (
                <span className="flex items-center gap-1 flex-wrap">
                  {n.tags.map((t) => (
                    <button key={t} type="button" onClick={() => setTopicFilter(t)}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/12 text-neutral-200' : 'bg-black/[0.06] text-neutral-700'}`}>
                      <Tag className="w-2.5 h-2.5" />{t}
                    </button>
                  ))}
                </span>
              )}
              {list.length > 0 && (
                <button type="button" onClick={() => setExpanded((p) => { const next = new Set(p); if (next.has(n.id)) next.delete(n.id); else next.add(n.id); return next })}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
                  <ListChecks className="w-3 h-3" />{checklistDone}/{list.length}
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              )}
              {list.length === 0 && (
                <button type="button" onClick={() => { setAddingItemTo(n.id); setExpanded((p) => new Set(p).add(n.id)) }}
                  className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-neutral-500 hover:text-neutral-300">
                  <Plus className="w-3 h-3" /> Checklist
                </button>
              )}
            </div>
            {isExpanded && (
              <div className="mt-2 space-y-1 pl-1">
                {list.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group/item">
                    <button type="button" onClick={() => toggleChecklistItem(n, item.id)}
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${item.done ? 'bg-emerald-500 text-white' : dark ? 'ring-1 ring-white/25' : 'ring-1 ring-neutral-300'}`}>
                      {item.done && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <span className={`text-[13px] flex-1 ${item.done ? `line-through ${muted}` : ''}`}>{item.text}</span>
                    <button type="button" onClick={() => removeChecklistItem(n, item.id)} className="opacity-0 group-hover/item:opacity-100 text-neutral-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {addingItemTo === n.id ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input autoFocus value={newItemText} onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(n); if (e.key === 'Escape') setAddingItemTo(null) }}
                      placeholder="New step" className={`flex-1 h-8 rounded-lg px-2 text-[13px] outline-none glass-panel ${dark ? 'text-neutral-100' : 'text-neutral-900'}`} />
                    <button type="button" onClick={() => addChecklistItem(n)} className={`text-[13px] font-medium ${dark ? 'text-neutral-200' : 'text-neutral-700'}`}>Add</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddingItemTo(n.id)} className={`text-[12px] font-medium flex items-center gap-1 pt-1 ${dark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    <Plus className="w-3 h-3" /> Add step
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {n.status !== 'dismissed' && (
              <button type="button" onClick={() => setStatus(n, 'dismissed')} disabled={busyId === n.id}
                className="opacity-0 sm:group-hover:opacity-100 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-neutral-400 hover:text-neutral-600 disabled:opacity-40" aria-label="Dismiss note">
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="button" onClick={() => remove(n.id)} disabled={busyId === n.id}
              className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-neutral-400 hover:text-red-500 disabled:opacity-40" aria-label="Delete note">
              {busyId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${dark ? 'text-neutral-100' : 'text-neutral-900'}`}>
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${dark ? 'bg-white text-black' : 'bg-neutral-900 text-white'}`}>
          <StickyNote className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">Notes</h2>
          <p className={`text-[13px] ${muted}`}>Everything you asked Quantumy to save, organized by topic</p>
        </div>
        <button type="button" onClick={onClose} className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${hover}`} aria-label="Close notes">
          <X className={`w-5 h-5 ${dark ? 'text-neutral-300' : 'text-neutral-600'}`} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className={`rounded-2xl px-3 py-3 ${card}`}>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{stats.open}</p>
            <p className={`text-[12px] ${muted}`}>Open notes</p>
          </div>
          <div className={`rounded-2xl px-3 py-3 ${stats.overdue > 0 ? (dark ? 'bg-rose-500/10 ring-1 ring-rose-400/25' : 'bg-rose-50 ring-1 ring-rose-200') : card}`}>
            <p className={`text-2xl font-semibold tabular-nums tracking-tight ${stats.overdue > 0 ? 'text-rose-500' : ''}`}>{stats.overdue}</p>
            <p className={`text-[12px] ${stats.overdue > 0 ? 'text-rose-500/80' : muted}`}>Overdue</p>
          </div>
          <div className={`rounded-2xl px-3 py-3 ${card}`}>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{stats.topics}</p>
            <p className={`text-[12px] ${muted}`}>Topics</p>
          </div>
        </div>

        <div className={`flex items-center gap-2 h-10 rounded-xl px-3 mb-4 ${dark ? 'bg-white/[0.06] ring-1 ring-white/[0.06]' : 'bg-black/[0.04] ring-1 ring-black/[0.04]'}`}>
          <Search className={`w-4 h-4 shrink-0 ${muted}`} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes, tags, projects…"
            className={`flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] ${dark ? 'text-neutral-100 placeholder:text-neutral-500' : 'text-neutral-900 placeholder:text-neutral-400'}`} aria-label="Search notes" />
          {search && (
            <button type="button" onClick={() => setSearch('')} className={`p-0.5 rounded ${hover}`} aria-label="Clear search">
              <X className={`w-3.5 h-3.5 ${muted}`} />
            </button>
          )}
        </div>

        <div className="mb-4">
          {!showForm ? (
            <button type="button" onClick={() => setShowForm(true)} className={`w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-[14px] font-medium transition ${primaryBtn}`}>
              <Plus className="w-4 h-4" /> New note
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl p-3.5 space-y-2.5 ${card}`}>
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && resetForm()}
                placeholder="Note" rows={2} className={`w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel ${dark ? 'text-neutral-100 placeholder:text-neutral-500' : 'text-neutral-900 placeholder:text-neutral-400'}`} />
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project (optional)" className={fieldClass} list="quantumy-projects" />
              <datalist id="quantumy-projects">{projects.map((p) => <option key={p.id} value={p.name} />)}</datalist>
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Topics, comma separated (optional)" className={fieldClass} />
              <textarea value={checklistInput} onChange={(e) => setChecklistInput(e.target.value)} placeholder={'Checklist steps, one per line (optional)'} rows={2}
                className={`w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel ${dark ? 'text-neutral-100 placeholder:text-neutral-500' : 'text-neutral-900 placeholder:text-neutral-400'}`} />
              <div className="grid grid-cols-2 gap-2">
                <select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)} className={fieldClass}>
                  {(Object.keys(NOTE_TYPE_LABEL) as NoteType[]).map((t) => (<option key={t} value={t}>{NOTE_TYPE_LABEL[t]}</option>))}
                </select>
                <select value={priority} onChange={(e) => setPriority(e.target.value as NotePriority)} className={fieldClass}>
                  <option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option>
                </select>
              </div>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} aria-label="Due date (optional)" />
              {formError && <p className="text-[12px] text-rose-500">{formError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={resetForm} className={`flex-1 h-9 rounded-xl text-[13px] font-medium ${hover} ${muted}`}>Cancel</button>
                <button type="button" onClick={submit} disabled={!text.trim() || saving} className={`flex-1 h-9 rounded-xl text-[13px] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5 ${primaryBtn}`}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-0.5">
          {(['open', 'done', 'dismissed', 'all'] as StatusFilter[]).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`${chip} ${statusFilter === s ? chipActive : hover}`}>
              {s === 'open' ? 'Open' : s === 'done' ? 'Done' : s === 'dismissed' ? 'Dismissed' : 'All'}
            </button>
          ))}
          {projects.length > 0 && (
            <>
              <span className={`w-px h-4 mx-0.5 shrink-0 ${dark ? 'bg-white/10' : 'bg-black/10'}`} />
              <button type="button" onClick={() => setProjectFilter(null)} className={`${chip} ${!projectFilter ? chipActive : hover}`}>All projects</button>
              {projects.map((p) => (
                <button key={p.id} type="button" onClick={() => setProjectFilter(p.id)} className={`${chip} ${projectFilter === p.id ? chipActive : hover}`}>{p.name}</button>
              ))}
            </>
          )}
        </div>

        {topics.length > 0 && (
          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-0.5">
            <button type="button" onClick={() => setTopicFilter(null)} className={`${chip} ${!topicFilter ? chipActive : hover}`}>All topics</button>
            {topics.map((t) => (
              <button key={t} type="button" onClick={() => setTopicFilter(t)} className={`${chip} flex items-center gap-1 ${topicFilter === t ? chipActive : hover}`}>
                <Tag className="w-3 h-3" />{t}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className={`w-5 h-5 animate-spin ${muted}`} /></div>
        ) : filtered.length === 0 ? (
          <div className={`text-center py-12 px-4 ${muted}`}>
            <StickyNote className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{notes.length === 0 ? 'No notes yet. Ask Quantumy to "add a note" mid-chat, or add one here.' : 'No notes match this filter.'}</p>
          </div>
        ) : topicFilter || search.trim() || !grouped ? (
          <AnimatePresence initial={false}>{filtered.map((n) => <NoteRow key={n.id} n={n} />)}</AnimatePresence>
        ) : (
          <div className="space-y-5">
            {grouped.map(([topic, rows]) => (
              <div key={topic}>
                <div className="flex items-center gap-1.5 mb-1.5 px-1">
                  {topic !== UNTAGGED && <Tag className={`w-3.5 h-3.5 ${muted}`} />}
                  <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>{topic === UNTAGGED ? 'Untagged' : topic}</p>
                  <span className={`text-xs ${muted}`}>({rows.length})</span>
                </div>
                <AnimatePresence initial={false}>{rows.map((n) => <NoteRow key={`${topic}-${n.id}`} n={n} />)}</AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
