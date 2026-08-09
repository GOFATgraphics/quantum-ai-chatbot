import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import { sendGmail } from './lib/google.js';
import {
  loadConnectorsAndTools,
  runTool,
} from './lib/claudeTools.js';

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

const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']);

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
  const chosen = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
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
  const chosen = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
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

function buildSystemPrompt({ connected, memory, project, firstName, think, deepSearch }) {
  const memoryBlock = memory?.length > 0
    ? `## What you know about this user\n${memory.map((m) => `- ${m.fact}${m.category ? ` (${m.category})` : ''}`).join('\n')}\nUse this context naturally.`
    : '## What you know about this user\nNo saved memories yet. When they share stable facts, use save_memory.';
  const projectBlock = project
    ? `## Active project workspace\nName: ${project.name}\n${project.description ? `Description: ${project.description}\n` : ''}`
    : '';
  const nameLine = firstName ? `The user's first name is ${firstName}. Address them by first name occasionally when natural.` : '';
  const toolLines = [];
  if (connected.gmail) {
    toolLines.push('- search_gmail / send_email / create_email_draft');
  }
  if (connected.drive) toolLines.push('- search_drive');
  if (connected.docs) toolLines.push('- read_google_doc');
  if (connected.sheets) toolLines.push('- search_sheets / read_sheet');
  if (connected.calendar) toolLines.push('- list_calendar_events');
  if (connected.outlook) toolLines.push('- search_outlook');
  if (connected.excel) toolLines.push('- search_excel');
  toolLines.push('- save_memory');
  const missing = [];
  for (const [k, label] of [['gmail','Gmail'],['drive','Drive'],['docs','Docs'],['sheets','Sheets'],['calendar','Calendar'],['outlook','Outlook'],['excel','Excel']]) {
    if (!connected[k]) missing.push(label);
  }
  const missingLine = missing.length
    ? `Not connected: ${missing.join(', ')}. Tell user to open Connectors if needed.`
    : 'All listed connectors are connected.';
  const modeBlocks = [];
  if (think) {
    modeBlocks.push('## Think mode\nReason step by step before answering. Show key intermediate reasoning briefly, then give a clear final answer. Prefer depth and correctness over speed.');
  }
  if (deepSearch) {
    modeBlocks.push('## DeepSearch mode\nTreat this as a research task. Structure the answer with: key findings first, supporting detail, uncertainties, and suggested follow-ups. Prefer cited structure (named sources or [links] when the user or tools provide them). Do not invent URLs or live facts you cannot verify from tools or the conversation.');
  }
  const modeBlock = modeBlocks.length ? modeBlocks.join('\n\n') + '\n\n' : '';

  return `You are Quantumy AI — a precise personal work assistant that learns about the user over time.\n\n${nameLine}\n\n${modeBlock}## Core principles\n- Be accurate, structured, and easy to scan.\n- Lead with the answer, then details.\n- Never invent email, file, calendar, or sheet contents — only tool results and user facts.\n- Prefer clarity over fluff.\n- When the user shares lasting context, call save_memory.\n\n## Formatting\nClean Markdown only. Use ## / ### headings, short paragraphs, numbered or bullet lists, and **bold** labels.\n- NEVER use pipe tables (| col | col |). Mobile cannot render them well.\n- For files/docs: numbered list with **Name** — date, then [Open](url) on its own line.\n- Prefer short link labels. No raw JSON dumps.\n\n## Email\n- If send_email is listed, Gmail is CONNECTED with send permission. You are NOT read-only.\n- When user says send it / send the email: call send_email with to, subject, body.\n- For draft only: call create_email_draft.\n\n## Connected tools\n${toolLines.join('\n')}\n${missingLine}\n\n${memoryBlock}\n\n${projectBlock}`;
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
      content: String(m.content),
    }));

    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
    }

    for (let round = 0; round < 4; round++) {
      let data;
      const maxTokens = (() => {
        const m = body?.model || '';
        if (body?.think || m.includes('opus')) return 8192;
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

      if (stop !== 'tool_use') {
        const textOut = (wantStream ? data.text : extractText(content)) || extractText(content) || 'Sorry, I could not generate a response.';
        if (wantStream) {
          if (!data.text) sseWrite(res, { content: textOut });
          sseWrite(res, { done: true });
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        return res.status(200).json({ content: textOut });
      }

      if (wantStream) {
        try { sseWrite(res, { status: 'tool_use' }); } catch (_) {}
      }

      anthropicMessages = [...anthropicMessages, { role: 'assistant', content }];
      const toolResults = [];
      for (const block of content) {
        if (block.type !== 'tool_use') continue;
        toolResults.push(await runTool(block, user));
      }
      anthropicMessages.push({ role: 'user', content: toolResults });
    }

    const limitMsg = 'I tried to look that up but hit a limit. Please try a more specific question.';
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
