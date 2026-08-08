import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import {
  getGoogleConfig,
  refreshAccessToken,
  searchGmail,
  searchDrive,
  readGoogleDoc,
  searchSheets,
  readSheetRange,
  sendGmail,
  createGmailDraft,
} from './lib/google.js';


/** Simple in-memory rate limit: 30 requests / 5 min per user or IP */
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
          'Gmail search query (same syntax as Gmail search box). Examples: "from:boss@company.com newer_than:7d", "subject:invoice", "is:unread".',
      },
      max_results: {
        type: 'number',
        description: 'Max messages to return (1-15). Default 10.',
      },
    },
    required: ['query'],
  },
};

const SEND_EMAIL_TOOL = {
  name: 'send_email',
  description:
    'Send an email from the user\'s Gmail. Only use when the user explicitly asks to send. Confirm recipient and subject in the message first when unclear.',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Plain-text body' },
      cc: { type: 'string', description: 'Optional CC addresses, comma-separated' },
      bcc: { type: 'string', description: 'Optional BCC addresses, comma-separated' },
    },
    required: ['to', 'subject', 'body'],
  },
};

const DRAFT_EMAIL_TOOL = {
  name: 'create_email_draft',
  description:
    'Create a Gmail draft (does not send). Prefer this when the user wants to review before sending.',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Plain-text body' },
      cc: { type: 'string', description: 'Optional CC' },
      bcc: { type: 'string', description: 'Optional BCC' },
    },
    required: ['to', 'subject', 'body'],
  },
};

const DRIVE_TOOL = {
  name: 'search_drive',
  description:
    'Search Google Drive for files by name or content. Use when the user asks about files, documents, PDFs, or folders in Drive. Results include name, link, modifiedTime, mimeType. Present results as a numbered list with markdown links [Open](link) — never pipe tables.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search text (file name or words inside files). Empty string returns recent files.',
      },
      max_results: { type: 'number', description: '1-15, default 10' },
    },
    required: ['query'],
  },
};

const DOCS_TOOL = {
  name: 'read_google_doc',
  description:
    'Read the text content of a Google Doc by document ID (from search_drive results with mimeType application/vnd.google-apps.document).',
  input_schema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'Google Docs document ID',
      },
    },
    required: ['document_id'],
  },
};

const SHEETS_LIST_TOOL = {
  name: 'search_sheets',
  description:
    'List Google Spreadsheets the user can access, optionally filtered by name.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional name filter. Empty returns recent spreadsheets.',
      },
      max_results: { type: 'number', description: '1-15, default 8' },
    },
    required: ['query'],
  },
};

const SHEETS_READ_TOOL = {
  name: 'read_sheet',
  description:
    'Read cell values from a Google Spreadsheet. Use spreadsheet_id from search_sheets.',
  input_schema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'Spreadsheet ID' },
      range: {
        type: 'string',
        description: 'A1 notation range, e.g. Sheet1!A1:D20 or A1:Z30. Default A1:Z30',
      },
    },
    required: ['spreadsheet_id'],
  },
};

const SAVE_MEMORY_TOOL = {
  name: 'save_memory',
  description:
    'Save a lasting fact about the user for future conversations (preferences, job, people, companies, habits).',
  input_schema: {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description: 'A short, clear fact in third person.',
      },
      category: {
        type: 'string',
        description: 'Optional: preference, work, people, project, general',
      },
    },
    required: ['fact'],
  },
};

async function getValidToken(userId, provider) {
  const admin = getAdminClient();
  const { data: connector } = await admin
    .from('connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
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

async function loadUserMemory(userId) {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('user_memory')
      .select('fact, category')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(40);
    return data || [];
  } catch {
    return [];
  }
}

async function loadProjectContext(userId, projectId) {
  if (!projectId) return null;
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('projects')
      .select('name, description')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001']);

async function runClaude({ apiKey, system, messages, tools, model }) {
  const chosen = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
  const body = {
    model: chosen,
    max_tokens: 4096,
    system,
    messages,
  };
  if (tools?.length) body.tools = tools;

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


async function runClaudeStream({ apiKey, system, messages, tools, model, onDelta }) {
  const chosen = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
  const body = {
    model: chosen,
    max_tokens: 4096,
    system,
    messages,
    stream: true,
  };
  if (tools?.length) body.tools = tools;

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
        if (b?.type === 'text') {
          contentBlocks.push({ type: 'text', text: '' });
        } else if (b?.type === 'tool_use') {
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
          try {
            currentTool.input = JSON.parse(currentTool.partial_json || '{}');
          } catch {
            currentTool.input = {};
          }
          delete currentTool.partial_json;
          currentTool = null;
        }
      } else if (evt.type === 'message_delta') {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
      } else if (evt.type === 'message_stop') {
        // done
      }
    }
  }

  // Normalize tool_use blocks
  const normalized = contentBlocks.map((b) => {
    if (b.type === 'tool_use') {
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} };
    }
    return b;
  });

  return { stop_reason: stopReason || 'end_turn', content: normalized, text: textAcc };
}

