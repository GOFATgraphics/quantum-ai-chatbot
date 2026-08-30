/**
 * Undo and redo for the changes Quantumy makes to Google Sheets.
 *
 * There is no undo in the Sheets API. Ctrl+Z belongs to the browser tab you
 * are typing in — it is session state in that tab, not something stored with
 * the file — and Drive's revision endpoints can list a spreadsheet's history
 * but not restore it. So undo is built here: every write records what the
 * cells held beforehand, and undoing writes that back.
 *
 * That makes two things true, and both are worth saying to the user rather
 * than hiding:
 *
 *   - It reverses what Quantumy did, not what anyone did by hand. A person's
 *     own typing is still theirs to undo in the browser, where Ctrl+Z works.
 *   - Undo is itself an edit. It shows up in the sheet's version history and
 *     is visible to collaborators, the same as any other change.
 *
 * The safety rule is that undo never silently discards someone else's work.
 * Before restoring, the cells are checked against what the original write left
 * there; if they have moved on, the undo stops and says which cell changed.
 */

import {
  readSheetGrid,
  updateSheetValues,
  readSheetNotes,
  setSheetNote,
  setFileTrashed,
  indexToCol,
  colToIndex,
} from './google.js';

/**
 * Above this, the before-image is not worth storing — and a write that wide is
 * one to review in the sheet rather than reverse blind. Such edits are still
 * journalled, flagged, so undo can explain itself instead of half-working.
 */
const MAX_JOURNAL_CELLS = 50_000;

/** How many past edits list_sheet_edits will show at once. */
const MAX_LISTED = 25;

/** Split "Positions!B2:E4" into its tab and its cell part. Tab names may contain '!'. */
export function splitA1(range) {
  const raw = String(range || '').trim();
  const bang = raw.lastIndexOf('!');
  if (bang <= 0) return { sheet: null, cells: raw };
  return {
    sheet: raw.slice(0, bang).replace(/^'(.*)'$/, '$1').replace(/''/g, "'"),
    cells: raw.slice(bang + 1).trim(),
  };
}

/** The A1 forms a range can take once the tab name is off the front. */
const CELL_OR_BLOCK = /^[A-Za-z]+\d+(:[A-Za-z]+\d+)?$/;   // A1, A1:C3
const COLUMN_SPAN = /^[A-Za-z]+:[A-Za-z]+$/;              // B:D
const ROW_SPAN = /^\d+:\d+$/;                             // 2:5

/**
 * Work out what part of a range is the tab and what part is cells.
 *
 * "Positions" with no exclamation mark is a whole tab, not column POSITIONS —
 * a distinction that matters, because reading it as a column sends the write
 * somewhere off in the thousands. Anything that is not a recognisable A1 form
 * is therefore a tab name. "Q3" stays a cell, as Sheets itself treats it; a
 * tab genuinely called Q3 has to be quoted, again as Sheets requires.
 */
function resolveTarget(range) {
  const { sheet, cells } = splitA1(range);
  if (sheet !== null) return { sheet, cells };
  if (!cells) return { sheet: null, cells: '' };
  if (CELL_OR_BLOCK.test(cells) || COLUMN_SPAN.test(cells) || ROW_SPAN.test(cells)) {
    return { sheet: null, cells };
  }
  return { sheet: cells, cells: '' };
}

/** Quote a tab name only when it needs it, the way the Sheets UI does. */
function joinA1(sheet, cells) {
  if (!sheet) return cells;
  const needsQuotes = /[^A-Za-z0-9_]/.test(sheet);
  const name = needsQuotes ? `'${sheet.replace(/'/g, "''")}'` : sheet;
  return `${name}!${cells}`;
}

/**
 * Where a write actually starts. A range may be a single cell (B2), a block
 * (B2:Z100), a whole column (B:D), or nothing at all when only a tab was
 * named — in every case the values land at its top-left corner.
 */
function anchorOf(cells) {
  const first = String(cells || '').split(':')[0].trim();
  if (!first) return { col: 0, row: 0 };
  const m = /^([A-Za-z]*)(\d*)$/.exec(first);
  if (!m) return { col: 0, row: 0 };
  return {
    col: m[1] ? colToIndex(m[1]) : 0,
    row: m[2] ? Number(m[2]) - 1 : 0,
  };
}

/**
 * The block a write will actually touch.
 *
 * This matters because the recorded range has to be the same cells going both
 * ways. Writing a 3x4 block at B2 updates B2:E4 whatever range was asked for,
 * so B2:E4 is what gets journalled, read back, and restored.
 */
