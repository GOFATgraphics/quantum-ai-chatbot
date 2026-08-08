import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SquarePen, Search, Link2, Settings, X, Trash2, Loader2,
  FolderKanban, Plus,
} from 'lucide-react'
import type { Conversation, Project } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import Logo from './Logo'

type Props = {
  dark: boolean
  user: User
  conversations: Conversation[]
  projects: Project[]
  currentConversationId: string | null
  currentProjectId: string | null
  deletingId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
  onOpenConnectors: () => void
  onSelectProject: (id: string | null) => void
  onCreateProject: (name: string) => void
  onDeleteProject: (id: string) => void
  onClose?: () => void
  showClose?: boolean
}

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.035, delayChildren: 0.04 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
}

export default function Sidebar({
  dark,
  user,
  conversations,
  projects,
  currentConversationId,
  currentProjectId,
  deletingId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
  onOpenConnectors,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onClose,
  showClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')

  const displayName =
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'User'
  const initial = displayName.charAt(0).toUpperCase()

  const filtered = useMemo(() => {
    let list = conversations
    if (currentProjectId) list = list.filter((c) => c.project_id === currentProjectId)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, query, currentProjectId])

  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-500' : 'text-slate-500'
  const hoverRow = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const activeRow = dark ? 'bg-white/[0.09]' : 'bg-black/[0.05]'
  const navItem = dark
    ? 'text-slate-300 hover:bg-white/[0.06] active:scale-[0.98]'
    : 'text-slate-700 hover:bg-black/[0.04] active:scale-[0.98]'

  const submitProject = () => {
    const name = projectName.trim()
    if (!name) return
    onCreateProject(name)
    setProjectName('')
    setShowNewProject(false)
  }

  return (
    <div
      className={`flex flex-col h-full min-h-0 w-full ${
        dark ? 'bg-[#0e0e14] border-r border-white/[0.06]' : 'bg-[#f3f4f8] border-r border-black/[0.05]'
      }`}
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo size={28} className="shrink-0" />
          <span className={`text-[16px] font-semibold tracking-tight ${textMain}`}>Quantumy</span>
        </div>
        {showClose && onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition ${dark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
            aria-label="Close menu"
          >
            <X className={`w-5 h-5 ${textMuted}`} />
          </button>
        )}
      </div>

      <div className="px-3 space-y-0.5 shrink-0">
        <button
          onClick={onNewChat}
          className={`w-full flex items-center gap-3 h-11 rounded-2xl px-3.5 text-[14px] font-medium transition active:scale-[0.98] ${
            dark
              ? 'bg-white/[0.08] text-slate-100 hover:bg-white/[0.12] border border-white/[0.06]'
              : 'bg-white text-slate-800 hover:bg-white shadow-sm border border-black/[0.04]'
          }`}
        >
          <SquarePen className="w-[18px] h-[18px]" />
          New chat
        </button>

        <button
          onClick={() => setShowSearch((v) => !v)}
          className={`w-full flex items-center gap-3 h-10 rounded-2xl px-3.5 text-[14px] transition ${navItem}`}
        >
          <Search className="w-[18px] h-[18px]" />
          Search chats
        </button>

        <button
          onClick={onOpenConnectors}
          className={`w-full flex items-center gap-3 h-10 rounded-2xl px-3.5 text-[14px] transition ${navItem}`}
        >
          <Link2 className="w-[18px] h-[18px]" />
          Connectors
        </button>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 pt-2 shrink-0 overflow-hidden"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className={`w-full h-10 rounded-2xl px-4 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/30 ${
                dark
                  ? 'bg-white/[0.06] text-slate-100 placeholder:text-slate-500 border border-white/10'
                  : 'bg-white text-slate-900 placeholder:text-slate-400 border border-black/[0.06]'
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 mt-5 shrink-0">
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${textMuted}`}>
            Projects
          </span>
          <button
            onClick={() => setShowNewProject((v) => !v)}
            className={`p-1 rounded-lg transition ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-black/5 text-slate-500'}`}
            aria-label="New project"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <AnimatePresence>
          {showNewProject && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitProject()}
                  placeholder="Project name"
                  className={`flex-1 h-9 rounded-xl px-3 text-sm outline-none ${
                    dark
                      ? 'bg-white/[0.06] border border-white/10 text-slate-100'
                      : 'bg-white border border-black/[0.06] text-slate-900'
                  }`}
                />
                <button
                  onClick={submitProject}
                  className="px-3 h-9 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition"
                >
                  Add
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-0.5 max-h-28 overflow-y-auto">
          <button
            onClick={() => onSelectProject(null)}
            className={`w-full flex items-center gap-2.5 h-9 rounded-xl px-2.5 text-[13px] transition ${
              !currentProjectId ? activeRow : hoverRow
            } ${textMain}`}
          >
            <FolderKanban className={`w-4 h-4 ${textMuted}`} />
            All chats
          </button>
          {projects.map((p) => (
            <div key={p.id} className={`group flex items-center rounded-xl transition ${currentProjectId === p.id ? activeRow : hoverRow}`}>
              <button
                onClick={() => onSelectProject(p.id)}
                className={`flex-1 flex items-center gap-2.5 h-9 px-2.5 text-[13px] min-w-0 ${textMain}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || '#6366f1' }} />
                <span className="truncate">{p.name}</span>
              </button>
              <button
                onClick={() => onDeleteProject(p.id)}
                className={`p-1.5 mr-1 rounded-full opacity-0 group-hover:opacity-100 transition ${dark ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 mt-4 pb-2">
        <p className={`text-[11px] font-semibold uppercase tracking-wider px-1 mb-1.5 ${textMuted}`}>
          Recents
        </p>

        {filtered.length === 0 && (
          <p className={`px-3 py-8 text-sm text-center ${textMuted}`}>
            {query ? 'No matching chats' : 'No chats yet'}
          </p>
        )}

        <motion.div
          className="space-y-0.5"
          variants={listVariants}
          initial="hidden"
          animate="show"
          key={`${currentProjectId || 'all'}-${filtered.length}`}
        >
          {filtered.map((conv) => {
            const active = currentConversationId === conv.id
            return (
              <motion.div
                key={conv.id}
                variants={itemVariants}
                className={`group flex items-center rounded-2xl transition ${active ? activeRow : hoverRow}`}
              >
                <button
                  onClick={() => onSelectChat(conv.id)}
                  className="flex-1 text-left px-3.5 py-2.5 text-[14px] min-w-0"
                >
                  <span className={`block truncate ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {conv.title || 'Untitled'}
                  </span>
                </button>
                <button
                  onClick={() => onDeleteChat(conv.id)}
                  disabled={deletingId === conv.id}
                  className={`p-2 mr-1 rounded-full opacity-0 group-hover:opacity-100 transition ${
                    dark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                  }`}
                  title="Delete"
                >
                  {deletingId === conv.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      <div className={`shrink-0 px-3 py-3 border-t ${dark ? 'border-white/[0.05]' : 'border-black/[0.05]'}`}>
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-3 rounded-2xl px-2 py-2 transition ${hoverRow} active:scale-[0.98]`}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className={`text-sm font-medium truncate ${textMain}`}>{displayName}</p>
            <p className={`text-xs truncate ${textMuted}`}>{user.email}</p>
          </div>
          <Settings className={`w-5 h-5 shrink-0 ${textMuted}`} />
        </button>
      </div>
    </div>
  )
}
