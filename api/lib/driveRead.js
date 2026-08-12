/** Read text files and Workspace exports from Google Drive */

export async function readDriveFile(accessToken, fileId) {
  if (!fileId) throw new Error('fileId is required');
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
  const MAX = 12000;

  if (mime === 'application/vnd.google-apps.document') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Docs export failed: ${res.status} ${await res.text()}`);
    const text = (await res.text()).slice(0, MAX);
    return { id: meta.id, name, mimeType: mime, link, text };
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent('text/csv')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Sheets export failed: ${res.status} ${await res.text()}`);
    const text = (await res.text()).slice(0, MAX);
    return { id: meta.id, name, mimeType: mime, link, text, format: 'csv' };
  }
  if (mime === 'application/vnd.google-apps.presentation') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Slides export failed: ${res.status} ${await res.text()}`);
    const text = (await res.text()).slice(0, MAX);
    return { id: meta.id, name, mimeType: mime, link, text };
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
      id: meta.id,
      name,
      mimeType: mime,
      link,
      text: null,
      error: `Cannot read binary type "${mime}". Supported: .txt, .md, .csv, .json, and Google Docs/Sheets/Slides.`,
    };
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
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
    return {
      id: meta.id,
      name,
      mimeType: mime,
      link,
      text: null,
      error: 'File looks binary; cannot extract text.',
    };
  }
  let text = buf.toString('utf8');
  const truncated = text.length > MAX;
  text = text.slice(0, MAX);
  return { id: meta.id, name, mimeType: mime, link, text, truncated, size: meta.size };
}