export function expandWriteRange(range, rows, cols) {
  const { sheet, cells } = resolveTarget(range);
  const { col, row } = anchorOf(cells);
  const height = Math.max(1, rows);
  const width = Math.max(1, cols);
  const start = `${indexToCol(col)}${row + 1}`;
  const end = `${indexToCol(col + width - 1)}${row + height}`;
  return joinA1(sheet, `${start}:${end}`);
}

/** Widest row in a grid — a written block is as wide as its longest row. */
export function gridWidth(values) {
  return (values || []).reduce((w, r) => Math.max(w, Array.isArray(r) ? r.length : 1), 0);
}

/**
 * Square a grid off to exact dimensions, padding with empty cells.
 *
 * Google trims trailing blanks out of both reads and writes, so a before-image
 * and the block it has to fill are rarely the same shape. Padding is what
 * makes restoring also *clear* the cells the write had filled beyond what was
 * there before — without it, undoing a 5-row write over 2 rows of old data
 * would leave the last 3 rows behind.
 */
export function padGrid(values, rows, cols) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = Array.isArray(values?.[r]) ? values[r] : [];
    const padded = [];
    for (let c = 0; c < cols; c++) padded.push(row[c] == null ? '' : String(row[c]));
    out.push(padded);
  }
  return out;
}

/**
 * Compare two grids cell by cell, returning the first difference.
 *
 * Values make a round trip through Google on the way in — "25" is stored as
 * the number 25 and read back as 25 — so this compares their text, which is
 * what survives that trip intact.
 */
export function firstDifference(a, b) {
  const rows = Math.max(a.length, b.length);
  for (let r = 0; r < rows; r++) {
    const rowA = a[r] || [];
    const rowB = b[r] || [];
    const cols = Math.max(rowA.length, rowB.length);
    for (let c = 0; c < cols; c++) {
      const x = String(rowA[c] ?? '').trim();
      const y = String(rowB[c] ?? '').trim();
      if (x !== y) return { row: r, col: c, mine: y, theirs: x };
    }
  }
  return null;
}

/** Point at the changed cell in A1 terms, so the refusal names a place a person can look. */
function cellLabel(range, diff) {
  const { sheet, cells } = resolveTarget(range);
  const { col, row } = anchorOf(cells);
  return joinA1(sheet, `${indexToCol(col + diff.col)}${row + diff.row + 1}`);
}

/* ------------------------------------------------------------------ *
 * Recording
 * ------------------------------------------------------------------ */

/**
 * Journal an edit. Never throws: losing the ability to undo a write is a
 * smaller problem than failing the write itself, so a storage error is
 * reported back rather than raised.
 */
export async function recordSheetEdit(admin, entry) {
  try {
    const { data, error } = await admin
      .from('sheet_edits')
      .insert({
        user_id: entry.userId,
        spreadsheet_id: entry.spreadsheetId,
        kind: entry.kind,
        range: entry.range,
        before_state: entry.before ?? null,
        after_state: entry.after ?? null,
        too_large: !!entry.tooLarge,
      })
      .select('id')
      .single();
    if (error) return { undo_id: null, undoable: false, undo_note: error.message };
    if (entry.tooLarge) {
      return {
        undo_id: data.id,
        undoable: false,
        undo_note:
          'This write was too large to record for undo. Say so if the user asks to reverse it — ' +
          'the sheet\'s own version history is the way back.',
      };
    }
    return { undo_id: data.id, undoable: true };
  } catch (e) {
    return { undo_id: null, undoable: false, undo_note: e?.message || String(e) };
  }
}

/**
 * Capture the cells a values write is about to overwrite.
 *
 * Returns what to journal alongside the write. A failure to read the old
 * values is not a reason to refuse the write — it only means this particular
 * edit cannot be undone, which is said plainly rather than discovered later.
 */
export async function captureValuesBefore(token, spreadsheetId, range, values) {
  const rows = values.length;
  const cols = gridWidth(values);
  const written = expandWriteRange(range, rows, cols);
  if (rows * cols > MAX_JOURNAL_CELLS) {
    return { range: written, rows, cols, tooLarge: true, before: null };
  }
  try {
    const before = await readSheetGrid(token, spreadsheetId, written);
    return { range: written, rows, cols, tooLarge: false, before: padGrid(before, rows, cols) };
  } catch {
    // Usually a range that does not exist yet — a new tab, or rows past the
    // end of the grid. Empty is then the honest before-image.
    return { range: written, rows, cols, tooLarge: false, before: padGrid([], rows, cols) };
  }
}

/* ------------------------------------------------------------------ *
 * Undo / redo
 * ------------------------------------------------------------------ */

