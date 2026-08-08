export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Support both ANTHROPIC_API_KEY and the old XAI_API_KEY name
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing ANTHROPIC_API_KEY environment variable',
    });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Anthropic expects system message separately and only user/assistant in messages
    const systemPrompt =
      'You are Quantum, a premium, helpful, and concise AI assistant. Respond in a clear, professional yet friendly tone. Use markdown when helpful. Keep answers focused and high-quality.';

    // Convert our simple {role, content} array into Anthropic format
    const anthropicMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', // or claude-3-5-sonnet-20241022 / claude-3-haiku-20240307
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Failed to get response from AI provider',
        details: errorText,
      });
    }

    const data = await response.json();

    // Anthropic returns content as an array of blocks
    const content =
      data.content?.[0]?.text ||
      'Sorry, I could not generate a response.';

    return res.status(200).json({ content });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
