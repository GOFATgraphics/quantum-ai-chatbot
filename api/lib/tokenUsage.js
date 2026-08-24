/**
 * Token accounting.
 *
 * Anthropic reports usage on every response; nothing here estimates what was
 * billed. A meter collects the usage from each round of a turn, and one row is
 * written when the turn ends — so cost is attributable per user, per
 * conversation and per endpoint without adding a write per API call.
 *
 * Recording is strictly best-effort: a turn must never fail because accounting
 * failed, so every path here swallows its own errors.
 */
import { getAdminClient } from './supabaseAdmin.js';

/**
 * List prices in USD per million tokens.
 *
 * Cache writes cost 1.25x fresh input, cache reads 0.1x — that ratio is why
 * the dashboard reports them separately rather than lumping them into "input".
 * Promotional rates are deliberately not modelled: figures are labelled as
 * list-price estimates, and this is the single place to change if that shifts.
 */
const PRICING = {
  'claude-sonnet-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-opus-5': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};
const DEFAULT_PRICING = PRICING['claude-sonnet-5'];

export function pricingFor(model) {
  if (!model) return DEFAULT_PRICING;
  if (PRICING[model]) return PRICING[model];
  const hit = Object.keys(PRICING).find((k) => String(model).startsWith(k));
  return hit ? PRICING[hit] : DEFAULT_PRICING;
}

/** USD for one usage row, at list price. */
export function estimateCostUsd(row) {
  const p = pricingFor(row?.model);
  const per = (tokens, rate) => ((Number(tokens) || 0) / 1_000_000) * rate;
  return (
    per(row?.input_tokens, p.input) +
    per(row?.output_tokens, p.output) +
    per(row?.cache_creation_input_tokens, p.cacheWrite) +
    per(row?.cache_read_input_tokens, p.cacheRead)
  );
}

/**
 * One-shot recorder for the single-call endpoints (titles, suggestions), which
 * have no tool loop and therefore nothing to accumulate.
 */
export async function recordUsage({ userId, endpoint, model, usage }) {
  const meter = createUsageMeter({ userId, endpoint, model });
  meter.addRound();
  meter.addUsage(usage);
  await meter.flush();
}

/** Rough token count for prompt text. Only used for the context split, which is rescaled to real totals before it is stored. */
const CHARS_PER_TOKEN = 4;

const COMPONENTS = ['system_prompt', 'user_context', 'tools', 'history', 'tool_results', 'assistant'];

/**
 * Turn the per-component character counts into a token split that adds up to
 * the real peak input the API reported. The shape comes from measurement, the
 * magnitude from billing — so the bar is honest about total size even though
 * the slices are approximations.
 */
export function scaleComposition(chars, peakTokens) {
  const totalChars = COMPONENTS.reduce((sum, k) => sum + (Number(chars?.[k]) || 0), 0);
  if (totalChars <= 0) return null;
  const target = peakTokens > 0 ? peakTokens : Math.round(totalChars / CHARS_PER_TOKEN);
  const out = {};
  let assigned = 0;
  let largest = COMPONENTS[0];
  for (const k of COMPONENTS) {
    out[k] = Math.round(target * ((Number(chars?.[k]) || 0) / totalChars));
    assigned += out[k];
    if (out[k] > out[largest]) largest = k;
  }
  // Rounding drift goes to the biggest slice, not the last one — a component
  // that contributed nothing (no tools ran, no assistant turns yet) must stay
  // at zero rather than absorb a few stray tokens.
  out[largest] = Math.max(0, out[largest] + (target - assigned));
  return out;
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string|null} [opts.conversationId]
 * @param {string} [opts.endpoint] 'chat' | 'title' | 'suggestions'
 * @param {string} [opts.model]
 * @param {number} [opts.contextWindow]
 */
export function createUsageMeter({ userId, conversationId = null, endpoint = 'chat', model = null, contextWindow = 200_000 }) {
  const startedAt = Date.now();
  const totals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let rounds = 0;
  let toolCalls = 0;
  let peak = 0;
  let stopReason = null;
  let composition = null;
  let flushed = false;

  /** Fold one response's usage in. Safe to call with a partial or missing object. */
  const addUsage = (usage) => {
    if (!usage) return;
    const input = Number(usage.input_tokens) || 0;
    const cacheRead = Number(usage.cache_read_input_tokens) || 0;
    const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
    totals.input_tokens += input;
    totals.cache_read_input_tokens += cacheRead;
    totals.cache_creation_input_tokens += cacheWrite;
    totals.output_tokens += Number(usage.output_tokens) || 0;
    // Every round resends the whole prompt, so the sum above overstates how
    // full the window ever got. The largest single request is the real answer.
    peak = Math.max(peak, input + cacheRead + cacheWrite);
  };

  return {
    addUsage,
    addRound: () => { rounds += 1; },
    addToolCalls: (n) => { toolCalls += Number(n) || 0; },
    setStopReason: (r) => { if (r) stopReason = r; },
    /** Character counts per prompt component; converted to tokens at flush. */
    setComposition: (chars) => { composition = chars; },
    get totals() { return { ...totals }; },

    /** Write the turn's row. Never throws, never runs twice. */
    async flush() {
      if (flushed) return;
      flushed = true;
      if (!userId) return;
      const spent =
        totals.input_tokens + totals.output_tokens +
        totals.cache_read_input_tokens + totals.cache_creation_input_tokens;
      if (spent === 0) return;
      try {
        const admin = getAdminClient();
        const { error } = await admin.from('token_usage').insert({
          user_id: userId,
          conversation_id: conversationId || null,
          endpoint,
          model,
          ...totals,
          rounds: Math.max(1, rounds),
          tool_calls: toolCalls,
          duration_ms: Date.now() - startedAt,
          stop_reason: stopReason,
          peak_context_tokens: peak,
          context_window: contextWindow,
          context_breakdown: scaleComposition(composition, peak),
        });
        if (error) console.warn('token_usage insert failed:', error.message);
      } catch (e) {
        console.warn('token_usage insert threw:', e?.message || e);
      }
    },
  };
}
