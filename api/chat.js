export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing ANTHROPIC_API_KEY',
      hint: 'Add it in Vercel → Settings → Environment Variables, then redeploy',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = body?.messages;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const systemPrompt = `You are Quantum — a sharp, reliable AI assistant built for professionals who work with email, documents, and data every day.

Be clear, direct, and helpful. Use markdown for structure. Lead with the answer. Keep responses focused and high-signal.`;

    const anthropicMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content),
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic error:', response.status, errorText);
      // Always return 502 for upstream errors so client doesn't confuse with route 404
      return res.status(502).json({
        error: 'Anthropic API error',
        status: response.status,
        details: errorText,
      });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || 'Sorry, I could not generate a response.';

    return res.status(200).json({ content });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || String(err),
    });
  }
}
