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

export type ConnectorProvider =
  | 'gmail'
  | 'google_drive'
  | 'google_sheets'
  | 'google_docs'
  | 'google_calendar'
  | 'outlook'
  | 'excel'

/** Safe connector fields only — never select access_token / refresh_token from the client */
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

export const CONNECTOR_CATALOG = [
  {
    provider: 'gmail' as const,
    name: 'Gmail',
    description: 'Read inbox and send email on your behalf',
    scopesLabel: 'Read inbox and send email',
    available: true,
  },
  {
    provider: 'google_drive' as const,
    name: 'Google Drive',
    description: 'Search and open Drive files',
    scopesLabel: 'Read-only access to Drive',
    available: true,
  },
  {
    provider: 'google_docs' as const,
    name: 'Google Docs',
    description: 'Read Google Docs content',
    scopesLabel: 'Read-only access to Docs',
    available: true,
  },
  {
    provider: 'google_sheets' as const,
    name: 'Google Sheets',
    description: 'Query spreadsheet data',
    scopesLabel: 'Read-only access to Sheets',
    available: true,
  },
  {
    provider: 'google_calendar' as const,
    name: 'Google Calendar',
    description: 'Check events and schedule',
    scopesLabel: 'Read-only access to Calendar',
    available: false,
  },
  {
    provider: 'outlook' as const,
    name: 'Outlook',
    description: 'Search Microsoft email',
    scopesLabel: 'Read-only access to Outlook',
    available: false,
  },
  {
    provider: 'excel' as const,
    name: 'Excel',
    description: 'Query workbook data',
    scopesLabel: 'Read-only access to Excel',
    available: false,
  },
]

/** Build a short chat title from message content (not a raw first-line dump). */
export function makeChatTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim()
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
