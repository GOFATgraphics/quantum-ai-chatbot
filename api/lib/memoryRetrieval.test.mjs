/**
 * Tests for per-request memory selection.
 *
 * The fixture mirrors the shape of the real store rather than being invented:
 * mostly long project facts about one client, a couple of long work facts, one
 * short preference, one person fact. That shape is what makes the naive
 * "send everything" approach expensive, and it is also the shape that makes
 * relevance scoring hard - when most of the store is about one project, a
 * question about that project legitimately matches most of it, and the budget
 * rather than the scoring is what bounds the cost.
 *
 * Run: node api/lib/memoryRetrieval.test.mjs
 */
import assert from 'node:assert/strict';
import { selectMemory, queryFromMessages, terms, MEMORY_CHAR_BUDGET } from './memoryRetrieval.js';

const pad = (s, n) => s + ' ' + 'detail'.repeat(Math.max(0, Math.floor((n - s.length) / 7)));

const MEMORY = [
  { category: 'project', fact: pad('MERCANCIA ADD NOTE HANDLER: fixed and tested. Router filter bug in module 21 was self-comparing target_column. Column offset bug in the switch table. Apps Script appendNote writes an in-cell annotation.', 3342) },
  { category: 'work', fact: pad('MERCANCIA AI AGENT PARSING PROMPT: extract trade data from WhatsApp messages into flat JSON for the MASTER sheet. Fields include contract_no, seller_name, incoterm, demurrage.', 5330) },
  { category: 'project', fact: pad('Similar Trade workflow build in progress. WhatsApp Flow JSON updated with Similar_Trade_Screen. Trade Flow Handler still needs a router branch.', 1434) },
  { category: 'project', fact: pad('Quantumy auth model: per-user OAuth three-legged flow, no domain-wide delegation, no service account for Workspace data. Google enforces permissions live on every request.', 1417) },
  { category: 'project', fact: pad('Notes workflow bug found and fixed: the note_flow WhatsApp template sent flow_action_data as empty so the commodity dropdown rendered blank.', 1163) },
  { category: 'work', fact: pad('Mercancia payments: current phase is USD 3k, half end of August and half end of September. Mark sent a 1500 advance.', 854) },
  { category: 'people', fact: 'Mark Allen is significantly older than Ahmadee and the tone toward him should stay respectful rather than commanding.' },
  { category: 'preference', fact: 'Ahmadee dislikes long hyphens (em dashes) used between words in messages and email drafts. Never use them.' },
  { category: 'instruction', fact: 'When asked to draft a threaded reply, never use reply_email because it sends immediately. Use create_email_draft instead.' },
  { category: 'general', fact: 'Ahmadee is 23, turning 24 in September.' },
];

const chars = (rows) => rows.reduce((n, m) => n + m.fact.length, 0);
const TOTAL = chars(MEMORY);
const has = (sel, needle) => sel.some((m) => m.fact.includes(needle));

/* 1. A preference is included even when it matches nothing in the question. */
{
  const { selected } = selectMemory(MEMORY, 'what is the capital of France');
  assert.ok(has(selected, 'em dashes'), 'preference facts must always be carried');
  assert.ok(!has(selected, 'ADD NOTE HANDLER'), 'an unrelated project fact must not be sent');
  assert.ok(chars(selected) < 500, `off-topic turn should be tiny, got ${chars(selected)} chars`);
}

/* 2. An on-topic question pulls the fact that answers it. */
{
  const { selected } = selectMemory(MEMORY, 'what was the router filter bug in the add note handler?');
  assert.ok(has(selected, 'ADD NOTE HANDLER'), 'the matching fact must be retrieved');
  assert.ok(has(selected, 'em dashes'), 'preferences still ride along');
}

/* 3. Distinct topics retrieve distinct facts. */
{
  const auth = selectMemory(MEMORY, 'does quantumy use a service account or per-user oauth?').selected;
  assert.ok(has(auth, 'OAuth'), 'auth question should retrieve the auth fact');
  assert.ok(!has(auth, 'payments'), 'auth question should not drag in the payments fact');

  const pay = selectMemory(MEMORY, 'how much has mark paid so far this phase?').selected;
  assert.ok(has(pay, 'advance'), 'payment question should retrieve the payments fact');
}

/* 4. The budget is a hard ceiling - this is what bounds the worst case. */
{
  // A question naming most of the store's vocabulary at once.
  const { selected } = selectMemory(
    MEMORY,
    'mercancia trade whatsapp make sheet contract notes handler oauth payments parsing similar workflow',
  );
  assert.ok(
    chars(selected) <= MEMORY_CHAR_BUDGET + 500,
    `budget must hold even when everything matches: ${chars(selected)} vs ${MEMORY_CHAR_BUDGET}`,
  );
  assert.ok(chars(selected) < TOTAL, 'a broad question must still send less than everything');
}

