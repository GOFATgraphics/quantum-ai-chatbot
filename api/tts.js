/**
 * ElevenLabs Text-to-Speech proxy
 * - Uses ELEVENLABS_VOICE_* env when set
 * - Flash model + low bitrate + streaming latency opt
 * - Optional body.stream pipes ElevenLabs stream for earlier first-byte
 * POST { text, language?, voice_id?, stream? }
 */
import { getUserFromAuthHeader } from './lib/supabaseAdmin.js';

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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let text = (body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });

    text = text
      .replace(/\u2014/g, ',')
      .replace(/\u2013/g, '-')
      .replace(/\u2015/g, ',')
      .replace(/--+/g, ',')
      .replace(/\s+/g, ' ')
      .trim();

    // Hard cap keeps latency bounded (client should chunk longer text)
    const maxLen = body?.chunk ? 450 : 900;
    if (text.length > maxLen) {
      const cut = text.slice(0, maxLen);
      const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf(', '));
      text = lastStop > 40 ? cut.slice(0, lastStop + 1) : cut;
    }

    const voiceId =
      body?.voice_id ||
      process.env.ELEVENLABS_VOICE_ID ||
      process.env.ELEVENLABS_VOICE_MALE ||
      process.env.ELEVENLABS_VOICE_HAUSA_MALE ||
      process.env.ELEVENLABS_VOICE ||
      'rPlZjuLXpONhaMouRFww';

    const lang = (body?.language || 'en').toLowerCase();
    const isHausa = lang === 'ha' || lang === 'hau' || lang === 'hausa';

    const modelId = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
    const languageCode = isHausa ? 'ha' : 'en';

    const payload = {
      text,
      model_id: modelId,
      language_code: languageCode,
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.72,
        style: 0.0,
        use_speaker_boost: true,
      },
    };

    const wantStream = body?.stream === true;
    const path = wantStream
      ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`
      : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const url = `${path}?output_format=mp3_22050_32&optimize_streaming_latency=4`;

    const elRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(payload),
    });

    if (!elRes.ok) {
      const errText = await elRes.text().catch(() => '');
      console.error('ElevenLabs TTS error', elRes.status, errText, { voiceId, modelId });
      return res.status(502).json({
        error: 'ElevenLabs TTS failed',
        status: elRes.status,
        details: errText.slice(0, 500),
        voiceId,
        modelId,
      });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Voice-Id', voiceId);
    res.setHeader('X-Model-Id', modelId);

    if (wantStream && elRes.body && typeof elRes.body.getReader === 'function') {
      // Pipe stream through for lower time-to-first-byte
      const reader = elRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
        return res.end();
      } catch (pipeErr) {
        console.error('TTS stream pipe error', pipeErr);
        return res.end();
      }
    }

    const audioBuf = Buffer.from(await elRes.arrayBuffer());
    res.setHeader('Content-Length', audioBuf.length);
    return res.status(200).send(audioBuf);
  } catch (err) {
    console.error('TTS handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message || String(err) });
  }
}
