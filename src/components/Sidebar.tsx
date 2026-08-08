import { useMemo, useState } from 'react'
import {
  SquarePen, Search, Link2, Settings, X, Trash2, Loader2, MessageSquare,
  FolderKanban, Plus,
} from 'lucide-react'
import type { Conversation, Project } from '../lib/supabase'
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
    if (currentProjectId) {
      list = list.filter((c) => c.project_id === currentProjectId)
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, query, currentProjectId])

  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-500' : 'text-slate-500'
  const hoverRow = dark ? 'hover:bg-white/8' : 'hover:bg-white/50'
  const activeRow = dark ? 'bg-white/10' : 'bg-white/70'
  const pill = dark
    ? 'bg-white/10 text-slate-100 hover:bg-white/15 border border-white/10'
    : 'bg-white/70 text-slate-800 hover:bg-white/90 border border-white/80 shadow-sm'
  const navItem = dark ? 'text-slate-300 hover:bg-white/8' : 'text-slate-700 hover:bg-white/50'

  const submitProject = () => {
    const name = projectName.trim()
    if (!name) return
    onCreateProject(name)
    setProjectName('')
    setShowNewProject(false)
  }

  return (
    <div className={`flex flex-col h-full min-h-0 glass-panel ${dark ? 'glass-panel-dark' : 'glass-panel-light'}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <span className={`text-[17px] font-medium tracking-tight ${textMain}`}>Quantumy</span>
        {showClose && onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-white/60'}`}
            aria-label="Close menu"
          >
            <X className={`w-5 h-5 ${textMuted}`} />
          </button>
        )}
      </div>

      <div className="px-3 space-y-1 shrink-0">
        <button
          onClick={onNewChat}
          className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] font-medium transition ${pill}`}
        >
          <SquarePen className="w-[18px] h-[18px]" />
          New chat
        </button>

        <button
          onClick={() => setShowSearch((v) => !v)}
          className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] transition ${navItem}`}
        >
          <Search className="w-[18px] h-[18px]" />
          Search chats
        </button>

        <button
          onClick={onOpenConnectors}
          className={`w-full flex items-center gap-3 h-11 rounded-full px-4 text-[15px] transition ${navItem}`}
        >
          <Link2 className="w-[18px] h-[18px]" />
          Connectors
        </button>
      </div>

      {showSearch && (
        <div className="px-3 pt-2 shrink-0">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className={`w-full h-10 rounded-full px-4 text-sm outline-none ${dark ? 'bg-white/8 text-slate-100 placeholder:text-slate-500 border border-white/10' : 'bg-white/60 text-slate-900 placeholder:text-slate-400 border border-white/80'}`}
          />
        </div>
      )}

      {/* Projects */}
      <div className="px-3 mt-4 shrink-0">
        <div className="flex items-center justify-between px-1 mb-1">
          <p className={`text-[12px] font-medium ${textMuted}`}>Projects</p>
          <button
            onClick={() => setShowNewProject((v) => !v)}
            className={`p-1 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-white/60'}`}
            title="New project"
          >
            <Plus className={`w-3.5 h-3.5 ${textMuted}`} />
          </button>
        </div>

        {showNewProject && (
          <div className="mb-2 flex gap-1">
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitProject()}
              placeholder="Project name"
              className={`flex-1 h-9 rounded-xl px-3 text-sm outline-none ${dark ? 'bg-white/8 border border-white/10 text-slate-100' : 'bg-white/70 border border-white/80 text-slate-900'}`}
            />
            <button
              onClick={submitProject}
              className="h-9 px-3 rounded-xl text-xs font-medium text-white bg-indigo-600"
            >
              Add
            </button>
          </div>
        )}

        <button
          onClick={() => onSelectProject(null)}
          className={`w-full flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] transition ${!currentProjectId ? activeRow : hoverRow}`}
        >
          <FolderKanban className={`w-4 h-4 ${textMuted}`} />
          <span className={textMain}>All chats</span>
        </button>

        <div className="space-y-0.5 max-h-36 overflow-y-auto">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center rounded-full transition ${currentProjectId === p.id ? activeRow : hoverRow}`}
            >
              <button
                onClick={() => onSelectProject(p.id)}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 text-[13px] min-w-0"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: p.color || '#6366f1' }}
                />
                <span className={`truncate ${textMain}`}>{p.name}</span>
              </button>
              <button
                onClick={() => onDeleteProject(p.id)}
                className={`p-1.5 mr-1 rounded-full opacity-0 group-hover:opacity-100 ${dark ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 mt-3 px-2 pb-3">
        <p className={`px-3 mb-1 text-[12px] font-medium ${textMuted}`}>
          {currentProjectId ? 'Project chats' : 'Recents'}
        </p>

        {filtered.length === 0 && (
          <p className={`px-3 py-8 text-sm text-center ${textMuted}`}>
            {query ? 'No matching chats' : 'No chats yet'}
          </p>
        )}

        <div className="space-y-0.5">
          {filtered.map((conv) => {
            const active = currentConversationId === conv.id
            return (
              <div
                key={conv.id}
                className={`group flex items-center rounded-full transition ${
                  active ? activeRow : hoverRow
                }`}
              >
                <button
                  onClick={() => onSelectChat(conv.id)}
                  className="flex-1 text-left px-3 py-2.5 text-[14px] flex items-center gap-2.5 min-w-0"
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 ${textMuted}`} />
                  <span className={`truncate ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {conv.title || 'Untitled'}
                  </span>
                </button>
                <button
                  onClick={() => onDeleteChat(conv.id)}
                  disabled={deletingId === conv.id}
                  className={`p-2 mr-1 rounded-full opacity-0 group-hover:opacity-100 transition ${dark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                  title="Delete"
                >
                  {deletingId === conv.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className={`shrink-0 px-3 py-3 border-t ${dark ? 'border-white/5' : 'border-white/50'}`}>
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-3 rounded-2xl px-2 py-2 transition ${hoverRow}`}
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
