import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, FolderKanban, Check, ChevronRight, Loader2,
} from 'lucide-react'
import type { Conversation, Project } from '../lib/supabase'

type Props = {
  dark: boolean
  projects: Project[]
  conversations: Conversation[]
  currentProjectId: string | null
  onClose: () => void
  onSelectProject: (id: string | null) => void
  onCreateProject: (name: string) => void | Promise<void>
  onDeleteProject: (id: string) => void | Promise<void>
  onNewChat?: () => void
}

export default function ProjectsWorkspace({
  dark,
  projects,
  conversations,
  currentProjectId,
  onClose,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onNewChat,
}: Props) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

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

  const submit = async () => {
    const n = name.trim()
    if (!n || creating) return
    setCreating(true)
    try {
      await onCreateProject(n)
      setName('')
      setShowForm(false)
    } finally {
      setCreating(false)
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
          <p className={`text-[13px] ${muted}`}>Organize chats into workspaces</p>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                  if (e.key === 'Escape') {
                    setShowForm(false)
                    setName('')
                  }
                }}
                placeholder="Project name"
                className={`w-full h-10 rounded-xl px-3 text-[14px] outline-none glass-panel ${
                  dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setName('')
                  }}
                  className={`flex-1 h-9 rounded-xl text-[13px] font-medium ${hover} ${muted}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!name.trim() || creating}
                  className="flex-1 h-9 rounded-xl text-[13px] font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Create
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
              No projects yet. Create one to group related chats.
            </motion.p>
          )}
          {projects.map((p) => {
            const isActive = currentProjectId === p.id
            const count = counts.get(p.id) || 0
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`group flex items-center gap-1 rounded-2xl mb-1 ${isActive ? active : hover}`}
              >
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  className="flex-1 flex items-center gap-3 px-3.5 py-3 text-left min-w-0"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      dark ? 'bg-indigo-500/20' : 'bg-indigo-100'
                    }`}
                  >
                    <FolderKanban className={`w-4 h-4 ${dark ? 'text-indigo-300' : 'text-indigo-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{p.name}</p>
                    <p className={`text-[12px] ${muted}`}>
                      {count} chat{count === 1 ? '' : 's'}
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
                  onClick={() => remove(p.id)}
                  disabled={deletingId === p.id}
                  className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-40"
                  aria-label={`Delete project ${p.name}`}
                >
                  {deletingId === p.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
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
