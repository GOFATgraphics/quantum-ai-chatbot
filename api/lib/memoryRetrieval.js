/**
 * Choosing which saved facts go into a request.
 *
 * Every saved fact used to be sent on every message. Measured over a week that
 * block averaged 26,771 tokens - a quarter of the whole prompt - and it sits
 * after the cache breakpoint by design, so it is billed fresh at full input
 * price on every single turn, including "thanks" and "what's 2+2". It also only
 * grows: the fix has to hold as the store goes from 45 facts to 450.
 *
 * So the block is now assembled per request rather than dumped. Two kinds of
 * fact are treated differently because they earn their place differently:
 *
 *   - Facts about how the user wants to be worked with (preference, behavior)
 *     apply to every reply regardless of topic. They are short and they are
 *     always included.
 *   - Facts about things - a project, a person, a system - only matter when the
 *     conversation is about that thing. Those are scored against what is
 *     actually being discussed and the best ones are kept until the budget runs
 *     out.
 *
 * Scoring is term overlap, deliberately. An embedding search would rank better
 * but costs a network call and real latency on the critical path of every
 * message, to pick between at most a few hundred short strings. When a fact is
 * about the Mercancia Add Note Handler, the words "mercancia", "note",
 * "handler" are in it; that is enough signal to rank on, and nothing is lost
 * outright because recall_memory can still reach the full store on demand.
 */

/** Roughly 4 characters per token; the budget is expressed in characters. */
export const MEMORY_CHAR_BUDGET = 12_000;

/** Categories that shape every answer, so they bypass scoring entirely. */
const ALWAYS_INCLUDE = new Set(['preference', 'behavior']);

/**
 * A cap on any single always-included fact. A 5,000-character "preference"
 * would otherwise walk straight past the budget on the strength of its
 * category alone.
 */
const ALWAYS_MAX_CHARS = 1_200;

/** Words that appear in every message and would flatten every score. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'you', 'your', 'are', 'was', 'were', 'has',
  'have', 'had', 'not', 'but', 'can', 'will', 'would', 'should', 'could', 'what', 'when', 'where',
  'which', 'who', 'how', 'why', 'all', 'any', 'its', 'his', 'her', 'their', 'our', 'out', 'get',
  'got', 'let', 'now', 'one', 'two', 'about', 'into', 'over', 'than', 'then', 'them', 'they',
  'there', 'here', 'been', 'being', 'just', 'like', 'make', 'made', 'want', 'need', 'please',
  'okay', 'yes', 'know', 'see', 'say', 'said', 'ask', 'asked', 'tell', 'told', 'use', 'used',
  'also', 'some', 'more', 'most', 'much', 'very', 'only', 'still', 'back', 'good', 'well',
]);

/** Lowercase alphanumeric terms of 3+ characters, deduplicated. */
export function terms(text) {
  const out = new Set();
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

/**
 * How well one fact matches what is being talked about.
 *
 * Rare terms are worth more than common ones: a fact and a message sharing
 * "mercancia" is a real signal, sharing "sheet" is not much of one. Document
 * frequency across the user's own facts is the cheapest available proxy for
 * that, and it needs no corpus beyond what is already in hand.
 */
export function scoreFact(factTerms, queryTerms, docFreq, totalFacts) {
  let score = 0;
  for (const t of queryTerms) {
    if (!factTerms.has(t)) continue;
    const df = docFreq.get(t) || 1;
    score += Math.log(1 + totalFacts / df);
  }
  // Without this a 3,000-character fact outranks a precise short one purely by
  // covering more words. Dividing by length outright over-punishes, so the
  // damping is gentle.
  return score / Math.sqrt(Math.max(1, factTerms.size));
}

/**
 * Pick the facts to send this turn.
 *
 * `query` should be what the conversation is currently about - the new message
 * plus a little of what came just before it, since "do that for the other one
 * too" carries no terms of its own.
 *
 * Never throws and never returns nothing useful: on any unexpected shape it
 * falls back to the most recent facts that fit, which is what the old
 * behaviour amounted to anyway.
 */
export function selectMemory(memory, query, { budget = MEMORY_CHAR_BUDGET } = {}) {
  const all = Array.isArray(memory) ? memory.filter((m) => m && typeof m.fact === 'string' && m.fact.trim()) : [];
  if (all.length === 0) return { selected: [], omitted: 0, total: 0 };

  const queryTerms = terms(query);

  // Document frequency over the user's own facts.
  const factTerms = all.map((m) => terms(m.fact));
  const docFreq = new Map();
  for (const set of factTerms) {
    for (const t of set) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  }

  const always = [];
  const scored = [];
  all.forEach((m, i) => {
    if (ALWAYS_INCLUDE.has(String(m.category || '').toLowerCase()) && m.fact.length <= ALWAYS_MAX_CHARS) {
      always.push(m);
    } else {
      scored.push({ fact: m, score: scoreFact(factTerms[i], queryTerms, docFreq, all.length), order: i });
    }
  });

  // Highest score first; ties go to the more recently updated fact, which is
  // the order the caller loaded them in.
  scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));

  const selected = [];
  let used = 0;
  for (const m of always) {
    selected.push(m);
    used += m.fact.length;
  }
  for (const { fact: m, score } of scored) {
    // A fact with no overlap at all is not "the next best thing", it is
    // unrelated. Padding the budget with unrelated facts is exactly the
    // behaviour being removed.
    if (score <= 0) break;
    if (used + m.fact.length > budget) continue;
    selected.push(m);
    used += m.fact.length;
  }

  // Deliberately no "nothing matched, so send the most recent instead"
  // fallback. A message with no terms to match on is a greeting or a trivial
  // question - "hi", "thanks", "what is 2+2" - and those are precisely the
  // messages that should carry the least. Backfilling them with recent facts
  // was measured sending 9 of 10 facts on "what is 2+2", which is the old
  // behaviour wearing a different hat. The preference facts above are enough
  // to answer in the right voice, the user's name is passed separately, and
  // recall_memory covers anything the next turn actually needs.
  return { selected, omitted: all.length - selected.length, total: all.length };
}

/**
 * The text of the conversation to match facts against.
 *
 * The newest user message carries most of the signal, but a reply like "yes do
 * that" carries none, so the turn before it is included at lower weight by
 * simply being shorter - the scorer is set-based, so a term counts once no
 * matter how often it appears.
 */
export function queryFromMessages(messages, { lookback = 3 } = {}) {
  if (!Array.isArray(messages)) return '';
  const parts = [];
  for (let i = messages.length - 1; i >= 0 && parts.length < lookback; i -= 1) {
    const m = messages[i];
    if (!m) continue;
    const c = m.content;
    if (typeof c === 'string') parts.push(c);
    else if (Array.isArray(c)) parts.push(c.filter((b) => b?.type === 'text').map((b) => b.text).join(' '));
  }
  // Long pasted documents would swamp the terms of the actual question.
  return parts.join('\n').slice(0, 4_000);
}
