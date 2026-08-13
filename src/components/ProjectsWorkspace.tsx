import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, FolderKanban, Check, ChevronRight, Loader2, Pencil, StickyNote,
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

const COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#f97316', '#64748b']

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
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openNoteCounts, setOpenNoteCounts] = useState<Map<string, number>>(new Map())

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
  }, [user.id])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of conversations) {
      if (!c.project_id) continue
      map.set(c.project_id, (map.get(c.project_id) || 0) + 1)
    }
    return map
  }, [conversations])

  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const hover = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const active = dark
    ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30'
    : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
  const fieldClass = `w-full rounded-xl px-3 text-[14px] outline-none glass-panel ${
    dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
  }`

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
    } finally {
      setDeletingId(null)
    }
  }

  const pick = (id: string | null) => {
    onSelectProject(id)
    onClose()
  }

  return (
    <div className={`flex flex-col h-full ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
          <FolderKanban className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
          <p className={`text-[13px] ${muted}`}>Organize chats and notes into workspaces</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center ${hover}`}
          aria-label="Close projects"
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
                dark
                  ? 'bg-white/[0.08] hover:bg-white/[0.12] text-slate-100'
                  : 'bg-slate-900 text-white hover:bg-black'
              }`}
            >
              <Plus className="w-4 h-4" />
              New project
            </button>
          ) : (
            <div
              className={`rounded-2xl p-3 space-y-2 ${
                dark ? 'bg-white/[0.05] ring-1 ring-white/10' : 'bg-black/[0.03] ring-1 ring-black/5'
              }`}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && resetForm()}
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
                    style={{ backgroundColor: c, outline: color === c ? `2px solid ${dark ? '#fff' : '#000'}` : 'none', outlineOffset: 2 }}
                  >
                    {color === c && <Check className="w-3.5 h-3.5 text-white" />}
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
                  className="flex-1 h-9 rounded-xl text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingId ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
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
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              dark ? 'bg-white/10' : 'bg-slate-100'
            }`}
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
          {projects.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`text-sm px-1 py-6 text-center ${muted}`}
            >
              No projects yet. Create one to group related chats and notes.
            </motion.p>
          )}
          {projects.map((p) => {
            const isActive = currentProjectId === p.id
            const chatCount = counts.get(p.id) || 0
            const noteCount = openNoteCounts.get(p.id) || 0
            const swatch = p.color || COLORS[0]
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`group rounded-2xl mb-1.5 ${isActive ? active : hover}`}
              >
                <div className="flex items-center gap-1">
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
                    onClick={() => onOpenNotesForProject(p.id)}
                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-amber-500 shrink-0"
                    aria-label={`View notes for ${p.name}`}
                    title="View notes"
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-indigo-500 shrink-0"
                    aria-label={`Edit ${p.name}`}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={deletingId === p.id}
                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                    aria-label={`Delete project ${p.name}`}
                    title="Delete"
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
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
            className={`mt-6 w-full h-11 rounded-2xl text-[14px] font-medium transition ${
              dark
                ? 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            New chat in this project
          </button>
        )}
      </div>
    </div>
  )
}
