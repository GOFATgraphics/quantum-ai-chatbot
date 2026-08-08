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
  const data = await res.json();
  return data.email || null;
}

/** Decode Gmail body data (base64url) to UTF-8 text. */
function decodeBodyData(data) {
  if (!data) return '';
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/** Walk Gmail payload parts and extract plain-text (prefer) or HTML body. */
function extractBodyFromPayload(payload) {
  if (!payload) return '';

  const collect = (part, out) => {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    if (part.body?.data && (mime === 'text/plain' || mime === 'text/html' || !mime)) {
      out.push({ mime, text: decodeBodyData(part.body.data) });
    }
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) collect(p, out);
    }
  };

  const parts = [];
  collect(payload, parts);
  const plain = parts.find((p) => p.mime === 'text/plain' && p.text.trim());
  if (plain) return plain.text.trim();
  const html = parts.find((p) => p.mime === 'text/html' && p.text.trim());
  if (html) {
    return html.text
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  if (payload.body?.data) return decodeBodyData(payload.body.data).trim();
  return '';
}

export async function searchGmail(accessToken, query, maxResults = 8) {
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', query || 'in:inbox newer_than:14d');
  listUrl.searchParams.set('maxResults', String(maxResults));

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Gmail list failed: ${listRes.status} ${t}`);
  }
  const list = await listRes.json();
  const messages = list.messages || [];

  const results = [];
  for (const m of messages.slice(0, maxResults)) {
    const detailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!detailRes.ok) continue;
    const detail = await detailRes.json();
    const headers = detail.payload?.headers || [];
    const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    let body = extractBodyFromPayload(detail.payload);
    if (body.length > 6000) body = body.slice(0, 6000) + '\n\n[...truncated]';
    results.push({
      id: m.id,
      threadId: detail.threadId || m.threadId || null,
      from: get('From'),
      subject: get('Subject'),
      date: get('Date'),
      snippet: detail.snippet || '',
      body,
    });
  }
  return results;
}

/** Search Drive files (also finds Docs/Sheets by name). */
export async function searchDrive(accessToken, query, maxResults = 10) {
  const q = query?.trim()
    ? `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : 'trashed = false';
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(maxResults));
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive search failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    link: f.webViewLink,
  }));
}

export async function readGoogleDoc(accessToken, documentId) {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Docs read failed: ${res.status} ${t}`);
  }
  const doc = await res.json();
  const body = doc.body?.content || [];
  let text = '';
  for (const el of body) {
    if (el.paragraph?.elements) {
      for (const e of el.paragraph.elements) {
        if (e.textRun?.content) text += e.textRun.content;
      }
    }
  }
  return { title: doc.title || '', text: text.trim().slice(0, 12000) };
}

export async function searchSheets(accessToken, query, maxResults = 8) {
  const q = query?.trim()
    ? `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(maxResults));
  url.searchParams.set('fields', 'files(id,name,modifiedTime,webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets list failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    link: f.webViewLink,
  }));
}

export async function readSheetRange(accessToken, spreadsheetId, range = 'A1:Z30') {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets read failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return {
    spreadsheetId,
    range: data.range || range,
    values: (data.values || []).slice(0, 40),
  };
}

/** Build RFC 2822 raw message and base64url-encode for Gmail API. */
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
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Send an email via Gmail API (requires gmail.send). */
export async function sendGmail(accessToken, { to, subject, body, cc, bcc }) {
  if (!to || !subject) throw new Error('to and subject are required');
  const raw = encodeRawMessage({ to, subject, body, cc, bcc });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail send failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return { id: data.id, threadId: data.threadId, labelIds: data.labelIds || [] };
}

/** Create a Gmail draft (requires gmail.compose). */
export async function createGmailDraft(accessToken, { to, subject, body, cc, bcc }) {
  if (!to || !subject) throw new Error('to and subject are required');
  const raw = encodeRawMessage({ to, subject, body, cc, bcc });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail draft failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return { id: data.id, messageId: data.message?.id };
}
