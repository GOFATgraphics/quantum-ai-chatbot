import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import { loadConnectorsAndTools, runTool } from './lib/claudeTools.js';
import { allowRequest } from './lib/rateLimit.js';

export const config = { maxDuration: 300 };

const MODEL = 'claude-sonnet-4-20250514';
const CACHE_CONTROL = { type: 'ephemeral' };

function withCacheBreakpoint(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const out = messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  if (last && typeof last.content === 'string') {
    last.content = last.content;
  }
  return out;
}

function extractText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';
  return contentBlocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function toAnthropicContent(content) {
  const str = String(content || '');
  const imgRe = /!\[([^\]]*)\]\((data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+))\)/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = imgRe.exec(str)) !== null) {
    if (m.index > last) {
      const t = str.slice(last, m.index).trim();
      if (t) parts.push({ type: 'text', text: t });
    }
    let mediaType = m[3];
    if (!mediaType.startsWith('image/')) mediaType = 'image/' + mediaType;
    if (mediaType.includes('jpg')) mediaType = 'image/jpeg';
    else if (mediaType.includes('png')) mediaType = 'image/png';
    else if (mediaType.includes('gif')) mediaType = 'image/gif';
    else if (mediaType.includes('webp')) mediaType = 'image/webp';
    else if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) mediaType = 'image/jpeg';
    parts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: m[4] } });
    last = m.index + m[0].length;
  }
  const rest = str.slice(last).trim();
  if (rest) parts.push({ type: 'text', text: rest });
  if (parts.length === 0) return str || ' ';
  return parts;
}

SEE_ARTIFACT_RESTORE_FAILED
