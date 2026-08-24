import { getUserFromAuthHeader } from './lib/supabaseAdmin.js';
import { allowRequest } from './lib/rateLimit.js';
import { recordUsage } from './lib/tokenUsage.js';

const MODEL = 'claude-sonnet-5';
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userText = String(body?.userText || '').slice(0, 800);
    const assistantText = String(body?.assistantText || '').slice(0, 800);
    if (!userText && !assistantText) return res.status(400).json({ error: 'userText or assistantText required' });
    const user = await getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ error: 'Sign in required' });
    if (!allowRequest(`title:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS)) {
      return res.status(429).json({ error: 'Too many requests. Wait a moment and try again.' });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 20,
        system:
          'Generate a short chat title, 3 to 6 words, that captures the actual topic or intent of this exchange, not a generic label. No quotes, no trailing punctuation, no prefix like "Title:". Reply with only the title text.',
        messages: [{ role: 'user', content: `User: ${userText}\n\nAssistant: ${assistantText}` }],
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({ error: `AI provider error (${response.status})`, details: errorText.slice(0, 180) });
    }
    const data = await response.json();
    await recordUsage({ userId: user.id, endpoint: 'title', model: MODEL, usage: data.usage });
    const title = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
    return res.status(200).json({ title: title || null });
  } catch (err) {
    console.error('Title handler error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
