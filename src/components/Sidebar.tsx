import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SquarePen, Search, Link2, Settings, X, Trash2, Loader2,
  FolderKanban, Plus,
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
  onSelectProject: (id: string | null) => void
  onCreateProject: (name: string) => void
  onDeleteProject: (id: string) => void
  onOpenCommandPalette?: () => void
  onClose?: () => void
  showClose?: boolean
}

export default function Sidebar({
  dark, user, conversations, projects, currentConversationId, currentProjectId,
  deletingId, onNewChat, onSelectChat, onDeleteChat, onOpenSettings, onOpenConnectors,
  onSelectProject, onCreateProject, onDeleteProject, onOpenCommandPalette, onClose, showClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')

  const displayName =
    user.user_metadata?.preferred_name ||
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

  const text = dark ? 'text-slate-100' : 'text-slate-900'
  const hover = dark ? 'hover:bg-white/[0.08]' : 'hover:bg-black/[0.04]'
  const active = dark ? 'bg-white/[0.1]' : 'bg-white/70 text-[#1967d2]'
  const newChat = dark
    ? 'glass-btn bg-white/[0.08] hover:bg-white/[0.14]'
    : 'glass-btn bg-white/60 hover:bg-white/80'

  const submitProject = () => {
    const name = projectName.trim()
    if (!name) return
    onCreateProject(name)
    setProjectName('')
    setShowNewProject(false)
  }

  const openSearch = () => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette()
      return
    }
    setShowSearch((v) => !v)
  }

  return (
    <div className={`glass-sidebar flex flex-col h-full min-h-0 w-full ${text}`}>
      <div className="flex items-center justify-between px-4 pt-[max(1.1rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo size={32} dark={dark} className="shrink-0" />
          <span className="text-[20px] font-semibold tracking-tight truncate">Quantumy</span>
        </div>
        {showClose && onClose && (
          <button onClick={onClose} className={`glass-btn w-9 h-9 rounded-full flex items-center justify-center ${hover}`} aria-label="Close">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        )}
      </div>

      <div className="px-3 mt-1 space-y-0.5 shrink-0">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNewChat}
          className={`w-full flex items-center gap-3 h-12 rounded-full px-4 text-[15px] font-medium transition ${newChat}`}
        >
          <SquarePen className="w-[18px] h-[18px]" />
          New chat
        </motion.button>
        <button
          onClick={openSearch}
          className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] transition ${hover} ${dark ? 'text-slate-300' : 'text-slate-700'}`}
        >
          <Search className="w-[18px] h-[18px]" />
          <span className="flex-1 text-left">Search chats</span>
          <kbd className={`hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10 text-slate-400' : 'bg-black/[0.06] text-slate-500'}`}>
            ⌘K
          </kbd>
        </button>
        <button onClick={onOpenConnectors} className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] transition ${hover} ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
          <Link2 className="w-[18px] h-[18px]" />
          Connectors
        </button>
      </div>

      <AnimatePresence>
        {showSearch && !onOpenCommandPalette && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="px-4 pt-2 overflow-hidden shrink-0"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className={`glass-panel w-full h-10 rounded-full px-4 text-sm outline-none ${dark ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'}`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 mt-5 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Projects</span>
          <button type="button" onClick={() => setShowNewProject((v) => !v)} className={`p-1.5 rounded-lg ${hover}`} aria-label="New project">
            <Plus className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
        <AnimatePresence>
          {showNewProject && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-1.5 mb-2">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitProject()}
                  placeholder="Project name"
                  className={`glass-panel flex-1 h-9 rounded-xl px-3 text-sm outline-none ${dark ? 'text-slate-100' : 'text-slate-900'}`}
                />
                <button type="button" onClick={submitProject} className="h-9 px-3 rounded-xl text-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900">Add</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="space-y-0.5 max-h-28 overflow-y-auto">
          <button type="button" onClick={() => onSelectProject(null)} className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${!currentProjectId ? active : hover}`}>
            <FolderKanban className="w-4 h-4 shrink-0 opacity-70" /> All chats
          </button>
          <AnimatePresence initial={false}>
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8, height: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.2 }}
                className={`group flex items-center gap-1 rounded-xl ${currentProjectId === p.id ? active : hover}`}
              >
                <button type="button" onClick={() => onSelectProject(p.id)} className="flex-1 text-left px-3 py-2 text-sm truncate">{p.name}</button>
                <button type="button" onClick={() => onDeleteProject(p.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete project"><Trash2 className="w-3.5 h-3.5" /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 mt-3 pb-2">
        <p className="px-3 mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Chats</p>
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
                  delay: Math.min(i * 0.025, 0.25),
                  duration: 0.22,
                  ease: [0.22, 1, 0.36, 1],
                  layout: { duration: 0.2 },
                }}
                className={`group flex items-center gap-1 rounded-xl ${currentConversationId === c.id ? active : hover}`}
              >
                <button type="button" onClick={() => onSelectChat(c.id)} className="flex-1 text-left px-3 py-2.5 text-[14px] truncate">{c.title || 'New chat'}</button>
                <button type="button" onClick={() => onDeleteChat(c.id)} disabled={deletingId === c.id} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete chat">
                  {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-3 py-4 text-sm text-slate-500"
            >
              No chats yet
            </motion.p>
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
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">{initial}</div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <Settings className="w-4 h-4 text-slate-400 shrink-0" />
        </motion.button>
      </div>
    </div>
  )
}
