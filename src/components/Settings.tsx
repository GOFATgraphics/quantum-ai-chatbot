import { useEffect, useState } from 'react'
import {
  LogOut, Moon, Sun, Brain, Plus, Trash2, Loader2,
  Sparkles, UserRound, Link2,
} from 'lucide-react'
import { supabase, type UserMemory } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  user: User
  onSignOut: () => void
  onToggleTheme: () => void
  onOpenConnectors: () => void
}

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  preference: 'Preference',
  instruction: 'Instruction',
  work: 'Work',
  people: 'People',
  project: 'Project',
}

export default function Settings({
  dark,
  user,
  onSignOut,
  onToggleTheme,
  onOpenConnectors,
}: Props) {
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loading, setLoading] = useState(true)
  const [newFact, setNewFact] = useState('')
  const [newCategory, setNewCategory] = useState<'preference' | 'instruction' | 'general'>('preference')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'account' | 'memory'>('account')

  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const card = `rounded-2xl p-4 glass-card ${dark ? 'glass-card-dark' : 'glass-card-light'}`
  const inputCls = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${dark ? 'bg-white/8 border border-white/10 text-slate-100 placeholder:text-slate-500' : 'bg-white/70 border border-white/80 text-slate-900 placeholder:text-slate-400'}`

  const loadMemories = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_memory')
      .select('*')
      .order('updated_at', { ascending: false })
    if (!error && data) setMemories(data as UserMemory[])
    setLoading(false)
  }

  useEffect(() => {
    loadMemories()
  }, [])

  const addMemory = async () => {
    const fact = newFact.trim()
    if (!fact || saving) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('user_memory')
        .insert({
          user_id: user.id,
          fact,
          category: newCategory,
          source: 'user',
        })
        .select()
        .single()
      if (!error && data) {
        setMemories((p) => [data as UserMemory, ...p])
        setNewFact('')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteMemory = async (id: string) => {
    setDeletingId(id)
    try {
      await supabase.from('user_memory').delete().eq('id', id)
      setMemories((p) => p.filter((m) => m.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const aiMemories = memories.filter((m) => m.source === 'chat' || !m.source)
  const userMemories = memories.filter((m) => m.source === 'user')

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className={`flex p-1 rounded-2xl gap-1 ${dark ? 'bg-white/5' : 'bg-white/50'}`}>
        <button
          onClick={() => setTab('account')}
          className={`flex-1 h-9 rounded-xl text-sm font-medium transition ${
            tab === 'account'
              ? dark
                ? 'bg-white/15 text-slate-100'
                : 'bg-white text-slate-900 shadow-sm'
              : textMuted
          }`}
        >
          Account
        </button>
        <button
          onClick={() => setTab('memory')}
          className={`flex-1 h-9 rounded-xl text-sm font-medium transition flex items-center justify-center gap-1.5 ${
            tab === 'memory'
              ? dark
                ? 'bg-white/15 text-slate-100'
                : 'bg-white text-slate-900 shadow-sm'
              : textMuted
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          Memory
        </button>
      </div>

      {tab === 'account' && (
        <div className="space-y-3">
          <div className={card}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-semibold shrink-0">
                {(user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${textMain}`}>
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </p>
                <p className={`text-xs truncate ${textMuted}`}>{user.email}</p>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenConnectors}
            className={`w-full h-11 rounded-2xl text-sm font-medium transition flex items-center justify-center gap-2 ${card} ${textMain}`}
          >
            <Link2 className="w-4 h-4" /> Connectors
          </button>

          <button
            onClick={onToggleTheme}
            className={`w-full h-11 rounded-2xl text-sm font-medium transition flex items-center justify-center gap-2 ${card} ${textMain}`}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {dark ? 'Switch to light mode' : 'Switch to dark mode'}
          </button>

          <button
            onClick={onSignOut}
            className={`w-full h-11 rounded-2xl text-sm font-medium transition flex items-center justify-center gap-2 ${card} ${textMain}`}
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}

      {tab === 'memory' && (
        <div className="space-y-4">
          {/* Add preference / instruction */}
          <div className={card}>
            <div className="flex items-center gap-2 mb-3">
              <UserRound className={`w-4 h-4 ${textMuted}`} />
              <p className={`text-sm font-medium ${textMain}`}>Add preference or instruction</p>
            </div>
            <p className={`text-xs mb-3 ${textMuted}`}>
              Tell Quantumy how to respond, what you prefer, or lasting facts about you.
            </p>
            <div className="flex gap-2 mb-2">
              {(['preference', 'instruction', 'general'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setNewCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition ${
                    newCategory === c
                      ? 'bg-indigo-600 text-white'
                      : dark
                        ? 'bg-white/10 text-slate-300'
                        : 'bg-white/80 text-slate-600'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder={
                newCategory === 'instruction'
                  ? 'e.g. Always reply in short bullet points'
                  : newCategory === 'preference'
                    ? 'e.g. Prefers concise answers, works in product design'
                    : 'e.g. Based in Lagos, Nigeria'
              }
              rows={2}
              className={`${inputCls} resize-none mb-2`}
            />
            <button
              onClick={addMemory}
              disabled={!newFact.trim() || saving}
              className="w-full h-10 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className={`w-5 h-5 animate-spin ${textMuted}`} />
            </div>
          ) : (
            <>
              {/* User-added */}
              <div>
                <p className={`text-xs font-medium mb-2 px-0.5 ${textMuted}`}>
                  Your instructions & preferences ({userMemories.length})
                </p>
                {userMemories.length === 0 ? (
                  <p className={`text-sm py-3 text-center ${textMuted}`}>None yet — add one above.</p>
                ) : (
                  <div className="space-y-2">
                    {userMemories.map((m) => (
                      <MemoryRow
                        key={m.id}
                        memory={m}
                        dark={dark}
                        deleting={deletingId === m.id}
                        onDelete={() => deleteMemory(m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* AI-learned */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 px-0.5">
                  <Sparkles className={`w-3.5 h-3.5 ${textMuted}`} />
                  <p className={`text-xs font-medium ${textMuted}`}>
                    Learned by Quantumy ({aiMemories.length})
                  </p>
                </div>
                {aiMemories.length === 0 ? (
                  <p className={`text-sm py-3 text-center ${textMuted}`}>
                    Nothing saved from chats yet. Quantumy remembers stable facts as you talk.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {aiMemories.map((m) => (
                      <MemoryRow
                        key={m.id}
                        memory={m}
                        dark={dark}
                        deleting={deletingId === m.id}
                        onDelete={() => deleteMemory(m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryRow({
  memory,
  dark,
  deleting,
  onDelete,
}: {
  memory: UserMemory
  dark: boolean
  deleting: boolean
  onDelete: () => void
}) {
  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-500' : 'text-slate-500'
  const label = CATEGORY_LABEL[memory.category || 'general'] || memory.category || 'General'

  return (
    <div
      className={`group flex items-start gap-2 rounded-2xl px-3 py-2.5 glass-card ${
        dark ? 'glass-card-dark' : 'glass-card-light'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${textMain}`}>{memory.fact}</p>
        <p className={`text-[11px] mt-1 ${textMuted}`}>{label}</p>
      </div>
      <button
        onClick={onDelete}
        disabled={deleting}
        className={`p-1.5 rounded-full shrink-0 transition ${
          dark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
        }`}
        title="Delete"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
