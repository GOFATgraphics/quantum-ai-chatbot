/**
 * ElevenLabs Text-to-Speech proxy (low-latency)
 * POST { text, language? }
 * Returns audio/mpeg
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
    let text = (body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });

    // Keep voice replies short for speed
    if (text.length > 800) {
      const cut = text.slice(0, 800);
      const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      text = lastStop > 120 ? cut.slice(0, lastStop + 1) : cut + '…';
    }

    const voiceId =
      body?.voice_id ||
      process.env.ELEVENLABS_VOICE_MALE ||
      process.env.ELEVENLABS_VOICE_HAUSA_MALE ||
      'rPlZjuLXpONhaMouRFww';

    const lang = (body?.language || 'en').toLowerCase();
    const isHausa = lang === 'ha' || lang === 'hau' || lang === 'hausa';

    // Prefer Flash for low latency. Hausa → eleven_v3 (best HA support).
    const modelId = isHausa
      ? (process.env.ELEVENLABS_TTS_MODEL_HA || 'eleven_v3')
      : (process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5');

    const languageCode = isHausa ? 'ha' : 'en';

    const payload = {
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.7,
        style: 0,
        use_speaker_boost: true,
      },
    };
    // language_code on flash / v3
    if (modelId !== 'eleven_multilingual_v2') {
      payload.language_code = languageCode;
    }

    // Smaller/faster audio
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`;
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
