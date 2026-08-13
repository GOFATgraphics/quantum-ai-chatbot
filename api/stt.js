/**
 * ElevenLabs Speech-to-Text (Scribe) proxy
 * POST multipart/form-data with field "file" (audio)
 * or JSON { audioBase64, mimeType, language }
 * Returns { text, language_code? }
 */
import { getUserFromAuthHeader } from './lib/supabaseAdmin.js';

export const config = {
  api: {
    bodyParser: false, // we parse multipart / raw ourselves when needed
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUserFromAuthHeader(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing ELEVENLABS_API_KEY',
      hint: 'Add ELEVENLABS_API_KEY in Vercel env vars and redeploy',
    });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    let fileBlob;
    let language = 'en';

    if (contentType.includes('application/json')) {
      const raw = await readRawBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const b64 = body?.audioBase64 || body?.audio;
      if (!b64) return res.status(400).json({ error: 'audioBase64 is required' });
      const mime = body?.mimeType || 'audio/webm';
      const buf = Buffer.from(String(b64).replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (buf.length < 100) return res.status(400).json({ error: 'Audio too short' });
      if (buf.length > 25 * 1024 * 1024) return res.status(400).json({ error: 'Audio too large (max 25MB)' });
      fileBlob = new Blob([buf], { type: mime });
      language = (body?.language || 'en').toLowerCase();
    } else if (contentType.includes('multipart/form-data')) {
      // Vercel/Node may still parse; fall back to raw + manual boundary is heavy.
      // Prefer JSON base64 from the client for reliability on serverless.
      return res.status(400).json({
        error: 'Send JSON with audioBase64 instead of multipart on this endpoint',
      });
    } else {
      // Treat body as raw audio if Content-Type is audio/*
      const raw = await readRawBody(req);
      if (!raw?.length) return res.status(400).json({ error: 'Empty body' });
      const mime = contentType.startsWith('audio/') ? contentType : 'audio/webm';
      fileBlob = new Blob([raw], { type: mime });
      language = (req.headers['x-language'] || 'en').toLowerCase();
    }

    const isHausa = language === 'ha' || language === 'hau' || language === 'hausa';
    const languageCode = isHausa ? 'hau' : 'eng';

    const form = new FormData();
    form.append('file', fileBlob, 'recording.webm');
    form.append('model_id', 'scribe_v2');
    form.append('language_code', languageCode);

    const elRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: form,
    });

    if (!elRes.ok) {
      const errText = await elRes.text().catch(() => '');
      console.error('ElevenLabs STT error', elRes.status, errText);
      return res.status(502).json({
        error: 'ElevenLabs STT failed',
        status: elRes.status,
        details: errText.slice(0, 500),
      });
    }

    const data = await elRes.json();
    const text = (data?.text || '').trim();
    return res.status(200).json({
      text,
      language_code: data?.language_code || languageCode,
      words: data?.words || undefined,
    });
  } catch (err) {
    console.error('STT handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message || String(err) });
  }
}
