/** Tool defs + execution for chat connectors */
import { getAdminClient } from './supabaseAdmin.js';
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
  listCalendarEvents,
} from './google.js';
import {
  getMicrosoftConfig,
  refreshMicrosoftToken,
  searchOutlook,
  searchExcelFiles,
} from './microsoft.js';

export const GMAIL_TOOL = {
  name: 'search_gmail',
  description: 'Search the user Gmail inbox.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Gmail search query' },
      max_results: { type: 'number', description: '1-15, default 10' },
    },
    required: ['query'],
  },
};

export const SEND_EMAIL_TOOL = {
  name: 'send_email',
  description: 'Send email from Gmail. Only when user explicitly asks to send.',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      cc: { type: 'string' },
      bcc: { type: 'string' },
    },
    required: ['to', 'subject', 'body'],
  },
};

export const DRAFT_EMAIL_TOOL = {
  name: 'create_email_draft',
  description: 'Create a Gmail draft without sending.',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      cc: { type: 'string' },
      bcc: { type: 'string' },
    },
    required: ['to', 'subject', 'body'],
  },
};

export const DRIVE_TOOL = {
  name: 'search_drive',
  description: 'Search Google Drive. Present as numbered list with [Open](link).',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      max_results: { type: 'number' },
    },
    required: ['query'],
  },
};

export const DOCS_TOOL = {
  name: 'read_google_doc',
  description: 'Read a Google Doc by document ID.',
  input_schema: {
    type: 'object',
    properties: { document_id: { type: 'string' } },
    required: ['document_id'],
  },
};

export const SHEETS_LIST_TOOL = {
  name: 'search_sheets',
  description: 'List Google Spreadsheets.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      max_results: { type: 'number' },
    },
    required: ['query'],
  },
};

export const SHEETS_READ_TOOL = {
  name: 'read_sheet',
  description: 'Read cells from a spreadsheet.',
  input_schema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string' },
      range: { type: 'string' },
    },
    required: ['spreadsheet_id'],
  },
};

export const CALENDAR_TOOL = {
  name: 'list_calendar_events',
  description: 'List upcoming Google Calendar events.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      days_ahead: { type: 'number' },
      max_results: { type: 'number' },
    },
    required: [],
  },
};

export const OUTLOOK_TOOL = {
  name: 'search_outlook',
  description: 'Search Microsoft Outlook mail.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      max_results: { type: 'number' },
    },
    required: ['query'],
  },
};

export const EXCEL_TOOL = {
  name: 'search_excel',
  description: 'Search OneDrive for Excel workbooks. Use [Open](url) links.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      max_results: { type: 'number' },
    },
    required: ['query'],
  },
};

export const SAVE_MEMORY_TOOL = {
  name: 'save_memory',
  description: 'Save a lasting fact about the user.',
  input_schema: {
    type: 'object',
    properties: {
      fact: { type: 'string' },
      category: { type: 'string' },
    },
    required: ['fact'],
  },
};

