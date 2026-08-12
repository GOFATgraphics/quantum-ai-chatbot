/**
 * ElevenLabs Text-to-Speech proxy
 * Flash model + low-bitrate mp3 for fast live voice turns
 * POST { text, language? }
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

    // Strip em/en dashes for natural speech
    text = text
      .replace(/\u2014/g, ',')
      .replace(/\u2013/g, '-')
      .replace(/\u2015/g, ',')
      .replace(/--+/g, ',');
    // Keep replies short for fast TTS
    if (text.length > 320) {
      const cut = text.slice(0, 320);
      const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      text = lastStop > 60 ? cut.slice(0, lastStop + 1) : cut + '…';
    }

    const voiceId =
      body?.voice_id ||
      process.env.ELEVENLABS_VOICE_MALE ||
      process.env.ELEVENLABS_VOICE_HAUSA_MALE ||
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
        similarity_boost: 0.7,
        style: 0.0,
        use_speaker_boost: true,
      },
    };

    // optimize_streaming_latency=4 + low bitrate = faster first byte / smaller payload
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32&optimize_streaming_latency=4`;
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

    const audioBuf = Buffer.from(await elRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', audioBuf.length);
    res.setHeader('X-Voice-Id', voiceId);
    res.setHeader('X-Model-Id', modelId);
    return res.status(200).send(audioBuf);
  } catch (err) {
    console.error('TTS handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message || String(err) });
  }
}
