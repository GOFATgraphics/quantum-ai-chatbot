/**
 * Conversations and their messages, across all users.
 *
 * Serves both the Conversations page and the per-user drill-down in Users.
 * Same reason as users.js: RLS scopes conversations to their owner and
 * messages to the owner of their parent conversation, so a browser query can
 * only ever return the admin's own chats.
 *
 *   GET ?user_id=<uuid>          conversations belonging to one user
 *   GET ?conversation_id=<uuid>  messages in one conversation
 *   GET                          all conversations, newest activity first
 */
import { requireAdmin, applyAdminCors } from '../lib/adminAuth.js';

const CONVERSATION_LIMIT = 300;
const USER_CONVERSATION_LIMIT = 200;
const MESSAGE_LIMIT = 500;

/** Attach owner details without a second round-trip per row. */
async function withOwners(admin, conversations) {
  const ids = [...new Set(conversations.map((c) => c.user_id).filter(Boolean))];
  if (ids.length === 0) return conversations.map((c) => ({ ...c, owner: null }));
  const { data } = await admin
    .from('profiles')
    .select('id, email, preferred_name')
    .in('id', ids);
  const byId = new Map((data || []).map((p) => [p.id, p]));
  return conversations.map((c) => {
    const p = byId.get(c.user_id);
    return {
      ...c,
      owner: p ? { id: p.id, email: p.email, name: p.preferred_name } : null,
    };
  });
}

export default async function handler(req, res) {
  if (applyAdminCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { admin } = ctx;

  try {
    const conversationId = req.query?.conversation_id ? String(req.query.conversation_id) : null;
    const userId = req.query?.user_id ? String(req.query.user_id) : null;

    if (conversationId) {
      const { data, error } = await admin
        .from('messages')
        .select('id, conversation_id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;
      return res.status(200).json({
        messages: data || [],
        truncated: (data || []).length >= MESSAGE_LIMIT,
      });
    }

    let q = admin
      .from('conversations')
      .select('id, title, user_id, project_id, created_at, updated_at')
      .order('updated_at', { ascending: false });
    q = userId ? q.eq('user_id', userId).limit(USER_CONVERSATION_LIMIT) : q.limit(CONVERSATION_LIMIT);

    const { data, error } = await q;
    if (error) throw error;
    const conversations = data || [];

    return res.status(200).json({
      // The per-user view already knows whose chats these are; only the
      // all-users listing needs owners resolved.
      conversations: userId ? conversations : await withOwners(admin, conversations),
      truncated: conversations.length >= (userId ? USER_CONVERSATION_LIMIT : CONVERSATION_LIMIT),
    });
  } catch (err) {
    console.error('admin conversations error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load conversations' });
  }
}