export async function getValidToken(userId, provider) {
  const admin = getAdminClient();
  const { data: connector } = await admin
    .from('connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'connected')
    .maybeSingle();
  if (!connector?.access_token) return null;
  const expires = connector.token_expires_at ? new Date(connector.token_expires_at).getTime() : 0;
  const needsRefresh = !expires || expires < Date.now() + 60_000;
  if (!needsRefresh) return connector.access_token;
  if (!connector.refresh_token) return connector.access_token;
  const { clientId, clientSecret } = getGoogleConfig();
  const refreshed = await refreshAccessToken({ clientId, clientSecret, refreshToken: connector.refresh_token });
  const tokenExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  await admin.from('connectors').update({
    access_token: refreshed.access_token,
    token_expires_at: tokenExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', connector.id);
  return refreshed.access_token;
}

export async function getValidMicrosoftToken(userId, provider) {
  const admin = getAdminClient();
  const { data: connector } = await admin
    .from('connectors')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'connected')
    .maybeSingle();
  if (!connector?.access_token) return null;
  const expires = connector.token_expires_at ? new Date(connector.token_expires_at).getTime() : 0;
  const needsRefresh = !expires || expires < Date.now() + 60_000;
  if (!needsRefresh) return connector.access_token;
  if (!connector.refresh_token) return connector.access_token;
  const { clientId, clientSecret, tenant } = getMicrosoftConfig();
  if (!clientId || !clientSecret) return connector.access_token;
  const refreshed = await refreshMicrosoftToken({
    clientId, clientSecret, refreshToken: connector.refresh_token, tenant,
  });
  const tokenExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  await admin.from('connectors').update({
    access_token: refreshed.access_token,
    token_expires_at: tokenExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', connector.id);
  return refreshed.access_token;
}

export async function runTool(block, user) {
  const id = block.id;
  const name = block.name;
  const input = block.input || {};
  try {
    if (name === 'search_gmail' && user) {
      const token = await getValidToken(user.id, 'gmail');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Gmail is not connected.', is_error: true };
      const results = await searchGmail(token, input.query || 'in:inbox newer_than:14d', Math.min(15, Math.max(1, Number(input.max_results) || 10)));
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ count: results.length, messages: results }) };
    }
    if (name === 'send_email' && user) {
      const token = await getValidToken(user.id, 'gmail');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Gmail is not connected.', is_error: true };
      const result = await sendGmail(token, { to: String(input.to || ''), subject: String(input.subject || ''), body: String(input.body || ''), cc: input.cc ? String(input.cc) : undefined, bcc: input.bcc ? String(input.bcc) : undefined });
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ sent: true, ...result }) };
    }
    if (name === 'create_email_draft' && user) {
      const token = await getValidToken(user.id, 'gmail');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Gmail is not connected.', is_error: true };
      const result = await createGmailDraft(token, { to: String(input.to || ''), subject: String(input.subject || ''), body: String(input.body || ''), cc: input.cc ? String(input.cc) : undefined, bcc: input.bcc ? String(input.bcc) : undefined });
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ drafted: true, ...result }) };
    }
    if (name === 'search_drive' && user) {
      const token = (await getValidToken(user.id, 'google_drive')) || (await getValidToken(user.id, 'google_docs'));
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Google Drive is not connected.', is_error: true };
      const results = await searchDrive(token, input.query || '', Math.min(15, Math.max(1, Number(input.max_results) || 10)));
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ count: results.length, files: results }) };
    }
    if (name === 'read_google_doc' && user) {
      const token = (await getValidToken(user.id, 'google_docs')) || (await getValidToken(user.id, 'google_drive'));
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Google Docs is not connected.', is_error: true };
      const doc = await readGoogleDoc(token, String(input.document_id || ''));
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(doc) };
    }
    if (name === 'search_sheets' && user) {
      const token = await getValidToken(user.id, 'google_sheets');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Google Sheets is not connected.', is_error: true };
      const results = await searchSheets(token, input.query || '', Math.min(15, Math.max(1, Number(input.max_results) || 8)));
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ count: results.length, spreadsheets: results }) };
    }
    if (name === 'read_sheet' && user) {
      const token = await getValidToken(user.id, 'google_sheets');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Google Sheets is not connected.', is_error: true };
      const data = await readSheetRange(token, String(input.spreadsheet_id || ''), input.range || 'A1:Z30');
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(data) };
    }
    if (name === 'list_calendar_events' && user) {
      const token = await getValidToken(user.id, 'google_calendar');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Google Calendar is not connected.', is_error: true };
      const days = Math.min(30, Math.max(1, Number(input.days_ahead) || 7));
      const max = Math.min(25, Math.max(1, Number(input.max_results) || 15));
      const events = await listCalendarEvents(token, {
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + days * 86400000).toISOString(),
        maxResults: max,
        query: input.query || undefined,
      });
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ count: events.length, days_ahead: days, events }) };
    }
    if (name === 'search_outlook' && user) {
      const token = await getValidMicrosoftToken(user.id, 'outlook');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Outlook is not connected.', is_error: true };
      const results = await searchOutlook(token, input.query || '', Math.min(15, Math.max(1, Number(input.max_results) || 10)));
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ count: results.length, messages: results }) };
    }
    if (name === 'search_excel' && user) {
      const token = await getValidMicrosoftToken(user.id, 'excel');
      if (!token) return { type: 'tool_result', tool_use_id: id, content: 'Excel / OneDrive is not connected.', is_error: true };
      const results = await searchExcelFiles(token, input.query || '', Math.min(15, Math.max(1, Number(input.max_results) || 10)));
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify({ count: results.length, files: results }) };
    }
    if (name === 'save_memory' && user) {
      const fact = String(input.fact || '').trim();
      if (!fact) return { type: 'tool_result', tool_use_id: id, content: 'Empty fact; nothing saved.', is_error: true };
      const admin = getAdminClient();
      await admin.from('user_memory').insert({ user_id: user.id, fact, category: input.category || 'general', source: 'chat' });
      return { type: 'tool_result', tool_use_id: id, content: `Saved memory: ${fact}` };
    }
    return { type: 'tool_result', tool_use_id: id, content: `Unknown tool: ${name}`, is_error: true };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: id, content: `Tool error: ${e.message}`, is_error: true };
  }
}

export async function loadConnectorsAndTools(user) {
  const connected = { gmail: false, drive: false, docs: false, sheets: false, calendar: false, outlook: false, excel: false };
  const tools = [SAVE_MEMORY_TOOL];
  if (!user) return { connected, tools };
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
    if (!connected.drive) { connected.drive = true; tools.push(DRIVE_TOOL); }
  }
  if (await getValidToken(user.id, 'google_sheets')) {
    connected.sheets = true;
    tools.push(SHEETS_LIST_TOOL, SHEETS_READ_TOOL);
  }
  if (await getValidToken(user.id, 'google_calendar')) {
    connected.calendar = true;
    tools.push(CALENDAR_TOOL);
  }
  if (await getValidMicrosoftToken(user.id, 'outlook')) {
    connected.outlook = true;
    tools.push(OUTLOOK_TOOL);
  }
  if (await getValidMicrosoftToken(user.id, 'excel')) {
    connected.excel = true;
    tools.push(EXCEL_TOOL);
  }
  return { connected, tools };
}
