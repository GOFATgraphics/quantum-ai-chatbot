import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderKanban, Pencil, Trash2, Check, Loader2, MessageSquare,
  Plus, AlertTriangle, ChevronRight, Search,
} from 'lucide-react'
import { supabase, type Conversation, type Project, type Note, type NoteType, type NotePriority } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  user: User
  project: Project
  conversations: Conversation[]
  onClose: () => void
  onUpdateProject: (id: string, patch: { name?: string; description?: string | null; color?: string }) => void | Promise<void>
  onDeleteProject: (id: string) => void | Promise<void>
  onSelectChat: (id: string) => void
  onNewChatInProject: () => void
}

const COLORS = ['#0a0a0a', '#525252', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#f97316']

const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  action_item: 'Action',
  trade_note: 'Trade',
  decision: 'Decision',
  alert: 'Alert',
}

const PRIORITY_DOT: Record<NotePriority, string> = {
  high: 'bg-destructive',
  medium: 'bg-foreground',
  low: 'bg-muted-foreground',
}

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

function dueLabel(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now()
  const overdue = ms < 0
  const days = Math.round(Math.abs(ms) / 86_400_000)
  if (overdue) return { text: days === 0 ? 'due today' : `${days}d overdue`, overdue: true }
  if (days === 0) return { text: 'due today', overdue: false }
  return { text: `due in ${days}d`, overdue: false }
}

