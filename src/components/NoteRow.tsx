import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Trash2, Loader2, EyeOff, AlertTriangle, Tag, ListChecks, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { Note } from '../lib/supabase'
import { NOTE_TYPE_LABEL, PRIORITY_DOT, dueLabel } from '../lib/noteHelpers'

type Props = {
  dark: boolean
  note: Note
  busy: boolean
  expanded: boolean
  onToggleExpanded: () => void
  onSetStatus: (status: Note['status']) => void
  /** Omit to hide the dismiss action */
  onDismiss?: () => void
  onDelete: () => void
  onToggleChecklistItem: (itemId: string) => void
  onRemoveChecklistItem: (itemId: string) => void
  onAddChecklistItem: (text: string) => void
  projectName?: string | null
  onTagClick?: (tag: string) => void
}

export default function NoteRow({
  dark,
  note: n,
  busy,
  expanded,
  onToggleExpanded,
  onSetStatus,
  onDismiss,
  onDelete,
  onToggleChecklistItem,
  onRemoveChecklistItem,
  onAddChecklistItem,
  projectName,
  onTagClick,
}: Props) {
  const [addingItem, setAddingItem] = useState(false)
  const [newItemText, setNewItemText] = useState('')

  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const hover = dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.04]'
  const due = n.due_date ? dueLabel(n.due_date) : null
  const isOverdue = !!due?.overdue && n.status === 'open'
  const checklist = n.checklist || []
  const checklistDone = checklist.filter((it) => it.done).length

  const submitNewItem = () => {
    const t = newItemText.trim()
    if (!t) return
    onAddChecklistItem(t)
    setNewItemText('')
    setAddingItem(false)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className={`group rounded-2xl mb-1.5 px-3.5 py-3 ${isOverdue ? (dark ? 'bg-rose-500/[0.07]' : 'bg-rose-50/70') : hover}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onSetStatus(n.status === 'open' ? 'done' : 'open')}
          disabled={busy}
          aria-label={n.status === 'open' ? 'Mark done' : 'Mark open'}
          className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition ${
            n.status === 'done'
              ? 'bg-emerald-500 text-white'
              : n.status === 'dismissed'
                ? dark ? 'bg-white/10 text-slate-500' : 'bg-black/[0.06] text-slate-400'
                : dark ? 'ring-1 ring-white/25' : 'ring-1 ring-slate-300'
          }`}
        >
          {n.status === 'done' && <Check className="w-3 h-3" />}
          {n.status === 'dismissed' && <EyeOff className="w-3 h-3" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-[14px] leading-snug ${n.status !== 'open' ? `line-through ${muted}` : ''}`}>{n.note}</p>
          <div className={`flex flex-wrap items-center gap-1.5 mt-1.5 text-[12px] ${muted}`}>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[n.priority]}`} />
              {NOTE_TYPE_LABEL[n.note_type]}
            </span>
            {projectName && (
              <span className={`px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>{projectName}</span>
            )}
            {n.trade_ref && (
              <span className={`px-1.5 py-0.5 rounded-md font-mono ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>{n.trade_ref}</span>
            )}
            {due && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${isOverdue ? 'bg-rose-500/15 text-rose-500' : dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}>
                {isOverdue && <AlertTriangle className="w-3 h-3" />}
                {due.text}
              </span>
            )}
            {onTagClick && n.tags && n.tags.length > 0 && (
              <span className="flex items-center gap-1 flex-wrap">
                {n.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTagClick(t)}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${dark ? 'bg-indigo-500/15 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {t}
                  </button>
                ))}
              </span>
            )}
            {checklist.length > 0 && (
              <button
                type="button"
                onClick={onToggleExpanded}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${dark ? 'bg-white/10' : 'bg-black/[0.05]'}`}
              >
                <ListChecks className="w-3 h-3" />
                {checklistDone}/{checklist.length}
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
            {checklist.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setAddingItem(true)
                  if (!expanded) onToggleExpanded()
                }}
                className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-indigo-500"
              >
                <Plus className="w-3 h-3" />
                Checklist
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-2 space-y-1 pl-1">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group/item">
                  <button
                    type="button"
                    onClick={() => onToggleChecklistItem(item.id)}
                    aria-label={item.done ? 'Mark step not done' : 'Mark step done'}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                      item.done ? 'bg-emerald-500 text-white' : dark ? 'ring-1 ring-white/25' : 'ring-1 ring-slate-300'
                    }`}
                  >
                    {item.done && <Check className="w-3 h-3" />}
                  </button>
                  <span className={`text-[13px] flex-1 ${item.done ? `line-through ${muted}` : ''}`}>{item.text}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveChecklistItem(item.id)}
                    aria-label="Remove step"
                    className="opacity-70 sm:opacity-0 sm:group-hover/item:opacity-100 min-w-[28px] min-h-[28px] flex items-center justify-center text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {addingItem ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    autoFocus
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitNewItem()
                      if (e.key === 'Escape') setAddingItem(false)
                    }}
                    placeholder="New step"
                    className={`flex-1 h-9 rounded-lg px-2 text-[13px] outline-none glass-panel ${dark ? 'text-slate-100' : 'text-slate-900'}`}
                  />
                  <button type="button" onClick={submitNewItem} className="text-indigo-500 text-[13px] font-medium px-2 min-h-[36px]">
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingItem(true)}
                  className={`text-[12px] font-medium flex items-center gap-1 pt-1 min-h-[28px] ${dark ? 'text-indigo-300' : 'text-indigo-600'}`}
                >
                  <Plus className="w-3 h-3" />
                  Add step
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {onDismiss && n.status !== 'dismissed' && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy}
              className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-40"
              aria-label="Dismiss note"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-40"
            aria-label="Delete note"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
