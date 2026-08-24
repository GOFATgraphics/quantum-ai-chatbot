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
 * Read a PDF or Office file by having Drive convert it, rather than parsing it here.
 *
 * Google's own converter is what runs — the same one behind "Open with Google
 * Docs" — so scanned PDFs come back OCR'd and layout-heavy documents survive,
 * with no PDF library to ship into a serverless function.
 *
 * The copy is a real file in the user's Drive for as long as this takes, so it
 * is deleted in a finally: an interrupted read must not leave debris behind,
 * and a failed cleanup must not fail a read that already succeeded.
 */
/** fileId arrives already percent-encoded from readDriveFile. */
async function convertAndExtract(accessToken, fileId, name, spec) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  let tempId = null;
  try {
    const copyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true&fields=id` +
        // A language hint materially improves OCR accuracy; conversion still
        // runs without it, so this is a nudge rather than a requirement.
        (spec.ocr ? '&ocrLanguage=en' : ''),
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Quantumy temp - ${name}`.slice(0, 120), mimeType: spec.to }),
      },
    );
    if (!copyRes.ok) {
      const detail = (await copyRes.text()).slice(0, 200);
      // 403 here is nearly always scope, not permission on the file: converting
      // needs full Drive access, which the Docs-only connector does not grant.
      if (copyRes.status === 403) {
        return {
          error:
            'Could not convert this file for reading. This needs the Google Drive connector ' +
            `(full access), not just Docs. Detail: ${detail}`,
        };
      }
      return { error: `Could not convert "${name}" for reading (${copyRes.status}). ${detail}` };
    }
    tempId = (await copyRes.json()).id;

    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${tempId}/export?mimeType=${encodeURIComponent(spec.as)}`,
      { headers },
    );
    if (!exportRes.ok) {
      return { error: `Converted "${name}" but could not read it back (${exportRes.status}).` };
    }
    const text = await exportRes.text();
    if (!text.trim()) {
      return {
        error: spec.ocr
          ? `No readable text was found in "${name}". It may be a photo rather than a document, or ` +
            'too blurred or angled for OCR. Attaching it in chat lets the image itself be looked at.'
          : `"${name}" converted but contained no extractable text. If it is a scan, the pages may be ` +
            'too low-resolution for OCR. Attaching the file in chat reads it as images instead.',
      };
    }
    return { text };
  } catch (e) {
    return { error: `Could not read "${name}": ${e?.message || String(e)}` };
  } finally {
    if (tempId) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${tempId}?supportsAllDrives=true`, {
          method: 'DELETE',
          headers,
        });
      } catch (_) {
        // The read is what matters; a stray temp file is not worth failing over.
      }
    }
  }
}

/**
 * Read a Drive file's text content.
 * Supports offset/max_chars for paging through large files.
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

  // Formats Google can convert into a Workspace file, and what each becomes.
  // PDFs and Office documents hold most of the real work in a Drive, and until
  // now none of them could be read at all.
  const CONVERTIBLE = [
    { test: /^application\/pdf$/, ext: /\.pdf$/i, to: 'application/vnd.google-apps.document', as: 'text/plain' },
    {
      test: /^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|rtf|vnd\.oasis\.opendocument\.text)$/,
      ext: /\.(docx?|rtf|odt)$/i,
      to: 'application/vnd.google-apps.document',
      as: 'text/plain',
    },
    {
      test: /^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.oasis\.opendocument\.spreadsheet)$/,
      ext: /\.(xlsx?|xlsm|ods)$/i,
      to: 'application/vnd.google-apps.spreadsheet',
      as: 'text/csv',
    },
    {
      test: /^application\/(vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation|vnd\.oasis\.opendocument\.presentation)$/,
      ext: /\.(pptx?|odp)$/i,
      to: 'application/vnd.google-apps.presentation',
      as: 'text/plain',
    },
    {
      // A photographed bill of lading is a document, not a picture. Drive runs
      // OCR when converting an image to a Doc, which is the same engine that
      // handles scanned PDFs above.
      test: /^image\/(jpeg|png|gif|bmp|webp|tiff)$/,
      ext: /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i,
      to: 'application/vnd.google-apps.document',
      as: 'text/plain',
      ocr: true,
    },
  ];

  const convertible = CONVERTIBLE.find((c) => c.test.test(mime) || c.ext.test(name));
  if (convertible) {
    const extracted = await convertAndExtract(accessToken, id, name, convertible);
    if (extracted.error) return { ...base, text: null, error: extracted.error };
    return { ...base, converted: true, ...sliceText(extracted.text, offset, maxChars) };
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
      error:
        `Cannot read type "${mime}". Supported: PDF, Word/Excel/PowerPoint, scanned images, ` +
        '.txt, .md, .csv, .json, and Google Docs/Sheets/Slides. Audio files in Drive cannot be read ' +
        'yet - attaching one in chat transcribes it.',
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
    'Read the text of a Google Drive file by id (from search_drive or list_drive_folder). ' +
    'Works for PDFs, Word/Excel/PowerPoint files, scanned or photographed images, .txt/.md/.csv/.json, ' +
    'and Google Docs/Sheets/Slides. ' +
    'PDFs, Office files and images are converted by Drive on the way through, which OCRs scanned pages ' +
    'and photographed documents, ' +
    'so this is the right tool for a contract sitting in Drive - do not ask the user to convert or ' +
    're-upload it first. Converting needs the Google Drive connector rather than Docs alone. ' +
    'For large files use offset + max_chars and follow next_offset until truncated is false.',
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
