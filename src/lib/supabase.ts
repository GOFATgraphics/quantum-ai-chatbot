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
