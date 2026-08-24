/**
 * Full-text search over chat contents.
 *
 * Titles are matched locally and instantly; message bodies need a round trip,
 * so the two are kept separate and merged by the caller. The RPC runs as the
 * signed-in user, so RLS confines it to their own history.
 */
import { supabase } from './supabase'

export type ChatSearchHit = {
  conversation_id: string
  title: string | null
  snippet: string
  matched_at: string
  rank: number
}

/** Postgres wraps matched terms in guillemets so no markup crosses the wire. */
const HIGHLIGHT = /«([^»]*)»/g

export type SnippetPart = { text: string; hit: boolean }

export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let last = 0
  for (const m of snippet.matchAll(HIGHLIGHT)) {
    const at = m.index ?? 0
    if (at > last) parts.push({ text: snippet.slice(last, at), hit: false })
    parts.push({ text: m[1], hit: true })
    last = at + m[0].length
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), hit: false })
  return parts.length ? parts : [{ text: snippet, hit: false }]
}

export async function searchChatContents(query: string, maxResults = 30): Promise<ChatSearchHit[]> {
  const q = query.trim()
  // Single characters match almost everything and cost a full scan of the
  // ranked output for no useful result.
  if (q.length < 2) return []
  const { data, error } = await supabase.rpc('search_chat_messages', { q, max_results: maxResults })
  if (error) throw new Error(error.message)
  return (data || []) as ChatSearchHit[]
}
