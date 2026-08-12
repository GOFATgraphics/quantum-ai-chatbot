/** Read text files, Workspace exports, and list folders on Google Drive */

const DEFAULT_MAX = 80000; // raised from 12k — large trade dumps
const HARD_MAX = 150000;   // absolute ceiling per call

function clampInt(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

function sliceText(full, offset, maxChars) {
  const total = full.length;
  const start = clampInt(offset, 0, total, 0);
  const limit = clampInt(maxChars, 1, HARD_MAX, DEFAULT_MAX);
  const end = Math.min(total, start + limit);
  const text = full.slice(start, end);
  return {
    text,
    offset: start,
    length: text.length,
    total_length: total,
    truncated: end < total,
    next_offset: end < total ? end : null,
  };
}

/**
 * Read a Drive file's text content.
 * Supports offset/max_chars for paging through large .txt dumps.
 */
export async function readDriveFile(accessToken, fileId, opts = {}) {
  if (!fileId) throw new Error('fileId is required');
  const offset = clampInt(opts.offset, 0, 50_000_000, 0);
  const maxChars = clampInt(opts.max_chars, 1, HARD_MAX, DEFAULT_MAX);

  const id = encodeURIComponent(String(fileId));
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) throw new Error(`Drive file meta failed: ${metaRes.status} ${await metaRes.text()}`);
  const meta = await metaRes.json();
  const mime = meta.mimeType || '';
  const name = meta.name || '';
  const link = meta.webViewLink || '';

  const base = { id: meta.id, name, mimeType: mime, link, size: meta.size };

  // Google Workspace → export then slice
  if (mime === 'application/vnd.google-apps.document') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Docs export failed: ${res.status} ${await res.text()}`);
    const full = await res.text();
    return { ...base, ...sliceText(full, offset, maxChars) };
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent('text/csv')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Sheets export failed: ${res.status} ${await res.text()}`);
    const full = await res.text();
    return { ...base, format: 'csv', ...sliceText(full, offset, maxChars) };
  }
  if (mime === 'application/vnd.google-apps.presentation') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Slides export failed: ${res.status} ${await res.text()}`);
    const full = await res.text();
    return { ...base, ...sliceText(full, offset, maxChars) };
  }

  const textLike =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/csv' ||
    mime === 'application/x-csv' ||
    /\.(txt|md|markdown|csv|tsv|json|xml|log|yml|yaml|js|ts|py|html|css|sql|sh|env|ini|cfg|conf)$/i.test(name);

  if (!textLike) {
    return {
      ...base,
      text: null,
      error: `Cannot read binary type "${mime}". Supported: .txt, .md, .csv, .json, and Google Docs/Sheets/Slides.`,
    };
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    { headers }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sample = buf.slice(0, 512);
  let nonText = 0;
  for (const b of sample) {
    if (b === 0) nonText += 2;
    else if (b < 7 || (b > 14 && b < 32 && b !== 9 && b !== 10 && b !== 13)) nonText += 1;
  }
  if (nonText > 50) {
    return { ...base, text: null, error: 'File looks binary; cannot extract text.' };
  }
  const full = buf.toString('utf8');
  return { ...base, ...sliceText(full, offset, maxChars) };
}

/**
 * List children of a Drive folder by folder id.
 */
export async function listDriveFolder(accessToken, folderId, opts = {}) {
  if (!folderId) throw new Error('folderId is required');
  const pageSize = clampInt(opts.max_results, 1, 100, 50);
  const q = `'${String(folderId).replace(/'/g, "\\'")}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)',
    orderBy: 'folder,name',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    spaces: 'drive',
  });
  if (opts.page_token) params.set('pageToken', String(opts.page_token));

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive folder list failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const files = (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    size: f.size,
    link: f.webViewLink,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
  }));
  return {
    folder_id: folderId,
    count: files.length,
    next_page_token: data.nextPageToken || null,
    files,
  };
}

export const READ_DRIVE_FILE_TOOL = {
  name: 'read_drive_file',
  description:
    'Read text content of a Google Drive file by id (from search_drive or list_drive_folder). Works for .txt, .md, .csv, .json, and Google Docs/Sheets/Slides. For large files use offset + max_chars and follow next_offset until truncated is false. Not for PDF/images.',
  input_schema: {
    type: 'object',
    properties: {
      file_id: { type: 'string', description: 'Drive file id' },
      offset: {
        type: 'number',
        description: 'Character offset to start reading (default 0). Use next_offset from a previous read to continue.',
      },
      max_chars: {
        type: 'number',
        description: 'Max characters to return (default 80000, max 150000).',
      },
    },
    required: ['file_id'],
  },
};

export const LIST_DRIVE_FOLDER_TOOL = {
  name: 'list_drive_folder',
  description:
    'List files and subfolders inside a Google Drive folder by folder id. Prefer this over search when you already have the folder id. Returns id, name, mimeType, size, isFolder.',
  input_schema: {
    type: 'object',
    properties: {
      folder_id: { type: 'string', description: 'Drive folder id' },
      max_results: { type: 'number', description: '1-100, default 50' },
      page_token: { type: 'string', description: 'Pagination token from a previous list' },
    },
    required: ['folder_id'],
  },
};

export async function handleReadDriveFile(block, user, getToken) {
  const id = block.id;
  const input = block.input || {};
  const token = (await getToken(user.id, 'google_drive')) || (await getToken(user.id, 'google_docs'));
  if (!token) {
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: 'Google Drive is not connected.',
      is_error: true,
    };
  }
  try {
    const file = await readDriveFile(token, String(input.file_id || ''), {
      offset: input.offset,
      max_chars: input.max_chars,
    });
    if (file.error && !file.text) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: JSON.stringify(file),
        is_error: true,
      };
    }
    return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(file) };
  } catch (e) {
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: `Tool error: ${e.message}`,
      is_error: true,
    };
  }
}

export async function handleListDriveFolder(block, user, getToken) {
  const id = block.id;
  const input = block.input || {};
  const token = (await getToken(user.id, 'google_drive')) || (await getToken(user.id, 'google_docs'));
  if (!token) {
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: 'Google Drive is not connected.',
      is_error: true,
    };
  }
  try {
    const result = await listDriveFolder(token, String(input.folder_id || ''), {
      max_results: input.max_results,
      page_token: input.page_token,
    });
    return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(result) };
  } catch (e) {
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: `Tool error: ${e.message}`,
      is_error: true,
    };
  }
}
