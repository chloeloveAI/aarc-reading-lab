/* ------------------------------------------------------------------ *
 * coverage.js — where in the text each question should come from.
 *
 * The passage is cut into four quarters by word count. Before any item is
 * written, a coverage plan (the "blueprint") gives every question slot:
 *   - its comprehension process (from the plan, e.g. 1·2·2·1),
 *   - the quarter its evidence must come from, spread so every quarter is
 *     used and no quarter carries more than one item above another,
 *   - optionally a reader focus: a part she asked the tutor about, a
 *     sentence she highlighted, or a word she saved. At most one third of
 *     the questions are built around reader focus; the rest cover the text.
 *
 * Pure functions only (no React, no model calls), so they can be tested.
 * ------------------------------------------------------------------ */

export const COVERAGE_VERSION = "coverage-v1";
export const QUARTERS = 4;

const words = (s) => (String(s).match(/\S+/g) || []).length;

/* quarter (1–4) of every line, by the position of the line's middle word */
export function lineQuarters(lines) {
  const counts = lines.map(words);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let before = 0;
  return counts.map((c) => {
    const mid = before + c / 2;
    before += c;
    return Math.min(QUARTERS, Math.max(1, Math.floor((mid / total) * QUARTERS) + 1));
  });
}

/* the first line of each quarter (blank lines are skipped) */
export function quarterStarts(lines) {
  const q = lineQuarters(lines);
  const starts = {};
  lines.forEach((l, i) => {
    if (!String(l).trim()) return;
    if (starts[q[i]] == null) starts[q[i]] = i;
  });
  return starts;
}

/* The passage as the model sees it, with a marker line before each quarter.
   Markers sit on their own lines so anchors copied from the text stay exact. */
export function passageWithQuarters(lines) {
  const starts = quarterStarts(lines);
  const out = [];
  lines.forEach((l, i) => {
    for (let q = 1; q <= QUARTERS; q++) if (starts[q] === i) out.push(`[QUARTER ${q} OF ${QUARTERS} STARTS HERE]`);
    out.push(l);
  });
  return out.join("\n");
}

/* --------------------------- reader focus --------------------------- *
 * focus: { kind: "tutor" | "vocab" | "highlight", text, quarter, question? }
 * Priority: parts she asked the tutor to explain, then saved words, then
 * plain highlights. Duplicates (same text) count once.                   */
const PRIORITY = { tutor: 0, vocab: 1, highlight: 2 };
const LEVEL_PREF = { tutor: [3, 2, 4], vocab: [2, 1], highlight: [2, 4, 3] };

