import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import {
  getGoogleConfig,
  refreshAccessToken,
  searchGmail,
  searchDrive,
  readGoogleDoc,
  searchSheets,
  readSheetRange,
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

async function runClaude({ apiKey, system, messages, tools }) {
  const body = {
    model: 'claude-sonnet-4-6',
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

function extractText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';
  return contentBlocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
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
  if (connected.gmail) toolLines.push('- search_gmail: search/read their Gmail');
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

  return `You are Quantumy AI — a precise personal work assistant that learns about the user over time.\n\n${nameLine}\n\n## Core principles\n- Be accurate, structured, and easy to scan.\n- Lead with the answer, then details.\n- Never invent email, file, or sheet contents — only tool results and user facts.\n- Prefer clarity over fluff.\n- When the user shares lasting context, call save_memory.\n\n## Formatting\nClean Markdown only. Use ## / ### headings, short paragraphs, numbered or bullet lists, and **bold** labels.\n- NEVER use pipe tables (| col | col |). Mobile cannot render them well.\n- For files/docs: use a numbered list. Each item = **Name** — date, then a markdown link on its own line: [Open](url)\n- Prefer short link labels like [Open doc](url) or [Open sheet](url). Never dump raw multi-line URLs.\n- No raw JSON dumps.\n\n## Google Docs / Drive\n- search_drive returns name, link, date, mimeType. Present them as clean lists with [Open](link).\n- You can only READ a Doc's text if the Docs connector is connected AND you call read_google_doc with the document id.\n- If Docs is not connected, say so clearly and still give tappable [Open](link) links. Do not invent contents.\n\n## Email\n- If Gmail is connected with send permission (reconnect after scope update), you can ask the user to confirm then they can send from Gmail.\n- Always show a ready-to-copy draft with **To** / **Subject** / **Body**.\n- Sending via API requires the updated Gmail connector consent.\n\n## Connected tools\n${toolLines.join('\n')}\n${missingLine}\n\n${memoryBlock}\n\n${projectBlock}`;
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
    let tools = [SAVE_MEMORY_TOOL];
    const connected = { gmail: false, drive: false, docs: false, sheets: false };
    let memory = [];
    let project = null;
    const firstName = body?.firstName || null;

    if (user) {
      try {
        if (await getValidToken(user.id, 'gmail')) {
          connected.gmail = true;
          tools.push(GMAIL_TOOL);
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

    const systemPrompt = buildSystemPrompt({ connected, memory, project, firstName });

    let anthropicMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content),
    }));

    for (let round = 0; round < 4; round++) {
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
