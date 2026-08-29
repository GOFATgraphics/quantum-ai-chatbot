/**
 * Turn spoken numbers back into digits.
 *
 * Speech recognition returns what was said, as words: "one three zero seven"
 * comes back spelled out, not as 1307. For ordinary prose that is fine. For a
 * trade conversation it is not — prices, tonnages, container and invoice
 * numbers are the part of a transcript anyone actually needs, and words are
 * unusable for searching, comparing or pasting into a sheet.
 *
 * The conversion is deliberately conservative, because the failure that
 * matters is the false positive: rewriting "one of the sellers" as "1 of the
 * sellers" damages text that was correct. So a lone small word is left alone,
 * and only a run of number words, or a single larger one that is never a
 * pronoun, is converted.
 */

const UNITS = {
  zero: 0, oh: 0, nought: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };

/** Words that may sit inside a number without ending it. */
const GLUE = new Set(['and', 'a']);

const isUnit = (w) => Object.prototype.hasOwnProperty.call(UNITS, w);
const isTen = (w) => Object.prototype.hasOwnProperty.call(TENS, w);
const isScale = (w) => Object.prototype.hasOwnProperty.call(SCALES, w);
const isNumberWord = (w) => isUnit(w) || isTen(w) || isScale(w);

/**
 * A run of digit words with no scale in it — "one nine six six" — is a spoken
 * digit string, not arithmetic. Reading it as a cardinal would produce
 * nonsense, so those are concatenated instead of summed.
 */
function looksLikeDigitString(words) {
  // Two is enough: adjacent bare digits with no scale between them are always
  // read out, never arithmetic. Summing them would turn "five eight" into 13.
  if (words.length < 2) return false;
  if (words.some(isScale) || words.some(isTen)) return false;
  return words.every((w) => isUnit(w) && UNITS[w] <= 9);
}

/** Standard cardinal accumulation: "one thousand three hundred and sixty nine" -> 1369. */
function cardinalValue(words) {
  let total = 0;
  let current = 0;
  let seenAny = false;
  for (const w of words) {
    if (GLUE.has(w)) continue;
    if (isUnit(w)) { current += UNITS[w]; seenAny = true; }
    else if (isTen(w)) { current += TENS[w]; seenAny = true; }
    else if (isScale(w)) {
      const scale = SCALES[w];
      seenAny = true;
      if (scale === 100) current = (current || 1) * 100;
      else { total += (current || 1) * scale; current = 0; }
    }
  }
  return seenAny ? total + current : null;
}

/**
 * Worth converting on its own? A single "one" or "two" is usually prose.
 * Anything from eleven up, or any tens word, is almost always a quantity.
 */
function convertibleAlone(word) {
  if (isTen(word)) return true;
  if (isUnit(word) && UNITS[word] >= 11) return true;
  return false;
}

export function wordsToNumbers(input) {
  const text = String(input ?? '');
  if (!text) return text;

  // Split into tokens while keeping every separator, so punctuation, spacing
  // and casing outside the numbers survive untouched.
  const parts = text.split(/([A-Za-z]+)/);
  const out = [];
  let i = 0;

  while (i < parts.length) {
    const token = parts[i];
    const lower = token.toLowerCase();

    if (i % 2 === 1 && isNumberWord(lower)) {
      // Collect the run, allowing "and"/"a" between number words but never
      // trailing — "sixty and" keeps its "and".
      const words = [];
      const consumed = [];
      let j = i;
      let lastNumberAt = -1;
      while (j < parts.length) {
        const w = parts[j];
        if (j % 2 === 0) {
          // Only spaces and tabs may sit inside a number. A newline separates
          // speakers in a diarized transcript and chunks in a long one, so a
          // run must never reach across it and fuse two unrelated figures.
          if (!/^[ \t]*$/.test(w)) break;
          consumed.push(j);
          j += 1;
          continue;
        }
        const lw = w.toLowerCase();
        if (isNumberWord(lw)) { words.push(lw); lastNumberAt = j; consumed.push(j); j += 1; continue; }
        if (GLUE.has(lw) && words.length > 0) { words.push(lw); consumed.push(j); j += 1; continue; }
        break;
      }

      const meaningful = words.filter((w) => !GLUE.has(w));
      const worth = meaningful.length >= 2 || (meaningful.length === 1 && convertibleAlone(meaningful[0]));

      if (worth) {
        const value = looksLikeDigitString(meaningful)
          ? meaningful.map((w) => UNITS[w]).join('')
          : cardinalValue(meaningful);
        if (value !== null && value !== '') {
          out.push(String(value));
          // Everything after the last actual number word is put back verbatim,
          // so a trailing "and" is not swallowed.
          for (let k = lastNumberAt + 1; k < j; k++) out.push(parts[k]);
          i = j;
          continue;
        }
      }
    }

    out.push(token);
    i += 1;
  }

  return out.join('');
}
