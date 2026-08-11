/** Web search for Claude tool use */
const MAX_RESULTS = 8;

async function searchTavily(query, maxResults) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Tavily error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const results = (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || r.snippet || '',
  }));
  return {
    provider: 'tavily',
    answer: data.answer || null,
    results,
  };
}

async function searchSerper(query, maxResults) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': key,
    },
    body: JSON.stringify({ q: query, num: maxResults }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Serper error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const organic = data.organic || [];
  const results = organic.slice(0, maxResults).map((r) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
  }));
  return {
    provider: 'serper',
    answer: data.answerBox?.answer || data.answerBox?.snippet || null,
    results,
  };
}

async function searchBrave(query, maxResults) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': key,
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Brave error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const web = data.web?.results || [];
  const results = web.slice(0, maxResults).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }));
  return { provider: 'brave', answer: null, results };
}

/** Free fallback — DuckDuckGo HTML (no API key) */
async function searchDuckDuckGo(query, maxResults) {
  const url = new URL('https://html.duckduckgo.com/html/');
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; QuantumyBot/1.0)',
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo error ${res.status}`);
  }
  const html = await res.text();
  const results = [];
  const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  const links = [];
  let m;
  while ((m = linkRe.exec(html)) !== null && links.length < maxResults * 2) {
    let href = m[1];
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) {
      try { href = decodeURIComponent(uddg[1]); } catch { /* keep */ }
    }
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (title && href.startsWith('http')) links.push({ title, url: href });
  }
  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null && snippets.length < maxResults * 2) {
    const raw = (m[1] || m[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (raw) snippets.push(raw);
  }
  for (let i = 0; i < Math.min(maxResults, links.length); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    });
  }
  let answer = null;
  try {
    const ia = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'User-Agent': 'QuantumyBot/1.0' } },
    );
    if (ia.ok) {
      const data = await ia.json();
      answer = data.AbstractText || data.Answer || null;
      if (!results.length && Array.isArray(data.RelatedTopics)) {
        for (const t of data.RelatedTopics) {
          if (results.length >= maxResults) break;
          if (t.Text && t.FirstURL) {
            results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
          }
        }
      }
    }
  } catch { /* ignore */ }

  return { provider: 'duckduckgo', answer, results };
}

/**
 * Run web search. Prefers paid APIs when configured; falls back to DuckDuckGo.
 * @param {string} query
 * @param {number} [maxResults]
 */
export async function runWebSearch(query, maxResults = 5) {
  const q = String(query || '').trim();
  if (!q) return { provider: 'none', answer: null, results: [], error: 'Empty query' };
  const n = Math.min(MAX_RESULTS, Math.max(1, Number(maxResults) || 5));

  const providers = [searchTavily, searchSerper, searchBrave, searchDuckDuckGo];
  let lastErr = null;
  for (const fn of providers) {
    try {
      const out = await fn(q, n);
      if (out === null) continue;
      if (out.results?.length || out.answer) return out;
      if (fn !== searchDuckDuckGo) continue;
      return out;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  return {
    provider: 'none',
    answer: null,
    results: [],
    error: lastErr?.message || 'All search providers failed',
  };
}
