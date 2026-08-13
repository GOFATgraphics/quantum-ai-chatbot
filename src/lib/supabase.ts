import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Auth and history will not work until you add them.'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

export type Conversation = {
  id: string
  user_id: string
  title: string | null
  project_id?: string | null
  created_at: string
  updated_at: string
}

export type DbMessage = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type Project = {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string | null
  created_at: string
  updated_at: string
}

export type UserMemory = {
  id: string
  user_id: string
  fact: string
  category: string | null
  source: string | null
  created_at: string
  updated_at?: string
}

export type Note = {
  id: string
  user_id: string
  note: string
  project: string | null
  status: 'open' | 'done'
  created_at: string
  updated_at: string
}

export type ConnectorProvider =
  | 'gmail'
  | 'google_drive'
  | 'google_sheets'
  | 'google_docs'
  | 'google_calendar'
  | 'outlook'
  | 'excel'

export type Connector = {
  id: string
  user_id: string
  provider: ConnectorProvider
  account_email: string | null
  status: 'connected' | 'error' | 'revoked'
  scopes: string[] | null
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  email: string | null
  preferred_name: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export const CONNECTOR_CATALOG = [
  {
    provider: 'gmail' as const,
    name: 'Gmail',
    description: 'Read, send, archive, and manage email',
    scopesLabel: 'Read, send, and modify mail',
    available: true,
  },
  {
    provider: 'google_drive' as const,
    name: 'Google Drive',
    description: 'Search and manage Drive files',
    scopesLabel: 'Read and write Drive files',
    available: true,
  },
  {
    provider: 'google_docs' as const,
    name: 'Google Docs',
    description: 'Read and create Google Docs',
    scopesLabel: 'Read and write Docs',
    available: true,
  },
  {
    provider: 'google_sheets' as const,
    name: 'Google Sheets',
    description: 'Read, create, and update spreadsheets',
    scopesLabel: 'Read and write Sheets',
    available: true,
  },
  {
    provider: 'google_calendar' as const,
    name: 'Google Calendar',
    description: 'View and create calendar events',
    scopesLabel: 'Read and write calendar events',
    available: true,
  },
  {
    provider: 'outlook' as const,
    name: 'Outlook',
    description: 'Search Microsoft email',
    scopesLabel: 'Read Outlook mail',
    available: true,
  },
  {
    provider: 'excel' as const,
    name: 'Excel Online',
    description: 'Query Microsoft Excel workbooks',
    scopesLabel: 'Read Excel workbooks',
    available: true,
  },
]

/** Build a short chat title from message content (not a raw first-line dump). */
export function makeChatTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim()
  // Strip attachment noise so titles stay readable
  t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
  t = t.replace(/📎\s*\*\*[^*]+\*\*/g, '')
  t = t.replace(/---\s*File:[^-]+---/g, '')
  t = t.replace(/\[(?:Image|File) attached:[^\]]+\]/gi, '')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(
    /^(please |can you |could you |would you |i want (you )?to |i need (you )?to |help me (to )?|hey[, ]+|hi[, ]+)/i,
    ''
  )
  t = t.replace(/[.?!]+$/g, '').trim()
  if (!t) t = 'New chat'
  if (t.length > 42) {
    const cut = t.slice(0, 42)
    const sp = cut.lastIndexOf(' ')
    t = (sp > 18 ? cut.slice(0, sp) : cut).trim() + '…'
  }
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Fetch the current user's profile (includes is_admin). Returns null if not logged in or no row. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, preferred_name, is_admin, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.warn('getMyProfile error:', error.message)
    return null
  }
  return data as Profile | null
}

/** Quick check — true only if the logged-in user has is_admin = true */
export async function getIsAdmin(): Promise<boolean> {
  const profile = await getMyProfile()
  return profile?.is_admin === true
}