function extractText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';
  return contentBlocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** Detect explicit Send this email messages with To/Subject/Body blocks. */
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
  let body = bodyMatch[1].trim();
  body = body.replace(/\n-{3,}[\s\S]*$/, '').trim();
  if (!to || !subject || !body) return null;
  if (!to.includes('@')) return null;
  return { to, subject, body };
}

function buildSystemPrompt({ connected, memory, project, firstName }) {
  const memoryBlock =
    memory?.length > 0
      ? `## What you know about this user\n${memory
          .map((m) => `- ${m.fact}${m.category ? ` (${m.category})` : ''}`)
          .join('\n')}\nUse this context naturally. Honor preferences and instructions.`
      : '## What you know about this user\nNo saved memories yet. When they share stable facts, use save_memory.';

  const projectBlock = project
    ? `## Active project workspace\nName: ${project.name}\n${project.description ? `Description: ${project.description}\n` : ''}`
    : '';

  const nameLine = firstName
    ? `The user's first name is ${firstName}. Address them by first name occasionally when natural.`
    : '';

  const toolLines = [];
  if (connected.gmail) {
    toolLines.push('- search_gmail: search/read their Gmail');
    toolLines.push('- send_email: send email (only when user clearly asks to send)');
    toolLines.push('- create_email_draft: save a Gmail draft without sending');
  }
  if (connected.drive) toolLines.push('- search_drive: search files in Google Drive');
  if (connected.docs) toolLines.push('- read_google_doc: read a Google Doc by id (from Drive search)');
  if (connected.sheets) {
    toolLines.push('- search_sheets: list spreadsheets');
    toolLines.push('- read_sheet: read cells from a spreadsheet');
  }
  toolLines.push('- save_memory: store lasting facts about the user');

  const missing = [];
  if (!connected.gmail) missing.push('Gmail');
  if (!connected.drive) missing.push('Drive');
  if (!connected.docs) missing.push('Docs');
  if (!connected.sheets) missing.push('Sheets');
  const missingLine =
    missing.length > 0
      ? `Not connected: ${missing.join(', ')}. If they need those, tell them to open Connectors and connect.`
      : 'All Google connectors above are connected.';

  return `You are Quantumy AI — a precise personal work assistant that learns about the user over time.\n\n${nameLine}\n\n## Core principles\n- Be accurate, structured, and easy to scan.\n- Lead with the answer, then details.\n- Never invent email, file, or sheet contents — only tool results and user facts.\n- Prefer clarity over fluff.\n- When the user shares lasting context, call save_memory.\n\n## Formatting\nClean Markdown only. Use ## / ### headings, short paragraphs, numbered or bullet lists, and **bold** labels.\n- NEVER use pipe tables (| col | col |). Mobile cannot render them well.\n- For files/docs: use a numbered list. Each item = **Name** — date, then a markdown link on its own line: [Open](url)\n- Prefer short link labels like [Open doc](url) or [Open sheet](url). Never dump raw multi-line URLs.\n- No raw JSON dumps.\n\n## Google Docs / Drive\n- search_drive returns name, link, date, mimeType. Present them as clean lists with [Open](link).\n- You can only READ a Doc's text if the Docs connector is connected AND you call read_google_doc with the document id.\n- If Docs is not connected, say so clearly and still give tappable [Open](link) links. Do not invent contents.\n\n## Email (critical)\n- If send_email / create_email_draft appear under Connected tools, Gmail is CONNECTED with send permission. You are NOT read-only.\n- NEVER claim read-only or ask the user to reconnect when those tools are listed.\n- When the user says send it / send the email / send this: you MUST call send_email with to, subject, body. Do not only paste a draft.\n- For draft only: call create_email_draft.\n- After a successful send_email result, confirm it was sent and show To / Subject / Body.\n- Only if Gmail is under "Not connected" may you refuse to send and offer a copy-paste draft.\n\n## Connected tools\n${toolLines.join('\n')}\n${missingLine}\n\n${memoryBlock}\n\n${projectBlock}`;
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
    const rateKey = user?.id || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon';
    const rl = checkRateLimit(String(rateKey));
    if (!rl.ok) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
        retryAfterSec: rl.retryAfterSec,
      });
    }
    const wantStream = body?.stream === true;
    let tools = [SAVE_MEMORY_TOOL];
    const connected = { gmail: false, drive: false, docs: false, sheets: false };
    let memory = [];
    let project = null;
    const firstName = body?.firstName || null;

    if (user) {
      try {
        if (await getValidToken(user.id, 'gmail')) {
          connected.gmail = true;
          tools.push(GMAIL_TOOL, SEND_EMAIL_TOOL, DRAFT_EMAIL_TOOL);
        }
        if (await getValidToken(user.id, 'google_drive')) {
          connected.drive = true;
          tools.push(DRIVE_TOOL);
        }
        if (await getValidToken(user.id, 'google_docs')) {
          connected.docs = true;
          tools.push(DOCS_TOOL);
          if (!connected.drive) {
            connected.drive = true;
            tools.push(DRIVE_TOOL);
          }
        }
        if (await getValidToken(user.id, 'google_sheets')) {
          connected.sheets = true;
          tools.push(SHEETS_LIST_TOOL, SHEETS_READ_TOOL);
        }
      } catch (e) {
        console.warn('Could not load connectors:', e.message);
      }

      memory = await loadUserMemory(user.id);
      if (body?.projectId) {
        project = await loadProjectContext(user.id, body.projectId);
      }
    }

    // Direct send path: user pasted To/Subject/Body with "send"
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const explicit = lastUser ? parseExplicitSend(String(lastUser.content || '')) : null;
    if (explicit && user) {
      const accessToken = await getValidToken(user.id, 'gmail');
      if (accessToken) {
        try {
          const result = await sendGmail(accessToken, explicit);
          return res.status(200).json({
            content:
              'Email sent successfully.\n\n' +
              '**To:** ' + explicit.to + '\n' +
              '**Subject:** ' + explicit.subject + '\n\n' +
              '**Body:**\n' + explicit.body + '\n\n' +
              'Message id: ' + result.id,
          });
        } catch (e) {
          return res.status(200).json({
            content:
              'Gmail API error: ' + (e.message || String(e)) +
              '\n\nIf this mentions scopes, disconnect and reconnect Gmail in Connectors.',
          });
        }
      } else {
        return res.status(200).json({
          content:
            'Gmail is not connected. Open Connectors, connect Gmail (allow send), then try again.\n\n' +
            '**To:** ' + explicit.to + '\n**Subject:** ' + explicit.subject + '\n\n**Body:**\n' + explicit.body,
        });
      }
    }

    const systemPrompt = buildSystemPrompt({ connected, memory, project, firstName });

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
      if (wantStream) {
        data = await runClaudeStream({
          apiKey,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: tools.length ? tools : undefined,
          model: body?.model,
          onDelta: (delta) => {
            // Only stream text when not in a tool-use intermediate round will still stream;
            // client accumulates deltas.
            try { sseWrite(res, { delta }); } catch (_) {}
          },
        });
      } else {
        data = await runClaude({
          apiKey,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: tools.length ? tools : undefined,
          model: body?.model,
        });
      }

      const stop = data.stop_reason;
      const content = data.content || [];

      if (stop !== 'tool_use') {
        const textOut = (wantStream ? data.text : extractText(content)) || extractText(content) || 'Sorry, I could not generate a response.';
        if (wantStream) {
          // If nothing was streamed (e.g. empty), send full content
          if (!data.text) sseWrite(res, { content: textOut });
          sseWrite(res, { done: true });
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        return res.status(200).json({ content: textOut });
      }

      // Tool use: if we streamed partial text, client should ignore until final
      if (wantStream) {
        try { sseWrite(res, { status: 'tool_use' }); } catch (_) {}
      }

      anthropicMessages = [...anthropicMessages, { role: 'assistant', content }];

      const toolResults = [];
      for (const block of content) {
        if (block.type !== 'tool_use') continue;

        try {
          if (block.name === 'search_gmail' && user) {
            const accessToken = await getValidToken(user.id, 'gmail');
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Gmail is not connected.',
                is_error: true,
              });
            } else {
              const q = block.input?.query || 'in:inbox newer_than:14d';
              const max = Math.min(15, Math.max(1, Number(block.input?.max_results) || 10));
              const results = await searchGmail(accessToken, q, max);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ count: results.length, messages: results }),
              });
            }
          } else if (block.name === 'send_email' && user) {
            const accessToken = await getValidToken(user.id, 'gmail');
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Gmail is not connected. Ask the user to connect Gmail in Connectors, then reconnect so send permission is granted.',
                is_error: true,
              });
            } else {
              const result = await sendGmail(accessToken, {
                to: String(block.input?.to || ''),
                subject: String(block.input?.subject || ''),
                body: String(block.input?.body || ''),
                cc: block.input?.cc ? String(block.input.cc) : undefined,
                bcc: block.input?.bcc ? String(block.input.bcc) : undefined,
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ sent: true, ...result }),
              });
            }
          } else if (block.name === 'create_email_draft' && user) {
            const accessToken = await getValidToken(user.id, 'gmail');
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Gmail is not connected.',
                is_error: true,
              });
            } else {
              const result = await createGmailDraft(accessToken, {
                to: String(block.input?.to || ''),
                subject: String(block.input?.subject || ''),
                body: String(block.input?.body || ''),
                cc: block.input?.cc ? String(block.input.cc) : undefined,
                bcc: block.input?.bcc ? String(block.input.bcc) : undefined,
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ drafted: true, ...result }),
              });
            }
          } else if (block.name === 'search_drive' && user) {
            const accessToken =
              (await getValidToken(user.id, 'google_drive')) ||
              (await getValidToken(user.id, 'google_docs'));
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Google Drive is not connected.',
                is_error: true,
              });
            } else {
              const results = await searchDrive(
                accessToken,
                block.input?.query || '',
                Math.min(15, Math.max(1, Number(block.input?.max_results) || 10))
              );
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ count: results.length, files: results }),
              });
            }
          } else if (block.name === 'read_google_doc' && user) {
            const accessToken =
              (await getValidToken(user.id, 'google_docs')) ||
              (await getValidToken(user.id, 'google_drive'));
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Google Docs is not connected.',
                is_error: true,
              });
            } else {
              const doc = await readGoogleDoc(accessToken, String(block.input?.document_id || ''));
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(doc),
              });
            }
          } else if (block.name === 'search_sheets' && user) {
            const accessToken = await getValidToken(user.id, 'google_sheets');
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Google Sheets is not connected.',
                is_error: true,
              });
            } else {
              const results = await searchSheets(
                accessToken,
                block.input?.query || '',
                Math.min(15, Math.max(1, Number(block.input?.max_results) || 8))
              );
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ count: results.length, spreadsheets: results }),
              });
            }
          } else if (block.name === 'read_sheet' && user) {
            const accessToken = await getValidToken(user.id, 'google_sheets');
            if (!accessToken) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Google Sheets is not connected.',
                is_error: true,
              });
            } else {
              const data = await readSheetRange(
                accessToken,
                String(block.input?.spreadsheet_id || ''),
                block.input?.range || 'A1:Z30'
              );
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(data),
              });
            }
          } else if (block.name === 'save_memory' && user) {
            const fact = String(block.input?.fact || '').trim();
            if (!fact) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: 'Empty fact; nothing saved.',
                is_error: true,
              });
            } else {
              const admin = getAdminClient();
              await admin.from('user_memory').insert({
                user_id: user.id,
                fact,
                category: block.input?.category || 'general',
                source: 'chat',
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: `Saved memory: ${fact}`,
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
        } catch (e) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Tool error: ${e.message}`,
            is_error: true,
          });
        }
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
    if (wantStream && !res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    }
    if (wantStream && res.headersSent) {
      try {
        sseWrite(res, { error: err?.message || 'Internal server error' });
        res.write('data: [DONE]\n\n');
        return res.end();
      } catch (_) {}
    }
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
