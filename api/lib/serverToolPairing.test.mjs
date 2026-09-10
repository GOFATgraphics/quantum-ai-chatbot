/**
 * Reproduces the orphaned server-tool failure and pins the fix.
 *
 * The live error was:
 *   messages.43: mcp_tool_use with id mcptoolu_017v... was found without a
 *   corresponding `mcp_tool_result`
 *
 * Message 43, not the last one - because the whole conversation is resent on
 * every request, an orphan created once kills every later message in that
 * thread. The turn that produced it looked fine to the user at the time.
 *
 * Run: node api/lib/serverToolPairing.test.mjs
 */
import assert from 'node:assert/strict';
import { reconcileServerToolBlocks } from '../chat.js';

const use = (id, name = 'scenarios_list') => ({ type: 'mcp_tool_use', id, name, server_name: 'make', input: {} });
const result = (id) => ({ type: 'mcp_tool_result', tool_use_id: id, is_error: false, content: [{ type: 'text', text: 'ok' }] });
const text = (t) => ({ type: 'text', text: t });

/* 1. The reported failure: a call cut off before its result. */
{
  const { content, dropped } = reconcileServerToolBlocks([
    text('Let me pull the full body.'),
    use('mcptoolu_017vsAHjCyVeWVdY7ZR6jY3f'),
  ]);
  assert.deepEqual(content, [text('Let me pull the full body.')], 'the orphaned call must not be replayed');
  assert.deepEqual(dropped, ['scenarios_list'], 'the dropped call is reported so the model can be told');
}

/* 2. A complete pair is untouched. */
{
  const blocks = [text('Checking.'), use('a'), result('a'), text('You have 11 scenarios.')];
  const { content, dropped } = reconcileServerToolBlocks(blocks);
  assert.deepEqual(content, blocks, 'a matched pair must survive exactly as it arrived');
  assert.deepEqual(dropped, []);
}

/* 3. Several calls, only the last one cut off. */
{
  const { content, dropped } = reconcileServerToolBlocks([
    use('a'), result('a'),
    use('b'), result('b'),
    use('c', 'executions_list'),
  ]);
  assert.equal(content.length, 4, 'the two complete pairs stay');
  assert.deepEqual(dropped, ['executions_list']);
  assert.ok(!content.some((b) => b.id === 'c'), 'only the unmatched call goes');
}

/* 4. The reverse orphan is just as invalid. */
{
  const { content, dropped } = reconcileServerToolBlocks([text('hi'), result('missing')]);
  assert.deepEqual(content, [text('hi')], 'a result whose call is gone must also be dropped');
  assert.equal(dropped.length, 1);
}

/* 5. Local tool_use is a different mechanism and must not be touched.
 *
 * Local calls are paired by the tool loop, which appends the tool_result on
 * the next round - so at this point a local tool_use legitimately has no
 * result yet. Treating it like an orphan would delete every real tool call
 * the app makes.
 */
{
  const blocks = [{ type: 'tool_use', id: 't1', name: 'read_sheet', input: { range: 'A1' } }];
  const { content, dropped } = reconcileServerToolBlocks(blocks);
  assert.deepEqual(content, blocks, 'local tool_use must pass through untouched');
  assert.deepEqual(dropped, []);
}

/* 6. Other server tools use the same shape and get the same treatment. */
{
  const { content, dropped } = reconcileServerToolBlocks([
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
  ]);
  assert.deepEqual(content, []);
  assert.deepEqual(dropped, ['web_search']);
}

/* 7. Degenerate inputs do not throw. */
{
  assert.deepEqual(reconcileServerToolBlocks(null), { content: [], dropped: [] });
  assert.deepEqual(reconcileServerToolBlocks(undefined), { content: [], dropped: [] });
  const { content } = reconcileServerToolBlocks([null, text('x'), undefined]);
  assert.deepEqual(content, [null, text('x'), undefined], 'unknown entries are left for the API to judge');
}

console.log('server tool pairing: orphaned mcp_tool_use dropped, complete pairs intact');
