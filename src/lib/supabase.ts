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

/** Safe connector fields only — never select access_token / refresh_token from the client */
export type Connector = {
  id: string
  user_id: string
  provider: 'gmail' | 'google_drive' | 'google_sheets'
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
    description: 'Search and summarize your email',
    scopesLabel: 'Read-only access to Gmail',
    available: true,
  },
  {
    provider: 'google_drive' as const,
    name: 'Google Drive',
    description: 'Search files and documents',
    scopesLabel: 'Read-only access to Drive',
    available: false,
  },
  {
    provider: 'google_sheets' as const,
    name: 'Google Sheets',
    description: 'Query spreadsheet data',
    scopesLabel: 'Read-only access to Sheets',
    available: false,
  },
]
