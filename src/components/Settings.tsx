import { useEffect, useState } from 'react'
import {
  LogOut, Moon, Sun, Brain, Plus, Trash2, Loader2,
  UserRound, Link2, Sparkles, Shield, Palette,
  Layers, X, Check, Settings2, Database,
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

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  preference: 'Preference',
  instruction: 'Instruction',
  work: 'Work',
  people: 'People',
  project: 'Project',
}

type Section = 'account' | 'appearance' | 'behavior' | 'memory' | 'connectors' | 'about'

const NAV: { id: Section; label: string; icon: typeof UserRound }[] = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'behavior', label: 'Behavior', icon: Settings2 },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'connectors', label: 'Connectors', icon: Link2 },
  { id: 'about', label: 'About', icon: Shield },
]

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
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
        on ? 'bg-white' : dark ? 'bg-white/15' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
          on
            ? 'translate-x-5 bg-black'
            : dark
              ? 'translate-x-0 bg-white/80'
              : 'translate-x-0 bg-white'
        }`}
      />
    </button>
  )
}

function Divider({ dark }: { dark: boolean }) {
  return <div className={`h-px my-1 ${dark ? 'bg-white/[0.06]' : 'bg-black/[0.06]'}`} />
}

function Row({
  title,
  description,
  right,
  onClick,
  dark,
}: {
  title: string
  description?: string
  right?: React.ReactNode
  onClick?: () => void
  dark: boolean
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-4 py-3.5 text-left ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-medium ${dark ? 'text-white' : 'text-slate-900'}`}>{title}</p>
        {description && (
          <p className={`text-[13px] mt-0.5 leading-snug ${dark ? 'text-white/45' : 'text-slate-500'}`}>
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </Comp>
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
  const [section, setSection] = useState<Section>('account')
  const [preferredName, setPreferredName] = useState(meta.preferred_name || meta.full_name || '')
  const [dob, setDob] = useState(meta.date_of_birth || '')
  const [role, setRole] = useState(meta.role || '')
  const [instructions, setInstructions] = useState(meta.custom_instructions || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loadingMem, setLoadingMem] = useState(false)
  const [newFact, setNewFact] = useState('')
  const [newCategory, setNewCategory] = useState<'preference' | 'instruction' | 'general'>('preference')
  const [savingMem, setSavingMem] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [memoryOn, setMemoryOn] = useState(meta.memory_enabled !== false)

  const textMain = dark ? 'text-white' : 'text-slate-900'
  const textMuted = dark ? 'text-white/45' : 'text-slate-500'
  const inputCls = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition ${
    dark
      ? 'bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-white/30 focus:border-white/20'
      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300'
  }`

  const loadMemories = async () => {
    setLoadingMem(true)
    const { data, error } = await supabase
      .from('user_memory')
      .select('*')
      .order('updated_at', { ascending: false })
    if (!error && data) setMemories(data as UserMemory[])
    setLoadingMem(false)
  }

  useEffect(() => {
    if (section === 'memory') loadMemories()
  }, [section])

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

  const sectionTitle =
    NAV.find((n) => n.id === section)?.label || 'Settings'

  return (
    <div
      className={`flex flex-col sm:flex-row h-full min-h-0 overflow-hidden rounded-[20px] ${
        dark ? 'bg-[#111113] text-white' : 'bg-white text-slate-900'
      }`}
    >
      {/* Left nav — Grok-style */}
      <aside
        className={`sm:w-[200px] shrink-0 flex flex-col border-b sm:border-b-0 sm:border-r ${
          dark ? 'border-white/[0.06] bg-[#0c0c0e]' : 'border-black/[0.06] bg-slate-50/80'
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:pb-3">
          <h2 className={`text-[15px] font-semibold tracking-tight ${textMain}`}>Settings</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={`sm:hidden p-1.5 rounded-lg ${dark ? 'hover:bg-white/10 text-white/50' : 'hover:bg-black/5 text-slate-400'}`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <nav className="flex sm:flex-col gap-0.5 px-2 pb-3 overflow-x-auto sm:overflow-visible">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition ${
                  active
                    ? dark
                      ? 'bg-white/[0.1] text-white'
                      : 'bg-white text-slate-900 shadow-sm ring-1 ring-black/[0.04]'
                    : dark
                      ? 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-black/[0.03]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Right content */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h3 className={`text-[15px] font-semibold ${textMain}`}>{sectionTitle}</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={`hidden sm:flex p-1.5 rounded-lg ${dark ? 'hover:bg-white/10 text-white/40' : 'hover:bg-black/5 text-slate-400'}`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {section === 'account' && (
            <div className="space-y-1 max-w-lg">
              <div className="py-2">
                <p className={`text-[13px] ${textMuted}`}>{user.email}</p>
              </div>
              <Divider dark={dark} />
              <label className={`block text-[13px] font-medium pt-2 ${textMuted}`}>What we call you</label>
              <input
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                className={`${inputCls} mt-1.5`}
                placeholder="Your name"
              />
              <label className={`block text-[13px] font-medium pt-3 ${textMuted}`}>Date of birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className={`${inputCls} mt-1.5`}
              />
              <label className={`block text-[13px] font-medium pt-3 ${textMuted}`}>Role / work</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`${inputCls} mt-1.5`}
                placeholder="e.g. Designer at Acme"
              />
              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile}
                className={`mt-5 h-10 px-5 rounded-full text-sm font-medium transition disabled:opacity-50 ${
                  dark
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-slate-900 text-white hover:bg-black'
                }`}
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
              <Divider dark={dark} />
              <Row
                title="Sign out"
                description="End this session on this device"
                dark={dark}
                onClick={onSignOut}
                right={<LogOut className={`w-4 h-4 ${dark ? 'text-red-400' : 'text-red-500'}`} />}
              />
            </div>
          )}

          {section === 'appearance' && (
            <div className="max-w-lg">
              <Row
                title="Theme"
                description={dark ? 'Dark mode' : 'Light mode'}
                dark={dark}
                onClick={onToggleTheme}
                right={
                  dark ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-slate-500" />
                  )
                }
              />
              <Divider dark={dark} />
              {onToggleGlass && (
                <>
                  <Row
                    title="Glass surfaces"
                    description={glass ? 'Frosted glass effects on' : 'Solid surfaces'}
                    dark={dark}
                    right={
                      <Toggle on={glass} onChange={onToggleGlass} dark={dark} />
                    }
                  />
                  <Divider dark={dark} />
                </>
              )}
              <div className="flex items-start gap-3 py-3.5">
                <Layers className={`w-4 h-4 mt-0.5 shrink-0 ${textMuted}`} />
                <p className={`text-[13px] leading-relaxed ${textMuted}`}>
                  Theme applies across chat, sidebar, and settings. Glass softens panels on supported browsers.
                </p>
              </div>
            </div>
          )}

          {section === 'behavior' && (
            <div className="max-w-lg space-y-1">
              <label className={`block text-[13px] font-medium ${textMuted}`}>Custom instructions</label>
              <p className={`text-[13px] mb-2 ${textMuted}`}>
                How Quantumy should respond — tone, length, rules, and preferences.
              </p>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={5}
                placeholder="e.g. Prefer short answers. Use British English. Skip fluff."
                className={`${inputCls} resize-none`}
              />
              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile}
                className={`mt-4 h-10 px-5 rounded-full text-sm font-medium transition disabled:opacity-50 ${
                  dark
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-slate-900 text-white hover:bg-black'
                }`}
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
          )}

          {section === 'memory' && (
            <div className="max-w-lg">
              <Row
                title="Personalize with memories"
                description="Use facts across chats for better context"
                dark={dark}
                right={
                  <Toggle
                    on={memoryOn}
                    onChange={() => setMemoryOn((v) => !v)}
                    dark={dark}
                  />
                }
              />
              <Divider dark={dark} />
              <div className="py-3">
                <p className={`text-[13px] mb-3 ${textMuted}`}>
                  Facts Quantumy remembers. Add your own or delete anything.
                </p>
                <textarea
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  rows={2}
                  placeholder="e.g. Prefer short emails, work in WAT…"
                  className={`${inputCls} resize-none`}
                />
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className={`${inputCls} w-auto`}
                  >
                    <option value="preference">Preference</option>
                    <option value="instruction">Instruction</option>
                    <option value="general">General</option>
                  </select>
                  <button
                    type="button"
                    onClick={addMemory}
                    disabled={savingMem || !newFact.trim()}
                    className={`h-10 px-4 rounded-full text-sm font-medium disabled:opacity-40 flex items-center gap-1.5 ${
                      dark
                        ? 'bg-white text-black'
                        : 'bg-slate-900 text-white'
                    }`}
                  >
                    {savingMem ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Add
                  </button>
                </div>
              </div>
              <Divider dark={dark} />
              {loadingMem ? (
                <div className="flex justify-center py-8">
                  <Loader2 className={`w-5 h-5 animate-spin ${textMuted}`} />
                </div>
              ) : memories.length === 0 ? (
                <p className={`text-sm text-center py-8 ${textMuted}`}>No memories yet</p>
              ) : (
                <div className="space-y-0 max-h-56 overflow-y-auto">
                  {memories.map((m, i) => (
                    <div key={m.id}>
                      {i > 0 && <Divider dark={dark} />}
                      <div className="flex items-start gap-3 py-3">
                        <Database className={`w-3.5 h-3.5 mt-1 shrink-0 ${textMuted}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[14px] ${textMain}`}>{m.fact}</p>
                          <p className={`text-[11px] mt-0.5 ${textMuted}`}>
                            {CATEGORY_LABEL[m.category || 'general'] || m.category}
                            {' · '}
                            {m.source === 'user' ? 'You' : 'From chat'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteMemory(m.id)}
                          disabled={deletingId === m.id}
                          className={`p-1.5 rounded-lg ${
                            dark
                              ? 'hover:bg-red-500/10 text-white/30 hover:text-red-400'
                              : 'hover:bg-red-50 text-slate-400 hover:text-red-500'
                          }`}
                        >
                          {deletingId === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={saveProfile}
                className={`mt-3 h-9 px-4 rounded-full text-[13px] font-medium ${
                  dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-slate-100 text-slate-800'
                }`}
              >
                Save memory preference
              </button>
            </div>
          )}

          {section === 'connectors' && (
            <div className="max-w-lg">
              <Row
                title="Connected apps"
                description="Gmail, Drive, Docs, Sheets, Calendar, Outlook, Excel"
                dark={dark}
                onClick={onOpenConnectors}
                right={
                  <span
                    className={`text-[13px] font-medium ${dark ? 'text-white/70' : 'text-slate-600'}`}
                  >
                    Manage
                  </span>
                }
              />
              <Divider dark={dark} />
              <div className="py-3 space-y-3">
                {[
                  { title: 'Email', desc: 'Search inbox, draft and send' },
                  { title: 'Drive & Docs', desc: 'Find files and read documents' },
                  { title: 'Calendar', desc: 'Check upcoming events' },
                  { title: 'Sheets & Excel', desc: 'Query spreadsheet data' },
                ].map((c) => (
                  <div key={c.title} className="flex items-start gap-3">
                    <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${dark ? 'text-white/35' : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-[14px] font-medium ${textMain}`}>{c.title}</p>
                      <p className={`text-[13px] ${textMuted}`}>{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={onOpenConnectors}
                className={`mt-2 h-10 px-5 rounded-full text-sm font-medium border ${
                  dark
                    ? 'border-white/15 text-white hover:bg-white/5'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Open connectors
              </button>
            </div>
          )}

          {section === 'about' && (
            <div className="max-w-lg">
              <div className="py-6 text-center">
                <p className={`text-lg font-semibold ${textMain}`}>Quantumy</p>
                <p className={`text-[13px] mt-1 ${textMuted}`}>Personal AI for your work</p>
              </div>
              <Divider dark={dark} />
              <Row
                title="Privacy"
                description="How we handle your data"
                dark={dark}
                onClick={() => window.open('/privacy.html', '_blank')}
                right={<span className={`text-[13px] ${textMuted}`}>View</span>}
              />
              <Divider dark={dark} />
              <Row
                title="Terms"
                description="Terms of use"
                dark={dark}
                onClick={() => window.open('/terms.html', '_blank')}
                right={<span className={`text-[13px] ${textMuted}`}>View</span>}
              />
              <Divider dark={dark} />
              <Row
                title="Sign out"
                description="End this session"
                dark={dark}
                onClick={onSignOut}
                right={<LogOut className={`w-4 h-4 ${dark ? 'text-red-400' : 'text-red-500'}`} />}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
