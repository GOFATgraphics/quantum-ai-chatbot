import { useMemo, useState } from 'react'
import {
  SquarePen, Search, Link2, Settings, X, Trash2, Loader2, MessageSquare,
} from 'lucide-react'
import type { Conversation } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  user: User
  conversations: Conversation[]
  currentConversationId: string | null
  deletingId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
  onOpenConnectors: () => void
  onClose?: () => void
  showClose?: boolean
}

export default function Sidebar({
  dark,
  user,
  conversations,
  currentConversationId,
  deletingId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
  onOpenConnectors,
  onClose,
  showClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const displayName =
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'User'

  const initial = displayName.charAt(0).toUpperCase()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q))
  }, [conversations, query])

  const bg = dark ? 'bg-[#0f0f16]' : 'bg-white'
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-500' : 'text-slate-500'
  const hoverRow = dark ? 'hover:bg-white/5' : 'hover:bg-slate-100'
  const activeRow = dark ? 'bg-white/10' : 'bg-slate-100'
  const pill = dark
    ? 'bg-white/10 text-slate-100 hover:bg-white/15'
    : 'bg-slate-100 text-slate-800 hover:bg-slate-200/80'
  const navItem = dark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'

  return (
    <div className={`flex flex-col h-full min-h-0 ${bg}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <span className={`text-[17px] font-medium tracking-tight ${textMain}`}>Quantumy</span>
        {showClose && onClose && (
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
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
            className={`w-full h-10 rounded-full px-4 text-sm outline-none ${dark ? 'bg-white/5 text-slate-100 placeholder:text-slate-500' : 'bg-slate-100 text-slate-900 placeholder:text-slate-400'}`}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 mt-4 px-2 pb-3">
        <p className={`px-3 mb-1 text-[12px] font-medium ${textMuted}`}>Recents</p>

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

      {/* Only Settings entry — next to profile */}
      <div className={`shrink-0 px-3 py-3 border-t ${dark ? 'border-white/5' : 'border-slate-100'}`}>
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
