/* ------------------------------------------------------------------ *
 * cleanText.js — repair text copied out of a PDF.
 *
 * PDF copy-paste breaks lines at the page column, splits words with a
 * hyphen ("pedagog-" / "ical"), and drops blank lines into the middle of
 * sentences. That confuses the section/paragraph hints and stops the AI's
 * evidence quotes from matching the text. This joins it back up.
 * ------------------------------------------------------------------ */

const ROMAN_HEAD = /^[IVX]{1,5}\.\s+[A-Z]/; // "I. INTRODUCTION"
const LETTER_HEAD = /^[A-H]\.\s+[A-Z][^.]{0,70}$/; // "A. Platform design"
const NUM_HEAD = /^\d{1,2}(\.\d{1,2})*\.?\s+[A-Z][^.]{0,70}$/; // "3.1 Method"
const ITEM = /^(\d{1,2}[.)]|[-•*▪●–])\s+/; // list items

function isAllCaps(t) {
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && t.length <= 70 && letters === letters.toUpperCase();
}

function isHeading(t) {
  return ROMAN_HEAD.test(t) || LETTER_HEAD.test(t) || (NUM_HEAD.test(t) && !/[.!?]$/.test(t)) || isAllCaps(t);
}

/* "User:" / "Claude:" lines in a pasted transcript must stay on their own */
const MARKER = /^\**\s*(user|human|me|claude|assistant|ai)\s*:?\s*\**$/i;

const ENDS_SENTENCE = /[.!?:;]["”’')\]]?$/;

export function cleanPdfText(raw) {
  const lines = String(raw).replace(/\r\n?/g, "\n").replace(/­/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const lengths = lines.map((l) => l.trim().length).filter((n) => n > 0).sort((a, b) => a - b);
  const typical = lengths.length ? lengths[Math.floor(lengths.length * 0.75)] : 80;

  const paras = [];
  let cur = "";
  let curHead = false;
  let prevShort = false;
  let blank = false;
  const flush = () => {
    if (cur.trim()) paras.push(curHead ? "## " + cur.trim() : cur.trim());
    cur = "";
    curHead = false;
  };

  for (const line of lines) {
    const t = line.trim().replace(/\s{2,}/g, " ");
    if (!t) {
      blank = true;
      continue;
    }
    if (MARKER.test(t)) {
      flush();
      paras.push(t);
      blank = false;
      prevShort = true;
      continue;
    }
    const head = isHeading(t);
    const item = ITEM.test(t);
    if (!cur) {
      cur = t;
      curHead = head;
    } else if (head || curHead || item) {
      flush();
      cur = t;
      curHead = head;
    } else if (ENDS_SENTENCE.test(cur) && (blank || prevShort)) {
      /* a finished sentence followed by a gap or a short line = new paragraph */
      flush();
      cur = t;
    } else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(t)) {
      /* "pedagog-" + "ical" → "pedagogical" */
      cur = cur.slice(0, -1) + t;
    } else {
      cur += " " + t;
    }
    prevShort = t.length < typical * 0.7;
    blank = false;
  }
  flush();
  return paras.join("\n\n");
}

/* Does this look like PDF copy-paste? Used to suggest the button. */
export function looksLikePdfPaste(text) {
  const lines = String(text).split("\n").filter((l) => l.trim());
  if (lines.length < 8) return false;
  const hyphenBreaks = lines.filter((l) => /[a-z]-\s*$/.test(l)).length;
  const unfinished = lines.filter((l) => !/[.!?:;"”)]\s*$/.test(l)).length;
  return hyphenBreaks >= 2 || unfinished / lines.length > 0.6;
}
