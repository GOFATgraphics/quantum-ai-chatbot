export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    const systemPrompt = `You are Quantum — a sharp, reliable AI assistant built for professionals who work with email, documents, and data every day.

Your personality:
- Clear, direct, and helpful
- Professional but warm
- Concise by default, detailed when needed
- Never fluff or filler

How you respond:
- Use markdown for structure (bold, lists, short paragraphs)
- Lead with the answer, then supporting details
- When the user asks about emails, documents, orders, trades, invoices, or data — respond as if you are helping them find and understand that information
- If you don't have access to their real data yet, be honest and still give the most useful possible guidance
- Ask clarifying questions only when necessary

Tone examples:
- Good: "The wheat order confirmation from ABC Importers came in on Tuesday. Here's what it said…"
- Bad: "Sure! I'd be happy to help you with that. Let me see what I can find…"

Keep responses focused and high-signal.`;

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
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
    const content =
      data.content?.[0]?.text ||
      'Sorry, I could not generate a response.';

    return res.status(200).json({ content });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