/**
 * Find the edit to act on.
 *
 * The two directions do not read the same list, which is the part that is easy
 * to get wrong. Undo takes the most recent edit still standing. Redo takes the
 * edit that was undone most recently — after undoing three writes newest-first,
 * redo has to walk back up in the opposite order, so the oldest write is the
 * first one to return. Where several were undone in the same instant, the
 * oldest goes back first, which is the same order they were undone in.
 */
async function fetchEdit(admin, userId, editId, wantUndone) {
  let query = admin.from('sheet_edits').select('*').eq('user_id', userId);
  if (editId) {
    query = query.eq('id', editId);
  } else if (wantUndone) {
    query = query
      .eq('undone', true)
      .order('undone_at', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);
  } else {
    query = query.eq('undone', false).order('created_at', { ascending: false }).limit(1);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * Put a values edit back, in whichever direction.
 *
 * `target` is the grid to write, `expected` is what should be sitting there
 * now if nobody else has touched it. The check is the whole point: reversing a
 * change is only safe while the change is still the most recent thing there.
 */
async function restoreValues(token, edit, target, expected, force) {
  const rows = target.length;
  const cols = gridWidth(target);
  const current = padGrid(await readSheetGrid(token, edit.spreadsheet_id, edit.range), rows, cols);
  if (!force) {
    const diff = firstDifference(current, padGrid(expected, rows, cols));
    if (diff) {
      throw new Error(
        `${cellLabel(edit.range, diff)} has changed since that edit — it now reads ` +
        `"${diff.mine || '(empty)'}" instead of "${diff.theirs || '(empty)'}". ` +
        'Someone edited the sheet after Quantumy did, so undoing would overwrite their work. ' +
        'Tell the user what changed and ask before retrying with force=true.',
      );
    }
  }
  await updateSheetValues(token, {
    spreadsheetId: edit.spreadsheet_id,
    range: edit.range,
    values: target,
    append: false,
  });
  return { range: edit.range, cells: rows * cols };
}

async function currentNote(token, spreadsheetId, cellRange) {
  const { notes } = await readSheetNotes(token, spreadsheetId, { range: cellRange, maxResults: 1 });
  return notes[0]?.note ?? null;
}

async function restoreNote(token, edit, target, expected, force) {
  if (!force) {
    const now = await currentNote(token, edit.spreadsheet_id, edit.range);
    if (String(now ?? '') !== String(expected ?? '')) {
      throw new Error(
        `The note on ${edit.range} has changed since that edit. Undoing would discard the newer ` +
        'note. Tell the user and ask before retrying with force=true.',
      );
    }
  }
  await setSheetNote(token, edit.spreadsheet_id, { cell: edit.range, note: String(target ?? '') });
  return { cell: edit.range, note: target || null, cleared: !target };
}

async function applyEdit(token, edit, direction, force) {
  const undoing = direction === 'undo';
  if (edit.too_large) {
    throw new Error(
      'That edit was too large to record, so it cannot be undone from here. The spreadsheet\'s ' +
      'own version history (File > Version history in Google Sheets) still has it.',
    );
  }
  if (edit.kind === 'values') {
    const target = undoing ? edit.before_state : edit.after_state;
    const expected = undoing ? edit.after_state : edit.before_state;
    if (!Array.isArray(target)) throw new Error('That edit has no recorded values to restore.');
    return restoreValues(token, edit, target, expected || [], force);
  }
  if (edit.kind === 'note') {
    return restoreNote(token, edit, undoing ? edit.before_state : edit.after_state,
      undoing ? edit.after_state : edit.before_state, force);
  }
  if (edit.kind === 'create') {
    // Undoing a creation means binning the file, not destroying it — it sits
    // in the Drive bin and redo takes it straight back out.
    await setFileTrashed(token, edit.spreadsheet_id, undoing);
    return { spreadsheet_id: edit.spreadsheet_id, trashed: undoing };
  }
  throw new Error(`Unknown edit kind "${edit.kind}".`);
}

export async function undoOrRedo(admin, token, { userId, editId, direction, force }) {
  const edit = await fetchEdit(admin, userId, editId, direction === 'redo');
  if (!edit) {
    return {
      ok: false,
      error: direction === 'undo'
        ? 'There is nothing to undo — Quantumy has not changed a sheet, or every change has already been undone.'
        : 'There is nothing to redo — nothing has been undone.',
    };
  }
  if (direction === 'undo' && edit.undone) {
    return { ok: false, error: 'That edit has already been undone. Use redo_sheet_edit to put it back.' };
  }
  if (direction === 'redo' && !edit.undone) {
    return { ok: false, error: 'That edit is already applied — there is nothing to redo.' };
  }

  const result = await applyEdit(token, edit, direction, !!force);
  await admin
    .from('sheet_edits')
    .update({ undone: direction === 'undo', undone_at: direction === 'undo' ? new Date().toISOString() : null })
    .eq('id', edit.id);

  return {
    ok: true,
    direction,
    edit_id: edit.id,
    kind: edit.kind,
    spreadsheet_id: edit.spreadsheet_id,
    link: `https://docs.google.com/spreadsheets/d/${edit.spreadsheet_id}/edit`,
    made_at: edit.created_at,
    ...result,
  };
}

export async function listSheetEdits(admin, userId, { spreadsheetId, limit } = {}) {
  let query = admin
    .from('sheet_edits')
    .select('id, spreadsheet_id, kind, range, undone, created_at, too_large')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(MAX_LISTED, Math.max(1, Number(limit) || 10)));
  if (spreadsheetId) query = query.eq('spreadsheet_id', spreadsheetId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return {
    count: (data || []).length,
    edits: (data || []).map((e) => ({
      edit_id: e.id,
      spreadsheet_id: e.spreadsheet_id,
      what: e.kind === 'create' ? 'created the spreadsheet'
        : e.kind === 'note' ? `note on ${e.range}`
        : `wrote ${e.range}`,
      undone: e.undone,
      undoable: !e.too_large,
      at: e.created_at,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

const SHARED_CAVEAT =
  'This reverses edits Quantumy made, by writing the old values back — Google has no undo API, ' +
  'so there is nothing to press. It cannot undo what the user typed in the browser themselves; ' +
  'for that, Ctrl+Z in the sheet is the answer. If the cells have changed since, this stops and ' +
  'says which cell moved rather than overwriting the newer work.';

export const UNDO_SHEET_TOOL = {
  name: 'undo_sheet_edit',
  description:
    'Undo the last change Quantumy made to a Google Sheet, putting the previous cell values, note ' +
    'or file back. With no edit_id it undoes the most recent change that is still applied; pass an ' +
    'edit_id from list_sheet_edits to reverse a specific one. ' + SHARED_CAVEAT,
  input_schema: {
    type: 'object',
    properties: {
      edit_id: { type: 'string', description: 'A specific edit to undo, from list_sheet_edits. Omit for the most recent.' },
      force: {
        type: 'boolean',
        description:
          'Undo even though the cells changed after Quantumy wrote them. Only after telling the ' +
          'user what changed and getting their answer — this discards the newer edit.',
      },
    },
  },
};

export const REDO_SHEET_TOOL = {
  name: 'redo_sheet_edit',
  description:
    'Re-apply a sheet change that was undone, putting Quantumy\'s version back. With no edit_id it ' +
    'redoes the most recently undone change. ' + SHARED_CAVEAT,
  input_schema: {
    type: 'object',
    properties: {
      edit_id: { type: 'string', description: 'A specific edit to redo, from list_sheet_edits. Omit for the most recent.' },
      force: { type: 'boolean', description: 'Redo even though the cells changed since the undo. Ask the user first.' },
    },
  },
};

export const LIST_SHEET_EDITS_TOOL = {
  name: 'list_sheet_edits',
  description:
    'List the recent changes Quantumy has made to Google Sheets, newest first, with an edit_id for ' +
    'each and whether it has been undone. Use this when the user asks what was changed, or when ' +
    '"undo that" could mean more than one edit — read the list and confirm which one before undoing.',
  input_schema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'Limit to one spreadsheet. Optional.' },
      limit: { type: 'number', description: '1-25, default 10.' },
    },
  },
};

export const SHEET_HISTORY_TOOLS = [UNDO_SHEET_TOOL, REDO_SHEET_TOOL, LIST_SHEET_EDITS_TOOL];
export const SHEET_HISTORY_TOOL_NAMES = new Set(SHEET_HISTORY_TOOLS.map((t) => t.name));

export async function handleSheetHistoryTool(block, user, admin, token) {
  const id = block.id;
  const name = block.name;
  const input = block.input || {};
  try {
    if (name === 'list_sheet_edits') {
      const result = await listSheetEdits(admin, user.id, {
        spreadsheetId: input.spreadsheet_id ? String(input.spreadsheet_id) : undefined,
        limit: input.limit,
      });
      return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(result) };
    }
    const result = await undoOrRedo(admin, token, {
      userId: user.id,
      editId: input.edit_id ? String(input.edit_id) : null,
      direction: name === 'undo_sheet_edit' ? 'undo' : 'redo',
      force: !!input.force,
    });
    if (!result.ok) {
      return { type: 'tool_result', tool_use_id: id, content: result.error, is_error: true };
    }
    return { type: 'tool_result', tool_use_id: id, content: JSON.stringify(result) };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: id, content: e?.message || String(e), is_error: true };
  }
}
