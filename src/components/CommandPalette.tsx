import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, SquarePen, Settings, Link2, Sun, Moon, MessageSquare, FolderKanban, ArrowRight, PanelLeft } from 'lucide-react'
import type { Conversation, Project } from '../lib/supabase'

export type CommandAction = {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  section: 'Actions' | 'Projects' | 'Chats'
  run: () => void
}

type Props = {
  open: boolean
  onClose: () => void
  dark: boolean
  conversations: Conversation[]
  projects: Project[]
  currentConversationId: string | null
  currentProjectId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onSelectProject: (id: string | null) => void
  onOpenSettings: () => void
  onOpenConnectors: () => void
  onToggleTheme: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

function matchesQuery(text: string, q: string) {
  if (!q) return true
  const t = text.toLowerCase()
  const parts = q.toLowerCase().split(/\s+/).filter(Boolean)
  return parts.every((p) => t.includes(p))
}

export default function CommandPalette({
  open,
  onClose,
  dark,
  conversations,
  projects,
  currentConversationId,
  currentProjectId,
  onNewChat,
  onSelectChat,
  onSelectProject,
  onOpenSettings,
  onOpenConnectors,
  onToggleTheme,
  sidebarCollapsed = false,
  onToggleSidebar,
}: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open])

  const items = useMemo(() => {
    const actions: CommandAction[] = [
      {
        id: 'new-chat',
        label: 'New chat',
        hint: '⌘N',
        icon: <SquarePen className="w-4 h-4" />,
        section: 'Actions',
        run: () => { onNewChat(); onClose() },
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <Settings className="w-4 h-4" />,
        section: 'Actions',
        run: () => { onOpenSettings(); onClose() },
      },
      {
        id: 'connectors',
        label: 'Connectors',
        icon: <Link2 className="w-4 h-4" />,
        section: 'Actions',
        run: () => { onOpenConnectors(); onClose() },
      },
      ...(onToggleSidebar
        ? [{
            id: 'toggle-sidebar',
            label: sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar',
            hint: '\u2318B',
            icon: <PanelLeft className="w-4 h-4" />,
            section: 'Actions' as const,
            run: () => { onToggleSidebar(); onClose() },
          }]
        : []),
      {
        id: 'theme',
        label: dark ? 'Switch to light mode' : 'Switch to dark mode',
        icon: dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
        section: 'Actions',
        run: () => { onToggleTheme(); onClose() },
      },
      {
        id: 'all-chats',
        label: 'All chats',
        hint: currentProjectId ? undefined : 'Current',
        icon: <FolderKanban className="w-4 h-4" />,
        section: 'Projects',
        run: () => { onSelectProject(null); onClose() },
      },
    ]

    for (const p of projects) {
      actions.push({
        id: `project-${p.id}`,
        label: p.name,
        hint: currentProjectId === p.id ? 'Current' : undefined,
        icon: <FolderKanban className="w-4 h-4" />,
        section: 'Projects',
        run: () => { onSelectProject(p.id); onClose() },
      })
    }

    const q = query.trim()
    const filteredActions = actions.filter((a) => matchesQuery(a.label, q))

    const chatList = conversations
      .filter((c) => matchesQuery(c.title || 'New chat', q))
      .slice(0, 12)
      .map((c): CommandAction => ({
        id: `chat-${c.id}`,
        label: c.title || 'New chat',
        hint: currentConversationId === c.id ? 'Current' : undefined,
        icon: <MessageSquare className="w-4 h-4" />,
        section: 'Chats',
        run: () => { onSelectChat(c.id); onClose() },
      }))

    return [...filteredActions, ...chatList]
  }, [
    query, conversations, projects, dark, currentConversationId, currentProjectId,
    onNewChat, onSelectChat, onSelectProject, onOpenSettings, onOpenConnectors, onToggleTheme, onClose,
    onToggleSidebar, sidebarCollapsed,
  ])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[active]
        if (item) item.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, active, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const sections = useMemo(() => {
    const order: Array<CommandAction['section']> = ['Actions', 'Projects', 'Chats']
    return order
      .map((section) => ({
        section,
        rows: items.filter((i) => i.section === section),
      }))
      .filter((g) => g.rows.length > 0)
  }, [items])

  let flatIndex = -1

  const panel = 'bg-card border-border text-foreground'
  const inputCls = 'text-foreground placeholder:text-muted-foreground'
  const rowHover = 'hover:bg-accent'
  const rowActive = 'bg-secondary text-foreground'
  const muted = 'text-muted-foreground'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[min(18vh,120px)] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Fast navigation"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full max-w-[520px] rounded-2xl border shadow-2xl overflow-hidden ${panel}`}
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
              <Search className={`w-[18px] h-[18px] shrink-0 ${muted}`} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats, projects, actions…"
                className={`flex-1 bg-transparent outline-none text-[15px] ${inputCls}`}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="hidden sm:inline text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[min(52vh,380px)] overflow-y-auto py-2">
              {items.length === 0 ? (
                <p className={`px-4 py-8 text-center text-sm ${muted}`}>No results</p>
              ) : (
                sections.map((group) => (
                  <div key={group.section} className="mb-1">
                    <div className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
                      {group.section}
                    </div>
                    {group.rows.map((item) => {
                      flatIndex += 1
                      const idx = flatIndex
                      const isActive = idx === active
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-index={idx}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => item.run()}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] transition ${
                            isActive ? rowActive : rowHover
                          }`}
                        >
                          <span className={`shrink-0 ${isActive ? '' : muted}`}>{item.icon}</span>
                          <span className="flex-1 min-w-0 truncate font-medium">{item.label}</span>
                          {item.hint && (
                            <span className={`text-[11px] shrink-0 ${muted}`}>{item.hint}</span>
                          )}
                          {isActive && <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${muted}`} />}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className={`flex items-center gap-3 px-4 py-2 text-[11px] border-t border-border ${muted}`}>
              <span><kbd className="font-medium">↑↓</kbd> navigate</span>
              <span><kbd className="font-medium">↵</kbd> open</span>
              <span className="ml-auto"><kbd className="font-medium">⌘K</kbd> toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
