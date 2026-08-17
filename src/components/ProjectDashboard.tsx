import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  X, FolderKanban, Pencil, Trash2, Check, Loader2, MessageSquare,
  Plus, ChevronRight, AlertCircle,
} from 'lucide-react'
import { supabase, type Conversation, type Project, type Note, type NoteType, type NotePriority, type ChecklistItem } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import NoteRow from './NoteRow'
import StatTile from './StatTile'
import { NOTE_TYPE_LABEL } from '../lib/noteHelpers'
import { NOTES_ENABLED } from '../lib/features'

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

const COLORS = ['#e8e8e8', '#d1d1d1', '#afafaf', '#8c8c8c', '#737373', '#595959', '#4a4a4a', '#212121']

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

export default function ProjectDashboard({
  dark,
  user,
  project,
  conversations,
  onClose,
  onUpdateProject,
  onDeleteProject,
  onSelectChat,
  onNewChatInProject,
}: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [noteFilter, setNoteFilter] = useState<'open' | 'done' | 'all'>('open')
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

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

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setName(project.name)
    setDescription(project.description || '')
    setColor(project.color || COLORS[0])
  }, [project])

  useEffect(() => {
    if (!NOTES_ENABLED) {
      setLoadingNotes(false)
      return
    }
    let cancelled = false
    setLoadingNotes(true)
    ;(async () => {
      const { data } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setNotes((data as Note[]) || [])
        setLoadingNotes(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user.id, project.id])

  const projectChats = useMemo(
    () =>
      conversations
        .filter((c) => c.project_id === project.id)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [conversations, project.id],
  )

  const openNotes = useMemo(() => notes.filter((n) => n.status === 'open'), [notes])
  const overdueNotes = useMemo(
    () => openNotes.filter((n) => n.due_date && new Date(n.due_date).getTime() < Date.now()),
    [openNotes],
  )
  const filteredNotes = useMemo(
    () => (noteFilter === 'all' ? notes : notes.filter((n) => n.status === noteFilter)),
    [notes, noteFilter],
  )

  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const hover = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const card = dark ? 'bg-white/[0.04] ring-1 ring-white/10' : 'bg-black/[0.02] ring-1 ring-black/5'
  const chipActive = dark
    ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30'
    : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
  const chip = `px-3 h-8 rounded-full text-[13px] font-medium transition shrink-0 ${dark ? 'text-slate-300' : 'text-slate-600'}`
  const fieldClass = `w-full h-10 rounded-xl px-3 text-[14px] outline-none glass-panel ${
    dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
  }`

  const saveEdit = async () => {
    const n = name.trim()
    if (!n || savingEdit) return
    setSavingEdit(true)
    setError(null)
    try {
      await onUpdateProject(project.id, { name: n, description: description.trim() || null, color })
      setEditing(false)
    } catch {
      setError('Could not save changes. Try again.')
    } finally {
      setSavingEdit(false)
    }
  }

  const submitNote = async () => {
    const n = noteText.trim()
    if (!n || savingNote) return
    setSavingNote(true)
    setError(null)
    try {
      const { data, error: dbError } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          note: n,
          project: project.name,
          project_id: project.id,
          note_type: noteType,
          priority: notePriority,
          due_date: noteDue ? new Date(noteDue).toISOString() : null,
        })
        .select()
        .single()
      if (dbError || !data) throw dbError || new Error('Insert failed')
      setNotes((p) => [data as Note, ...p])
      setShowNoteForm(false)
      setNoteText('')
      setNoteType('action_item')
      setNotePriority('medium')
      setNoteDue('')
    } catch {
      setError('Could not save note. Try again.')
    } finally {
      setSavingNote(false)
    }
  }

  const setNoteStatus = async (n: Note, status: Note['status']) => {
    setBusyNoteId(n.id)
    setError(null)
    try {
      const { error: dbError } = await supabase.from('notes').update({ status, updated_at: new Date().toISOString() }).eq('id', n.id)
      if (dbError) throw dbError
      setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, status } : x)))
    } catch {
      setError('Could not update note. Try again.')
    } finally {
      setBusyNoteId(null)
    }
  }

  const removeNote = async (id: string) => {
    setBusyNoteId(id)
    setError(null)
    try {
      const { error: dbError } = await supabase.from('notes').delete().eq('id', id)
      if (dbError) throw dbError
      setNotes((p) => p.filter((x) => x.id !== id))
    } catch {
      setError('Could not delete note. Try again.')
    } finally {
      setBusyNoteId(null)
    }
  }

  const updateChecklist = async (n: Note, checklist: ChecklistItem[]) => {
    setNotes((p) => p.map((x) => (x.id === n.id ? { ...x, checklist } : x)))
    const { error: dbError } = await supabase.from('notes').update({ checklist, updated_at: new Date().toISOString() }).eq('id', n.id)
    if (dbError) setError('Could not update checklist. Try again.')
  }

  const toggleExpanded = (id: string) => {
    setExpanded((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDeleteProject(project.id)
      onClose()
    } catch {
      setError('Could not delete project. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`flex flex-col h-full ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="flex items-start gap-3 px-5 pt-5 pb-4 shrink-0">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}26` }}
        >
          <FolderKanban className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight truncate">{project.name}</h2>
              <p className={`text-[13px] ${muted}`}>{project.description || 'No description yet'}</p>
            </>
          ) : (
            <div className="space-y-2">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass}`} placeholder="Project name" />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Description (optional)"
                className={`w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel ${
                  dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Use color ${c}`}
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: c, outline: color === c ? `2px solid ${dark ? '#fff' : '#000'}` : 'none', outlineOffset: 2 }}
                  >
                    {color === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)} className={`h-9 px-4 rounded-xl text-[13px] font-medium ${hover} ${muted}`}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!name.trim() || savingEdit}
                  className="h-9 px-4 rounded-xl text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 flex items-center gap-1.5"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`glass-btn w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${hover}`}
            aria-label="Edit project"
          >
            <Pencil className={`w-4 h-4 ${dark ? 'text-slate-300' : 'text-slate-600'}`} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`glass-btn w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${hover}`}
          aria-label="Close project dashboard"
        >
          <X className={`w-5 h-5 ${dark ? 'text-slate-300' : 'text-slate-600'}`} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
        {error && (
          <div className={`mb-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] ${dark ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/25' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className={`grid gap-2.5 mb-5 ${NOTES_ENABLED ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <StatTile dark={dark} value={projectChats.length} label="Chats" />
          {NOTES_ENABLED && <StatTile dark={dark} value={openNotes.length} label="Open notes" />}
          {NOTES_ENABLED && <StatTile dark={dark} value={overdueNotes.length} label="Overdue" alert={overdueNotes.length > 0} />}
        </div>

        <button
          type="button"
          onClick={onNewChatInProject}
          className={`w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-[14px] font-medium transition mb-6 ${
            dark ? 'bg-white/[0.08] hover:bg-white/[0.12] text-slate-100' : 'bg-slate-900 text-white hover:bg-black'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          New chat in this project
        </button>

        <div className={`grid gap-5 ${NOTES_ENABLED ? 'md:grid-cols-2' : ''}`}>
          <div>
            <p className={`text-xs font-medium uppercase tracking-wide mb-2 px-1 ${muted}`}>Recent chats</p>
            {projectChats.length === 0 ? (
              <p className={`text-sm px-1 py-4 ${muted}`}>No chats in this project yet.</p>
            ) : (
              <div className="space-y-1">
                {projectChats.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectChat(c.id)}
                    className={`group w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ${hover}`}
                  >
                    <MessageSquare className={`w-4 h-4 shrink-0 ${muted}`} />
                    <span className="flex-1 min-w-0 truncate text-[14px]">{c.title || 'Untitled chat'}</span>
                    <span className={`text-[11px] shrink-0 ${muted}`}>{timeAgo(c.updated_at)}</span>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 ${muted}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {NOTES_ENABLED && (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>Notes</p>
              <button
                type="button"
                onClick={() => setShowNoteForm((s) => !s)}
                className={`text-[12px] font-medium flex items-center gap-1 min-h-[28px] ${dark ? 'text-indigo-300' : 'text-indigo-600'}`}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {showNoteForm && (
              <div className={`rounded-2xl p-3 space-y-2 mb-2 ${card}`}>
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Note"
                  rows={2}
                  className={`w-full resize-none rounded-xl px-3 py-2 text-[14px] outline-none glass-panel ${
                    dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                  }`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)} className={fieldClass}>
                    {(Object.keys(NOTE_TYPE_LABEL) as NoteType[]).map((t) => (
                      <option key={t} value={t}>{NOTE_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                  <select value={notePriority} onChange={(e) => setNotePriority(e.target.value as NotePriority)} className={fieldClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <input type="date" value={noteDue} onChange={(e) => setNoteDue(e.target.value)} className={fieldClass} aria-label="Due date" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNoteForm(false)} className={`flex-1 h-9 rounded-xl text-[13px] font-medium ${hover} ${muted}`}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitNote}
                    disabled={!noteText.trim() || savingNote}
                    className="flex-1 h-9 rounded-xl text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-2">
              {(['open', 'done', 'all'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setNoteFilter(s)} className={`${chip} ${noteFilter === s ? chipActive : hover}`}>
                  {s === 'open' ? 'Open' : s === 'done' ? 'Done' : 'All'}
                </button>
              ))}
            </div>

            {loadingNotes ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className={`w-4 h-4 animate-spin ${muted}`} />
              </div>
            ) : filteredNotes.length === 0 ? (
              <p className={`text-sm px-1 py-4 ${muted}`}>No notes here yet.</p>
            ) : (
              <AnimatePresence initial={false}>
                {filteredNotes.map((n) => (
                  <NoteRow
                    key={n.id}
                    dark={dark}
                    note={n}
                    busy={busyNoteId === n.id}
                    expanded={expanded.has(n.id)}
                    onToggleExpanded={() => toggleExpanded(n.id)}
                    onSetStatus={(status) => setNoteStatus(n, status)}
                    onDelete={() => removeNote(n.id)}
                    onToggleChecklistItem={(itemId) =>
                      updateChecklist(n, n.checklist.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)))
                    }
                    onRemoveChecklistItem={(itemId) => updateChecklist(n, n.checklist.filter((it) => it.id !== itemId))}
                    onAddChecklistItem={(text) =>
                      updateChecklist(n, [...n.checklist, { id: crypto.randomUUID(), text, done: false }])
                    }
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
          )}
        </div>

        <div className={`mt-8 pt-4 border-t ${dark ? 'border-white/10' : 'border-black/10'}`}>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[13px] font-medium text-red-500/80 hover:text-red-500 flex items-center gap-1.5 min-h-[28px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete project
            </button>
          ) : (
            <div className={`rounded-2xl p-3 flex items-center gap-3 ${dark ? 'bg-rose-500/10 ring-1 ring-rose-400/25' : 'bg-rose-50 ring-1 ring-rose-200'}`}>
              <p className="text-[13px] flex-1">Delete "{project.name}"? Its chats stay, but become unassigned.</p>
              <button type="button" onClick={() => setConfirmDelete(false)} className={`h-8 px-3 rounded-lg text-[13px] font-medium ${hover}`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="h-8 px-3 rounded-lg text-[13px] font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 flex items-center gap-1.5"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
