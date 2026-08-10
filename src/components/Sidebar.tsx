import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SquarePen, Search, Link2, Settings, X, Trash2, Loader2,
  FolderKanban, ChevronRight,
} from 'lucide-react'
import type { Conversation, Project } from '../lib/supabase'
import Logo from './Logo'
import type { User } from '@supabase/supabase-js'

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
  onOpenProjects: () => void
  onSelectProject: (id: string | null) => void
  onOpenCommandPalette?: () => void
  onClose?: () => void
  showClose?: boolean
}

export default function Sidebar({
  dark, user, conversations, projects, currentConversationId, currentProjectId,
  deletingId, onNewChat, onSelectChat, onDeleteChat, onOpenSettings, onOpenConnectors,
  onOpenProjects, onSelectProject, onOpenCommandPalette, onClose, showClose,
}: Props) {
  const [query, setQuery] = useState('')

  const displayName =
    user.user_metadata?.preferred_name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'User'
  const initial = displayName.charAt(0).toUpperCase()

  const activeProject = useMemo(
    () => (currentProjectId ? projects.find((p) => p.id === currentProjectId) : null),
    [projects, currentProjectId],
  )

  const filtered = useMemo(() => {
    let list = conversations
    if (currentProjectId) list = list.filter((c) => c.project_id === currentProjectId)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, query, currentProjectId])

  const text = dark ? 'text-slate-100' : 'text-slate-900'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const hover = dark ? 'hover:bg-white/[0.08]' : 'hover:bg-black/[0.04]'
  const active = dark
    ? 'bg-indigo-500/20 text-indigo-200'
    : 'bg-indigo-50 text-indigo-700'
  const newChat = dark
    ? 'glass-btn bg-white/[0.08] hover:bg-white/[0.14]'
    : 'glass-btn bg-white/60 hover:bg-white/80'
  const row = `w-full flex items-center gap-3 h-11 rounded-xl px-3.5 text-[15px] transition ${hover} ${
    dark ? 'text-slate-200' : 'text-slate-700'
  }`

  return (
    <div className={`glass-sidebar flex flex-col h-full min-h-0 w-full ${text}`}>
      <div className="flex items-center justify-between px-4 pt-[max(1.1rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo size={32} dark={dark} className="shrink-0" />
          <span className="text-[20px] font-semibold tracking-tight truncate">Quantumy</span>
        </div>
        {showClose && onClose && (
          <button
            onClick={onClose}
            className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center ${hover}`}
            aria-label="Close"
          >
            <X className={`w-5 h-5 ${dark ? 'text-slate-300' : 'text-slate-600'}`} />
          </button>
        )}
      </div>

      <div className="px-3 mt-1 space-y-0.5 shrink-0">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onNewChat}
          className={`w-full flex items-center gap-3 h-12 rounded-xl px-3.5 text-[15px] font-medium transition ${newChat}`}
        >
          <SquarePen className="w-[18px] h-[18px]" />
          New chat
        </motion.button>

        <button type="button" onClick={() => onOpenCommandPalette?.()} className={row}>
          <Search className="w-[18px] h-[18px]" />
          <span className="flex-1 text-left">Search</span>
          <kbd
            className={`hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
              dark ? 'bg-white/10 text-slate-400' : 'bg-black/[0.06] text-slate-500'
            }`}
          >
            ⌘K
          </kbd>
        </button>

        <button type="button" onClick={onOpenConnectors} className={row}>
          <Link2 className="w-[18px] h-[18px]" />
          Connectors
        </button>

        <button type="button" onClick={onOpenProjects} className={row}>
          <FolderKanban className="w-[18px] h-[18px]" />
          <span className="flex-1 text-left">Projects</span>
          <ChevronRight className={`w-4 h-4 shrink-0 ${muted}`} />
        </button>
      </div>

      {activeProject && (
        <div className="px-3 mt-3 shrink-0">
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] ${
              dark ? 'bg-indigo-500/15 text-indigo-200' : 'bg-indigo-50 text-indigo-700'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 shrink-0 opacity-80" />
            <span className="flex-1 truncate font-medium">{activeProject.name}</span>
            <button
              type="button"
              onClick={() => onSelectProject(null)}
              className={`p-1 rounded-lg ${hover}`}
              aria-label="Clear project filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="px-3 mt-3 shrink-0">
        <div
          className={`flex items-center gap-2 h-10 rounded-xl px-3 ${
            dark ? 'bg-white/[0.06] ring-1 ring-white/[0.06]' : 'bg-black/[0.04] ring-1 ring-black/[0.04]'
          }`}
        >
          <Search className={`w-4 h-4 shrink-0 ${muted}`} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className={`flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] ${
              dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
            }`}
            aria-label="Filter chats"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className={`p-0.5 rounded ${hover}`} aria-label="Clear search">
              <X className={`w-3.5 h-3.5 ${muted}`} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 mt-3 pb-2">
        <p className={`px-3 mb-1 text-xs font-medium uppercase tracking-wide ${muted}`}>Chats</p>
        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
            {filtered.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12, height: 0, marginBottom: 0 }}
                transition={{
                  delay: Math.min(i * 0.02, 0.2),
                  duration: 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`group flex items-center gap-1 rounded-xl ${
                  currentConversationId === c.id ? active : hover
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChat(c.id)}
                  className="flex-1 text-left px-3 py-2.5 text-[14px] truncate"
                  aria-current={currentConversationId === c.id ? 'page' : undefined}
                >
                  {c.title || 'New chat'}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteChat(c.id)}
                  disabled={deletingId === c.id}
                  className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-red-500 active:text-red-500 disabled:opacity-40"
                  aria-label={`Delete chat ${c.title || 'New chat'}`}
                >
                  {deletingId === c.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <p className={`px-3 py-4 text-sm ${muted}`}>
              {query.trim()
                ? 'No matching chats'
                : activeProject
                  ? 'No chats in this project'
                  : 'No chats yet'}
            </p>
          )}
        </div>
      </div>

      <div className={`shrink-0 p-3 ${dark ? 'border-t border-white/[0.06]' : 'border-t border-black/[0.05]'}`}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={onOpenSettings}
          className={`glass-panel w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${hover}`}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className={`text-xs truncate ${muted}`}>{user.email}</p>
          </div>
          <Settings className={`w-4 h-4 shrink-0 ${muted}`} />
        </motion.button>
      </div>
    </div>
  )
}
