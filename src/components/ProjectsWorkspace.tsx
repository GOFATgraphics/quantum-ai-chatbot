import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, FolderKanban, Check, ChevronRight, Loader2, Pencil, StickyNote,
  Search, LayoutDashboard, AlertTriangle,
} from 'lucide-react'
import { supabase, type Conversation, type Project } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  user: User
  projects: Project[]
  conversations: Conversation[]
  currentProjectId: string | null
  onClose: () => void
  onSelectProject: (id: string | null) => void
  onCreateProject: (name: string, description?: string, color?: string) => void | Promise<void>
  onUpdateProject: (id: string, patch: { name?: string; description?: string | null; color?: string }) => void | Promise<void>
  onDeleteProject: (id: string) => void | Promise<void>
  onNewChat?: () => void
  onOpenNotesForProject: (id: string) => void
  onOpenDashboard: (id: string) => void
}

const COLORS = ['#0a0a0a', '#525252', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#f97316']

export default function ProjectsWorkspace({
  dark,
  user,
  projects,
  conversations,
  currentProjectId,
  onClose,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onNewChat,
  onOpenNotesForProject,
  onOpenDashboard,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openNoteCounts, setOpenNoteCounts] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeleteId) setConfirmDeleteId(null)
        else if (showForm) resetForm()
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDeleteId, showForm, onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('notes')
        .select('project_id')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .not('project_id', 'is', null)
      if (cancelled || !data) return
      const map = new Map<string, number>()
      for (const row of data as { project_id: string }[]) {
        map.set(row.project_id, (map.get(row.project_id) || 0) + 1)
      }
      setOpenNoteCounts(map)
    })()
    return () => {
      cancelled = true
    }
  }, [user.id, projects.length])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of conversations) {
      if (!c.project_id) continue
      map.set(c.project_id, (map.get(c.project_id) || 0) + 1)
    }
    return map
  }, [conversations])

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
    )
  }, [projects, query])

  const muted = 'text-muted-foreground'
  const hover = 'hover:bg-accent'
  const active = 'bg-secondary text-foreground ring-1 ring-border'
  const card = 'bg-card ring-1 ring-border'
  const fieldClass = 'w-full rounded-xl px-3 text-[14px] outline-none glass-panel text-foreground placeholder:text-muted-foreground'
  const primaryBtn = 'bg-primary text-primary-foreground hover:bg-primary/90'

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setDescription('')
    setColor(COLORS[0])
  }

  const startEdit = (p: Project) => {
    setEditingId(p.id)
    setName(p.name)
    setDescription(p.description || '')
    setColor(p.color || COLORS[0])
    setShowForm(true)
    setConfirmDeleteId(null)
  }

  const submit = async () => {
    const n = name.trim()
    if (!n || saving) return
    setSaving(true)
    try {
      if (editingId) {
        await onUpdateProject(editingId, { name: n, description: description.trim() || null, color })
      } else {
        await onCreateProject(n, description.trim(), color)
      }
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeletingId(id)
    try {
      await onDeleteProject(id)
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  const pick = (id: string | null) => {
    onSelectProject(id)
    onClose()
  }

  return (
    <div className="flex flex-col h-full text-foreground">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-primary text-primary-foreground"
        >
          <FolderKanban className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
          <p className={`text-[13px] ${muted}`}>
            {projects.length} workspace{projects.length === 1 ? '' : 's'} · organize chats & notes
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center ${hover}`}
          aria-label="Close projects"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
        {projects.length > 3 && (
          <div
            className="flex items-center gap-2 h-10 rounded-xl px-3 mb-3 bg-muted ring-1 ring-border"
          >
            <Search className={`w-4 h-4 shrink-0 ${muted}`} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] text-foreground placeholder:text-muted-foreground"
              aria-label="Search projects"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className={`p-0.5 rounded ${hover}`} aria-label="Clear">
                <X className={`w-3.5 h-3.5 ${muted}`} />
              </button>
            )}
          </div>
        )}

        <div className="mb-4">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={`w-full flex items-center justify-center gap-2 h-11 rounded-2xl text-[14px] font-medium transition ${primaryBtn}`}
            >
              <Plus className="w-4 h-4" />
              New project
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-3.5 space-y-2.5 ${card}`}
            >
              <p className={`text-[12px] font-medium uppercase tracking-wide ${muted}`}>
                {editingId ? 'Edit project' : 'New project'}
              </p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) void submit()
                  if (e.key === 'Escape') resetForm()
                }}
                placeholder="Project name"
                className={`${fieldClass} h-10`}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && resetForm()}
                placeholder="Description (optional)"
                rows={2}
                className={`${fieldClass} resize-none py-2`}
              />
              <div className="flex items-center gap-1.5 pt-0.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Use color ${c}`}
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center transition"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `2px solid ${dark ? '#fff' : '#000'}` : 'none',
                      outlineOffset: 2,
                    }}
                  >
                    {color === c && <Check className="w-3.5 h-3.5 text-white mix-blend-difference" />}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className={`flex-1 h-9 rounded-xl text-[13px] font-medium ${hover} ${muted}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!name.trim() || saving}
                  className={`flex-1 h-9 rounded-xl text-[13px] font-medium disabled:opacity-40 flex items-center justify-center gap-1.5 ${primaryBtn}`}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingId ? 'Save' : 'Create'}
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <button
          type="button"
          onClick={() => pick(null)}
          className={`w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 mb-2 text-left transition ${
            !currentProjectId ? active : hover
          }`}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-secondary"
          >
            <FolderKanban className="w-4 h-4 opacity-80" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium">All chats</p>
            <p className={`text-[12px] ${muted}`}>{conversations.length} total</p>
          </div>
          {!currentProjectId && <Check className="w-4 h-4 shrink-0" />}
        </button>

        <p className={`text-xs font-medium uppercase tracking-wide mb-2 mt-4 px-1 ${muted}`}>
          Your projects
        </p>

        <AnimatePresence initial={false}>
          {filteredProjects.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`text-center py-10 px-4 ${muted}`}
            >
              <FolderKanban className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {query.trim()
                  ? 'No projects match your search.'
                  : 'No projects yet. Create one to group related chats and notes.'}
              </p>
            </motion.div>
          )}
          {filteredProjects.map((p) => {
            const isActive = currentProjectId === p.id
            const chatCount = counts.get(p.id) || 0
            const noteCount = openNoteCounts.get(p.id) || 0
            const swatch = p.color || COLORS[0]
            const confirming = confirmDeleteId === p.id
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`group rounded-2xl mb-1.5 overflow-hidden ${
                  confirming
                    ? 'bg-destructive/10 ring-1 ring-destructive/25'
                    : isActive
                      ? active
                      : hover
                }`}
              >
                {confirming ? (
                  <div className="flex items-center gap-2 px-3.5 py-3">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-[13px] flex-1 min-w-0">Delete “{p.name}”?</p>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className={`h-8 px-2.5 rounded-lg text-[12px] font-medium ${hover}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      disabled={deletingId === p.id}
                      className="h-8 px-2.5 rounded-lg text-[12px] font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 flex items-center gap-1"
                    >
                      {deletingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onOpenDashboard(p.id)}
                      className="flex-1 flex items-center gap-3 px-3.5 py-3 text-left min-w-0"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${swatch}26` }}
                      >
                        <FolderKanban className="w-4 h-4" style={{ color: swatch }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium truncate">{p.name}</p>
                        {p.description && (
                          <p className={`text-[12px] truncate ${muted}`}>{p.description}</p>
                        )}
                        <p className={`text-[12px] ${muted}`}>
                          {chatCount} chat{chatCount === 1 ? '' : 's'}
                          {noteCount > 0 && ` · ${noteCount} open note${noteCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      {isActive ? (
                        <Check className="w-4 h-4 shrink-0" />
                      ) : (
                        <ChevronRight className={`w-4 h-4 shrink-0 opacity-0 group-hover:opacity-60 ${muted}`} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDashboard(p.id)}
                      className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`Open dashboard for ${p.name}`}
                      title="Dashboard"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenNotesForProject(p.id)}
                      className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`View notes for ${p.name}`}
                      title="Notes"
                    >
                      <StickyNote className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`Edit ${p.name}`}
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(p.id)}
                      className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                      aria-label={`Delete project ${p.name}`}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {currentProjectId && onNewChat && (
          <button
            type="button"
            onClick={() => {
              onNewChat()
              onClose()
            }}
            className="mt-6 w-full h-11 rounded-2xl text-[14px] font-medium transition bg-secondary text-foreground hover:bg-accent"
          >
            New chat in this project
          </button>
        )}
      </div>
    </div>
  )
}
