/** Shared Google OAuth + token helpers for serverless functions */

export const PROVIDER_SCOPES = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  google_drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  google_docs: [
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  google_sheets: [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = (process.env.APP_URL || process.env.VERCEL_URL
    ? (process.env.APP_URL || `https://${process.env.VERCEL_URL}`)
    : '').replace(/\/$/, '');

  return { clientId, clientSecret, appUrl };
}

export function buildAuthUrl({ clientId, redirectUri, scopes, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
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
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!detailRes.ok) continue;
    const detail = await detailRes.json();
    const headers = detail.payload?.headers || [];
    const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    results.push({
      id: m.id,
      from: get('From'),
      subject: get('Subject'),
      date: get('Date'),
      snippet: detail.snippet || '',
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
  url.searchParams.set('pageSize', String(Math.min(20, Math.max(1, maxResults)));
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink,owners)');
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
    link: f.webViewLink || null,
  }));
}

/** Read plain text from a Google Doc. */
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
  const chunks = [];
  const body = doc.body?.content || [];
  for (const el of body) {
    const paras = el.paragraph?.elements || [];
    for (const p of paras) {
      if (p.textRun?.content) chunks.push(p.textRun.content);
    }
  }
  const text = chunks.join('').trim();
  return {
    id: documentId,
    title: doc.title || 'Untitled',
    text: text.slice(0, 12000),
    truncated: text.length > 12000,
  };
}

/** List recent spreadsheets via Drive, or read a sheet range. */
export async function searchSheets(accessToken, query, maxResults = 8) {
  const nameFilter = query?.trim()
    ? ` and name contains '${query.replace(/'/g, "\\'")}'`
    : '';
  const q = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false${nameFilter}`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(Math.min(15, Math.max(1, maxResults)));
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
    link: f.webViewLink || null,
  }));
}

export async function readSheetRange(accessToken, spreadsheetId, range = 'A1:Z30') {
  const encoded = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encoded}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
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