export default function ProjectDashboard({
  dark, user, project, conversations, onClose, onUpdateProject, onDeleteProject, onSelectChat, onNewChatInProject,
}: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [noteFilter, setNoteFilter] = useState<'open' | 'done' | 'all'>('open')
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null)
  const [chatQuery, setChatQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || '')
  const [color, setColor] = useState(project.color || COLORS[0])
  const [savingEdit, setSavingEdit] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<NoteType>('action_item')
  const [notePriority, setNotePriority] = useState<NotePriority>('medium')
  const [noteDue, setNoteDue] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDelete) setConfirmDelete(false)
        else if (editing) setEditing(false)
        else if (showNoteForm) setShowNoteForm(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDelete, editing, showNoteForm, onClose])

  useEffect(() => {
    setName(project.name)
    setDescription(project.description || '')
    setColor(project.color || COLORS[0])
  }, [project])

  useEffect(() => {
    let cancelled = false
    setLoadingNotes(true)
    ;(async () => {
      const { data, error } = await supabase.from('notes').select('*').eq('user_id', user.id).eq('project_id', project.id).order('created_at', { ascending: false })
      if (!cancelled) {
        if (!error) setNotes((data as Note[]) || [])
        setLoadingNotes(false)
      }
    })()
    return () => { cancelled = true }
  }, [user.id, project.id])

  const projectChats = useMemo(() => {
    const list = conversations.filter((c) => c.project_id === project.id).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    const q = chatQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, project.id, chatQuery])

  const openNotes = useMemo(() => notes.filter((n) => n.status === 'open'), [notes])
  const overdueNotes = useMemo(() => openNotes.filter((n) => n.due_date && new Date(n.due_date).getTime() < Date.now()), [openNotes])
  const filteredNotes = useMemo(() => (noteFilter === 'all' ? notes : notes.filter((n) => n.status === noteFilter)), [notes, noteFilter])

  const muted = 'text-muted-foreground'
  const hover = 'hover:bg-accent'
  const card = 'bg-card ring-1 ring-border'
  const chipActive = 'bg-secondary text-foreground ring-1 ring-border'
  const chip = 'px-3 h-8 rounded-full text-[13px] font-medium transition shrink-0 text-muted-foreground'
  const fieldClass = 'w-full h-10 rounded-xl px-3 text-[14px] outline-none glass-panel text-foreground placeholder:text-muted-foreground'
  const primaryBtn = 'bg-primary text-primary-foreground hover:bg-primary/90'

  const saveEdit = async () => {
    const n = name.trim()
    if (!n || savingEdit) return
    setSavingEdit(true)
    try {
      await onUpdateProject(project.id, { name: n, description: description.trim() || null, color })
      setEditing(false)
    } finally { setSavingEdit(false) }
  }

  const submitNote = async () => {
    const n = noteText.trim()
    if (!n || savingNote) return
    setSavingNote(true)
    setNoteError(null)
    try {
      const { data, error } = await supabase.from('notes').insert({
        user_id: user.id, note: n, project: project.name, project_id: project.id,
        note_type: noteType, priority: notePriority,
        due_date: noteDue ? new Date(noteDue).toISOString() : null, checklist: [],
      }).select().single()
      if (error) { setNoteError(error.message || 'Could not save note'); return }
      if (data) {
        setNotes((p) => [data as Note, ...p])
        setShowNoteForm(false); setNoteText(''); setNoteType('action_item'); setNotePriority('medium'); setNoteDue('')
      }
    } finally { setSavingNote(false) }
  }

  const setNoteStatus = async (n: Note, status: Note['status']) => {
    setBusyNoteId(n.id)
    try {
      const { error } = await supabase.from('notes').update({ status, updated_at: new Date().toISOString() }).eq('id', n.id)
      if (!error) setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, status } : x)))
    } finally { setBusyNoteId(null) }
  }

  const removeNote = async (id: string) => {
    setBusyNoteId(id)
    try {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (!error) setNotes((p) => p.filter((x) => x.id !== id))
    } finally { setBusyNoteId(null) }
  }

  const doDelete = async () => {
    setDeleting(true)
    try { await onDeleteProject(project.id); onClose() } finally { setDeleting(false) }
  }

  return (
    <div className="flex flex-col h-full text-foreground">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4 shrink-0">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}26` }}>
          <FolderKanban className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          {!editing ? (
            <><h2 className="text-xl font-semibold tracking-tight truncate">{project.name}</h2>
            <p className={`text-[13px] ${muted}`}>{project.description || 'No description yet'}</p></>
          ) : (
            <div className="space-y-2">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Project name" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className="w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel text-foreground placeholder:text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Use color ${c}`} className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: c, outline: color === c ? `2px solid ${dark ? '#fff' : '#000'}` : 'none', outlineOffset: 2 }}>
                    {color === c && <Check className="w-3.5 h-3.5 text-white mix-blend-difference" />}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)} className={`h-9 px-4 rounded-xl text-[13px] font-medium ${hover} ${muted}`}>Cancel</button>
                <button type="button" onClick={saveEdit} disabled={!name.trim() || savingEdit} className={`h-9 px-4 rounded-xl text-[13px] font-medium disabled:opacity-40 flex items-center gap-1.5 ${primaryBtn}`}>
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                </button>
              </div>
            </div>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${hover}`} aria-label="Edit project">
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className={`rounded-2xl px-3 py-3 ${card}`}>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{conversations.filter((c) => c.project_id === project.id).length}</p>
            <p className={`text-[12px] ${muted}`}>Chats</p>
          </div>
          <div className={`rounded-2xl px-3 py-3 ${card}`}>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{openNotes.length}</p>
            <p className={`text-[12px] ${muted}`}>Open notes</p>
          </div>
          <div className={`rounded-2xl px-3 py-3 ${overdueNotes.length > 0 ? 'bg-destructive/10 ring-1 ring-destructive/25' : card}`}>
            <p className={`text-2xl font-semibold tabular-nums tracking-tight ${overdueNotes.length > 0 ? 'text-destructive' : ''}`}>{overdueNotes.length}</p>
            <p className={`text-[12px] ${overdueNotes.length > 0 ? 'text-destructive/80' : muted}`}>Overdue</p>
          </div>
        </div>

        <button type="button" onClick={onNewChatInProject} className={`w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-[14px] font-medium transition mb-6 ${primaryBtn}`}>
          <MessageSquare className="w-4 h-4" /> New chat in this project
        </button>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <p className={`text-xs font-medium uppercase tracking-wide mb-2 px-1 ${muted}`}>Recent chats</p>
            {conversations.filter((c) => c.project_id === project.id).length > 4 && (
              <div className="flex items-center gap-2 h-9 rounded-xl px-2.5 mb-2 bg-muted">
                <Search className={`w-3.5 h-3.5 shrink-0 ${muted}`} />
                <input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="Filter chats" className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-foreground placeholder:text-muted-foreground" />
              </div>
            )}
            {projectChats.length === 0 ? (
              <div className={`text-center py-8 px-2 ${muted}`}>
                <MessageSquare className="w-7 h-7 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{chatQuery.trim() ? 'No matching chats' : 'No chats in this project yet'}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {projectChats.slice(0, 12).map((c) => (
                  <button key={c.id} type="button" onClick={() => onSelectChat(c.id)} className={`group w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ${hover}`}>
                    <MessageSquare className={`w-4 h-4 shrink-0 ${muted}`} />
                    <span className="flex-1 min-w-0 truncate text-[14px]">{c.title || 'Untitled chat'}</span>
                    <span className={`text-[11px] shrink-0 ${muted}`}>{timeAgo(c.updated_at)}</span>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 ${muted}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>Notes</p>
              <button type="button" onClick={() => setShowNoteForm((s) => !s)} className="text-[12px] font-medium flex items-center gap-1 text-foreground">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            {showNoteForm && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl p-3 space-y-2 mb-2 ${card}`}>
                <textarea autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Note" rows={2} className="w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel text-foreground placeholder:text-muted-foreground" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)} className={fieldClass}>
                    {(Object.keys(NOTE_TYPE_LABEL) as NoteType[]).map((t) => (<option key={t} value={t}>{NOTE_TYPE_LABEL[t]}</option>))}
                  </select>
                  <select value={notePriority} onChange={(e) => setNotePriority(e.target.value as NotePriority)} className={fieldClass}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <input type="date" value={noteDue} onChange={(e) => setNoteDue(e.target.value)} className={fieldClass} aria-label="Due date" />
                {noteError && <p className="text-[12px] text-destructive">{noteError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNoteForm(false)} className={`flex-1 h-9 rounded-xl text-[13px] font-medium ${hover} ${muted}`}>Cancel</button>
                  <button type="button" onClick={submitNote} disabled={!noteText.trim() || savingNote} className={`flex-1 h-9 rounded-xl text-[13px] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5 ${primaryBtn}`}>
                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                  </button>
                </div>
              </motion.div>
            )}

            <div className="flex items-center gap-1.5 mb-2">
              {(['open', 'done', 'all'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setNoteFilter(s)} className={`${chip} ${noteFilter === s ? chipActive : hover}`}>
                  {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'All'}
                </button>
              ))}
            </div>

            {loadingNotes ? (
              <div className="flex items-center justify-center py-6"><Loader2 className={`w-4 h-4 animate-spin ${muted}`} /></div>
            ) : filteredNotes.length === 0 ? (
              <div className={`text-center py-8 px-2 ${muted}`}><p className="text-sm">No notes here yet.</p></div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredNotes.map((n) => {
                  const due = n.due_date ? dueLabel(n.due_date) : null
                  const isOverdue = !!due?.overdue && n.status === 'open'
                  return (
                    <motion.div key={n.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      className={`group flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-1 ${isOverdue ? 'bg-destructive/10' : hover}`}>
                      <button type="button" onClick={() => setNoteStatus(n, n.status === 'open' ? 'done' : 'open')} disabled={busyNoteId === n.id}
                        className={`mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition ${n.status === 'done' ? 'bg-primary text-primary-foreground' : 'ring-1 ring-border'}`} aria-label="Toggle note status">
                        {n.status === 'done' && <Check className="w-2.5 h-2.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] leading-snug ${n.status !== 'open' ? `line-through ${muted}` : ''}`}>{n.note}</p>
                        <div className={`flex flex-wrap items-center gap-1 mt-1 text-[11px] ${muted}`}>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary">
                            <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[n.priority]}`} />{NOTE_TYPE_LABEL[n.note_type]}
                          </span>
                          {due && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${isOverdue ? 'bg-destructive/15 text-destructive' : 'bg-secondary'}`}>
                              {isOverdue && <AlertTriangle className="w-3 h-3" />}{due.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeNote(n.id)} disabled={busyNoteId === n.id}
                        className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-40 shrink-0" aria-label="Delete note">
                        {busyNoteId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-border">
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-[13px] font-medium text-destructive/80 hover:text-destructive flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Delete project
            </button>
          ) : (
            <div className="rounded-2xl p-3 flex items-center gap-3 bg-destructive/10 ring-1 ring-destructive/25">
              <p className="text-[13px] flex-1">Delete &quot;{project.name}&quot;? Its chats stay, but become unassigned.</p>
              <button type="button" onClick={() => setConfirmDelete(false)} className={`h-8 px-3 rounded-lg text-[13px] font-medium ${hover}`}>Cancel</button>
              <button type="button" onClick={doDelete} disabled={deleting} className="h-8 px-3 rounded-lg text-[13px] font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 flex items-center gap-1.5">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
