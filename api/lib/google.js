/** Shared Google OAuth + token helpers for serverless functions */

export const PROVIDER_SCOPES = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  google_drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  google_docs: [
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  google_sheets: [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  google_calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
};

export function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  };
}

export function buildAuthUrl({ clientId, redirectUri, scopes, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token exchange failed');
  return data;
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token refresh failed');
  return data;
}

export async function getGoogleEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

export async function searchGmail(accessToken, query, maxResults = 10) {
  const q = encodeURIComponent(query || 'in:inbox');
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Gmail search failed: ${listRes.status} ${t}`);
  }
  const list = await listRes.json();
  const messages = list.messages || [];
  const out = [];
  for (const m of messages.slice(0, maxResults)) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!detail.ok) continue;
    const msg = await detail.json();
    const headers = msg.payload?.headers || [];
    const getH = (n) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
    out.push({
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet || '',
      subject: getH('Subject'),
      from: getH('From'),
      date: getH('Date'),
      body: extractBody(msg.payload),
    });
  }
  return out;
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeB64(payload.body.data);
  const parts = payload.parts || [];
  for (const p of parts) {
    if (p.mimeType === 'text/plain' && p.body?.data) return decodeB64(p.body.data);
  }
  for (const p of parts) {
    if (p.mimeType === 'text/html' && p.body?.data) {
      return decodeB64(p.body.data).replace(/<[^>]+>/g, ' ');
    }
    if (p.parts) {
      const inner = extractBody(p);
      if (inner) return inner;
    }
  }
  return '';
}

function decodeB64(data) {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function encodeRawMessage({ to, subject, body, cc, bcc, from }) {
  const headers = [
    from ? `From: ${from}` : null,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ].filter(Boolean);
  const raw = `${headers.join('\r\n')}\r\n\r\n${body || ''}`;
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendGmail(accessToken, { to, subject, body, cc, bcc }) {
  if (!to || !subject) throw new Error('to and subject are required');
  const raw = encodeRawMessage({ to, subject, body, cc, bcc });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { id: data.id, threadId: data.threadId, labelIds: data.labelIds || [] };
}

export async function createGmailDraft(accessToken, { to, subject, body, cc, bcc }) {
  if (!to || !subject) throw new Error('to and subject are required');
  const raw = encodeRawMessage({ to, subject, body, cc, bcc });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) throw new Error(`Gmail draft failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { id: data.id, messageId: data.message?.id };
}

export async function searchDrive(accessToken, query, maxResults = 10) {
  const q = encodeURIComponent(query || "modifiedTime > '2020-01-01T00:00:00'");
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${Math.min(20, maxResults)}&fields=${fields}&orderBy=modifiedTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.files || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, link: f.webViewLink }));
}

export async function readGoogleDoc(accessToken, documentId) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Docs read failed: ${res.status} ${await res.text()}`);
  const doc = await res.json();
  const chunks = [];
  const walk = (content) => {
    if (!content) return;
    for (const el of content) {
      if (el.paragraph?.elements) {
        for (const e of el.paragraph.elements) {
          if (e.textRun?.content) chunks.push(e.textRun.content);
        }
      }
      if (el.table?.tableRows) {
        for (const row of el.table.tableRows) {
          for (const cell of row.tableCells || []) walk(cell.content);
        }
      }
    }
  };
  walk(doc.body?.content);
  return { title: doc.title || '', documentId: doc.documentId, text: chunks.join('').slice(0, 12000) };
}

export async function searchSheets(accessToken, query, maxResults = 8) {
  const qParts = ["mimeType='application/vnd.google-apps.spreadsheet'", 'trashed=false'];
  if (query) qParts.push(`name contains '${String(query).replace(/'/g, "\\'")}'`);
  const q = encodeURIComponent(qParts.join(' and '));
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${Math.min(15, maxResults)}&fields=${fields}&orderBy=modifiedTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.files || []).map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, link: f.webViewLink }));
}

export async function readSheetRange(accessToken, spreadsheetId, range = 'A1:Z30') {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { spreadsheetId, range: data.range || range, values: (data.values || []).slice(0, 40) };
}

export async function listCalendarEvents(accessToken, { timeMin, timeMax, maxResults = 15, query } = {}) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(Math.max(maxResults || 15, 1), 25)),
  });
  if (timeMin) params.set('timeMin', timeMin);
  else params.set('timeMin', new Date().toISOString());
  if (timeMax) params.set('timeMax', timeMax);
  if (query) params.set('q', query);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.items || []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || '(No title)',
    description: (ev.description || '').slice(0, 400),
    location: ev.location || '',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    htmlLink: ev.htmlLink || '',
    status: ev.status || '',
  }));
}
