import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import { sendGmail } from './lib/google.js';
import {
  loadConnectorsAndTools,
  runTool,
} from './lib/claudeTools.js';

/** Vercel serverless timeout — needs Pro plan for >60s */
export const config = { maxDuration: 300 };

const rateBuckets = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const max = 30;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.start + windowMs - now) / 1000) };
  }
  return { ok: true };
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-opus-4-6',
]);
const DEFAULT_MODEL = 'claude-sonnet-5';

async function loadUserMemory(userId) {
  try {
    const admin = getAdminClient();
    const { data } = await admin.from('user_memory').select('fact, category').eq('user_id', userId).order('updated_at', { ascending: false }).limit(40);
    return data || [];
  } catch { return []; }
}

async function loadProjectContext(userId, projectId) {
  if (!projectId) return null;
  try {
    const admin = getAdminClient();
    const { data } = await admin.from('projects').select('name, description').eq('id', projectId).eq('user_id', userId).maybeSingle();
    return data;
  } catch { return null; }
}

async function runClaude({ apiKey, system, messages, tools, model, maxTokens = 4096 }) {
  const chosen = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const body = { model: chosen, max_tokens: maxTokens, system, messages };
  if (tools?.length) body.tools = tools;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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

async function runClaudeStream({ apiKey, system, messages, tools, model, onDelta, maxTokens = 4096 }) {
  const chosen = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const body = { model: chosen, max_tokens: maxTokens, system, messages, stream: true };
  if (tools?.length) body.tools = tools;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Anthropic API error ${response.status}`);
    err.status = response.status;
    err.details = errorText;
    throw err;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason = null;
  const contentBlocks = [];
  let currentTool = null;
  let textAcc = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(payload); } catch { continue; }
      if (evt.type === 'content_block_start') {
        const b = evt.content_block;
        if (b?.type === 'text') contentBlocks.push({ type: 'text', text: '' });
        else if (b?.type === 'tool_use') {
          currentTool = { type: 'tool_use', id: b.id, name: b.name, input: '', partial_json: '' };
          contentBlocks.push(currentTool);
        }
      } else if (evt.type === 'content_block_delta') {
        const d = evt.delta;
        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          textAcc += d.text;
          const last = contentBlocks[contentBlocks.length - 1];
          if (last?.type === 'text') last.text += d.text;
          if (onDelta) onDelta(d.text);
        } else if (d?.type === 'input_json_delta' && currentTool) {
          currentTool.partial_json = (currentTool.partial_json || '') + (d.partial_json || '');
        }
      } else if (evt.type === 'content_block_stop') {
        if (currentTool) {
          try { currentTool.input = JSON.parse(currentTool.partial_json || '{}'); }
          catch { currentTool.input = {}; }
          delete currentTool.partial_json;
          currentTool = null;
        }
      } else if (evt.type === 'message_delta') {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
      }
    }
  }
  const normalized = contentBlocks.map((b) => {
    if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} };
    return b;
  });
  return { stop_reason: stopReason || 'end_turn', content: normalized, text: textAcc };
}

function extractText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';
  return contentBlocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function toAnthropicContent(content) {
  const str = String(content || '');
  const imgRe = /!\[([^\]]*)\]\((data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+))\)/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = imgRe.exec(str)) !== null) {
    if (m.index > last) {
      const text = str.slice(last, m.index).trim();
      if (text) parts.push({ type: 'text', text });
    }
    let mediaType = m[3];
    if (!mediaType.startsWith('image/')) mediaType = 'image/' + mediaType;
    if (mediaType.includes('jpg')) mediaType = 'image/jpeg';
    else if (mediaType.includes('png')) mediaType = 'image/png';
    else if (mediaType.includes('gif')) mediaType = 'image/gif';
    else if (mediaType.includes('webp')) mediaType = 'image/webp';
    else if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) mediaType = 'image/jpeg';
    parts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: m[4] } });
    last = m.index + m[0].length;
  }
  const rest = str.slice(last).trim();
  if (rest) parts.push({ type: 'text', text: rest });
  if (parts.length === 0) return str || '';
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
}

function parseExplicitSend(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  if (!lower.includes('send') || !lower.includes('to:')) return null;
  const toMatch = text.match(/^\s*To:\s*(.+)$/im);
  const subjectMatch = text.match(/^\s*Subject:\s*(.+)$/im);
  const bodyMatch = text.match(/^\s*Body:\s*([\s\S]+)/im);
  if (!toMatch || !subjectMatch || !bodyMatch) return null;
  const to = toMatch[1].trim();
  const subject = subjectMatch[1].trim();
  let body = bodyMatch[1].trim().replace(/\n-{3,}[\s\S]*$/, '').trim();
  if (!to || !subject || !body || !to.includes('@')) return null;
  return { to, subject, body };
}

const OPERATOR_SYSTEM_PROMPT = `You are **Quantumy**, an AI workspace operator. Direct, brief, outcome-focused. No filler, no emoji.

You read and write documents, spreadsheets, images, and screenshots. You act on Gmail, Drive, Sheets, Calendar, and connected tools. You can search the live web with web_search and read specific pages with web_fetch when you need current information.

**Confirmation rule:** Reversible actions (read, search, draft, analyze, create local drafts, archive, mark read) → do immediately when clearly requested. Irreversible/external actions (send email, reply, forward, trash mail, invite calendar attendees, share externally) → summarize exactly what you will do and wait for explicit confirmation. Creating a calendar event without attendees, creating a Doc/Sheet, or updating a sheet the user owns is fine after a clear request — still confirm if attendees or external sharing are involved.

Lead with outcomes. Never narrate internal steps. Clean Markdown. No pipe tables. When you use web_search or web_fetch, cite key sources with links.

Images: when the user attaches an image, look at it carefully and answer based on what you see.
`;

function buildSystemPrompt({ connected, memory, project, firstName, think, deepSearch }) {
  const memoryBlock = memory?.length > 0
    ? `## What you know about this user\n${memory.map((m) => `- ${m.fact}${m.category ? ` (${m.category})` : ''}`).join('\n')}\nUse this context naturally. When they share stable facts, use save_memory.`
    : '## What you know about this user\nNo saved memories yet. When they share stable facts, use save_memory.';
  const projectBlock = project
    ? `## Active project workspace\nName: ${project.name}\n${project.description ? `Description: ${project.description}\n` : ''}`
    : '';
  const nameLine = firstName ? `The user's first name is ${firstName}. Address them by first name occasionally when natural.` : '';
  const toolLines = [];
  toolLines.push('- web_search (always available — current events, prices, news, time-sensitive facts)');
  toolLines.push('- web_fetch (always available — read a specific URL or page in full)');
  if (connected.gmail) {
    toolLines.push('- search_gmail / get_gmail_message / send_email / create_email_draft');
    toolLines.push('- reply_email / forward_email (confirm before sending)');
    toolLines.push('- modify_gmail (archive, star, read/unread, trash) / list_gmail_labels / bulk_archive_gmail');
  }
  if (connected.drive) toolLines.push('- search_drive');
  if (connected.docs) toolLines.push('- read_google_doc / create_google_doc / append_google_doc');
  if (connected.sheets) toolLines.push('- search_sheets / read_sheet / create_spreadsheet / update_sheet');
  if (connected.calendar) toolLines.push('- list_calendar_events / create_calendar_event');
  if (connected.outlook) toolLines.push('- search_outlook');
  if (connected.excel) toolLines.push('- search_excel');
  toolLines.push('- save_memory');
  const missing = [];
  for (const [k, label] of [['gmail','Gmail'],['drive','Drive'],['docs','Docs'],['sheets','Sheets'],['calendar','Calendar'],['outlook','Outlook'],['excel','Excel']]) {
    if (!connected[k]) missing.push(label);
  }
  const missingLine = missing.length
    ? `Not connected: ${missing.join(', ')}. Tell user to open Connectors if needed. If a write tool fails with a scope error, tell them to disconnect and reconnect that connector.`
    : 'All listed connectors are connected.';
  const modeBlocks = [];
  if (think) modeBlocks.push('## Think mode\nReason step by step before answering.');
  if (deepSearch) modeBlocks.push('## DeepSearch mode\nTreat this as a research task. Prefer web_search + web_fetch for fresh sources; synthesize findings and cite links.');
  const modeBlock = modeBlocks.length ? modeBlocks.join('\n\n') + '\n\n' : '';

  return `${OPERATOR_SYSTEM_PROMPT}

${nameLine}

${modeBlock}## Connected tools (runtime)\n${toolLines.join('\n')}\n${missingLine}

## Email tools
- search_gmail first to get message_id / threadId.
- send_email / reply_email / forward_email are irreversible: summarize and get confirmation before calling.
- create_email_draft is safe (no send).
- modify_gmail: archive / star / read / unread are fine when asked; trash requires confirmation.
- bulk_archive_gmail: confirm which messages first (max 50 ids).

## Calendar
- create_calendar_event without attendees: OK after a clear request.
- With attendees (invites others): confirm first.

## Docs & Sheets
- create_google_doc / create_spreadsheet / update_sheet / append_google_doc: do when the user asks to create or update their own files.

${memoryBlock}

${projectBlock}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY', hint: 'Add it in Vercel env vars and redeploy' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = body?.messages;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const user = await getUserFromAuthHeader(req);
    const rateKey = user?.id || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon';
    const rl = checkRateLimit(String(rateKey));
    if (!rl.ok) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.', retryAfterSec: rl.retryAfterSec });
    }

    const wantStream = body?.stream === true;
    const firstName = body?.firstName || null;
    let memory = [];
    let project = null;
    let connected = { gmail: false, drive: false, docs: false, sheets: false, calendar: false, outlook: false, excel: false };
    let tools = [];

    try {
      const loaded = await loadConnectorsAndTools(user);
      connected = loaded.connected;
      tools = loaded.tools;
    } catch (e) {
      console.warn('Could not load connectors:', e.message);
      tools = [];
    }

    if (user) {
      memory = await loadUserMemory(user.id);
      if (body?.projectId) project = await loadProjectContext(user.id, body.projectId);
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const explicit = lastUser ? parseExplicitSend(String(lastUser.content || '')) : null;
    if (explicit && user) {
      const { getValidToken } = await import('./lib/claudeTools.js');
      const accessToken = await getValidToken(user.id, 'gmail');
      if (accessToken) {
        try {
          const result = await sendGmail(accessToken, explicit);
          return res.status(200).json({
            content: `Email sent successfully.\n\n**To:** ${explicit.to}\n**Subject:** ${explicit.subject}\n\n**Body:**\n${explicit.body}\n\nMessage id: ${result.id}`,
          });
        } catch (e) {
          return res.status(200).json({ content: `Gmail API error: ${e.message || String(e)}\n\nIf this mentions scopes, reconnect Gmail in Connectors.` });
        }
      }
      return res.status(200).json({
        content: `Gmail is not connected. Open Connectors, connect Gmail, then try again.\n\n**To:** ${explicit.to}\n**Subject:** ${explicit.subject}\n\n**Body:**\n${explicit.body}`,
      });
    }

    const systemPrompt = buildSystemPrompt({ connected, memory, project, firstName, think: !!body?.think, deepSearch: !!body?.deepSearch });
    let anthropicMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.role === 'assistant' ? String(m.content) : toAnthropicContent(m.content),
    }));

    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
    }

    const maxRounds = body?.deepSearch || body?.think ? 10 : 8;
    for (let round = 0; round < maxRounds; round++) {
      let data;
      const maxTokens = (() => {
        const m = body?.model || '';
        if (body?.think || body?.deepSearch || m.includes('opus') || m.includes('fable')) return 8192;
        if (m.includes('haiku')) return 2048;
        return 4096;
      })();
      if (wantStream) {
        data = await runClaudeStream({
          apiKey, system: systemPrompt, messages: anthropicMessages,
          tools: tools.length ? tools : undefined, model: body?.model,
          maxTokens,
          onDelta: (delta) => { try { sseWrite(res, { delta }); } catch (_) {} },
        });
      } else {
        data = await runClaude({
          apiKey, system: systemPrompt, messages: anthropicMessages,
          tools: tools.length ? tools : undefined, model: body?.model,
          maxTokens,
        });
      }

      const stop = data.stop_reason;
      const content = data.content || [];
      const clientToolBlocks = content.filter((b) => b.type === 'tool_use');

      if (stop !== 'tool_use' || clientToolBlocks.length === 0) {
        const textOut =
          (wantStream ? data.text : extractText(content)) ||
          extractText(content) ||
          'Sorry, I could not generate a response.';
        if (wantStream) {
          if (!data.text || !String(data.text).trim()) sseWrite(res, { content: textOut });
          sseWrite(res, { done: true });
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        return res.status(200).json({ content: textOut });
      }

      if (wantStream) {
        try {
          const names = clientToolBlocks.map((b) => b.name).filter(Boolean);
          sseWrite(res, { status: 'tool_use', tool: names[0] || 'tool', tools: names });
        } catch (_) {}
      }

      anthropicMessages = [...anthropicMessages, { role: 'assistant', content }];
      const toolResults = [];
      for (const block of clientToolBlocks) {
        toolResults.push(await runTool(block, user));
      }
      if (toolResults.length === 0) {
        const fallback = 'Tool step produced no results. Please try a more specific request.';
        if (wantStream) {
          sseWrite(res, { content: fallback });
          sseWrite(res, { done: true });
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        return res.status(200).json({ content: fallback });
      }
      anthropicMessages.push({ role: 'user', content: toolResults });
    }

    const limitMsg =
      'I ran out of tool steps on this request. Try a narrower query (e.g. emails with a person in the last 3–6 months), or turn on DeepSearch and ask again.';
    if (wantStream) {
      sseWrite(res, { content: limitMsg });
      sseWrite(res, { done: true });
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return res.status(200).json({ content: limitMsg });
  } catch (err) {
    console.error('Handler error:', err);
    const wantStream = (() => {
      try {
        const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        return b?.stream === true;
      } catch { return false; }
    })();
    if (wantStream && res.headersSent) {
      try {
        sseWrite(res, { error: err?.message || 'Internal server error' });
        res.write('data: [DONE]\n\n');
        return res.end();
      } catch (_) {}
    }
    if (err.status) {
      return res.status(502).json({ error: 'Anthropic API error', status: err.status, details: err.details });
    }
    return res.status(500).json({ error: 'Internal server error', message: err?.message || String(err) });
  }
}
