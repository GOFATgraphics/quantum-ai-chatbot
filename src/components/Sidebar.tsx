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
  onClose?: () => void
  showClose?: boolean
}

export default function Sidebar({
  dark, user, conversations, projects, currentConversationId, currentProjectId,
  deletingId, onNewChat, onSelectChat, onDeleteChat, onOpenSettings, onOpenConnectors,
  onSelectProject, onCreateProject, onDeleteProject, onClose, showClose,
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

  const bg = dark ? 'bg-[#0e0e14] text-slate-100' : 'bg-white text-slate-900'
  const hover = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const active = dark ? 'bg-white/[0.08]' : 'bg-[#e8f0fe] text-[#1967d2]'
  const newChat = dark ? 'bg-white/[0.08] hover:bg-white/[0.12]' : 'bg-[#f0f4f8] hover:bg-[#e8edf3]'

  const submitProject = () => {
    const name = projectName.trim()
    if (!name) return
    onCreateProject(name)
    setProjectName('')
    setShowNewProject(false)
  }

  return (
    <div className={`flex flex-col h-full min-h-0 w-full ${bg}`}>
      <div className="flex items-center justify-between px-4 pt-[max(1.1rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo size={32} dark={dark} className="shrink-0" />
          <span className="text-[20px] font-semibold tracking-tight truncate">Quantumy</span>
        </div>
        {showClose && onClose && (
          <button onClick={onClose} className={`w-9 h-9 rounded-full flex items-center justify-center ${hover}`} aria-label="Close">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        )}
      </div>

      <div className="px-3 mt-1 space-y-0.5 shrink-0">
        <button onClick={onNewChat} className={`w-full flex items-center gap-3 h-12 rounded-full px-4 text-[15px] font-medium transition ${newChat}`}>
          <SquarePen className="w-[18px] h-[18px]" />
          New chat
        </button>
        <button onClick={() => setShowSearch((v) => !v)} className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] transition ${hover} ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
          <Search className="w-[18px] h-[18px]" />
          Search chats
        </button>
        <button onClick={onOpenConnectors} className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] transition ${hover} ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
          <Link2 className="w-[18px] h-[18px]" />
          Connectors
        </button>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pt-2 overflow-hidden shrink-0">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats…" className={`w-full h-10 rounded-full px-4 text-sm outline-none border ${dark ? 'bg-white/5 border-white/10 text-slate-100' : 'bg-[#f1f3f4] border-transparent text-slate-900'}`} />
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
        {showNewProject && (
          <div className="flex gap-1.5 mb-2">
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitProject()} placeholder="Project name" className={`flex-1 h-9 rounded-xl px-3 text-sm outline-none border ${dark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`} />
            <button type="button" onClick={submitProject} className="h-9 px-3 rounded-xl text-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900">Add</button>
          </div>
        )}
        <div className="space-y-0.5 max-h-28 overflow-y-auto">
          <button type="button" onClick={() => onSelectProject(null)} className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${!currentProjectId ? active : hover}`}>
            <FolderKanban className="w-4 h-4 shrink-0 opacity-70" /> All chats
          </button>
          {projects.map((p) => (
            <div key={p.id} className={`group flex items-center gap-1 rounded-xl ${currentProjectId === p.id ? active : hover}`}>
              <button type="button" onClick={() => onSelectProject(p.id)} className="flex-1 text-left px-3 py-2 text-sm truncate">{p.name}</button>
              <button type="button" onClick={() => onDeleteProject(p.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete project"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 mt-3 pb-2">
        <p className="px-3 mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Chats</p>
        <div className="space-y-0.5">
          {filtered.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-xl ${currentConversationId === c.id ? active : hover}`}>
              <button type="button" onClick={() => onSelectChat(c.id)} className="flex-1 text-left px-3 py-2.5 text-[14px] truncate">{c.title || 'New chat'}</button>
              <button type="button" onClick={() => onDeleteChat(c.id)} disabled={deletingId === c.id} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete chat">
                {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No chats yet</p>}
        </div>
      </div>

      <div className="shrink-0 border-t border-black/[0.06] dark:border-white/[0.06] p-3">
        <button type="button" onClick={onOpenSettings} className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${hover}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">{initial}</div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <Settings className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>
    </div>
  )
}