/* 5. A message with nothing to match on carries almost nothing.
 *
 * This is the case that caught an earlier version out: "what is 2+2" has no
 * scoreable terms, and a "nothing matched, send recent facts instead" fallback
 * turned the cheapest possible message into nearly the most expensive one.
 */
for (const trivial of ['', 'hi', 'thanks!', 'what is 2 + 2', 'ok']) {
  const { selected } = selectMemory(MEMORY, trivial);
  assert.ok(has(selected, 'em dashes'), `preferences still apply to ${JSON.stringify(trivial)}`);
  assert.ok(
    chars(selected) < 500,
    `${JSON.stringify(trivial)} should carry almost no memory, got ${chars(selected)} chars`,
  );
}

/* 6. Counts are reported honestly, since the prompt tells the model about them. */
{
  const { selected, omitted, total } = selectMemory(MEMORY, 'capital of France');
  assert.equal(total, MEMORY.length);
  assert.equal(selected.length + omitted, total, 'selected + omitted must account for every fact');
}

/* 7. Degenerate inputs do not throw. */
{
  assert.deepEqual(selectMemory(null, 'x').selected, []);
  assert.deepEqual(selectMemory([], 'x').selected, []);
  assert.deepEqual(selectMemory([{ fact: '   ' }, null], 'x').selected, []);
}

/* 8. The query is built from the recent turns, not just the last one. */
{
  const q = queryFromMessages([
    { role: 'user', content: 'tell me about the add note handler' },
    { role: 'assistant', content: 'It routes notes into MASTER.' },
    { role: 'user', content: 'and the other one?' },
  ]);
  assert.ok(terms(q).has('handler'), 'a follow-up with no nouns must inherit terms from earlier turns');

  const { selected } = selectMemory(MEMORY, q);
  assert.ok(has(selected, 'ADD NOTE HANDLER'), 'the follow-up still retrieves the right fact');
}

/* 9. Content-block messages are read, not just plain strings. */
{
  const q = queryFromMessages([
    { role: 'user', content: [{ type: 'image' }, { type: 'text', text: 'is this the incoterm field?' }] },
  ]);
  assert.ok(terms(q).has('incoterm'), 'text blocks inside array content must be picked up');
}

/* Measured summary. */
const scenarios = [
  ['off-topic ("what is 2+2")', 'what is 2 + 2'],
  ['general work chat', 'can you help me write an email to mark about the demo'],
  ['deep project question', 'what was the router filter bug in the add note handler module 21'],
  ['everything at once', 'mercancia trade whatsapp make sheet contract notes handler oauth payments parsing'],
];
console.log(`\nstore: ${MEMORY.length} facts, ${TOTAL} chars (~${Math.round(TOTAL / 4)} tokens) sent on every message before this change\n`);
for (const [label, q] of scenarios) {
  const { selected } = selectMemory(MEMORY, q);
  const c = chars(selected);
  console.log(
    `  ${label.padEnd(34)} ${String(selected.length).padStart(2)} facts  ${String(c).padStart(6)} chars  ~${String(Math.round(c / 4)).padStart(5)} tokens  (${Math.round((1 - c / TOTAL) * 100)}% less)`,
  );
}
/* 10. The worst case at the real store's size.
 *
 * The fixture above is 12k characters, so the budget barely bites on it. The
 * live store is 46 facts and ~39,400 characters, and on that the budget is the
 * whole point: it is what stops "a question about the main project" from
 * costing the same as sending the lot.
 */
{
  const big = [];
  while (chars(big) < 39_400) {
    MEMORY.forEach((m, i) => {
      if (chars(big) < 39_400) big.push({ ...m, fact: `${m.fact} variant${big.length}-${i}` });
    });
  }
  const bigTotal = chars(big);
  const { selected } = selectMemory(
    big,
    'mercancia trade whatsapp make sheet contract notes handler oauth payments parsing similar workflow',
  );
  const c = chars(selected);
  assert.ok(c <= MEMORY_CHAR_BUDGET + 2_000, `worst case must stay near budget: ${c}`);
  console.log(
    `\nat the live store's size (${big.length} facts, ${bigTotal} chars, ~${Math.round(bigTotal / 4)} tokens):\n` +
      `  worst case (a question touching every topic)  ${String(c).padStart(6)} chars  ~${Math.round(c / 4)} tokens  (${Math.round((1 - c / bigTotal) * 100)}% less)`,
  );
}

console.log('\nall memory retrieval tests passed');