export function rankFocus(focus = []) {
  const seen = new Set();
  return focus
    .filter((f) => f && f.text && f.quarter >= 1 && f.quarter <= QUARTERS && PRIORITY[f.kind] != null)
    .map((f, order) => ({ ...f, order }))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.order - b.order)
    .filter((f) => {
      const k = f.kind + ":" + String(f.text).toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export const maxTargeted = (total) => Math.floor(total / 3);

/**
 * buildBlueprint(counts, focus) → slots
 * counts: questions per process, e.g. [1,2,2,1] or [2,3,3,2]
 * slot: { slot_id, level, quarter, focus|null }
 */
export function buildBlueprint(counts, focus = []) {
  const slots = [];
  counts.forEach((c, li) => {
    for (let i = 0; i < c; i++) slots.push({ level: li + 1, quarter: null, focus: null });
  });
  const total = slots.length;
  const load = Array(QUARTERS + 1).fill(0);
  const levelInQuarter = {};
  const mark = (s, q) => {
    s.quarter = q;
    load[q]++;
    levelInQuarter[s.level + ":" + q] = true;
  };

  /* 1. reader focus first, up to a third of the questions.
        Take one of each kind before a second of any kind, and prefer a
        quarter that has no targeted question yet (second pass allows it). */
  let targeted = 0;
  const cap = maxTargeted(total);
  const ranked = rankFocus(focus);
  const byKind = {};
  ranked.forEach((f) => (byKind[f.kind] = byKind[f.kind] || []).push(f));
  const interleaved = [];
  for (let round = 0; interleaved.length < ranked.length; round++)
    for (const k of Object.keys(PRIORITY)) if (byKind[k]?.[round]) interleaved.push(byKind[k][round]);
  const used = new Set();
  const targetedIn = Array(QUARTERS + 1).fill(0);
  for (const pass of [0, 1]) {
    for (const f of interleaved) {
      if (targeted >= cap) break;
      if (used.has(f)) continue;
      if (pass === 0 && targetedIn[f.quarter]) continue;
      /* keep every quarter reachable: a quarter may hold at most ceil(total/4) items */
      if (load[f.quarter] >= Math.ceil(total / QUARTERS)) continue;
      let slot = null;
      for (const lv of LEVEL_PREF[f.kind]) {
        slot = slots.find((s) => s.level === lv && !s.focus);
        if (slot) break;
      }
      if (!slot) continue;
      slot.focus = { kind: f.kind, text: f.text, question: f.question || "", start_line: f.start_line ?? null, end_line: f.end_line ?? f.start_line ?? null };
      mark(slot, f.quarter);
      targetedIn[f.quarter]++;
      used.add(f);
      targeted++;
    }
  }

  /* 2. the rest spread across the quarters: least-used quarter first,
        avoiding a quarter that already has this process; ties go to the
        earliest quarter after the last one chosen, so the plan rotates */
  let cursor = 0;
  for (const s of slots) {
    if (s.quarter) continue;
    let best = null;
    for (let k = 0; k < QUARTERS; k++) {
      const q = ((cursor + k) % QUARTERS) + 1;
      const score = load[q] * 10 + (levelInQuarter[s.level + ":" + q] ? 1 : 0);
      if (!best || score < best.score) best = { q, score };
    }
    mark(s, best.q);
    cursor = best.q % QUARTERS;
  }

  return slots.map((s, i) => ({ slot_id: "S" + String(i + 1).padStart(2, "0"), ...s }));
}

/* summary for the research log and the results screen */
export function blueprintSummary(slots) {
  const per = Array(QUARTERS).fill(0);
  slots.forEach((s) => per[s.quarter - 1]++);
  return { per_quarter: per, targeted: slots.filter((s) => s.focus).length, total: slots.length };
}

/* v10.4: a stem that names a part of the text must name the right part.
   Only section-level phrases are checked; paragraph references are too
   ambiguous to judge by code. Returns a reason string, or "" if fine.
   anchorSection: 1-based section of the evidence; totalSections: count. */
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
export function stemLocationProblem(stem, anchorSection, totalSections) {
  const s = String(stem || "").toLowerCase();
  if (!anchorSection || !totalSections) return "";
  if (/\bquarter\b/.test(s)) return "The question mentions a 'quarter' of the text (planning marker, not part of the text)";
  const named = [];
  if (/\b(final|last|concluding|closing)\s+(section|part)\b/.test(s)) named.push(totalSections);
  if (/\b(opening|introductory)\s+(section|part)\b|\bfirst\s+section\b|\bthe introduction\b/.test(s)) named.push(1);
  for (const m of s.matchAll(/\bsection\s+(\d{1,2})\b/g)) named.push(Number(m[1]));
  for (const m of s.matchAll(/\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+section\b/g)) named.push(ORDINALS[m[1]]);
  if (!named.length) return "";
  return named.includes(anchorSection)
    ? ""
    : `The question names section ${named.join("/")} but its evidence is in section ${anchorSection}`;
}

/* ---------------------- answer-key positions ------------------------ *
 * Models tend to put the correct option first. After an item is written,
 * the correct option is moved to a planned position and the distractors
 * are reordered. Deterministic (seeded), so the same run always shows the
 * same order; the original position is logged.                           */
function seeded(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/* a permutation of 0..3 for a run: candidate k gets key position plan[k % 4],
   so every block of four candidates uses each letter once */
export function keyPlan(runId) {
  const r = seeded("keys:" + runId);
  const p = [0, 1, 2, 3];
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/* returns { options, from, to }: the correct option moved to `target`,
   distractors shuffled with a seed. Leaves anything without exactly one
   key untouched. */
export function placeKey(options, target, seed) {
  const from = options.findIndex((o) => o.correct);
  if (from < 0 || options.filter((o) => o.correct).length !== 1 || target < 0 || target >= options.length) return { options, from, to: from };
  const r = seeded("opts:" + seed);
  const rest = options.filter((_, i) => i !== from);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out = [...rest];
  out.splice(target, 0, options[from]);
  return { options: out, from, to: target };
}
