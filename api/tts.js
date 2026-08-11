/**
 * ElevenLabs Text-to-Speech proxy
 * POST { text, language? }
 * Always uses the configured man voice (Hausa man by default).
 * Returns audio/mpeg stream
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing ELEVENLABS_API_KEY',
      hint: 'Add ELEVENLABS_API_KEY in Vercel env vars and redeploy',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const text = (body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 4000) return res.status(400).json({ error: 'text too long (max 4000 chars)' });

    // Single man voice for all TTS (custom Hausa man)
    const voiceId =
      body?.voice_id ||
      process.env.ELEVENLABS_VOICE_MALE ||
      process.env.ELEVENLABS_VOICE_HAUSA_MALE ||
      'rPlZjuLXpONhaMouRFww';

    const lang = (body?.language || 'en').toLowerCase();
    const isHausa = lang === 'ha' || lang === 'hau' || lang === 'hausa';
    const modelId = isHausa
      ? 'eleven_v3'
      : (process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2');
    const languageCode = isHausa ? 'ha' : 'en';

    const payload = {
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true,
      },
    };
    if (modelId !== 'eleven_multilingual_v2') {
      payload.language_code = languageCode;
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
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
      console.error('ElevenLabs TTS error', elRes.status, errText);
      return res.status(502).json({
        error: 'ElevenLabs TTS failed',
        status: elRes.status,
        details: errText.slice(0, 500),
      });
    }

    const audioBuf = Buffer.from(await elRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', audioBuf.length);
    return res.status(200).send(audioBuf);
  } catch (err) {
    console.error('TTS handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message || String(err) });
  }
}
