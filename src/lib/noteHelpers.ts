import type { NoteType, NotePriority } from './supabase'

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  action_item: 'Action',
  trade_note: 'Trade',
  decision: 'Decision',
  alert: 'Alert',
}

export const PRIORITY_DOT: Record<NotePriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
}

export function dueLabel(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now()
  const overdue = ms < 0
  const days = Math.round(Math.abs(ms) / 86_400_000)
  if (overdue) return { text: days === 0 ? 'due today' : `${days}d overdue`, overdue: true }
  if (days === 0) return { text: 'due today', overdue: false }
  return { text: `due in ${days}d`, overdue: false }
}
