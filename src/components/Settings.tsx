import { useEffect, useState } from 'react'
import {
  Moon, Sun, Brain, Plus, Trash2, Loader2, Pencil,
  Link2, Sparkles, X, Check, ChevronRight, ChevronLeft,
  Bell, Globe, LayoutGrid, Settings2, Search,
} from 'lucide-react'
import { supabase, type UserMemory } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

type Props = {
  dark: boolean
  glass?: boolean
  user: User
  onClose?: () => void
  onSignOut: () => void
  onToggleTheme: () => void
  onToggleGlass?: () => void
  onOpenConnectors: () => void
  onProfileUpdated?: (name: string) => void
}

type Page =
  | 'home'
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'widget'
  | 'language'
  | 'customize'
  | 'memory'
  | 'skills'

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  preference: 'Preference',
  instruction: 'Instruction',
  work: 'Work',
  people: 'People',
  project: 'Project',
  behavior: 'Behavior pattern',
}

function Toggle({
  on,
  onChange,
  dark,
}: {
  on: boolean
  onChange: () => void
  dark: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${
        on ? 'bg-blue-500' : dark ? 'bg-white/20' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function GroupCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {children}
    </div>
  )
}

function ListRow({
  icon,
  label,
  value,
  onClick,
  dark,
  danger,
  last,
}: {
  icon?: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
  dark: boolean
  danger?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition ${
        onClick ? (dark ? 'active:bg-white/5' : 'active:bg-black/[0.03]') : ''
      } ${!last ? (dark ? 'border-b border-white/[0.06]' : 'border-b border-black/[0.06]') : ''}`}
    >
      {icon && (
        <span className={`shrink-0 ${dark ? 'text-white/70' : 'text-slate-700'}`}>{icon}</span>
      )}
      <span
        className={`flex-1 text-[16px] ${
          danger
            ? 'text-red-500'
            : dark
              ? 'text-white'
              : 'text-slate-900'
        }`}
      >
        {label}
      </span>
      {value && (
        <span className={`text-[15px] ${dark ? 'text-white/50' : 'text-slate-500'}`}>{value}</span>
      )}
      {onClick && !danger && (
        <ChevronRight className={`w-4 h-4 shrink-0 ${dark ? 'text-white/35' : 'text-slate-400'}`} />
      )}
    </button>
  )
}

function SectionLabel({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <p className={`text-[13px] font-medium px-1 mb-2 ${dark ? 'text-white/50' : 'text-slate-600'}`}>
      {children}
    </p>
  )
}

export default function Settings({
  dark,
  glass = true,
  user,
  onClose,
  onSignOut,
  onToggleTheme,
  onToggleGlass,
  onOpenConnectors,
  onProfileUpdated,
}: Props) {
  const meta = user.user_metadata || {}
  const [page, setPage] = useState<Page>('home')
  const [search, setSearch] = useState('')
  const [preferredName, setPreferredName] = useState(meta.preferred_name || meta.full_name || '')
  const [dob, setDob] = useState(meta.date_of_birth || '')
  const [role, setRole] = useState(meta.role || '')
  const [instructions, setInstructions] = useState(meta.custom_instructions || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loadingMem, setLoadingMem] = useState(false)
  const [newFact, setNewFact] = useState('')
  const [newCategory, setNewCategory] = useState<'preference' | 'instruction' | 'general' | 'behavior'>('preference')
  const [savingMem, setSavingMem] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [memoryOn, setMemoryOn] = useState(meta.memory_enabled !== false)
  const [notifOn, setNotifOn] = useState(false)

  const displayName =
    preferredName ||
    meta.full_name ||
    meta.name ||
    user.email?.split('@')[0] ||
    'You'
  const initial = (displayName[0] || 'Q').toUpperCase()

  const textMain = dark ? 'text-white' : 'text-slate-900'
  const textMuted = dark ? 'text-white/55' : 'text-slate-600'
  const inputCls = `glass-panel w-full rounded-xl px-3.5 py-3 text-[16px] outline-none ${
    dark
      ? 'text-white placeholder:text-white/30'
      : 'text-slate-900 placeholder:text-slate-400'
  }`

  useEffect(() => {
    if (page === 'memory') {
      setLoadingMem(true)
      supabase
        .from('user_memory')
        .select('*')
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) setMemories(data as UserMemory[])
          setLoadingMem(false)
        })
    }
  }, [page])

  const saveProfile = async () => {
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      const name = preferredName.trim()
      const { error } = await supabase.auth.updateUser({
        data: {
          preferred_name: name,
          full_name: name,
          date_of_birth: dob || null,
          role: role.trim() || null,
          custom_instructions: instructions.trim() || null,
          memory_enabled: memoryOn,
        },
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
      const { data, error } = await supabase
        .from('user_memory')
        .insert({ user_id: user.id, fact, category: newCategory, source: 'user' })
        .select()
        .single()
      if (!error && data) {
        setMemories((p) => [data as UserMemory, ...p])
        setNewFact('')
      }
    } finally {
      setSavingMem(false)
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

  const startEditMemory = (m: UserMemory) => {
    setEditingId(m.id)
    setEditText(m.fact)
  }

  const saveEditMemory = async (id: string) => {
    const fact = editText.trim()
    if (!fact) return
    setSavingEditId(id)
    try {
      const { error } = await supabase
        .from('user_memory')
        .update({ fact, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (!error) {
        setMemories((p) => p.map((m) => (m.id === id ? { ...m, fact } : m)))
        setEditingId(null)
      }
    } finally {
      setSavingEditId(null)
    }
  }

  const pageTitle: Record<Page, string> = {
    home: 'Settings',
    profile: 'Profile',
    appearance: 'Appearance',
    notifications: 'Notifications',
    widget: 'Widget',
    language: 'App Language',
    customize: 'Customize',
    memory: 'Memory',
    skills: 'Skills',
  }

  const q = search.trim().toLowerCase()
  const match = (s: string) => !q || s.toLowerCase().includes(q)

  return (
    <div className={`flex flex-col h-full min-h-0 bg-transparent ${dark ? 'text-white' : 'text-slate-900'}`}>
      <div className="relative flex items-center justify-center h-14 shrink-0 px-4">
        {page === 'home' ? (
          <button
            type="button"
            onClick={onClose}
            className={`glass-btn absolute left-4 w-9 h-9 rounded-full flex items-center justify-center ${
              dark ? 'text-white' : 'text-slate-800'
            }`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPage('home')}
            className={`absolute left-3 w-9 h-9 rounded-full flex items-center justify-center ${
              dark ? 'text-white' : 'text-slate-800'
            }`}
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <h2 className={`text-[17px] font-semibold ${textMain}`}>{pageTitle[page]}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">
        {page === 'home' && (
          <>
            {(match(displayName) || match(user.email || '')) && (
              <button
                type="button"
                onClick={() => setPage('profile')}
                className={`glass-panel w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${
                  dark ? 'active:bg-white/5' : 'active:bg-black/[0.02]'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-violet-600 flex items-center justify-center text-white text-lg font-semibold shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[17px] font-semibold truncate ${textMain}`}>{displayName}</p>
                  <p className={`text-[14px] truncate ${textMuted}`}>{user.email}</p>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${dark ? 'text-white/35' : 'text-slate-400'}`} />
              </button>
            )}

            {(match('appearance') ||
              match('notifications') ||
              match('widget') ||
              match('language') ||
              match('app') ||
              match('glass')) && (
              <div>
                <SectionLabel dark={dark}>App</SectionLabel>
                <GroupCard>
                  {match('appearance') && (
                    <ListRow
                      icon={<Sun className="w-5 h-5" />}
                      label="Appearance"
                      value={dark ? 'Dark' : 'Light'}
                      onClick={() => setPage('appearance')}
                      dark={dark}
                    />
                  )}
                  {match('notifications') && (
                    <ListRow
                      icon={<Bell className="w-5 h-5" />}
                      label="Notifications"
                      onClick={() => setPage('notifications')}
                      dark={dark}
                    />
                  )}
                  {match('widget') && (
                    <ListRow
                      icon={<LayoutGrid className="w-5 h-5" />}
                      label="Widget"
                      onClick={() => setPage('widget')}
                      dark={dark}
                    />
                  )}
                  {match('language') && (
                    <ListRow
                      icon={<Globe className="w-5 h-5" />}
                      label="App Language"
                      value="English"
                      onClick={() => setPage('language')}
                      dark={dark}
                      last
                    />
                  )}
                </GroupCard>
              </div>
            )}

            {(match('customize') ||
              match('skills') ||
              match('memory') ||
              match('connectors') ||
              match('quantumy')) && (
              <div>
                <SectionLabel dark={dark}>Quantumy</SectionLabel>
                <GroupCard>
                  {match('customize') && (
                    <ListRow
                      icon={<Settings2 className="w-5 h-5" />}
                      label="Customize"
                      onClick={() => setPage('customize')}
                      dark={dark}
                    />
                  )}
                  {(match('skills') || match('connectors')) && (
                    <ListRow
                      icon={<Sparkles className="w-5 h-5" />}
                      label="Skills"
                      onClick={() => setPage('skills')}
                      dark={dark}
                    />
                  )}
                  {(match('connectors') || match('connect')) && (
                    <ListRow
                      icon={<Link2 className="w-5 h-5" />}
                      label="Connectors"
                      onClick={onOpenConnectors}
                      dark={dark}
                    />
                  )}
                  {match('memory') && (
                    <ListRow
                      icon={<Brain className="w-5 h-5" />}
                      label="Memory"
                      onClick={() => setPage('memory')}
                      dark={dark}
                      last
                    />
                  )}
                </GroupCard>
              </div>
            )}

            <div className="glass-panel flex items-center gap-2 rounded-2xl px-3.5 h-11">
              <Search className={`w-4 h-4 shrink-0 ${textMuted}`} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search settings"
                className={`flex-1 bg-transparent border-0 outline-none text-[15px] ${
                  dark ? 'text-white placeholder:text-white/35' : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
            </div>

            <GroupCard>
              <ListRow label="Sign out" onClick={onSignOut} dark={dark} danger last />
            </GroupCard>
          </>
        )}

        {page === 'profile' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4">
              <div className="w-20 h-20 rounded-full bg-violet-600 flex items-center justify-center text-white text-3xl font-semibold">
                {initial}
              </div>
              <p className={`mt-3 text-[18px] font-semibold ${textMain}`}>{displayName}</p>
              <p className={`text-[14px] ${textMuted}`}>{user.email}</p>
            </div>
            <GroupCard>
              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className={`text-[13px] ${textMuted}`}>What we call you</label>
                  <input
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    className={`${inputCls} mt-1`}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className={`text-[13px] ${textMuted}`}>Date of birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <label className={`text-[13px] ${textMuted}`}>Role / work</label>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={`${inputCls} mt-1`}
                    placeholder="e.g. Designer at Acme"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="w-full h-11 rounded-xl bg-blue-500 text-white text-[16px] font-medium disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  ) : profileMsg === 'Saved' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Saved
                    </span>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </GroupCard>
            <GroupCard>
              <ListRow label="Sign out" onClick={onSignOut} dark={dark} danger last />
            </GroupCard>
          </div>
        )}

        {page === 'appearance' && (
          <div className="space-y-4">
            <GroupCard>
              <div className={`flex items-center gap-3 px-4 py-3.5 ${dark ? 'border-b border-white/[0.06]' : 'border-b border-black/[0.06]'}`}>
                <span className={dark ? 'text-white/70' : 'text-slate-600'}>
                  {dark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </span>
                <div className="flex-1">
                  <p className={`text-[16px] ${textMain}`}>Dark Mode</p>
                  <p className={`text-[13px] ${textMuted}`}>{dark ? 'On' : 'Off'}</p>
                </div>
                <Toggle on={dark} onChange={onToggleTheme} dark={dark} />
              </div>
              {onToggleGlass && (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className={dark ? 'text-white/70' : 'text-slate-600'}>
                    <Sparkles className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[16px] ${textMain}`}>Glassmorphism</p>
                    <p className={`text-[13px] ${textMuted}`}>
                      {glass
                        ? 'Frosted glass on chat, header, sidebar, composer & settings'
                        : 'Solid surfaces — glass off'}
                    </p>
                  </div>
                  <Toggle on={glass} onChange={onToggleGlass} dark={dark} />
                </div>
              )}
            </GroupCard>
            <p className={`text-[13px] px-1 ${textMuted}`}>
              Glassmorphism applies to the full app in both light and dark mode: header, sidebar,
              typing bar, menus, message bubbles, and this settings sheet. Turn it off anytime for
              solid surfaces.
            </p>
          </div>
        )}

        {page === 'notifications' && (
          <div className="space-y-4">
            <GroupCard>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Bell className={`w-5 h-5 ${dark ? 'text-white/70' : 'text-slate-600'}`} />
                <div className="flex-1">
                  <p className={`text-[16px] ${textMain}`}>Push notifications</p>
                  <p className={`text-[13px] ${textMuted}`}>Coming soon</p>
                </div>
                <Toggle on={notifOn} onChange={() => setNotifOn((v) => !v)} dark={dark} />
              </div>
            </GroupCard>
            <p className={`text-[13px] px-1 ${textMuted}`}>
              Notifications are not enabled yet. This toggle is a preview for a future release.
            </p>
          </div>
        )}

        {page === 'widget' && (
          <div className="space-y-4">
            <GroupCard>
              <div className="px-4 py-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`glass-btn w-12 h-12 rounded-2xl flex items-center justify-center ${
                      dark ? 'text-white' : 'text-slate-700'
                    }`}
                  >
                    <LayoutGrid className="w-6 h-6" />
                  </div>
                  <div>
                    <p className={`text-[17px] font-semibold ${textMain}`}>Home screen widget</p>
                    <p className={`text-[13px] ${textMuted}`}>Quick access to Quantumy</p>
                  </div>
                </div>
                <p className={`text-[15px] leading-relaxed ${textMuted}`}>
                  Add Quantumy to your home screen for one-tap access. On iPhone: Share → Add to Home
                  Screen. On Android: browser menu → Install app / Add to Home screen.
                </p>
                <div className={`glass-panel rounded-xl px-3.5 py-3 text-[14px] ${textMuted}`}>
                  <p className="font-medium mb-1">Tips</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Use the install banner when it appears in chat</li>
                    <li>Open the app from your home screen for the full experience</li>
                    <li>True lock-screen widgets are planned for a later update</li>
                  </ul>
                </div>
              </div>
            </GroupCard>
          </div>
        )}

        {page === 'language' && (
          <div className="space-y-4">
            <GroupCard>
              <ListRow label="English" value="Selected" dark={dark} last />
            </GroupCard>
            <p className={`text-[13px] px-1 ${textMuted}`}>
              More languages will be available in a future update.
            </p>
          </div>
        )}

        {page === 'customize' && (
          <div className="space-y-4">
            <p className={`text-[13px] px-1 ${textMuted}`}>
              How Quantumy should respond — tone, length, rules, and preferences.
            </p>
            <GroupCard>
              <div className="p-4">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={6}
                  placeholder="e.g. Prefer short answers. Use British English. Skip fluff."
                  className={`${inputCls} resize-none`}
                />
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="mt-3 w-full h-11 rounded-xl bg-blue-500 text-white text-[16px] font-medium disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  ) : profileMsg === 'Saved' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Saved
                    </span>
                  ) : (
                    'Save instructions'
                  )}
                </button>
              </div>
            </GroupCard>
          </div>
        )}

        {page === 'skills' && (
          <div className="space-y-4">
            <p className={`text-[13px] px-1 ${textMuted}`}>
              What Quantumy can do when apps are connected.
            </p>
            <GroupCard>
              {[
                { title: 'Email', desc: 'Search, draft, and send' },
                { title: 'Drive & Docs', desc: 'Find files and read documents' },
                { title: 'Calendar', desc: 'Check upcoming events' },
                { title: 'Sheets & Excel', desc: 'Query spreadsheet data' },
              ].map((c, i, arr) => (
                <div
                  key={c.title}
                  className={`flex items-start gap-3 px-4 py-3.5 ${
                    i < arr.length - 1
                      ? dark
                        ? 'border-b border-white/[0.06]'
                        : 'border-b border-black/[0.06]'
                      : ''
                  }`}
                >
                  <Sparkles className={`w-5 h-5 mt-0.5 ${dark ? 'text-white/55' : 'text-slate-500'}`} />
                  <div>
                    <p className={`text-[16px] ${textMain}`}>{c.title}</p>
                    <p className={`text-[13px] ${textMuted}`}>{c.desc}</p>
                  </div>
                </div>
              ))}
            </GroupCard>
            <button
              type="button"
              onClick={onOpenConnectors}
              className="w-full h-11 rounded-xl bg-blue-500 text-white text-[16px] font-medium flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              Manage connectors
            </button>
          </div>
        )}

        {page === 'memory' && (
          <div className="space-y-4">
            <GroupCard>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Brain className={`w-5 h-5 ${dark ? 'text-white/70' : 'text-slate-600'}`} />
                <div className="flex-1">
                  <p className={`text-[16px] ${textMain}`}>Personalize with memories</p>
                  <p className={`text-[13px] ${textMuted}`}>Use facts across chats</p>
                </div>
                <Toggle on={memoryOn} onChange={() => setMemoryOn((v) => !v)} dark={dark} />
              </div>
            </GroupCard>

            <GroupCard>
              <div className="p-4 space-y-2">
                <textarea
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  rows={2}
                  placeholder="e.g. Prefer short emails, work in WAT…"
                  className={`${inputCls} resize-none`}
                />
                <div className="flex gap-2">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className={`${inputCls} w-auto`}
                  >
                    <option value="preference">Preference</option>
                    <option value="instruction">Instruction</option>
                    <option value="general">General</option>
                    <option value="behavior">Behavior pattern</option>
                  </select>
                  <button
                    type="button"
                    onClick={addMemory}
                    disabled={savingMem || !newFact.trim()}
                    className="h-11 px-4 rounded-xl bg-blue-500 text-white text-[15px] font-medium disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {savingMem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add
                  </button>
                </div>
              </div>
            </GroupCard>

            {loadingMem ? (
              <div className="flex justify-center py-8">
                <Loader2 className={`w-5 h-5 animate-spin ${textMuted}`} />
              </div>
            ) : memories.length === 0 ? (
              <p className={`text-sm text-center py-6 ${textMuted}`}>No memories yet</p>
            ) : (
              <GroupCard>
                {memories.map((m, i) => (
                  <div
                    key={m.id}
                    className={`flex items-start gap-3 px-4 py-3.5 ${
                      i < memories.length - 1
                        ? dark
                          ? 'border-b border-white/[0.06]'
                          : 'border-b border-black/[0.06]'
                        : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      {editingId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)}
                            rows={2}
                            className={`w-full resize-none rounded-lg px-2.5 py-1.5 text-[14px] outline-none glass-panel ${textMain}`}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className={`h-8 px-3 rounded-lg text-[13px] font-medium ${textMuted}`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditMemory(m.id)}
                              disabled={!editText.trim() || savingEditId === m.id}
                              className="h-8 px-3 rounded-lg text-[13px] font-medium bg-blue-500 text-white disabled:opacity-40 flex items-center gap-1.5"
                            >
                              {savingEditId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className={`text-[15px] ${textMain}`}>{m.fact}</p>
                          <p className={`text-[12px] mt-0.5 ${textMuted}`}>
                            {CATEGORY_LABEL[m.category || 'general'] || m.category}
                            {' · '}
                            {m.source === 'user' ? 'You' : 'From chat'}
                          </p>
                        </>
                      )}
                    </div>
                    {editingId !== m.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditMemory(m)}
                          className={`p-1.5 rounded-lg ${dark ? 'text-white/30 hover:text-blue-400' : 'text-slate-400 hover:text-blue-500'}`}
                          aria-label="Edit memory"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMemory(m.id)}
                          disabled={deletingId === m.id}
                          className={`p-1.5 rounded-lg ${
                            dark
                              ? 'text-white/30 hover:text-red-400'
                              : 'text-slate-400 hover:text-red-500'
                          }`}
                          aria-label="Delete memory"
                        >
                          {deletingId === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </GroupCard>
            )}

            <button
              type="button"
              onClick={saveProfile}
              className={`glass-btn w-full h-11 rounded-xl text-[15px] font-medium ${
                dark ? 'text-white' : 'text-slate-800'
              }`}
            >
              Save memory preference
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
