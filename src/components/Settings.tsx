import { useEffect, useState } from 'react'
import {
  LogOut, Moon, Sun, Brain, Plus, Trash2, Loader2,
  UserRound, Link2, Sparkles, Shield, Bell, Palette,
  ChevronRight, Check,
} from 'lucide-react'
import { supabase, type UserMemory } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import Logo from './Logo'

type Props = {
  dark: boolean
  user: User
  onSignOut: () => void
  onToggleTheme: () => void
  onOpenConnectors: () => void
  onProfileUpdated?: (name: string) => void
}

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  preference: 'Preference',
  instruction: 'Instruction',
  work: 'Work',
  people: 'People',
  project: 'Project',
}

const CAPABILITIES = [
  { id: 'email', title: 'Email', desc: 'Search inbox, draft and send with Gmail' },
  { id: 'drive', title: 'Drive & Docs', desc: 'Find files and read Google Docs' },
  { id: 'memory', title: 'Memory', desc: 'Remember facts you share across chats' },
  { id: 'projects', title: 'Projects', desc: 'Group chats by workstream' },
]

type Tab = 'profile' | 'preferences' | 'memory' | 'capabilities' | 'about'

export default function Settings({
  dark, user, onSignOut, onToggleTheme, onOpenConnectors, onProfileUpdated,
}: Props) {
  const meta = user.user_metadata || {}
  const [tab, setTab] = useState<Tab>('profile')
  const [preferredName, setPreferredName] = useState(meta.preferred_name || meta.full_name || '')
  const [dob, setDob] = useState(meta.date_of_birth || '')
  const [role, setRole] = useState(meta.role || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loadingMem, setLoadingMem] = useState(true)
  const [newFact, setNewFact] = useState('')
  const [newCategory, setNewCategory] = useState<'preference' | 'instruction' | 'general'>('preference')
  const [savingMem, setSavingMem] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const textMain = dark ? 'text-slate-100' : 'text-slate-900'
  const textMuted = dark ? 'text-slate-400' : 'text-slate-500'
  const card = `rounded-2xl p-4 ${dark ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-slate-50 border border-slate-100'}`
  const inputCls = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${dark ? 'bg-white/8 border border-white/10 text-slate-100 placeholder:text-slate-500' : 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400'}`

  const loadMemories = async () => {
    setLoadingMem(true)
    const { data, error } = await supabase.from('user_memory').select('*').order('updated_at', { ascending: false })
    if (!error && data) setMemories(data as UserMemory[])
    setLoadingMem(false)
  }

  useEffect(() => {
    if (tab === 'memory') loadMemories()
  }, [tab])

  const saveProfile = async () => {
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      const name = preferredName.trim()
      const { error } = await supabase.auth.updateUser({
        data: { preferred_name: name, full_name: name, date_of_birth: dob || null, role: role.trim() || null },
      })
      if (error) throw error
      setProfileMsg('Saved')
      onProfileUpdated?.(name)
      setTimeout(() => setProfileMsg(null), 2000)
    } catch {
      setProfileMsg('Could not save')
    } finally {
      setSavingProfile(false)
    }
  }

  const addMemory = async () => {
    const fact = newFact.trim()
    if (!fact || savingMem) return
    setSavingMem(true)
    try {
      const { data, error } = await supabase.from('user_memory').insert({ user_id: user.id, fact, category: newCategory, source: 'user' }).select().single()
      if (!error && data) { setMemories((p) => [data as UserMemory, ...p]); setNewFact('') }
    } finally { setSavingMem(false) }
  }

  const deleteMemory = async (id: string) => {
    setDeletingId(id)
    try {
      await supabase.from('user_memory').delete().eq('id', id)
      setMemories((p) => p.filter((m) => m.id !== id))
    } finally { setDeletingId(null) }
  }

  const tabs: { id: Tab; label: string; icon: typeof UserRound }[] = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'preferences', label: 'Prefs', icon: Palette },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'capabilities', label: 'Skills', icon: Sparkles },
    { id: 'about', label: 'About', icon: Shield },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <Logo size={36} dark={dark} />
        <div>
          <h2 className={`text-lg font-semibold ${textMain}`}>Settings</h2>
          <p className={`text-xs ${textMuted}`}>{user.email}</p>
        </div>
      </div>

      <div className={`flex p-1 rounded-2xl gap-0.5 overflow-x-auto ${dark ? 'bg-white/5' : 'bg-slate-100'}`}>
        {tabs.map((t) => {
          const Icon = t.icon
          const on = tab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-medium transition ${
              on ? (dark ? 'bg-white/10 text-white' : 'bg-white text-slate-900 shadow-sm') : textMuted
            }`}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' && (
        <div className="space-y-3">
          <div className={card}>
            <label className={`text-xs font-medium ${textMuted}`}>What we call you</label>
            <input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} className={`${inputCls} mt-1.5`} placeholder="Your name" />
            <label className={`text-xs font-medium ${textMuted} mt-3 block`}>Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={`${inputCls} mt-1.5`} />
            <label className={`text-xs font-medium ${textMuted} mt-3 block`}>Role / work</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} mt-1.5`} placeholder="e.g. Designer at Acme" />
            <button type="button" onClick={saveProfile} disabled={savingProfile} className="mt-4 w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2 dark:bg-white dark:text-slate-900">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : profileMsg === 'Saved' ? <><Check className="w-4 h-4" /> Saved</> : 'Save profile'}
            </button>
          </div>
        </div>
      )}

      {tab === 'preferences' && (
        <div className="space-y-3">
          <button type="button" onClick={onToggleTheme} className={`w-full ${card} flex items-center gap-3 text-left`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-white/10' : 'bg-white'}`}>
              {dark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${textMain}`}>Appearance</p>
              <p className={`text-xs ${textMuted}`}>{dark ? 'Dark' : 'Light'} mode</p>
            </div>
            <ChevronRight className={`w-4 h-4 ${textMuted}`} />
          </button>
          <button type="button" onClick={onOpenConnectors} className={`w-full ${card} flex items-center gap-3 text-left`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-white/10' : 'bg-white'}`}>
              <Link2 className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${textMain}`}>Connectors</p>
              <p className={`text-xs ${textMuted}`}>Gmail, Drive, Docs, Calendar</p>
            </div>
            <ChevronRight className={`w-4 h-4 ${textMuted}`} />
          </button>
          <div className={`${card} flex items-center gap-3 opacity-60`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-white/10' : 'bg-white'}`}>
              <Bell className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${textMain}`}>Notifications</p>
              <p className={`text-xs ${textMuted}`}>Coming soon</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'memory' && (
        <div className="space-y-3">
          <p className={`text-xs ${textMuted}`}>Facts Quantumy remembers about you. Add your own or delete anything.</p>
          <div className={card}>
            <textarea value={newFact} onChange={(e) => setNewFact(e.target.value)} rows={2} placeholder="e.g. Prefer short emails, work in WAT timezone…" className={inputCls} />
            <div className="flex items-center gap-2 mt-2">
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as any)} className={`${inputCls} w-auto`}>
                <option value="preference">Preference</option>
                <option value="instruction">Instruction</option>
                <option value="general">General</option>
              </select>
              <button type="button" onClick={addMemory} disabled={savingMem || !newFact.trim()} className="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-medium disabled:opacity-40 flex items-center gap-1.5 dark:bg-white dark:text-slate-900">
                {savingMem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
          </div>
          {loadingMem ? (
            <div className="flex justify-center py-6"><Loader2 className={`w-5 h-5 animate-spin ${textMuted}`} /></div>
          ) : memories.length === 0 ? (
            <p className={`text-sm text-center py-6 ${textMuted}`}>No memories yet</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {memories.map((m) => (
                <div key={m.id} className={`${card} flex items-start gap-2 py-3`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${textMain}`}>{m.fact}</p>
                    <p className={`text-[11px] mt-0.5 ${textMuted}`}>{CATEGORY_LABEL[m.category || 'general'] || m.category} · {m.source === 'user' ? 'You' : 'From chat'}</p>
                  </div>
                  <button type="button" onClick={() => deleteMemory(m.id)} disabled={deletingId === m.id} className={`p-1.5 rounded-lg ${dark ? 'hover:bg-red-500/10 text-slate-500 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}>
                    {deletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'capabilities' && (
        <div className="space-y-2">
          <p className={`text-xs ${textMuted} mb-2`}>What Quantumy can do when connected.</p>
          {CAPABILITIES.map((c) => (
            <div key={c.id} className={`${card} flex items-start gap-3`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-indigo-500/15 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className={`text-sm font-medium ${textMain}`}>{c.title}</p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>{c.desc}</p>
              </div>
            </div>
          ))}
          <button type="button" onClick={onOpenConnectors} className="w-full h-11 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5">
            Manage connectors
          </button>
        </div>
      )}

      {tab === 'about' && (
        <div className="space-y-3">
          <div className={`${card} text-center py-6`}>
            <Logo size={48} dark={dark} className="mx-auto mb-3" />
            <p className={`font-semibold ${textMain}`}>Quantumy</p>
            <p className={`text-xs mt-1 ${textMuted}`}>Personal AI for your work</p>
          </div>
          <button type="button" onClick={onSignOut} className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
