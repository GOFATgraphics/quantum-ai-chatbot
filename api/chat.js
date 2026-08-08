import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import {
  getGoogleConfig,
  refreshAccessToken,
  searchGmail,
} from './lib/google.js';

const GMAIL_TOOL = {
  name: 'search_gmail',
  description:
    'Search the user\'s Gmail inbox. Use when they ask about emails, messages, unread mail, invoices in email, or anything that requires looking at their mail.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Gmail search query (same syntax as Gmail search box). Examples: "from:boss@company.com newer_than:7d", "subject:invoice", "is:unread". Default to recent inbox if unsure.',
      },
      max_results: {
        type: 'number',
        description: 'Max messages to return (1-15). Default 8.',
      },
    },
    required: ['query'],
  },
};

async function getValidGmailToken(userId) {
  const admin = getAdminClient();
  const { data: connector } = await admin
    .from('connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('status', 'connected')
    .maybeSingle();

  if (!connector?.access_token) return null;

  const expires = connector.token_expires_at
    ? new Date(connector.token_expires_at).getTime()
    : 0;
  const needsRefresh = !expires || expires < Date.now() + 60_000;

  if (!needsRefresh) return connector.access_token;
  if (!connector.refresh_token) return connector.access_token;

  const { clientId, clientSecret } = getGoogleConfig();
  const refreshed = await refreshAccessToken({
    clientId,
    clientSecret,
    refreshToken: connector.refresh_token,
  });

  const tokenExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;

  await admin
    .from('connectors')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connector.id);

  return refreshed.access_token;
}

async function runClaude({ apiKey, system, messages, tools }) {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system,
    messages,
  };
  if (tools?.length) {
    body.tools = tools;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Anthropic API error ${response.status}`);
    err.status = response.status;
    err.details = errorText;
    throw err;
  }

  return response.json();
}

function extractText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';
  return contentBlocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing ANTHROPIC_API_KEY',
      hint: 'Add it in Vercel → Settings → Environment Variables, then redeploy',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = body?.messages;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const user = await getUserFromAuthHeader(req);
    let tools = [];
    let gmailReady = false;

    if (user) {
      try {
        const token = await getValidGmailToken(user.id);
        if (token) {
          gmailReady = true;
          tools = [GMAIL_TOOL];
        }
      } catch (e) {
        console.warn('Could not load Gmail connector:', e.message);
      }
    }

    const systemPrompt = `You are Quantum — a sharp, reliable AI assistant built for professionals who work with email, documents, and data every day.

Be clear, direct, and helpful. Use markdown for structure. Lead with the answer. Keep responses focused and high-signal.

${gmailReady
  ? 'The user has connected Gmail. When they ask about their email, use the search_gmail tool. Summarize results clearly and cite subject/from/date.'
  : 'The user has not connected Gmail yet. If they ask about their email, tell them to open Settings → Connectors and connect Gmail.'}`;

    let anthropicMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content),
    }));

    // Tool-use loop (max 3 rounds)
    for (let round = 0; round < 3; round++) {
      const data = await runClaude({
        apiKey,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: tools.length ? tools : undefined,
      });

      const stop = data.stop_reason;
      const content = data.content || [];

      if (stop !== 'tool_use') {
        const text = extractText(content) || 'Sorry, I could not generate a response.';
        return res.status(200).json({ content: text });
      }

      // Append assistant tool_use turn
      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content },
      ];

      const toolResults = [];
      for (const block of content) {
        if (block.type !== 'tool_use') continue;

        if (block.name === 'search_gmail' && user) {
          try {
            const accessToken = await getValidGmailToken(user.id);
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Gmail is not connected.',
                is_error: true,
              });
            } else {
              const q = block.input?.query || 'in:inbox newer_than:14d';
              const max = Math.min(15, Math.max(1, Number(block.input?.max_results) || 8));
              const results = await searchGmail(accessToken, q, max);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ count: results.length, messages: results }),
              });
            }
          } catch (e) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Gmail search error: ${e.message}`,
              is_error: true,
            });
          }
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
        }
      }

      anthropicMessages.push({ role: 'user', content: toolResults });
    }

    return res.status(200).json({
      content: 'I tried to look that up but hit a limit. Please try a more specific question.',
    });
  } catch (err) {
    console.error('Handler error:', err);
    if (err.status) {
      return res.status(502).json({
        error: 'Anthropic API error',
        status: err.status,
        details: err.details,
      });
    }
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || String(err),
    });
  }
}
