import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Settings from "./Settings";
import {
  listSessions,
  saveSession,
  removeSession,
  whereSaved,
  formatWhen,
  relativeWhen,
} from "./sessions";
import { WordCard, VocabDrawer } from "./Glossary";
import { SelectionBar, AskPanel, NotesDrawer } from "./Ask";
import { analyseIntent } from "./notes";
import FlagPanel from "./Flag";
import WritingScaffold from "./Scaffold";
import { cleanPdfText, looksLikePdfPaste } from "./cleanText";
import Inspector from "./Inspector";
import { buildItemPromptV10, PASSAGE_TOKEN, learnerText, buildL3CheckPrompt, L3CHECK_SCHEMA, L3CHECK_VERSION, buildL4CheckPrompt, L4CHECK_SCHEMA, L4CHECK_VERSION } from "./prompts";
import {
  PROMPT_VERSION,
  VALIDATOR_VERSION,
  APP_VERSION,
  hash,
  passageId,
  newRunId,
  logPassage,
  logRun,
  logRunEnd,
  logRunModel,
  logCall,
  logCandidates,
  logShortfall,
  logDiagnostic,
  loadExemplars,
  logSummary,
  exportLogJSON,
  exportCandidatesCSV,
  exportReadingCSV,
  exportWrittenCSV,
  logReading,
  logWritten,
  logSelfRating,
  exportRatingsCSV,
} from "./research";
import FocusReading from "./FocusReading";
import SelfRating, { RATING_VERSION } from "./SelfRating";
import { checkPremise, markAnswer, improveAnswer, strongAnswer, WRITTEN_VERSION } from "./written";
import { quarterMap, normLine, passageWithQuarters, buildBlueprint, blueprintSummary, COVERAGE_VERSION, stemLocationProblem, keyPlan, placeKey, evidenceSpans } from "./coverage";
import { loadFlags, exportFlagsCSV, exportFlagsJSON, agreement } from "./flags";
import {
  complete,
  parseJSON,
  loadConfig,
  lastExchange,
  modelInfo,
  ITEMS_SCHEMA,
  ITEMS_SCHEMA_L3,
  OPEN_SCHEMA,
  MARK_SCHEMA,
  WORD_GRADE_SCHEMA,
  GRADE_BANDS,
} from "./llm";

/* ------------------------------------------------------------------ *
 * Question Ladder — turn a long AI answer into a climb of comprehension
 * items, one screen at a time. PIRLS processes 1–4, PISA aspects.
 * ------------------------------------------------------------------ */

const C = {
  ink: "#16202B",
  slate: "#5A6B7B",
  mute: "#8496A4",
  line: "#D3DBE0",
  paper: "#E9EDEF",
  card: "#FFFFFF",
  teal: "#1F6F6A",
  tealSoft: "#DDEDEB",
  amber: "#F2C14E",
  amberSoft: "#FDF3DC",
  brick: "#A8402B",
  brickSoft: "#F8E5E0",
};

const F = {
  read: "'Newsreader', Georgia, 'Times New Roman', serif",
  ui: "'Public Sans', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
};

const LEVELS = [
  {
    n: 1,
    name: "Find it",
    pirls: "Focus on and retrieve explicitly stated information",
    pisa: "Locate information",
    spec:
      "Ask for a fact, figure, name, condition or step that the passage states outright. The work is locating it, not reasoning about it. Do not quote the passage word-for-word in the stem — make the learner search.",
  },
  {
    n: 2,
    name: "Join the dots",
    pirls: "Make straightforward inferences",
    pisa: "Understand",
    spec:
      "Require exactly one inferential step: connect two nearby statements, work out a cause, a purpose, what a term or pronoun refers to, or the consequence of a stated condition. The answer is implied, never printed. Self-check: if the correct option can be matched to the words of one sentence, it is level 1 — rewrite it.",
  },
  {
    n: 3,
    name: "Read across",
    pirls: "Interpret and integrate ideas and information",
    pisa: "Integrate and interpret",
    spec:
      "The correct answer must be a NEW idea that only exists when two parts of the passage, in DIFFERENT paragraphs, are put together: a relationship between them (cause and effect, contrast, how one explains, limits or depends on the other), a main idea or theme that runs across them, or a stated rule applied to a case the passage never mentions. The reader must reason about HOW the two parts connect — not just find two facts.\n" +
      "NOT level 3 (never write these): (a) 'What are the two conditions/requirements/features…' where the answer just lists two separately stated facts; (b) options built as combinations of two facts ('X and Y', 'X and not-Y', 'not-X and Y'…); (c) anything answerable by finding each half separately.\n" +
      "GOOD level 3: 'Why does the advice in the cost section make the VCP entry rule stricter?' — the answer explains a link the passage never states in one place.\n" +
      "Give the second evidence span in \"anchor2\" and say in \"link\" how the two spans connect.",
  },
  {
    n: 4,
    name: "Weigh it up",
    pirls: "Evaluate and critique content, language and textual elements",
    pisa: "Evaluate and reflect",
    spec:
      "Require judging the answer itself: the strength of its evidence, the limits of a claim, a trade-off it leaves implicit, the effect of a word choice, or what a reader should stay cautious about. There must still be one defensible best answer grounded in the passage.",
  },
];

/* counts = questions per comprehension process 1–4 */
const PLANS = {
  short: { key: "short", label: "Quick practice", counts: [1, 2, 2, 1], note: "6 questions (1·2·2·1) + 1 written" },
  full: { key: "full", label: "Full practice", counts: [2, 3, 3, 2], note: "10 questions (2·3·3·2) + 1 written" },
  /* the formal experiment: PIRLS 2026 weighting 20/30/30/20 % (p. 8) */
  research: { key: "research", label: "Research set", counts: [2, 3, 3, 2], note: "10 questions · PIRLS mix 2·3·3·2 · formal runs" },
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/* ----------------------------- API ------------------------------- */

async function ask(userText, { maxTokens = 1400, schema, config } = {}) {
  return complete(userText, { maxTokens, schema, config });
}

function trimPassage(text) {
  const cap = 40000;
  return text.length > cap ? text.slice(0, cap) + "\n[…passage truncated…]" : text;
}

/* The item-generation prompt lives in prompts.js (versioned: PROMPT_VERSION). */

function buildOpenPrompt(prompt, passage, problems = []) {
  return `Write ONE open-ended written-response question about the passage below, at PIRLS process 4 (evaluate and critique) / PISA "evaluate and reflect".

<question>
${prompt || "(not supplied)"}
</question>

<passage>
${trimPassage(passage)}
</passage>

The question must require the learner to take a position and defend it with evidence from the passage — for example weighing a trade-off the passage leaves implicit, judging where the advice would break down, or deciding what she would do differently and why. It must not be answerable with recall.
Only name things the passage actually contains, in the role the passage gives them: do not call a problem a "framework", do not invent a finding, contradiction or link the passage does not support.${
    problems.length ? `\n\nAn earlier version of this question was rejected because:\n- ${problems.join("\n- ")}\nWrite a different question that avoids these problems.` : ""
  }

Return ONLY JSON:
{"stem":"...","criteria":["...","...","..."]}
Each criterion: at most 14 words, describing what a strong answer contains.`;
}

function buildMarkPrompt(passage, stem, criteria, answer) {
  return `Mark this written answer. Be direct and specific; no flattery, no padding.

<passage>
${trimPassage(passage)}
</passage>

QUESTION: ${stem}
CRITERIA: ${(criteria || []).join(" | ")}

LEARNER'S ANSWER:
${answer}

Return ONLY JSON:
{"verdict":"strong|developing|thin","strengths":["..."],"missing":["..."],"nudge":"...","model":"..."}
- strengths and missing: 1–3 items each, at most 20 words per item, each pointing at something concrete in her answer or in the passage.
- nudge: one question that would push her thinking further. At most 20 words.
- model: a strong answer in 3–4 sentences, using the passage.`;
}

/* The learner explains a key word in her own words; the model grades the
   explanation against its meaning in this sentence. It must not leak the
   answer to the question she is working on. */
function buildWordGradePrompt(word, sentence, explanation, stem) {
  return `A reader is explaining, in her own words, what a word or phrase means in a passage. Grade her explanation of its meaning IN THIS CONTEXT.

WORD OR PHRASE: "${word}"
THE SENTENCE IT APPEARS IN:
<sentence>
${sentence}
</sentence>

HER EXPLANATION:
<explanation>
${explanation}
</explanation>

Bands — choose exactly one:
- Excellent: accurate meaning in this context, clearly in her own words, and shows how the word works in this sentence.
- Good: accurate meaning in this context, in her own words, but little link to the sentence.
- Satisfactory: broadly right but vague, or gives a general dictionary sense rather than the meaning here.
- Weak: partly right, with a clear gap or error.
- Poor: mostly wrong or misunderstands the word.
- Unacceptable: blank, irrelevant, nonsense, or just copies the sentence without explaining.

Rules:
- Judge meaning, not grammar or spelling. A short answer can be Excellent if it is precise.
- If most of her explanation is copied from the sentence, the band can be no higher than Satisfactory.
- She is answering this question about the passage: "${stem}". NEVER reveal or hint at the answer to that question.
- "feedback": one sentence, at most 25 words, saying what her explanation got right or wrong. Speak to her as "you".
- "improve": one sentence, at most 20 words, saying how to make it stronger. If Excellent, say what made it strong.

Return ONLY JSON:
{"band":"...","feedback":"...","improve":"..."}`;
}

const BAND_COLOR = {
  Excellent: C.teal,
  Good: C.teal,
  Satisfactory: "#8A6A12",
  Weak: C.brick,
  Poor: C.brick,
  Unacceptable: C.brick,
};

/* --------------------------- Utilities --------------------------- */

function truthy(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return /^(true|yes|y|1|correct)$/i.test(v.trim());
  return false;
}

/* Small models get the shape almost right. Repair what is repairable and
   reject only the individual item that isn't, never the whole batch. */
/* Turn the model's reply into candidate records — one per raw item, kept
   whether or not it is usable. Format problems are rejections, never
   silent repairs (the one repair, a separate answer-key field, is logged). */
function normaliseCandidates(raw, level) {
  const list = Array.isArray(raw) ? raw : raw?.items || raw?.questions || [];
  if (!Array.isArray(list)) return [];
  return list.map((it) => {
    const rec = { raw: it, item: null, reasons: [], repairs: [], checks: {} };
    const reject = (why) => {
      rec.reasons.push(why);
      return rec;
    };
    if (!it || typeof it !== "object") return reject("Item is not an object");
    let opts = (it.options || it.choices || it.answers || []).map((o) =>
      typeof o === "string" ? { text: o, correct: false, why: "" } : o || {}
    );
    rec.checks.four_options = opts.length === 4;
    if (opts.length !== 4) return reject("Needs exactly 4 options (got " + opts.length + ")");
    opts = opts.map((o) => ({
      text: String(o.text ?? o.option ?? "").trim(),
      correct: truthy(o.correct ?? o.isCorrect),
      why: String(o.why ?? o.rationale ?? o.explanation ?? "").trim(),
    }));
    if (opts.some((o) => !o.text)) return reject("An option is blank");
    let nRight = opts.filter((o) => o.correct).length;
    if (nRight === 0) {
      const key = it.answer ?? it.correct ?? it.correctIndex ?? it.answerIndex;
      const k = typeof key === "number" ? key : LETTERS.indexOf(String(key ?? "").trim().toUpperCase());
      if (k >= 0 && k < 4) {
        opts = opts.map((o, i) => ({ ...o, correct: i === k }));
        rec.repairs.push("answer key taken from a separate field");
        nRight = 1;
      }
    }
    rec.checks.single_key = nRight === 1;
    if (nRight === 0) return reject("No option marked correct");
    if (nRight > 1) return reject(nRight + " options marked correct — ambiguous key");
    const distinct = new Set(opts.map((o) => norm(o.text).replace(/[^a-z0-9 ]/g, "").trim()));
    rec.checks.distinct_options = distinct.size === 4;
    if (distinct.size !== 4) return reject("Two options are the same");
    const stem = String(it.stem ?? it.question ?? "").trim();
    if (!stem) return reject("No question text");
    /* a stem cut off mid-sentence (e.g. by a double quote inside JSON) */
    rec.checks.stem_complete = /[?:]['"\u2019\u201D)\]]*$/.test(stem) && stem.split(/\s+/).length >= 4;
    if (!rec.checks.stem_complete) return reject("Question text looks cut off (it does not end with a question mark)");
    rec.item = {
      level,
      skill: String(it.skill ?? "").trim(),
      stem,
      options: opts,
      hint: String(it.hint ?? "").trim(),
      anchor: String(it.anchor ?? "").trim(),
      anchor2: String(it.anchor2 ?? "").trim(),
      link: String(it.link ?? "").trim(),
      keyword: String(it.keyword ?? "").trim(),
      keyword_meaning: String(it.keyword_meaning ?? "").trim(),
      guide: String(it.guide ?? "").trim(),
      takeaway: String(it.takeaway ?? "").trim(),
    };
    return rec;
  });
}

/* Words are clickable; punctuation and spacing are not. */
function Words({ text, onWord, style }) {
  if (!onWord) return <>{text}</>;
  const parts = String(text).split(/([A-Za-z][A-Za-z'\u2019-]*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^[A-Za-z]/.test(p) && p.length > 2 ? (
          <span
            key={i}
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              const sel = String(window.getSelection?.() || "").trim();
              onWord(sel && sel.length > p.length && sel.length < 60 ? sel : p, text);
            }}
            style={{ cursor: "pointer", borderBottom: "1px dotted rgba(90,107,123,0.45)", ...style }}
          >
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

const norm = (s) => String(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ");

/* The model is asked to copy the anchor verbatim; it sometimes doesn't.
   Exact match first, then the line sharing the most distinctive words. */
function findAnchor(lines, anchor) {
  if (!anchor) return null;
  const a = norm(anchor);
  for (let i = 0; i < lines.length; i++) {
    const idx = norm(lines[i]).indexOf(a);
    if (idx > -1) return { line: i, exact: true, needle: a };
  }
  /* v10.4: a span shortened with "..." or "…" — every piece, in order, in one line */
  const pieces = a.split(/\s*(?:\.\.\.|\u2026)\s*/).map((x) => x.trim()).filter((x) => x.length >= 3);
  if (pieces.length > 1)
    for (let i = 0; i < lines.length; i++) {
      const nl = norm(lines[i]);
      let from = 0;
      const ok = pieces.every((pc) => {
        const k = nl.indexOf(pc, from);
        if (k === -1) return false;
        from = k + pc.length;
        return true;
      });
      if (ok) return { line: i, exact: true, needle: pieces[0], pieces, ellipsis: true };
    }
  const words = a.split(" ").filter((w) => w.length > 4);
  if (words.length < 2) return null;
  let best = { line: -1, score: 0 };
  lines.forEach((l, i) => {
    const nl = norm(l);
    const score = words.filter((w) => nl.includes(w)).length / words.length;
    if (score > best.score) best = { line: i, score };
  });
  return best.score >= 0.6 ? { line: best.line, exact: false, needle: a } : null;
}

/* ------------------------ Sections & paragraphs ---------------------- *
 * The hint ladder points at a section, then a paragraph — never at the
 * sentence until the last step. So the passage needs a stable structure.
 * Sections come from headings when the text has them; otherwise the text
 * is cut into ~250-word chunks at paragraph breaks.                       */

const isListLine = (l) => /^\s*([-*•]|\d+[.)])\s+/.test(l);
const isMdHeading = (l) => /^#{1,6}\s/.test(l.trim()) || /^\*\*[^*]+\*\*:?\s*$/.test(l.trim());

function looksLikeHeading(lines, i) {
  const t = lines[i].replace(/\*\*/g, "").trim();
  if (!t || t.length > 80) return false;
  if (/^[-*•>|`]/.test(t)) return false;
  if (/[.,;:?!]$/.test(t)) return false;
  if (t.split(/\s+/).length > 10) return false;
  const prevBlank = i === 0 || !lines[i - 1].trim();
  /* body text follows within two lines (headings are often followed by a blank line) */
  const nextHasText = [1, 2].some((d) => i + d < lines.length && !!lines[i + d].trim());
  return prevBlank && nextHasText;
}

function wordCount(s) {
  return (String(s).match(/\S+/g) || []).length;
}

function buildStructure(passage) {
  const lines = passage.split("\n");
  const md = lines.map(isMdHeading);
  const soft = lines.map((_, i) => !md[i] && looksLikeHeading(lines, i));
  const useMd = md.some(Boolean);
  const softCount = soft.filter(Boolean).length;
  const heading = lines.map((_, i) => md[i] || (!useMd && softCount >= 2 && soft[i]));
  const hasHeadings = heading.some(Boolean);

  /* paragraphs: one per non-empty line, except consecutive list lines join up */
  const paraStart = new Array(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (!l.trim() || heading[i]) return;
    const prev = i > 0 ? lines[i - 1] : "";
    const continuesList = isListLine(l) && prev.trim() && !heading[i - 1] && isListLine(prev);
    if (!continuesList) paraStart[i] = true;
  });

  /* sections */
  const sectionStart = new Array(lines.length).fill(false);
  if (hasHeadings) {
    lines.forEach((_, i) => {
      if (heading[i]) sectionStart[i] = true;
    });
  } else {
    /* never cut a section after a lead-in ("…you can report:") or inside a
       list — pasted lists often lose their "-" marks, so short unpunctuated
       lines in a row count as a list too */
    const listy = (l) => {
      const t = l.trim();
      return isListLine(t) || (wordCount(t) <= 18 && !/[.?!]["”')]?$/.test(t));
    };
    let words = 0;
    let prevText = "";
    lines.forEach((l, i) => {
      const t = l.trim();
      const blocked = /:\s*$/.test(prevText) || (listy(t) && listy(prevText));
      if (paraStart[i] && words >= 250 && !blocked) {
        sectionStart[i] = true;
        words = 0;
      }
      words += wordCount(l);
      if (t) prevText = t;
    });
  }
  const firstText = lines.findIndex((l) => l.trim());
  if (firstText > -1) sectionStart[firstText] = true;

  const sections = [];
  const sectionOf = new Array(lines.length).fill(-1);
  const paraOf = new Array(lines.length).fill(0);
  let cur = -1;
  let para = 0;
  lines.forEach((l, i) => {
    if (sectionStart[i]) {
      cur = sections.length;
      para = 0;
      sections.push({
        n: cur + 1,
        start: i,
        title: heading[i] ? l.replace(/^#{1,6}\s/, "").replace(/\*\*/g, "").replace(/:\s*$/, "").trim() : "",
        words: 0,
      });
    }
    if (cur === -1) return;
    sectionOf[i] = cur;
    if (paraStart[i]) para += 1;
    if (l.trim() && !heading[i]) paraOf[i] = para;
    sections[cur].words += wordCount(l);
  });

  /* a tiny trailing chunk (no headings) merges into the one before it */
  if (!hasHeadings && sections.length > 1 && sections[sections.length - 1].words < 100) {
    const last = sections.pop();
    const prev = sections[sections.length - 1];
    let offset = 0;
    lines.forEach((_, i) => {
      if (sectionOf[i] === prev.n - 1) offset = Math.max(offset, paraOf[i]);
    });
    lines.forEach((_, i) => {
      if (sectionOf[i] === last.n - 1) {
        sectionOf[i] = prev.n - 1;
        if (paraOf[i]) paraOf[i] += offset;
      }
    });
    prev.words += last.words;
  }

  sections.forEach((s) => (s.paras = 0));
  lines.forEach((_, i) => {
    if (sectionOf[i] > -1) sections[sectionOf[i]].paras = Math.max(sections[sectionOf[i]].paras, paraOf[i]);
  });

  return { lines, heading, sections, sectionOf, paraOf, sectionStart: sections.map((s) => s.start) };
}

function sectionLabel(sec) {
  return sec ? "Section " + sec.n + (sec.title ? " · " + sec.title : "") : "";
}

/* Where an item's evidence sits: section, paragraph, line, and a sort key. */
function locate(structure, anchor) {
  const hit = findAnchor(structure.lines, anchor);
  if (!hit) return null;
  const s = structure.sectionOf[hit.line];
  const charIdx = hit.exact ? norm(structure.lines[hit.line]).indexOf(hit.needle) : 0;
  return {
    ...hit,
    section: s > -1 ? structure.sections[s] : null,
    para: structure.paraOf[hit.line] || 0,
    sortKey: hit.line * 100000 + Math.max(0, charIdx),
  };
}

/* The hint ladder: coarse to fine. The evidence is shown only at the last
   step, never before. Steps without content (a model that skipped the
   key word or guide) are left out rather than shown blank. */
/* ----------------------------- Validator ---------------------------- *
 * Code-level checks on every generated item, before the learner sees it.
 * A rejected item is regenerated; the rejection is recorded for the paper. */

const STOP = new Set("the a an of to in on for and or but is are was were be by with as at from that this these those it its into than then so if not no can may must will would should could have has had do does".split(" "));
const contentWords = (t) => norm(t).replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/* Returns { checks, reasons, anchor_loc, anchor2_loc, anchor_match }.
   checks: true = pass, false = fail, null = not applicable. Heuristics are
   documented in VALIDATOR.md; passing them is NOT evidence of PIRLS validity. */
function checkItem(item, structure, { l3Strict = true } = {}) {
  const checks = {};
  const reasons = [];
  const loc = (w) => (w ? { section: w.section?.n ?? null, para: w.para || null, line: w.line, exact: w.exact } : null);

  /* every level: the first evidence span must be found in the passage */
  const a = item.anchor ? locate(structure, item.anchor) : null;
  checks.anchor_found = !!a;
  if (!a) reasons.push(item.anchor ? "Evidence span not found in the passage" : "No evidence span given");

  /* v10.4: planning labels ("Q2", "quarter 3") must never reach the reader, in any field */
  const QLABEL = /\bQ[1-4]\b|\bquarters?\s*[1-4]\b|\bquarter (one|two|three|four)\b/i;
  const shown = [item.stem, item.link, item.hint, item.guide, item.takeaway, item.keyword_meaning, ...(item.options || []).flatMap((o) => [o.text, o.why])];
  checks.no_planning_labels = !shown.some((t) => QLABEL.test(String(t || "")));
  if (!checks.no_planning_labels) reasons.push("Mentions a quarter label (Q1–Q4), which is for planning only");

  /* v10.4: if the stem names a section ("the final section", "Section 3"), the evidence must be there */
  checks.location_consistent = null;
  if (a && a.section) {
    const sections = structure.sections || [];
    const problem = stemLocationProblem(item.stem, a.section.n, sections.length);
    checks.location_consistent = !problem;
    if (problem) {
      /* for process 3 the named section may hold the second span instead */
      const b2 = item.anchor2 ? locate(structure, item.anchor2) : null;
      const ok2 = b2?.section && !stemLocationProblem(item.stem, b2.section.n, sections.length);
      if (ok2) checks.location_consistent = true;
      else reasons.push(problem);
    }
  }

  /* processes 2–4: the answer must not simply be printed in one sentence */
  checks.not_copied = null;
  if (item.level >= 2) {
    const right = item.options.find((o) => o.correct)?.text || "";
    const cw = contentWords(right);
    if (cw.length >= 4) {
      const best = Math.max(
        ...structure.lines.map((l) => {
          const lw = new Set(contentWords(l));
          return cw.filter((w) => lw.has(w)).length / cw.length;
        })
      );
      checks.not_copied = best < 0.85;
      if (!checks.not_copied) reasons.push("Answer copied from one sentence — that is retrieval, not process " + item.level);
    } else checks.not_copied = true;
  }

  checks.anchor2_found = checks.anchor2_distinct = checks.cross_paragraph = checks.not_combo_grid = null;
  let b = null;
  if (item.level === 3) {
    const halves = item.options.map((o) => o.text.split(/\s+and\s+/i));
    checks.not_combo_grid = true;
    if (halves.every((h) => h.length === 2)) {
      const firsts = new Set(halves.map((h) => contentWords(h[0]).slice(0, 4).join(" ")));
      const seconds = new Set(halves.map((h) => contentWords(h[1]).slice(0, 4).join(" ")));
      if (firsts.size <= 2 && seconds.size <= 2) {
        checks.not_combo_grid = false;
        reasons.push("Options are an A-and-B combination grid");
      }
    }
    b = item.anchor2 ? locate(structure, item.anchor2) : null;
    checks.anchor2_found = !!b;
    if (!b) reasons.push(item.anchor2 ? "Second evidence span not found in the passage" : "Process 3 without a second evidence span");
    if (a && b) {
      checks.anchor2_distinct = !(a.line === b.line && norm(item.anchor) === norm(item.anchor2));
      if (!checks.anchor2_distinct) reasons.push("Both evidence spans are the same text");
      const samePara = a.section?.n === b.section?.n && a.para === b.para;
      checks.cross_paragraph = !samePara;
      /* design constraint for this experiment, not a PIRLS rule */
      if (samePara && l3Strict) reasons.push("Both evidence spans are in the same paragraph (strict mode)");
    }
  }

  return {
    checks,
    reasons,
    anchor_loc: loc(a),
    anchor2_loc: loc(b),
    anchor_match: a ? (a.exact ? "exact" : "fuzzy") : "none",
  };
}

/* v10.4 hint ladder: help with THINKING first, location only as a last resort.
   A location hint turns reading into search, so it comes last, names the
   section(s) only (both for process 3), and is labelled strong help.
   The exact sentence is never shown before answering; after answering it is
   shown as feedback. */
const STRATEGY = {
  1: "The answer is stated in the text. First decide what kind of detail the question wants: a number, a name, a place, a time or a reason. Then look for that kind of detail.",
  2: "The answer is not stated in one place. What do the nearby sentences suggest when you put them together?",
  3: "This question joins ideas from two different parts of the text. Which two ideas does it ask you to connect, and how are they related?",
  4: "This question asks you to judge the text, not just find something in it. Think about how strong the evidence is, what is missing, or why the writer chose these words.",
};
function hintSteps(item, where, where2) {
  /* strategy → guiding question → where to look (strong help) → key word.
     The key word comes last: it is taken from the evidence sentence, so it
     can't be answered without knowing where it is, and searching for it
     would lead straight to the evidence. */
  const steps = [{ kind: "strategy" }];
  if (item.guide) steps.push({ kind: "guide" });
  if (where?.section) steps.push({ kind: "section" });
  else if (item.hint) steps.push({ kind: "locator" });
  if (item.keyword) steps.push({ kind: "keyword" });
  return steps;
}
const LOCATION_KINDS = ["section", "locator", "paragraph", "evidence"];

function splitTranscript(text) {
  const lines = text.split("\n");
  let uStart = -1;
  let cStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim().toLowerCase().replace(/[*_#]/g, "");
    if (uStart === -1 && /^(user|human|me)\s*:?\s*$/.test(l)) uStart = i;
    if (cStart === -1 && /^(claude|assistant|ai)\s*:?\s*$/.test(l)) cStart = i;
  }
  if (uStart !== -1 && cStart !== -1 && cStart > uStart) {
    return {
      prompt: lines.slice(uStart + 1, cStart).join("\n").trim(),
      passage: lines.slice(cStart + 1).join("\n").trim(),
    };
  }
  return null;
}

/* --------------------------- Fragments --------------------------- */

function Fonts() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&family=Public+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap');
.ql-focus:focus-visible { outline: 2px solid ${C.teal}; outline-offset: 2px; }
.ql-bubble { transition: transform .18s ease, background-color .18s ease, border-color .18s ease; }
.ql-choose:not(:disabled):hover .ql-bubble { transform: scale(1.1); background: #16202b; color: #fff; }
@media (prefers-reduced-motion: reduce) { .ql-bubble { transition: none; } .ql-choose:hover .ql-bubble { transform: none; } }
textarea::placeholder { color: ${C.mute}; }
`}</style>
  );
}

function Eyebrow({ children, color }) {
  return (
    <div
      style={{
        fontFamily: F.mono,
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: color || C.mute,
      }}
    >
      {children}
    </div>
  );
}

/* The climb: four rungs, each sitting higher than the last. */
function Climb({ counts, answered, current }) {
  return (
    <div className="flex items-end gap-1 sm:gap-3 w-full">
      {LEVELS.map((L, li) => {
        const total = counts[li];
        const done = answered[li + 1] || 0;
        const active = current === li + 1;
        const lift = (3 - li) * 9;
        return (
          <div key={L.n} className="flex-1" style={{ marginBottom: 0, paddingBottom: lift }}>
            <div className="flex items-center gap-1 mb-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: i < done ? C.teal : "transparent",
                    border: `1px solid ${i < done ? C.teal : C.line}`,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                height: 3,
                background: active ? C.amber : done === total && total > 0 ? C.teal : C.line,
                borderRadius: 2,
              }}
            />
            <div
              className="mt-1.5 truncate"
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: active ? C.ink : C.mute,
                fontWeight: active ? 700 : 400,
              }}
            >
              <span className="hidden sm:inline">{L.n} · {L.name}</span>
              <span className="sm:hidden">{L.n}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* focus: "none" | "section" | "paragraph" | "sentence" — how much of the
   evidence location the learner has earned so far. */
/* where a key word sits in a line: case-insensitive, flexible spaces, any ending ("log" → "logs") */
function keywordSpans(line, kw) {
  const words = String(kw || "").replace(/["“”‘’]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("\\b" + words.map(esc).join("[\\s-]+") + "[\\w'-]*", "gi");
  const out = [];
  let m;
  while ((m = re.exec(line))) {
    out.push({ from: m.index, to: m.index + m[0].length });
    if (!m[0]) re.lastIndex++;
  }
  return out;
}

function PassagePanel({ prompt, structure, compact, where, where2, focus, keyword = "", onWord, onSelect }) {
  const { lines, heading, sectionOf, paraOf, sections } = structure;
  const hit = focus === "none" || !where ? null : where;
  /* v10.4: process 3 — the second place is shown at every step, like the first */
  const hit2 = hit && where2 ? where2 : null;
  const box = useRef(null);
  const lineEls = useRef({});

  /* key-word hint (the last step): mark the word where the evidence is.
     Evidence line(s) first; if the word is not there, its place in the section. */
  const kwLines = useMemo(() => {
    if (!keyword || !hit || focus === "sentence") return new Set();
    const strip = (l) => l.replace(/\*\*/g, "");
    const ev = [hit, hit2].filter(Boolean).map((h) => h.line).filter((i) => keywordSpans(strip(lines[i]), keyword).length);
    if (ev.length) return new Set(ev);
    const secs = new Set([hit, hit2].filter((h) => h && h.section).map((h) => h.section.n - 1));
    return new Set(lines.map((_, i) => i).filter((i) => secs.has(sectionOf[i]) && keywordSpans(strip(lines[i]), keyword).length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, hit?.line, hit2?.line, focus, lines]);

  const inSec1 = (h, i) => h && h.section && sectionOf[i] === h.section.n - 1;
  const inSection = (i) => inSec1(hit, i) || inSec1(hit2, i);
  const inPara = (i) => (inSec1(hit, i) && hit.para && paraOf[i] === hit.para) || (inSec1(hit2, i) && hit2.para && paraOf[i] === hit2.para);

  /* bring the earned location into view — the section start, the paragraph, or the evidence line */
  useEffect(() => {
    if (!hit || !box.current) return;
    let target = hit.line;
    if (focus === "section" && hit.section) target = hit.section.start;
    if (focus === "paragraph" && hit.para) target = lines.findIndex((_, i) => inPara(i));
    if (kwLines.size) target = Math.min(...kwLines);
    const el = lineEls.current[target];
    if (el) box.current.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, hit?.line, hit?.section?.n, hit?.para, kwLines]);

  const renderLine = (line, i) => {
    /* v10.4: evidence is marked at SENTENCE level — the 1–3 sentences that
       hold it, in bold — never the whole paragraph */
    const spans = focus === "sentence" ? evidenceSpans(line, [hit, hit2].filter((h) => h && h.line === i)) : [];
    let kws = !spans.length && kwLines.has(i) ? keywordSpans(line, keyword) : [];
    /* on an evidence line, only the word inside the evidence sentence(s) */
    const evHere = kws.length ? evidenceSpans(line, [hit, hit2].filter((h) => h && h.line === i)) : [];
    const inEv = kws.filter((m) => evHere.some((e) => m.from >= e.from && m.to <= e.to));
    if (inEv.length) kws = inEv;
    if (kws.length) {
      const parts = [];
      let pos = 0;
      kws.forEach((m, k) => {
        if (m.from > pos) parts.push(<Words key={"t" + k} text={line.slice(pos, m.from)} onWord={onWord} />);
        parts.push(
          <mark key={"k" + k} data-keyword="1" style={{ background: C.amber, color: C.ink, fontWeight: 700, padding: "1px 3px", borderRadius: 2 }}>
            <Words text={line.slice(m.from, m.to)} onWord={onWord} />
          </mark>
        );
        pos = m.to;
      });
      parts.push(<Words key="end" text={line.slice(pos)} onWord={onWord} />);
      return <>{parts}</>;
    }
    if (spans.length) {
      const parts = [];
      let pos = 0;
      spans.forEach((m, k) => {
        if (m.from > pos) parts.push(<Words key={"t" + k} text={line.slice(pos, m.from)} onWord={onWord} />);
        parts.push(
          <mark key={"m" + k} data-evidence="1" style={{ background: C.amberSoft, color: C.ink, fontWeight: 700, padding: "1px 2px", borderRadius: 2, boxShadow: `inset 0 -2px 0 ${C.amber}` }}>
            <Words text={line.slice(m.from, m.to)} onWord={onWord} />
          </mark>
        );
        pos = m.to;
      });
      parts.push(<Words key="end" text={line.slice(pos)} onWord={onWord} />);
      return <>{parts}</>;
    }
    return <Words text={line} onWord={onWord} />;
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-sm overflow-hidden">
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}`, background: C.amberSoft }}>
        <Eyebrow color={C.slate}>You asked</Eyebrow>
        <p className="mt-1" style={{ fontFamily: F.read, fontSize: 15, color: C.ink, lineHeight: 1.45 }}>
          {prompt ? (prompt.length > 260 ? prompt.slice(0, 260) + "…" : prompt) : "—"}
        </p>
      </div>
      {hit && (
        <div className="px-4 py-2" style={{ borderBottom: `1px solid ${C.line}`, background: C.tealSoft }}>
          <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal }}>
            {(() => {
              const short = (h) => sectionLabel(h.section).split(" · ")[0];
              const places = [hit, hit2].filter((h) => h && h.section).sort((a, b) => a.section.n - b.section.n || a.para - b.para);
              if (focus === "sentence") return places.length > 1 ? "Both pieces of evidence marked" : "Evidence marked";
              if (focus === "paragraph") return "Narrowed to " + places.map((h) => short(h) + ", paragraph " + (h.para || 1)).join(" and ");
              const secs = [...new Set(places.map((h) => sectionLabel(h.section)))];
              return "Narrowed to " + secs.join(" and ") + (kwLines.size ? " · key word marked" : "");
            })()}
          </span>
        </div>
      )}
      <div
        ref={box}
        className="px-4 py-4 overflow-y-auto"
        onMouseUp={() => {
          const t = String(window.getSelection?.() || "").trim();
          if (t.length > 2 && t.length < 1500 && onSelect) onSelect(t);
        }}
        style={{ maxHeight: compact ? 340 : "calc(100vh - 220px)", position: "relative" }}
      >
        {lines.map((raw, i) => {
          const line = raw.replace(/\*\*/g, "");
          const secIdx = sections.findIndex((s) => s.start === i);
          const marker =
            secIdx > -1 ? (
              <div
                className={secIdx === 0 ? "mb-1" : "mt-5 mb-1"}
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: inSection(i) ? C.teal : C.mute,
                  fontWeight: inSection(i) ? 700 : 400,
                }}
              >
                Section {secIdx + 1}
              </div>
            ) : null;
          if (!line.trim()) return <div key={i} style={{ height: 10 }} />;
          const isHead = heading[i];
          const isCode = /^\s*(\||```|\s{4})/.test(line);
          const sectionBand = focus === "section" && inSection(i);
          const paraBand = focus === "paragraph" && inPara(i);
          const evidenceLine = focus === "sentence" && [hit, hit2].some((h) => h && h.line === i);
          if (isHead)
            return (
              <div key={i} ref={(el) => (lineEls.current[i] = el)}>
                {marker}
                <p
                  className="mb-1"
                  style={{
                    fontFamily: F.ui,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: C.teal,
                    borderLeft: sectionBand ? `3px solid ${C.teal}` : "3px solid transparent",
                    paddingLeft: 8,
                  }}
                >
                  {line.replace(/^#{1,6}\s/, "").replace(/:\s*$/, "")}
                </p>
              </div>
            );
          return (
            <div key={i} ref={(el) => (lineEls.current[i] = el)}>
              {marker}
              <p
                style={{
                  fontFamily: isCode ? F.mono : F.read,
                  fontSize: isCode ? 12 : 15.5,
                  lineHeight: isCode ? 1.5 : 1.6,
                  color: isCode ? C.slate : C.ink,
                  whiteSpace: "pre-wrap",
                  margin: "2px 0",
                  background: paraBand ? C.amberSoft : "transparent",
                  borderLeft: evidenceLine || paraBand
                    ? `3px solid ${C.amber}`
                    : sectionBand
                    ? `3px solid ${C.teal}`
                    : "3px solid transparent",
                  paddingLeft: 8,
                }}
              >
                {renderLine(line, i)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Research log — every run, call and candidate (accepted and rejected). */
function ResearchExport({ style }) {
  const [sum, setSum] = useState(null);
  const [inspect, setInspect] = useState(false);
  useEffect(() => setSum(logSummary()), [inspect]);
  if (!sum || !sum.runs) return null;
  const b = { fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" };
  return (
    <div className="flex items-center gap-4 flex-wrap" style={style}>
      <span style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
        Research log: {sum.runs} run{sum.runs === 1 ? "" : "s"} · {sum.candidates} candidates ({sum.accepted} accepted, {sum.rejected} rejected)
        {sum.shortfalls ? ` · ${sum.shortfalls} shortfall${sum.shortfalls === 1 ? "" : "s"}` : ""}
      </span>
      <button className="ql-focus" style={b} onClick={exportCandidatesCSV}>Candidates (CSV)</button>
      <button className="ql-focus" style={b} onClick={() => exportLogJSON()}>Full log (JSON)</button>
      <button className="ql-focus" style={b} onClick={exportReadingCSV}>Focus reading (CSV)</button>
      <button className="ql-focus" style={b} onClick={exportWrittenCSV}>Written answers (CSV)</button>
      <button className="ql-focus" style={b} onClick={exportRatingsCSV}>Self-ratings (CSV)</button>
      <button className="ql-focus" style={b} onClick={() => setInspect(true)}>Inspect candidates</button>
      {inspect && <Inspector onClose={() => setInspect(false)} />}
    </div>
  );
}

/* Flag report — the dispute log across all passages, for the paper. */
function FlagExport({ style }) {
  const [n, setN] = useState(0);
  const [ag, setAg] = useState({ rated: 0, agree: 0 });
  useEffect(() => {
    setN(loadFlags().length);
    setAg(agreement());
  }, []);
  if (!n) return null;
  const b = { fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" };
  return (
    <div className="flex items-center gap-4 flex-wrap" style={style}>
      <span style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
        ⚑ {n} flagged question{n === 1 ? "" : "s"}
        {ag.rated > 0 && ` · you rated ${ag.rated} · AI agreed with you on ${ag.agree}`}
      </span>
      <button className="ql-focus" style={b} onClick={exportFlagsCSV}>Download report (CSV)</button>
      <button className="ql-focus" style={b} onClick={exportFlagsJSON}>JSON</button>
    </div>
  );
}

/* "Clean up PDF text" — offered under the paste box; highlighted when the
   pasted text looks like it came out of a PDF. One-step undo. */
function CleanButton({ value, onChange }) {
  const [undo, setUndo] = useState(null);
  const [msg, setMsg] = useState("");
  const suspect = looksLikePdfPaste(value);
  if (!value.trim()) return null;
  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <button
        onClick={() => {
          const cleaned = cleanPdfText(value);
          setUndo(value);
          onChange(cleaned);
          setMsg("Cleaned — " + cleaned.split("\n\n").length + " paragraphs. Check it reads properly.");
        }}
        className="ql-focus px-3 py-1.5"
        style={{
          fontFamily: F.ui,
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 2,
          border: `1px solid ${suspect ? C.teal : C.line}`,
          background: suspect ? C.teal : C.card,
          color: suspect ? C.card : C.slate,
        }}
      >
        Clean up PDF text
      </button>
      {suspect && !undo && (
        <span style={{ fontFamily: F.ui, fontSize: 12, color: C.teal }}>
          This looks like it was copied from a PDF — broken lines and split words.
        </span>
      )}
      {msg && <span style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>{msg}</span>}
      {undo != null && (
        <button
          onClick={() => {
            onChange(undo);
            setUndo(null);
            setMsg("");
          }}
          className="ql-focus"
          style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, textDecoration: "underline" }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/* ----------------------------- Setup ----------------------------- */

const SAMPLE_PROMPT =
  "I want to build a paper trade system for forex. It has to be like the SoFi account, simulate trading cost, store my trading history, connect to real forex data (free of charge), and I want a forex equivalent of the stock VCP scanner with buy price and stop loss.";

const SAMPLE_PASSAGE = `## First, the honest answer on Yahoo Finance

Don't use it as your trading feed. Yahoo's FX quotes are delayed, volume comes back as zero, daily history only starts around December 2003, and yfinance is an unofficial scraper that breaks without warning. For a paper-trading engine you need bid and ask — otherwise you can't simulate spread, which is 80% of your real cost in forex.

Use an OANDA v20 practice account instead. It's free, no deposit: candles return separate bid, mid and ask OHLC plus tick volume, historical candles go back to about 2005 at 5,000 per request, and the instrument endpoint exposes financing rates so carry costs can be real rather than invented. Twelve Data's free tier (8 calls/min, 800/day) is a backup, but 800 calls/day dies fast if you poll 28 pairs.

## Simulating trading cost properly

Model all four. Spread: fill buys at ask, sells at bid, never at mid. Slippage: 0.2–0.5 pips on market orders, 1–3 pips against you on stops, more during news. Swap: charged daily at 17:00 New York, triple on Wednesday. Commission: optional, about $3.50 per 100k units per side on a raw-spread broker.

## The forex equivalent of VCP

VCP needs volume dry-up, and forex has no true volume. But the structure — successive tighter contractions before an expansion — translates. Volume becomes tick volume, which correlates about 0.85–0.9 with real futures volume. Relative strength becomes currency strength ranking: rank the 8 majors by average % change across their 7 crosses, then trade the strongest base against the weakest quote. Contraction is measured with ATR(14) ÷ price as a percentile against the last 100 bars, flagged below the 20th percentile.

Entry: pivot_high + (0.10 × ATR14) + current spread. The spread add-on is non-negotiable — a breakout by 1 pip with a 1.5-pip spread is not a breakout. Stop: the tighter of the final contraction low − 0.25 ATR, or entry − 1.5 × ATR(14), never wider than 2 ATR. Size: units = (equity × risk%) ÷ (stop distance in pips × pip value). Fix risk at 0.5–1%.

One structural caveat: forex trends are choppier and more mean-reverting than leading growth stocks, so VCP breakouts have a lower hit rate here. Build in this order — data ingest, then the fill engine and ledger, then the scanner, then the app screen. A pretty app on a wrong fill engine teaches you bad habits.`;

function Setup({ onStart, onResume }) {
  const [mode, setMode] = useState("split");
  const [prompt, setPrompt] = useState("");
  const [passage, setPassage] = useState("");
  const [whole, setWhole] = useState("");
  const [err, setErr] = useState("");
  const [past, setPast] = useState([]);
  const [where, setWhere] = useState("");
  const [meta, setMeta] = useState({ title: "", source: "", licence: "" });
  const [focusFirst, setFocusFirst] = useState(() => {
    try {
      return localStorage.getItem("ql:focusFirst") !== "off";
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    listSessions()
      .then((list) =>
        setPast([...list].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))))
      )
      .catch(() => setPast([]));
    whereSaved()
      .then(setWhere)
      .catch(() => setWhere("this browser only"));
  }, []);

  const go = (planKey) => {
    let p = prompt;
    let a = passage;
    if (mode === "whole") {
      const split = splitTranscript(whole);
      if (!split) {
        setErr("No 'User:' and 'Claude:' markers found. Switch to two boxes and paste each part.");
        return;
      }
      p = split.prompt;
      a = split.passage;
    }
    if (a.trim().length < 400) {
      setErr("Paste a longer reply — under about 400 characters there isn't enough to build a climb from.");
      return;
    }
    setErr("");
    onStart({ prompt: p.trim(), passage: a.trim(), plan: PLANS[planKey], meta: { ...meta }, focusFirst });
  };

  const box = {
    fontFamily: F.ui,
    fontSize: 14,
    lineHeight: 1.55,
    color: C.ink,
    background: C.card,
    border: `1px solid ${C.line}`,
    borderRadius: 2,
    padding: "12px 14px",
    width: "100%",
    resize: "vertical",
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-10 sm:py-16">
      <Eyebrow>PIRLS 1–4 · PISA aspects</Eyebrow>
      <h1
        className="mt-3"
        style={{ fontFamily: F.read, fontSize: 46, lineHeight: 1.05, color: C.ink, fontWeight: 600 }}
      >
        Read it by answering it.
      </h1>
      <p className="mt-3 max-w-xl" style={{ fontFamily: F.ui, fontSize: 16, color: C.slate, lineHeight: 1.6 }}>
        Paste a conversation. You get a climb of questions that start with finding facts and end with
        judging the answer — one question per screen, with the passage beside you.
      </p>

      <div className="mt-8 flex gap-1" role="tablist">
        {[
          ["split", "Two boxes"],
          ["whole", "Whole transcript"],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className="ql-focus px-3 py-2"
            style={{
              fontFamily: F.mono,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: mode === k ? C.ink : "transparent",
              color: mode === k ? C.card : C.slate,
              border: `1px solid ${mode === k ? C.ink : C.line}`,
              borderRadius: 2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-5">
        {mode === "split" ? (
          <>
            <div>
              <label style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink }}>
                What you asked
              </label>
              <textarea
                className="ql-focus mt-2"
                style={{ ...box, minHeight: 90 }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Your prompt to the AI."
              />
            </div>
            <div>
              <label style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink }}>
                What Claude replied
              </label>
              <textarea
                className="ql-focus mt-2"
                style={{ ...box, minHeight: 220 }}
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                placeholder="The long reply you want to actually read — or text copied from a PDF."
              />
              <CleanButton value={passage} onChange={setPassage} />
            </div>
            <details>
              <summary style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
                Passage details for the research log
              </summary>
              <div className="mt-2 grid gap-2">
                {[
                  ["title", "Title"],
                  ["source", "Source (URL or citation)"],
                  ["licence", "Licence (e.g. CC BY 4.0)"],
                ].map(([k, label]) => (
                  <input
                    key={k}
                    className="ql-focus"
                    style={{ ...box, padding: "8px 12px" }}
                    placeholder={label}
                    aria-label={label}
                    value={meta[k]}
                    onChange={(e) => setMeta({ ...meta, [k]: e.target.value })}
                  />
                ))}
              </div>
            </details>
          </>
        ) : (
          <div>
            <label style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink }}>
              Paste the whole thing
            </label>
            <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate }}>
              Split on lines that read <span style={{ fontFamily: F.mono }}>User:</span> and{" "}
              <span style={{ fontFamily: F.mono }}>Claude:</span>
            </p>
            <textarea
              className="ql-focus mt-2"
              style={{ ...box, minHeight: 320 }}
              value={whole}
              onChange={(e) => setWhole(e.target.value)}
              placeholder={"User:\n\n…your prompt…\n\nClaude:\n\n…the reply…"}
            />
            <CleanButton value={whole} onChange={setWhole} />
          </div>
        )}
      </div>

      {err && (
        <p
          className="mt-4 px-3 py-2"
          style={{ fontFamily: F.ui, fontSize: 13, color: C.brick, background: C.brickSoft, borderRadius: 2 }}
        >
          {err}
        </p>
      )}

      <label
        htmlFor="focus-first"
        className="mt-7 flex items-start gap-3 px-3 py-3"
        style={{ background: focusFirst ? C.tealSoft : "transparent", border: `1px solid ${focusFirst ? C.teal : C.line}`, borderRadius: 2, cursor: "pointer" }}
      >
        <input
          id="focus-first"
          type="checkbox"
          checked={focusFirst}
          onChange={(e) => {
            setFocusFirst(e.target.checked);
            try {
              localStorage.setItem("ql:focusFirst", e.target.checked ? "on" : "off");
            } catch (err) {
              /* ignore */
            }
          }}
          style={{ marginTop: 3 }}
        />
        <span>
          <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: C.ink }}>Start with focus reading</span>
          <span className="block mt-0.5" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, lineHeight: 1.5 }}>
            The reader first reads the passage alone, with a timer, word meanings and a tutor for highlighted parts. The questions are written when she finishes, spread across the whole text, and some are built around what she asked about.
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {Object.values(PLANS).map((p) => (
          <button
            key={p.key}
            onClick={() => go(p.key)}
            className="ql-focus px-5 py-3 text-left"
            style={{
              background: p.key === "full" ? C.ink : "transparent",
              color: p.key === "full" ? C.card : C.ink,
              border: `1px solid ${C.ink}`,
              borderRadius: 2,
            }}
          >
            <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}>{p.label}</div>
            <div
              style={{
                fontFamily: F.mono,
                fontSize: 10,
                letterSpacing: "0.08em",
                opacity: 0.7,
                marginTop: 2,
              }}
            >
              {p.note}
            </div>
          </button>
        ))}
        <p className="w-full" style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>
          Numbers are questions per comprehension process, 1 → 4: retrieve · infer · interpret and integrate · evaluate.
        </p>
        <button
          onClick={() => {
            setMode("split");
            setPrompt(SAMPLE_PROMPT);
            setPassage(SAMPLE_PASSAGE);
            setErr("");
          }}
          className="ql-focus px-3 py-2"
          style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
        >
          Load a sample
        </button>
      </div>

      <div className="mt-14 pt-6" style={{ borderTop: `1px solid ${C.line}` }}>
        <ResearchExport style={{ marginBottom: 8 }} />
        <FlagExport style={{ marginBottom: 16 }} />
        <Eyebrow>Pick up where you left off</Eyebrow>
        <p className="mt-1 mb-3" style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>
          {where ? "Saved to " + where : "Checking where progress is saved…"}
        </p>
        {past.length === 0 && (
          <p
            className="px-4 py-3"
            style={{ fontFamily: F.ui, fontSize: 13, lineHeight: 1.55, color: C.slate, background: C.card, border: `1px dashed ${C.line}`, borderRadius: 2 }}
          >
            Nothing saved yet. Every passage you start is kept here with its date and time — leave
            one half-finished, add another, and come back to either. The last 20 are kept.
          </p>
        )}
        {past.length > 0 && (
          <div className="space-y-2">
            {past.map((p) => {
              const answered = Object.keys(p.answers || {}).length;
              const total = (p.plan?.counts || []).reduce((a, b) => a + b, 0);
              const correct = Object.values(p.answers || {}).filter((a) => a.correct).length;
              const done = total > 0 && answered >= total;
              return (
                <div key={p.id} className="px-4 py-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}>
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span style={{ fontFamily: F.read, fontSize: 16, color: C.ink, flex: "1 1 240px" }}>{p.title}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, whiteSpace: "nowrap" }}>
                      {answered}/{total} · {correct} right
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 flex-wrap">
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
                      {formatWhen(p.savedAt)} · {relativeWhen(p.savedAt)}
                    </span>
                    <span className="flex gap-3 items-center">
                      <button
                        onClick={() => onResume(p)}
                        className="ql-focus px-3 py-1.5"
                        style={{ background: C.ink, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 12, fontWeight: 700 }}
                      >
                        {done ? "Revise" : "Resume"}
                      </button>
                      <button
                        onClick={() => removeSession(p.id).then(setPast)}
                        className="ql-focus"
                        style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- Question --------------------------- */

function HintLadder({ item, where, where2, steps, hintLevel, onHint, contextLine, onGraded, savedGrade, readOnly }) {
  const [ownMeaning, setOwnMeaning] = useState("");
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState(null);
  const [gradeErr, setGradeErr] = useState("");

  /* coming back to a question restores what you wrote and how it was graded */
  useEffect(() => {
    setOwnMeaning(savedGrade?.text || "");
    setGrade(savedGrade ? { band: savedGrade.band || null, feedback: savedGrade.feedback || "", improve: savedGrade.improve || "" } : null);
    setGrading(false);
    setGradeErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const checkMeaning = async () => {
    setGrading(true);
    setGradeErr("");
    try {
      const raw = await ask(buildWordGradePrompt(item.keyword, contextLine || item.anchor, ownMeaning.trim(), item.stem), {
        maxTokens: 400,
        schema: WORD_GRADE_SCHEMA,
      });
      const d = parseJSON(raw);
      const band = GRADE_BANDS.find((b) => b.toLowerCase() === String(d.band || "").trim().toLowerCase());
      if (!band) throw new Error("no band");
      const g = { band, feedback: String(d.feedback || ""), improve: String(d.improve || "") };
      setGrade(g);
      onGraded && onGraded({ word: item.keyword, text: ownMeaning.trim(), band, feedback: g.feedback, improve: g.improve });
    } catch (e) {
      setGradeErr("Couldn't grade this time — here is the meaning so you can compare yourself.");
      setGrade({ band: null });
      onGraded && onGraded({ word: item.keyword, text: ownMeaning.trim(), band: null });
    }
    setGrading(false);
  };

  if (!steps.length) return null;
  const shown = steps.slice(0, hintLevel);
  const row = { fontFamily: F.ui, fontSize: 14, lineHeight: 1.5, color: C.ink };

  const render = (s, i) => {
    const tag = (
      <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.08em", color: LOCATION_KINDS.includes(s.kind) ? C.brick : C.slate, marginRight: 8 }}>
        HINT {i + 1}
        {LOCATION_KINDS.includes(s.kind) ? " · STRONG HELP" : ""}
      </span>
    );
    if (s.kind === "strategy") return <p style={row}>{tag}{STRATEGY[item.level] || STRATEGY[2]}</p>;
    if (s.kind === "section" && item.level === 3 && where2?.section)
      return where2.section.n === where.section.n ? (
        <p style={row}>{tag}This question joins two paragraphs of <strong>{sectionLabel(where.section)}</strong>. Read both.</p>
      ) : (
        <p style={row}>
          {tag}This question joins two parts of the text:{" "}
          <strong>{sectionLabel(where.section.n < where2.section.n ? where.section : where2.section)}</strong> and{" "}
          <strong>{sectionLabel(where.section.n < where2.section.n ? where2.section : where.section)}</strong>. Read both.
        </p>
      );
    if (s.kind === "section")
      return <p style={row}>{tag}Look in <strong>{sectionLabel(where.section)}</strong>.</p>;
    if (s.kind === "locator") return <p style={row}>{tag}{item.hint}</p>;
    if (s.kind === "paragraph" && item.level === 3 && where2?.section) {
      const [p, q] = (where.section.n < where2.section.n || (where.section.n === where2.section.n && where.para <= where2.para)) ? [where, where2] : [where2, where];
      return (
        <p style={row}>
          {tag}Focus on <strong>paragraph {p.para || 1}</strong> of Section {p.section.n} and <strong>paragraph {q.para || 1}</strong> of Section {q.section.n}. How do the two parts relate?
        </p>
      );
    }
    if (s.kind === "paragraph")
      return <p style={row}>{tag}Focus on <strong>paragraph {where.para}</strong> of Section {where.section?.n}.</p>;
    if (s.kind === "keyword")
      return (
        <div style={row}>
          <p>
            {tag}Think about <strong>“{item.keyword}”</strong>. What does it mean here?
          </p>
          <textarea
            className="ql-focus mt-2"
            rows={2}
            value={readOnly && !ownMeaning ? "(no explanation written)" : ownMeaning}
            disabled={!!grade || grading || readOnly}
            onChange={(e) => setOwnMeaning(e.target.value)}
            placeholder="Your own explanation first…"
            style={{ width: "100%", fontFamily: F.ui, fontSize: 14, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 2, background: C.card, color: C.ink }}
          />
          {grade ? (
            <div className="mt-2">
              {grade.band && (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: C.card,
                      background: BAND_COLOR[grade.band],
                      padding: "2px 8px",
                      borderRadius: 2,
                    }}
                  >
                    {grade.band}
                  </span>
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.mute }}>
                    {GRADE_BANDS.indexOf(grade.band) + 1} of 6 · Excellent → Unacceptable
                  </span>
                </div>
              )}
              {grade.feedback && <p className="mt-1" style={row}>{grade.feedback}</p>}
              {grade.improve && <p className="mt-1" style={{ ...row, color: C.slate }}>{grade.improve}</p>}
              {gradeErr && <p className="mt-1" style={{ ...row, color: C.brick }}>{gradeErr}</p>}
              <p className="mt-1" style={{ ...row, color: C.slate }}>In this text: {item.keyword_meaning || "—"}</p>
            </div>
          ) : readOnly ? (
            <p className="mt-1" style={{ ...row, color: C.slate }}>In this text: {item.keyword_meaning || "—"}</p>
          ) : (
            <button
              onClick={checkMeaning}
              disabled={ownMeaning.trim().length < 3 || grading}
              className="ql-focus mt-1"
              title={ownMeaning.trim().length < 3 ? "Write your own explanation first" : ""}
              style={{ fontFamily: F.ui, fontSize: 13, color: ownMeaning.trim().length < 3 ? C.mute : C.slate, textDecoration: "underline" }}
            >
              {grading ? "Checking your explanation…" : "Check my explanation"}
            </button>
          )}
        </div>
      );
    if (s.kind === "second")
      return (
        <p style={row}>
          {tag}Now connect it with <strong>{sectionLabel(where2.section)}</strong>
          {where2.para ? <>, paragraph {where2.para}</> : null}. How do the two parts relate?
        </p>
      );
    if (s.kind === "guide") return <p style={row}>{tag}{item.guide}</p>;
    if (s.kind === "evidence") return <p style={row}>{tag}The evidence is now marked in the passage.</p>;
    return null;
  };

  return (
    <div className="mt-3">
      {shown.length > 0 && (
        <div className="px-3 py-2 space-y-2" style={{ background: C.amberSoft, borderRadius: 2 }}>
          {shown.map((s, i) => (
            <div key={s.kind}>{render(s, i)}</div>
          ))}
        </div>
      )}
      {!readOnly && hintLevel < steps.length && (
        <button
          onClick={onHint}
          className="ql-focus mt-2"
          style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
        >
          {hintLevel === 0
            ? "I'm stuck — give me a hint"
            : LOCATION_KINDS.includes(steps[hintLevel]?.kind)
            ? "Show me where to look (strong help)"
            : "Next hint"}{" "}
          ({hintLevel + 1} of {steps.length})
        </button>
      )}
    </div>
  );
}

function Question({ item, slotNo, total, answer, onAnswer, onNext, onPrev, isLast, onWord, onAskCoach, where, where2, steps, hintLevel, onHint, contextLine, onGraded, savedGrade, passage, flagMeta, onFlagSaved }) {
  const L = LEVELS[item.level - 1];
  const answered = !!answer;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span>
          <Eyebrow color={C.teal}>
            {L.pirls}
          </Eyebrow>
          {item.focusKind === "vocab" && (
            <span className="block mt-1" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>
              A word you saved while reading · the sentence is marked in the passage
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-3" style={{ fontFamily: F.mono, fontSize: 11, color: C.mute, whiteSpace: "nowrap" }}>
          {slotNo > 1 && (
            <button onClick={onPrev} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, textDecoration: "underline" }}>
              ← Previous
            </button>
          )}
          {slotNo}/{total}
        </span>
      </div>

      <h2
        className="mt-4"
        style={{ fontFamily: F.read, fontSize: 26, lineHeight: 1.3, color: C.ink, fontWeight: 600 }}
      >
        <Words text={item.stem} onWord={onWord} />
      </h2>
      {onAskCoach && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 items-center" style={{ fontFamily: F.ui, fontSize: 13 }}>
          <button onClick={onAskCoach} className="ql-focus" style={{ color: C.teal, textDecoration: "underline", fontWeight: 600 }}>
            {answered ? (answer.correct ? "Ask the coach about this question" : "Ask the coach why my answer is wrong") : "What is this question asking?"}
          </button>
          <span style={{ color: C.mute }}>Tap any word in the question or the options to see its meaning.</span>
        </div>
      )}

      {!answered && (
        <HintLadder item={item} where={where} where2={where2} steps={steps} hintLevel={hintLevel} onHint={onHint} contextLine={contextLine} onGraded={onGraded} savedGrade={savedGrade} />
      )}
      {answered && answer.hints > 0 && (
        <div className="mt-2">
          <p style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
            Answered after {answer.hints} hint{answer.hints > 1 ? "s" : ""} — what you used:
          </p>
          <HintLadder item={item} where={where} where2={where2} steps={steps} hintLevel={answer.hints} contextLine={contextLine} savedGrade={answer.wordGrade} readOnly />
        </div>
      )}

      <div className="mt-5 space-y-2">
        {item.options.map((o, i) => {
          const chosen = answered && answer.choice === i;
          const isRight = o.correct;
          let border = C.line;
          let bg = C.card;
          let bubbleBg = "transparent";
          let bubbleBorder = C.line;
          let bubbleColor = C.slate;
          if (answered) {
            if (isRight) {
              border = C.teal;
              bg = C.tealSoft;
              bubbleBg = C.teal;
              bubbleBorder = C.teal;
              bubbleColor = C.card;
            } else if (chosen) {
              border = C.brick;
              bg = C.brickSoft;
              bubbleBg = C.brick;
              bubbleBorder = C.brick;
              bubbleColor = C.card;
            }
          }
          return (
            <div key={i}>
              <div
                className="ql-opt w-full flex items-stretch"
                style={{
                  background: bg,
                  border: `1px solid ${border}`,
                  borderRadius: 2,
                  opacity: answered && !isRight && !chosen ? 0.6 : 1,
                }}
              >
                {/* v10.4: only the letter chooses, so words in the option can be tapped for their meaning */}
                <button
                  onClick={() => !answered && onAnswer(i)}
                  disabled={answered}
                  aria-label={"Choose " + LETTERS[i]}
                  className="ql-choose ql-focus shrink-0 flex flex-col items-center justify-center"
                  style={{
                    width: 64,
                    minHeight: 56,
                    borderRight: `1px solid ${answered ? border : C.line}`,
                    background: answered ? "transparent" : C.paper,
                    cursor: answered ? "default" : "pointer",
                  }}
                >
                  <span
                    className="ql-bubble flex items-center justify-center"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      background: bubbleBg,
                      border: `2px solid ${answered ? bubbleBorder : C.ink}`,
                      color: answered ? bubbleColor : C.ink,
                      fontFamily: F.mono,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    {LETTERS[i]}
                  </span>
                  {!answered && (
                    <span style={{ fontFamily: F.ui, fontSize: 10, color: C.slate, marginTop: 3, letterSpacing: "0.04em" }}>choose</span>
                  )}
                </button>
                <span className="px-4 py-3 flex items-center" style={{ fontFamily: F.ui, fontSize: 15, lineHeight: 1.5, color: C.ink }}>
                  <span>
                    <Words text={o.text} onWord={onWord} />
                  </span>
                </span>
              </div>
              {answered && (
                <p
                  className="mt-1 mb-2 pl-4"
                  style={{
                    fontFamily: F.ui,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: isRight ? C.teal : C.slate,
                    borderLeft: `2px solid ${isRight ? C.teal : chosen ? C.brick : C.line}`,
                  }}
                >
                  {o.why}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {answered && (
        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.line}` }}>
          <Eyebrow color={answer.correct ? C.teal : C.brick}>
            {answer.correct ? "Right" : "Not this time"}
          </Eyebrow>
          {item.takeaway && (
            <p className="mt-2" style={{ fontFamily: F.read, fontSize: 17, lineHeight: 1.5, color: C.ink }}>
              {item.takeaway}
            </p>
          )}
          <FlagPanel
            item={item}
            answer={answer}
            passage={passage}
            evidence={contextLine}
            meta={flagMeta}
            onSaved={onFlagSaved}
          />

          <button
            onClick={onNext}
            className="ql-focus mt-5 px-5 py-3"
            style={{
              background: C.ink,
              color: C.card,
              border: "none",
              borderRadius: 2,
              fontFamily: F.ui,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {isLast ? "Go to the written question" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------- Open question ------------------------ */

function OpenQuestion({ q, passage, onDone, structure, onUpdate, onFocus }) {
  /* everything below is restored from q, so leaving and coming back
     (or reviewing later) shows exactly what she wrote and what she got */
  const [text, setText] = useState(q.draft || "");
  const [mark, setMark] = useState(q.mark || null);
  const [revision, setRevision] = useState(q.revision ?? q.draft ?? "");
  const [improved, setImproved] = useState(q.improved || null);
  const [revisedDone, setRevisedDone] = useState(!!q.revisedAt);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const save = (patch) => {
    onUpdate(patch);
    if (q.written_id) logWritten({ written_id: q.written_id, ...patch });
  };

  const submit = async () => {
    if (text.trim().length < 40) {
      setErr("Write a bit more — a few sentences gives something to respond to.");
      return;
    }
    setErr("");
    /* her answer is saved before the marking call, so a failed call never loses it */
    save({ draft: text, answer: text, submittedAt: new Date().toISOString() });
    setBusy("mark");
    try {
      const m = await markAnswer({ passage, stem: q.stem, criteria: q.criteria, answer: text });
      setMark(m);
      setRevision(text);
      save({ mark: m, markedAt: new Date().toISOString() });
    } catch (e) {
      setErr("Marking failed — your answer is saved. Try again in a moment.");
    }
    setBusy("");
  };

  const finishRevision = async (skipped) => {
    const final = skipped ? text : revision;
    if (!skipped && final.trim().length < 40) {
      setErr("Write a bit more, or choose “Skip, show me”.");
      return;
    }
    setErr("");
    const at = new Date().toISOString();
    save({ revision: skipped ? "" : final, revisionSkipped: !!skipped, revisedAt: at });
    setRevisedDone(true);
    setBusy("improve");
    try {
      const imp = await improveAnswer({ passage, stem: q.stem, criteria: q.criteria, answer: final, missing: mark?.missing });
      if (!imp.segments.length) throw new Error("empty");
      let strong = mark?.model || "";
      if (!strong) strong = await strongAnswer({ passage, stem: q.stem, criteria: q.criteria });
      const next = { ...imp, based_on: skipped ? "first" : "revision", strong };
      setImproved(next);
      save({ improved: next, improvedAt: new Date().toISOString() });
    } catch (e) {
      setErr("Couldn't build the improved answer. Your writing is saved — try again.");
    }
    setBusy("");
  };

  const box = (value, onChange, onBlur, disabled, placeholder) => (
    <textarea
      className="ql-focus mt-4"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={placeholder}
      style={{
        width: "100%",
        minHeight: 160,
        fontFamily: F.ui,
        fontSize: 15,
        lineHeight: 1.6,
        color: C.ink,
        background: disabled ? C.paper : C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 2,
        padding: "12px 14px",
        resize: "vertical",
      }}
    />
  );
  const primary = (label, onClick, disabled) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ql-focus mt-4 px-5 py-3"
      style={{ background: disabled ? C.slate : C.ink, color: C.card, border: "none", borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}
    >
      {label}
    </button>
  );
  const small = (t, color = C.slate) => <p style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, color, letterSpacing: "0.04em" }}>{t}</p>;

  return (
    <div>
      <Eyebrow color={C.teal}>Evaluate and reflect · written</Eyebrow>
      <h2 className="mt-4" style={{ fontFamily: F.read, fontSize: 26, lineHeight: 1.3, color: C.ink, fontWeight: 600 }}>
        {q.stem}
      </h2>
      {q.criteria && q.criteria.length > 0 && (
        <ul className="mt-4 space-y-1">
          {q.criteria.map((c, i) => (
            <li key={i} className="flex gap-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate }}>
              <span style={{ color: C.amber, fontWeight: 700 }}>·</span>
              {c}
            </li>
          ))}
        </ul>
      )}

      {!mark && (
        <WritingScaffold
          q={q}
          passage={passage}
          structure={structure}
          locate={locate}
          sectionLabel={sectionLabel}
          scaffold={q.scaffold || null}
          onScaffold={(sc) => onUpdate({ scaffold: sc })}
          onFocus={onFocus}
          onUseNotes={(t) => {
            const merged = (text.trim() ? text.trim() + "\n\n" : "") + t;
            setText(merged);
            onUpdate({ draft: merged });
          }}
        />
      )}

      <div className="mt-5">{mark && small("YOUR FIRST ANSWER")}</div>
      {box(text, setText, () => onUpdate({ draft: text }), !!mark, "Your answer. Point at the passage where you can.")}

      {err && (
        <p className="mt-3" style={{ fontFamily: F.ui, fontSize: 13, color: C.brick }}>
          {err}
        </p>
      )}

      {!mark && (
        <div className="flex flex-wrap items-center gap-4">
          {primary(busy === "mark" ? "Reading your answer…" : "Get feedback", submit, !!busy)}
          {/* v10.4: optional — a short session can end after the multiple-choice questions */}
          <button
            onClick={() => {
              save({ skipped: true, skippedAt: new Date().toISOString(), draft: text });
              onDone();
            }}
            disabled={!!busy}
            className="ql-focus mt-4"
            style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
          >
            Skip the written question
          </button>
        </div>
      )}

      {mark && (
        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.line}` }}>
          <Eyebrow color={mark.verdict === "thin" ? C.brick : C.teal}>{mark.verdict}</Eyebrow>
          <div className="mt-3 grid sm:grid-cols-2 gap-5">
            <div>
              {small("Working", C.teal)}
              <ul className="mt-1 space-y-1">
                {(mark.strengths || []).map((s, i) => (
                  <li key={i} style={{ fontFamily: F.ui, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              {small("Missing", C.brick)}
              <ul className="mt-1 space-y-1">
                {(mark.missing || []).map((s, i) => (
                  <li key={i} style={{ fontFamily: F.ui, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
          {mark.nudge && (
            <p className="mt-5 px-4 py-3" style={{ fontFamily: F.read, fontSize: 17, color: C.ink, background: C.amberSoft, borderRadius: 2 }}>
              {mark.nudge}
            </p>
          )}

          {/* one revision attempt, before any better version is shown */}
          {!revisedDone ? (
            <div className="mt-6">
              {small("TRY ONCE MORE")}
              <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, lineHeight: 1.5 }}>
                Use the question above to improve your answer. Then you'll see your answer improved, and a strong answer to compare.
              </p>
              {box(revision, setRevision, () => onUpdate({ revisionDraft: revision }), !!busy, "Edit your answer here.")}
              <div className="flex flex-wrap items-center gap-4">
                {primary("Submit my revision", () => finishRevision(false), !!busy)}
                <button
                  onClick={() => finishRevision(true)}
                  disabled={!!busy}
                  className="ql-focus mt-4"
                  style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
                >
                  Skip, show me
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              {q.revision && (
                <>
                  {small("YOUR REVISION")}
                  <p className="mt-1 px-4 py-3" style={{ fontFamily: F.ui, fontSize: 15, lineHeight: 1.6, color: C.ink, background: C.paper, borderRadius: 2, whiteSpace: "pre-wrap" }}>
                    {q.revision}
                  </p>
                </>
              )}
              {busy === "improve" && (
                <p className="mt-4" style={{ fontFamily: F.ui, fontSize: 14, color: C.slate }}>Improving your answer…</p>
              )}
              {!improved && !busy && primary("Try again", () => finishRevision(!!q.revisionSkipped), false)}
              {improved && <ImprovedAnswer improved={improved} />}
            </div>
          )}

          {primary("See how the climb went", onDone, busy === "mark")}
        </div>
      )}
    </div>
  );
}

/* her answer with the additions marked, then a strong answer to compare */
function ImprovedAnswer({ improved }) {
  const adds = (improved.segments || []).filter((s) => s.added);
  return (
    <div className="mt-5">
      <p style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.teal, letterSpacing: "0.04em" }}>
        YOUR ANSWER, IMPROVED
      </p>
      <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>
        Your words are kept. <span style={{ background: C.amberSoft, padding: "0 3px" }}>Highlighted</span> parts were added or changed
        {improved.based_on === "revision" ? " (built from your revision)." : " (built from your first answer)."}
      </p>
      <p className="mt-2 px-4 py-3" style={{ fontFamily: F.read, fontSize: 17, lineHeight: 1.7, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 2 }}>
        {(improved.segments || []).map((s, i) =>
          s.added ? (
            <mark key={i} title={s.why} style={{ background: C.amberSoft, color: C.ink, padding: "0 2px" }}>
              {s.text}
              <sup style={{ fontFamily: F.ui, fontSize: 10, color: C.amber, fontWeight: 700 }}>{adds.indexOf(s) + 1}</sup>{" "}
            </mark>
          ) : (
            <span key={i}>{s.text} </span>
          )
        )}
      </p>
      {adds.length > 0 && (
        <ol className="mt-2 space-y-1">
          {adds.map((s, i) => (
            <li key={i} style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, lineHeight: 1.5 }}>
              <b style={{ color: C.amber }}>{i + 1}</b> {s.why || "added"}
            </li>
          ))}
        </ol>
      )}
      {improved.strong && (
        <>
          <p className="mt-5" style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.slate, letterSpacing: "0.04em" }}>
            A STRONG ANSWER, FOR COMPARISON
          </p>
          <p className="mt-1 px-4 py-3" style={{ fontFamily: F.read, fontSize: 16, lineHeight: 1.6, color: C.ink, background: C.paper, borderRadius: 2 }}>
            {improved.strong}
          </p>
        </>
      )}
    </div>
  );
}

/* ----------------------------- Review ---------------------------- */

function Review({ byLevel, answers, onRestart, onRetry, rejected = [], shortfalls = [], openQ = null, onOpenWritten, selfRating = {}, onRate }) {
  const rows = LEVELS.map((L) => {
    const items = byLevel[L.n] || [];
    let right = 0;
    let done = 0;
    items.forEach((_, i) => {
      const a = answers[L.n + "-" + i];
      if (a) {
        done++;
        if (a.correct) right++;
      }
    });
    return { L, right, done };
  });
  const total = rows.reduce((s, r) => s + r.done, 0);
  const correct = rows.reduce((s, r) => s + r.right, 0);
  const given = Object.values(answers);
  const noHint = given.filter((a) => !a.hints && !(a.coach || []).length).length;
  const sawEvidence = given.filter((a) => a.locationShown || (a.hintKinds || []).some((k) => ["section", "locator", "paragraph", "evidence"].includes(k))).length;
  const usedCoach = given.filter((a) => (a.coach || []).length).length;
  /* correct with no hint and no coach: the "actual" side of calibration */
  const unaidedCorrect = given.filter((a) => a.correct && !a.hints && !(a.coach || []).length).length;
  const [pendingRate, setPendingRate] = useState(null);

  /* AARC calibration: ask how much she understands BEFORE showing any result,
     so the score cannot shape the rating */
  if (onRate && given.length > 0 && selfRating.after_questions == null)
    return (
      <div className="max-w-2xl mx-auto px-5 py-12">
        <Eyebrow>Before your results</Eyebrow>
        <div className="mt-4 px-5 py-5" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}>
          <SelfRating
            id="rate-after-questions"
            value={pendingRate}
            onChange={setPendingRate}
            question="Now that you've done the questions: how much of the text do you think you understand? (0–10)"
          />
          <button
            onClick={() =>
              onRate(pendingRate, {
                answered_total: given.length,
                correct_total: correct,
                unaided_correct: unaidedCorrect,
                unaided_correct_pct: Math.round((unaidedCorrect / given.length) * 100),
              })
            }
            disabled={pendingRate == null}
            className="ql-focus mt-4 px-5 py-3"
            style={{ background: pendingRate == null ? C.mute : C.ink, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}
          >
            Show my results
          </button>
        </div>
      </div>
    );
  const attempted = rows.filter((r) => r.done > 0);
  const weakest = attempted.slice().sort((a, b) => a.right / a.done - b.right / b.done)[0];
  const missed = [];
  LEVELS.forEach((L) => {
    (byLevel[L.n] || []).forEach((it, i) => {
      const a = answers[L.n + "-" + i];
      if (a && !a.correct) missed.push(it);
    });
  });

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <Eyebrow>Climb finished</Eyebrow>
      <h2
        className="mt-3"
        style={{ fontFamily: F.read, fontSize: 44, lineHeight: 1.1, color: C.ink, fontWeight: 600 }}
      >
        {correct} of {total}
      </h2>
      {given.length > 0 && (
        <p className="mt-2" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
          {noHint} of {given.length} answered without help · {sawEvidence} needed to be shown where to look · {usedCoach} used the question coach
        </p>
      )}
      {selfRating.after_questions != null && (
        <div className="mt-4 px-4 py-3" style={{ background: C.tealSoft, borderRadius: 2 }}>
          <p style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.teal }}>How well you thought you understood</p>
          <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 15, color: C.ink, lineHeight: 1.6 }}>
            {selfRating.after_reading != null && (
              <>
                After reading: <b>{selfRating.after_reading}/10</b> ·{" "}
              </>
            )}
            After the questions: <b>{selfRating.after_questions}/10</b> · Correct without any help: <b>{unaidedCorrect} of {given.length}</b>
          </p>
        </div>
      )}
      {shortfalls.length > 0 && (
        <p className="mt-1" style={{ fontFamily: F.mono, fontSize: 12, color: C.brick }}>
          Shortfall —{" "}
          {shortfalls
            .map((x) => `process ${x.intended_process}: ${x.accepted} of ${x.requested} generated` + (x.model_declined_reason ? ` (model: “${x.model_declined_reason}”)` : ""))
            .join("; ")}
          . Recorded in the research log; no weaker items were substituted.
        </p>
      )}
      {rejected.length > 0 && (
        <p className="mt-1" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
          Quality check rejected {rejected.length} generated question{rejected.length === 1 ? "" : "s"} before you saw them (
          {Object.entries(rejected.reduce((m, r) => ((m[r.reason] = (m[r.reason] || 0) + 1), m), {}))
            .map(([k, v]) => v + "× " + k.toLowerCase())
            .join("; ")}
          )
        </p>
      )}

      <div className="mt-8 space-y-4">
        {rows.map((r) => (
          <div key={r.L.n}>
            <div className="flex items-baseline justify-between gap-3">
              <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: C.ink }}>
                {r.L.n} · {r.L.name}
              </span>
              <span style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
                {r.done ? r.right + "/" + r.done : "—"}
              </span>
            </div>
            <div className="mt-1.5" style={{ height: 4, background: C.line, borderRadius: 2 }}>
              <div
                style={{
                  height: 4,
                  width: r.done ? (r.right / r.done) * 100 + "%" : "0%",
                  background: C.teal,
                  borderRadius: 2,
                }}
              />
            </div>
            <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>
              {r.L.pirls}
            </p>
          </div>
        ))}
      </div>

      {weakest && weakest.right < weakest.done && (
        <p
          className="mt-8 px-4 py-3"
          style={{ fontFamily: F.read, fontSize: 17, lineHeight: 1.5, color: C.ink, background: C.amberSoft, borderRadius: 2 }}
        >
          Weakest process this time: <strong>{weakest.L.pirls.toLowerCase()}</strong>. On the next passage,
          slow down where the text asks you to {weakest.L.n <= 2 ? "locate and link" : "compare and judge"}.
        </p>
      )}

      {missed.length > 0 && (
        <div className="mt-10 pt-6" style={{ borderTop: `1px solid ${C.line}` }}>
          <Eyebrow>What the missed ones were testing</Eyebrow>
          <ul className="mt-3 space-y-3">
            {missed.map((m, i) => (
              <li key={i} style={{ fontFamily: F.read, fontSize: 16, lineHeight: 1.5, color: C.ink }}>
                {m.takeaway || m.stem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        {missed.length > 0 && (
          <button
            onClick={onRetry}
            className="ql-focus px-5 py-3"
            style={{
              background: C.ink,
              color: C.card,
              border: "none",
              borderRadius: 2,
              fontFamily: F.ui,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Retry the {missed.length} I missed
          </button>
        )}
        <button
          onClick={onRestart}
          className="ql-focus px-5 py-3"
          style={{
            background: "transparent",
            color: C.ink,
            border: `1px solid ${C.ink}`,
            borderRadius: 2,
            fontFamily: F.ui,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          New passage
        </button>
      </div>
      {openQ && <WrittenReview q={openQ} onOpen={onOpenWritten} />}
      <ResearchExport style={{ marginTop: 28 }} />
      <FlagExport style={{ marginTop: 8 }} />
    </div>
  );
}

/* the written question on the review screen: everything that was saved */
function WrittenReview({ q, onOpen }) {
  const lab = (t) => (
    <p className="mt-4" style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.slate, letterSpacing: "0.04em" }}>
      {t}
    </p>
  );
  const body = (t) => (
    <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 15, lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap" }}>
      {t}
    </p>
  );
  const answer = q.answer || q.draft || "";
  return (
    <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${C.line}` }}>
      <Eyebrow color={C.teal}>Written question</Eyebrow>
      <p className="mt-3" style={{ fontFamily: F.read, fontSize: 19, lineHeight: 1.4, color: C.ink, fontWeight: 600 }}>
        {q.stem}
      </p>
      {answer ? (
        <>
          {lab(q.mark ? "YOUR FIRST ANSWER · " + String(q.mark.verdict || "").toUpperCase() : "YOUR DRAFT (not submitted)")}
          {body(answer)}
        </>
      ) : (
        body(q.skipped ? "Skipped." : "Not answered yet.")
      )}
      {q.revision && (
        <>
          {lab("YOUR REVISION")}
          {body(q.revision)}
        </>
      )}
      {q.improved && <ImprovedAnswer improved={q.improved} />}
      {onOpen && !q.improved && (
        <button
          onClick={onOpen}
          className="ql-focus mt-4"
          style={{ fontFamily: F.ui, fontSize: 13, color: C.teal, textDecoration: "underline" }}
        >
          {answer ? "Continue the written question" : "Answer the written question"}
        </button>
      )}
    </div>
  );
}

function Diagnosis({ d, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const kind = d.kind || "";
  const guess =
    kind === "content_rejected"
      ? "This is a content rejection, not a format problem. The model returned complete, readable questions, but every one failed the quality checks listed above. All rejected candidates are kept in the research log (Inspect candidates on the home screen)."
      : kind === "declined"
      ? "The model judged that this text cannot support this process. That is recorded as a shortfall, which is a valid outcome."
      : /^Output truncated/.test(d.error)
      ? "The answer itself ran past the output limit. The raw output and token counts below are from this exact call."
      : /^Thinking exhaustion|only reasoning/.test(d.error)
      ? "Reasoning used up the output budget. Check the token counts below; if thinking was sent as off, the model ignored it."
      : /400|format|schema/i.test(d.error)
      ? "Your Ollama build looks like it rejects JSON schemas. Update Ollama, or it will keep falling back to loose JSON mode."
      : /runner crashed|was unloaded/i.test(d.error)
      ? "Ollama is up but the model dropped out. Check ollama ps and the server log — usually memory. Earlier levels are unaffected."
      : /No response from Ollama/i.test(d.error)
      ? "Ollama stopped answering entirely. If earlier levels worked, it crashed rather than being blocked."
      : /minutes/i.test(d.error)
      ? "Generation is slower than the timeout. Check ollama ps shows 100% GPU."
      : /no option correct|marked/i.test(d.error)
      ? "The model wrote items but couldn't keep one answer key straight."
      : "The reply could not be read as the JSON the app needs (a format problem). The raw output below is from this exact call.";
  const m = d.meta || {};

  return (
    <div className="mt-3 px-4 py-3" style={{ background: C.brickSoft, border: `1px solid ${C.brick}`, borderRadius: 2 }}>
      <Eyebrow color={C.brick}>Level {d.level} failed at the {d.stage} pass</Eyebrow>
      <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
        {d.error}
      </p>
      <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
        <strong>{kind === "content_rejected" || kind === "declined" ? "What this means:" : "Likely cause:"}</strong> {guess}
      </p>
      {d.meta && (
        <p className="mt-2" style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, lineHeight: 1.5 }}>
          call {d.call_id || "?"} · done_reason {String(m.done_reason ?? "?")} · output tokens {String(m.output_tokens ?? "?")} of num_predict{" "}
          {String(m.num_predict ?? "?")} · thinking sent {m.think_sent == null ? "?" : m.think_sent ? "on" : "off"} · answer {String(m.content_chars ?? "?")} chars · reasoning{" "}
          {String(m.thinking_chars ?? "?")} chars
        </p>
      )}
      <div className="mt-3 flex gap-4 items-center">
        <button
          onClick={onOpenSettings}
          className="ql-focus px-3 py-2"
          style={{ border: `1px solid ${C.brick}`, borderRadius: 2, fontFamily: F.ui, fontSize: 12, color: C.brick }}
        >
          Open settings
        </button>
        {d.raw && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ql-focus"
            style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, textDecoration: "underline" }}
          >
            {open ? "Hide" : "Show"} what the model actually sent (this call, in full)
          </button>
        )}
      </div>
      {open && (
        <pre
          className="mt-3 p-3 overflow-x-auto"
          style={{
            fontFamily: F.mono,
            fontSize: 11,
            lineHeight: 1.5,
            color: C.ink,
            background: C.card,
            border: `1px solid ${C.line}`,
            whiteSpace: "pre-wrap",
            maxHeight: 420,
          }}
        >
          {d.raw}
          {d.thinking ? "\n\n--- reasoning returned by the model ---\n" + d.thinking : ""}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------ App ------------------------------ */

export default function App() {
  const [screen, setScreen] = useState("setup");
  const [src, setSrc] = useState({ prompt: "", passage: "", plan: PLANS.full });
  const [byLevel, setByLevel] = useState({});
  const [status, setStatus] = useState({});
  const [answers, setAnswers] = useState({});
  const [slotIdx, setSlotIdx] = useState(0);
  const [openQ, setOpenQ] = useState(null);
  const [genErr, setGenErr] = useState(null);
  const [showPassage, setShowPassage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [lookup, setLookup] = useState(null);
  const [hintMap, setHintMap] = useState({});
  /* v10.4: question-coach use per question (counts as help) */
  const [coachMap, setCoachMap] = useState({});
  const [lookupMap, setLookupMap] = useState({});
  /* AARC calibration ratings for this session */
  const [selfRating, setSelfRating] = useState({});
  const [openFocus, setOpenFocus] = useState({ where: null, focus: "none" });
  const rejectedRef = useRef([]);
  const runRef = useRef(null);
  const shortfallsRef = useRef([]);
  const [intent, setIntent] = useState(null);
  const intentRef = useRef(null);
  const [selection, setSelection] = useState("");
  const [asking, setAsking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const sessionId = useRef(null);
  const [savedAt, setSavedAt] = useState(null);
  const saved = useRef(false);

  const planned = src.plan.counts;
  const counts = planned.map((c, li) => {
    const lvl = li + 1;
    const produced = (byLevel[lvl] || []).length;
    return status[lvl] === "ready" ? produced : c;
  });
  const slots = counts.flatMap((c, li) => Array.from({ length: c }, (_, i) => ({ level: li + 1, i })));
  const slot = slots[slotIdx];
  const item = slot ? (byLevel[slot.level] || [])[slot.i] : null;
  const hasAnswered = slot ? !!answers[slot.level + "-" + slot.i] : false;

  const structure = useMemo(() => buildStructure(src.passage || ""), [src.passage]);
  const where = useMemo(() => (item ? locate(structure, item.anchor) : null), [structure, item]);
  const where2 = useMemo(() => (item && item.anchor2 ? locate(structure, item.anchor2) : null), [structure, item]);
  const steps = useMemo(() => (item ? hintSteps(item, where, where2) : []), [item, where, where2]);

  /* hint level belongs to one question; any other question starts with none */
  const qKey = slot ? sessionId.current + ":" + slot.level + "-" + slot.i : "";
  const hintLevel = hintMap[qKey] || 0;
  const nextHint = () => setHintMap((m) => ({ ...m, [qKey]: Math.min(hintLevel + 1, steps.length) }));
  const wordGrades = useRef({});
  const contextLine = where ? structure.lines[where.line].replace(/\*\*/g, "") : "";

  /* the passage shows only the location the learner has asked for.
     After answering, the evidence is shown as feedback. */
  const earned = steps.slice(0, hintLevel).map((s) => s.kind);
  /* a question on a word she saved tests the word, not finding it: show the sentence at once */
  const passageFocus = hasAnswered || item?.focusKind === "vocab"
    ? "sentence"
    : earned.includes("section")
    ? "section"
    : "none";
  /* the key-word hint is the last step: by then the location is given, so the word is marked in the text too */
  const passageKeyword = !hasAnswered && earned.includes("keyword") ? item?.keyword || "" : "";

  const runGeneration = useCallback(async (source) => {
    const cfg = loadConfig();
    const chunk = Math.max(1, cfg.itemsPerCall || 2);
    const used = [];
    const st = buildStructure(source.passage);

    /* ---- research run: a new run id every time, never overwriting ---- */
    const pid = passageId(source.passage);
    const runId = newRunId();
    runRef.current = { runId, passageId: pid };
    shortfallsRef.current = [];
    const exemplars = loadExemplars().filter((e) => e.permission_confirmed === true);
    const isCloud = cfg.provider === "cloud";
    const settings = {
      provider: isCloud ? "openrouter" : cfg.provider,
      /* cloud: filled in from the first reply (the model OpenRouter used) */
      model: isCloud ? "" : cfg[cfg.provider]?.model || "",
      model_digest: "",
      model_info: null,
      temperature: cfg.temperature,
      itemsPerCall: chunk,
      think: !!cfg.think,
      num_ctx: cfg.provider === "ollama" ? 16384 : null,
      learner: learnerText(cfg),
      learnerPreset: cfg.learnerPreset,
      textType: cfg.textType || "auto",
      l3Strict: cfg.l3Strict !== false,
      l3MeaningCheck: cfg.l3MeaningCheck !== false,
      exemplars_available: exemplars.map((e) => e.id),
    };
    settings.model_info = await modelInfo(cfg);
    if (isCloud) settings.model_info = { ...settings.model_info, name: "" };
    settings.model_digest = settings.model_info.digest || "";
    const noteCloudModel = () => {
      const m = lastExchange.meta?.model;
      if (isCloud && m && !settings.model) {
        settings.model = m;
        settings.model_info.name = m;
        logRunModel(runId, m);
      }
    };
    /* v10.4 coverage: quarters of the text, and a plan for every question slot */
    const qm = quarterMap(st.lines);
    const markedPassage = passageWithQuarters(st.lines);
    const blueprint = buildBlueprint(source.plan.counts, source.reading?.focus || [], qm.available);
    const filledSlots = new Set();
    const usedAnchors = [];
    /* v10.4: spread the correct answer evenly over A–D (models favour A) */
    const keyOrder = keyPlan(runId);
    const pmeta = source.meta || {};
    logPassage(pid, source.passage, {
      title: pmeta.title || (source.passage || "").slice(0, 70).replace(/\s+/g, " "),
      source: pmeta.source || "",
      licence: pmeta.licence || "",
    });
    logRun({
      run_id: runId,
      session_id: sessionId.current,
      passage_id: pid,
      plan: source.plan.key,
      requested: source.plan.counts,
      app_version: APP_VERSION,
      prompt_version: PROMPT_VERSION,
      validator_version: VALIDATOR_VERSION,
      settings,
      passage_meta: { title: pmeta.title || "", source: pmeta.source || "", licence: pmeta.licence || "" },
      reading_id: source.reading?.reading_id || "",
      coverage_version: COVERAGE_VERSION,
      coverage_plan: blueprint,
      coverage_summary: blueprintSummary(blueprint),
      started_at: new Date().toISOString(),
    });
    let nCalls = 0;
    let nCand = 0;
    const seenStems = new Set();
    const l3Pending = [];
    let nAcc = 0;

    /* Reader's goal card — only when she supplied her own question. It is
       NOT fed into the v10 item prompt (keeps generation reproducible). */
    setStatus((s) => ({ ...s, intent: "loading" }));
    if ((source.prompt || "").trim()) {
      try {
        const it = await analyseIntent(source.prompt, source.passage);
        noteCloudModel();
        intentRef.current = it;
        setIntent(it);
      } catch (e) {
        intentRef.current = null;
      }
    }
    setStatus((s) => ({ ...s, intent: "done" }));

    for (const L of LEVELS) {
      const need = source.plan.counts[L.n - 1];
      setStatus((s) => ({ ...s, [L.n]: "loading" }));
      const collected = [];
      let diag = null;
      let callsThisLevel = 0;
      let declined = "";
      const MAX_CALLS = need * 3 + 2; /* bounded retries, so a shortfall is reported rather than looping */
      const exP = exemplars.filter((e) => e.process === L.n);
      const ex = [exP.find((e) => e.role !== "negative"), exP.find((e) => e.role === "negative")].filter(Boolean);

      while (collected.length < need && callsThisLevel < MAX_CALLS) {
        const want = Math.min(chunk, need - collected.length);
        /* v10.4: the planned slots this request should fill (quarter + reader focus) */
        const batch = blueprint.filter((sl) => sl.level === L.n && !filledSlots.has(sl.slot_id)).slice(0, want);
        /* after two rounds of misses, take good evidence from any quarter rather than lose the item */
        const relaxQuarter = callsThisLevel >= need * 2;
        let got = [];
        /* schema-constrained first; step down if this build or model can't do it */
        /* output budget per item, measured to fit a full item with all
           metadata (stem, 4 options + why, anchors, hint, keyword, guide,
           takeaway). v10.1 used 1600/2000 for TWO items, which a verbose
           model like Qwen can exceed. */
        const perItem = L.n === 3 ? 1100 : 950;
        const budget = 300 + perItem * want;
        const passes = [
          { mode: "schema", tokens: budget, extra: "" },
          {
            mode: "json",
            tokens: budget + 400,
            extra:
              '\n\nYour previous reply could not be used. Return ONLY the JSON object described above. Exactly one option per item must have "correct": true.',
          },
          {
            mode: "none",
            tokens: budget + 400,
            extra: "\n\nReturn ONLY raw JSON. Start your reply with { and end it with }. No commentary, no code fence.",
          },
        ];
        let lastReasons = [];
        for (const pass of passes) {
          if (got.length || declined || callsThisLevel >= MAX_CALLS) break;
          const feedback = lastReasons.length
            ? "\n\nYour previous items were rejected for these reasons — avoid them: " + [...new Set(lastReasons)].join("; ") + "."
            : "";
          const args = { level: L.n, count: want, passage: source.passage, usedStems: used, cfg, exemplars: ex, markedPassage, slots: batch, usedAnchors };
          const promptText = buildItemPromptV10(args) + pass.extra + feedback;
          const callId = runId + "-C" + String(++nCalls).padStart(3, "0");
          callsThisLevel++;
          const call = {
            call_id: callId,
            run_id: runId,
            passage_id: pid,
            intended_process: L.n,
            items_requested: want,
            slot_ids: batch.map((sl) => sl.slot_id),
            target_quarters: batch.map((sl) => sl.quarter),
            pass_mode: pass.mode,
            max_tokens: pass.tokens,
            prompt_version: PROMPT_VERSION,
            prompt_hash: hash(promptText),
            /* exact prompt with the passage replaced by a token (passage stored once) */
            prompt: buildItemPromptV10({ ...args, forLog: true }) + pass.extra + feedback,
            exemplar_ids: ex.map((e) => e.id),
            rejection_feedback: feedback ? [...new Set(lastReasons)] : [],
            started_at: new Date().toISOString(),
          };
          let raw = "";
          let records = [];
          try {
            raw = await ask(promptText, {
              maxTokens: call.max_tokens,
              schema: L.n === 3 ? ITEMS_SCHEMA_L3 : ITEMS_SCHEMA,
              mode: pass.mode,
              config: cfg,
            });
            noteCloudModel();
            const parsed = parseJSON(raw);
            if (parsed && parsed.shortfall_reason && !(parsed.items || []).length) declined = String(parsed.shortfall_reason);
            records = normaliseCandidates(parsed, L.n);
            logCall({ ...call, ok: true, latency_ms: lastExchange.ms, meta: lastExchange.meta, raw_reply: raw, shortfall_reason: parsed?.shortfall_reason || "" });
          } catch (e) {
            noteCloudModel();
            logCall({ ...call, ok: false, error: e.message, error_kind: /^Output truncated/.test(e.message) ? "output_truncated" : /^Thinking exhaustion|only reasoning/.test(e.message) ? "thinking_exhaustion" : /^Empty reply/.test(e.message) ? "empty_reply" : /^Provider filtered/.test(e.message) ? "provider_filtered" : "call_or_parse_error", latency_ms: lastExchange.ms, meta: lastExchange.meta, raw_reply: raw || String(lastExchange.raw || ""), thinking_reply: lastExchange.thinking || "" });
            diag = { kind: "call_failed", call_id: callId, stage: pass.mode, error: e.message, raw: String(raw || lastExchange.raw || ""), thinking: lastExchange.thinking || "", meta: lastExchange.meta };
            if (/died|No response|reachable/i.test(e.message)) await new Promise((r) => setTimeout(r, 4000));
            continue;
          }

          /* quality checks on every parsed candidate; every candidate is logged */
          const reasons = [];
          const logged = records.map((rec) => {
            const candidateId = runId + "-P" + L.n + "-" + String(++nCand).padStart(3, "0");
            if (rec.item) {
              const moved = placeKey(rec.item.options, keyOrder[(nCand - 1) % 4], candidateId);
              rec.item = { ...rec.item, options: moved.options, key_original_index: moved.from };
              if (moved.from !== moved.to) rec.repairs.push("options reordered: key moved from " + LETTERS[moved.from] + " to " + LETTERS[moved.to]);
            }
            let res = { checks: {}, reasons: [], anchor_loc: null, anchor2_loc: null, anchor_match: "none" };
            if (rec.item && (L.n === 3 || L.n === 4)) l3Pending.push({ candidateId, item: rec.item, process: L.n });
            if (rec.item) {
              res = checkItem(rec.item, st, { l3Strict: cfg.l3Strict !== false });
              /* the prompt asks for no repeats; the code makes sure */
              const key = norm(rec.item.stem).replace(/[^a-z0-9 ]/g, "").trim();
              res.checks.not_duplicate = !seenStems.has(key);
              if (!res.checks.not_duplicate) res.reasons.push("Duplicate of an earlier item in this run");
              else seenStems.add(key);
            }
            /* v10.4 coverage: distinct evidence, planned quarter, reader focus */
            let slotMatch = null;
            let aQuarter = null;
            if (rec.item && res.anchor_loc) {
              const aLine = res.anchor_loc.line;
              const bLine = res.anchor2_loc?.line;
              /* quarter of the evidence itself (sentence level), not of its paragraph */
              const aw = locate(st, rec.item.anchor);
              aQuarter = qm.posQuarter(aLine, aw ? aw.sortKey % 100000 : 0);
              const ev = contentWords(rec.item.anchor);
              const reused =
                ev.length >= 3 &&
                usedAnchors.some((u) => {
                  const uw = new Set(contentWords(u));
                  return ev.filter((w) => uw.has(w)).length / ev.length >= 0.6;
                });
              res.checks.distinct_evidence = !reused;
              if (reused) res.reasons.push("Uses the same evidence as an earlier question");
              const addressed = (sl) => {
                const f = sl.focus;
                if (!f) return true;
                if (f.kind === "vocab") {
                  const w = norm(f.text);
                  return [rec.item.keyword, rec.item.stem, rec.item.anchor].some((t) => norm(t || "").includes(w));
                }
                const inRange = (ln) => ln != null && f.start_line != null && ln >= f.start_line && ln <= f.end_line;
                if (inRange(aLine) || inRange(bLine)) return true;
                const fw = new Set(contentWords(f.text));
                return ev.length > 0 && ev.filter((w) => fw.has(w)).length / ev.length >= 0.5;
              };
              const open = batch.filter((sl) => !filledSlots.has(sl.slot_id));
              slotMatch =
                open.find((sl) => sl.focus && sl.quarter === aQuarter && addressed(sl)) ||
                open.find((sl) => !sl.focus && sl.quarter === aQuarter) ||
                (relaxQuarter ? open.find((sl) => sl.focus && addressed(sl)) || open.find((sl) => !sl.focus) : null);
              res.checks.in_target_quarter = slotMatch ? slotMatch.quarter === aQuarter : false;
              res.checks.focus_addressed = slotMatch?.focus ? addressed(slotMatch) : null;
              if (!slotMatch) {
                const focusOnly = open.some((sl) => sl.focus && sl.quarter === aQuarter);
                res.reasons.push(
                  focusOnly
                    ? "Not built around the part the reader asked about"
                    : "Evidence is from quarter " + aQuarter + ", not the planned quarter " + [...new Set(open.map((sl) => sl.quarter))].join(" or ")
                );
              } else if (!res.checks.in_target_quarter) rec.repairs.push("quarter relaxed after " + callsThisLevel + " requests");
            }
            const allReasons = [...rec.reasons, ...res.reasons];
            const accepted = !!rec.item && allReasons.length === 0;
            reasons.push(...allReasons);
            if (accepted && collected.length + got.length < need) {
              got.push({ ...rec.item, candidateId, runId, passageId: pid, slotId: slotMatch?.slot_id || "", quarter: aQuarter, focusKind: slotMatch?.focus?.kind || "" });
              if (slotMatch) filledSlots.add(slotMatch.slot_id);
              usedAnchors.push(rec.item.anchor);
              if (rec.item.anchor2) usedAnchors.push(rec.item.anchor2);
            }
            const tooMany = accepted && !got.some((g) => g.candidateId === candidateId);
            if (!accepted) rejectedRef.current.push({ level: L.n, stem: rec.item?.stem || String(rec.raw?.stem || ""), reason: allReasons.join("; "), at: new Date().toISOString(), candidateId });
            if (accepted && !tooMany) nAcc++;
            const pend = l3Pending.find((x) => x.candidateId === candidateId);
            if (pend) pend.accepted = accepted && !tooMany;
            return {
              candidate_id: candidateId,
              run_id: runId,
              passage_id: pid,
              call_id: callId,
              intended_process: L.n,
              accepted: accepted && !tooMany,
              stage_rejected: !rec.item ? "format" : allReasons.length ? "validator" : tooMany ? "surplus" : "",
              reasons: tooMany ? ["Surplus — more items returned than requested"] : allReasons,
              repairs: rec.repairs,
              checks: { ...rec.checks, ...res.checks },
              anchor_match: res.anchor_match,
              slot_id: slotMatch?.slot_id || "",
              target_quarter: slotMatch?.quarter ?? (batch.length === 1 ? batch[0].quarter : null),
              anchor_quarter: aQuarter,
              target_focus: slotMatch?.focus || null,
              anchor_loc: res.anchor_loc,
              anchor2_loc: res.anchor2_loc,
              item: rec.item,
              raw: rec.item ? undefined : rec.raw,
              created_at: new Date().toISOString(),
            };
          });
          logCandidates(logged);
          lastReasons = reasons;
          if (!got.length)
            diag = {
              kind: declined ? "declined" : reasons.length ? "content_rejected" : "format",
              call_id: callId,
              stage: pass.mode,
              error: declined
                ? "The model said this text cannot support the process: " + declined
                : reasons.length
                ? "Every candidate from this call failed the quality checks: " + [...new Set(reasons)].join("; ")
                : "The reply held no usable item.",
              raw: String(raw),
              meta: lastExchange.meta,
            };
        }
        if (got.length === 0 || declined) {
          got.forEach((g) => {
            collected.push(g);
            used.push(g.stem);
          });
          break;
        }
        got.forEach((g) => {
          collected.push(g);
          used.push(g.stem);
        });
      }

      /* fewer accepted than requested: record it, never fill with weaker items */
      if (collected.length < need) {
        const sf = {
          run_id: runId,
          passage_id: pid,
          intended_process: L.n,
          requested: need,
          accepted: collected.length,
          calls: callsThisLevel,
          model_declined_reason: declined,
          last_error: diag?.error || "",
          at: new Date().toISOString(),
        };
        logShortfall(sf);
        shortfallsRef.current.push(sf);
      }

      /* follow the order of the text: earlier evidence first */
      if (collected.length) {
        const key = (it) => locate(st, it.anchor)?.sortKey ?? Number.MAX_SAFE_INTEGER;
        const ordered = collected
          .map((it, k) => ({ it, k, pos: key(it) }))
          .sort((a, b) => a.pos - b.pos || a.k - b.k)
          .map((x) => x.it);
        setByLevel((b) => ({ ...b, [L.n]: ordered }));
      }

      if (collected.length === 0) {
        setStatus((s) => ({ ...s, [L.n]: "error" }));
        setGenErr({ level: L.n, ...(diag || { stage: "?", error: "Unknown", raw: "" }) });
        continue;
      }
      setStatus((s) => ({ ...s, [L.n]: "ready" }));
    }

    logRunEnd(runId, {
      ended_at: new Date().toISOString(),
      calls: nCalls,
      candidates: nCand,
      accepted: nAcc,
      shortfalls: shortfallsRef.current.map((x) => ({ process: x.intended_process, requested: x.requested, accepted: x.accepted })),
    });

    /* written question + premise check: everything it names must exist in
       the text in that role; one regeneration if not. Logged either way. */
    try {
      const writtenId = runId + "-w";
      const premise = { attempts: [] };
      let q = null;
      let problems = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await ask(buildOpenPrompt(source.prompt, source.passage, problems), {
          maxTokens: 900,
          schema: OPEN_SCHEMA,
          config: cfg,
        });
        const d = parseJSON(raw);
        if (!d?.stem) continue;
        q = { stem: String(d.stem), criteria: Array.isArray(d.criteria) ? d.criteria.map(String) : [] };
        let chk;
        try {
          chk = await checkPremise({ stem: q.stem, criteria: q.criteria, passage: source.passage });
        } catch (e) {
          chk = { ok: null, problems: [], error: String(e?.message || e).slice(0, 120) };
        }
        premise.attempts.push({ stem: q.stem, ...chk });
        if (chk.ok !== false) break;
        problems = chk.problems.length ? chk.problems : ["the question names something the text does not contain in that role"];
      }
      if (q) {
        const last = premise.attempts[premise.attempts.length - 1] || {};
        premise.ok = last.ok;
        premise.regenerated = premise.attempts.length > 1;
        const full = { ...q, written_id: writtenId, run_id: runId, written_version: WRITTEN_VERSION, premise };
        logWritten({ written_id: writtenId, run_id: runId, written_version: WRITTEN_VERSION, stem: q.stem, criteria: q.criteria, premise, created_at: new Date().toISOString() });
        setOpenQ(full);
      } else setOpenQ(null);
    } catch (e) {
      setOpenQ(null);
    }

    /* ---- shadow meaning checks, processes 3 and 4 (diagnostic only) ----
       Run after the learner already has the questions. Never accept or
       reject anything. Same model as the generator (a documented
       limitation); kept separate from the independent AI evaluator. */
    if (cfg.l3MeaningCheck !== false && l3Pending.length) {
      const checkCfg = { ...cfg, temperature: 0 };
      const b = (v) => v === true || v === "true";
      for (const c of l3Pending) {
        const p4 = c.process === 4;
        const build = p4 ? buildL4CheckPrompt : buildL3CheckPrompt;
        const promptText = build({ item: c.item, passage: source.passage });
        const d = {
          diagnostic_id: c.candidateId + (p4 ? "-L4M" : "-L3M"),
          check: p4 ? "l4_meaning" : "l3_meaning",
          check_version: p4 ? L4CHECK_VERSION : L3CHECK_VERSION,
          blocking: false,
          candidate_id: c.candidateId,
          run_id: runId,
          passage_id: pid,
          accepted_by_validator: !!c.accepted,
          provider: settings.provider,
          model: settings.model,
          same_model_as_generator: true,
          temperature: 0,
          prompt_hash: hash(promptText),
          prompt: build({ item: c.item, passage: source.passage, forLog: true }),
          started_at: new Date().toISOString(),
        };
        try {
          const raw = await ask(promptText, { maxTokens: 700, schema: p4 ? L4CHECK_SCHEMA : L3CHECK_SCHEMA, config: checkCfg });
          const r = parseJSON(raw);
          const result = p4
            ? {
                applies_evaluative_criterion: b(r.applies_evaluative_criterion),
                criterion: String(r.criterion || ""),
                answer_stated_in_text: b(r.answer_stated_in_text),
                stated_quote: String(r.stated_quote || ""),
                superficial_evaluative_wording: b(r.superficial_evaluative_wording),
                reason: String(r.reason || ""),
              }
            : {
                requires_integration: b(r.requires_integration),
                spans_coherent: b(r.spans_coherent),
                single_sentence_answerable: b(r.single_sentence_answerable),
                single_sentence_quote: String(r.single_sentence_quote || ""),
                unsupported_inference: b(r.unsupported_inference),
                reason: String(r.reason || ""),
              };
          logDiagnostic({ ...d, status: "ok", latency_ms: lastExchange.ms, meta: lastExchange.meta, raw_reply: raw, result });
        } catch (e) {
          logDiagnostic({ ...d, status: "error", error: e.message, latency_ms: lastExchange.ms, meta: lastExchange.meta, raw_reply: String(lastExchange.raw || "") });
        }
      }
    }
  }, []);

  const snapshot = useCallback(
    () => ({
      id: sessionId.current,
      title: (src.prompt || src.passage || "").slice(0, 70).replace(/\s+/g, " ") + "…",
      prompt: src.prompt,
      passage: src.passage,
      plan: src.plan,
      intent,
      byLevel,
      answers,
      openQ,
      selfRating,
      slotIdx,
      rejected: rejectedRef.current,
      run: runRef.current,
      shortfalls: shortfallsRef.current,
    }),
    [src, intent, byLevel, answers, openQ, selfRating, slotIdx]
  );

  const persistNow = useCallback(async () => {
    if (!sessionId.current) return false;
    try {
      const rec = await saveSession(snapshot());
      setSavedAt(rec.savedAt);
      return true;
    } catch (e) {
      return false; /* never let a failed save block the UI */
    }
  }, [snapshot]);

  /* autosave whenever something worth keeping changes */
  useEffect(() => {
    if (!sessionId.current) return;
    /* nothing to save until the questions exist; focus reading keeps its own draft */
    if (screen === "setup" || screen === "focus") return;
    const t = setTimeout(() => {
      persistNow();
    }, 1200);
    return () => clearTimeout(t);
  }, [answers, byLevel, openQ, selfRating, screen, persistNow]);

  useEffect(() => {
    const flush = () => {
      if (sessionId.current && screen !== "setup" && screen !== "focus") persistNow();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [persistNow, screen]);

  const resume = (rec) => {
    sessionId.current = rec.id;
    setSrc({ prompt: rec.prompt, passage: rec.passage, plan: rec.plan || PLANS.full });
    setByLevel(rec.byLevel || {});
    setStatus(
      Object.keys(rec.byLevel || {}).reduce((m, k) => ({ ...m, [k]: "ready" }), { intent: "done" })
    );
    setAnswers(rec.answers || {});
    setIntent(rec.intent || null);
    intentRef.current = rec.intent || null;
    rejectedRef.current = rec.rejected || [];
    runRef.current = rec.run || null;
    shortfallsRef.current = rec.shortfalls || [];
    setOpenQ(rec.openQ || null);
    setSelfRating(rec.selfRating || {});
    setGenErr(null);
    setSelection("");
    setSavedAt(rec.savedAt);
    /* land on the first unanswered question, or the start when revising */
    const slotsNow = (rec.plan?.counts || []).flatMap((c, li) =>
      Array.from({ length: c }, (_, i) => ({ level: li + 1, i }))
    );
    const next = slotsNow.findIndex((sl) => !(rec.answers || {})[sl.level + "-" + sl.i]);
    setSlotIdx(next === -1 ? 0 : next);
    saved.current = true;
    /* all multiple-choice done: go back to the written question if it is
       unfinished, otherwise to the review (which shows the saved writing) */
    if (next === -1 && slotsNow.length) setScreen(rec.openQ && !rec.openQ.improved && !rec.openQ.skipped ? "open" : "review");
    else setScreen("session");
  };

  const start = (source) => {
    sessionId.current = String(Date.now());
    setSavedAt(null);
    setSrc(source);
    setByLevel({});
    setStatus({});
    setAnswers({});
    setSlotIdx(0);
    setOpenQ(null);
    setSelfRating({});
    setGenErr(null);
    setIntent(null);
    intentRef.current = null;
    rejectedRef.current = [];
    setSelection("");
    saved.current = false;
    if (source.focusFirst) {
      setScreen("focus");
      return;
    }
    setScreen("session");
    runGeneration(source);
  };

  /* focus reading finished: log it, then write the questions */
  const finishReading = (reading) => {
    const pid = passageId(src.passage);
    const record = { ...reading, passage_id: pid, session_id: sessionId.current, app_version: APP_VERSION };
    logReading(record);
    if (reading.self_rating_after_reading != null) {
      const r = { rating_id: reading.reading_id, reading_id: reading.reading_id, session_id: sessionId.current, passage_id: pid, after_reading: reading.self_rating_after_reading, after_reading_at: reading.ended_at, rating_version: RATING_VERSION };
      setSelfRating(r);
      logSelfRating(r);
    }
    const source = { ...src, reading: record };
    setSrc(source);
    setScreen("session");
    runGeneration(source);
  };

  const answered = LEVELS.reduce((m, L) => {
    m[L.n] = Object.keys(answers).filter((k) => k.startsWith(L.n + "-")).length;
    return m;
  }, {});

  const record = (choice) => {
    const key = slot.level + "-" + slot.i;
    setAnswers((a) => ({
      ...a,
      [key]: {
        choice,
        correct: !!item.options[choice].correct,
        hints: hintLevel,
        hintKinds: earned,
        /* coach turns BEFORE answering count as help; turns after answering are feedback */
        coach: (coachMap[qKey] || []).filter((u) => !u.answered),
        coachAfter: (coachMap[qKey] || []).filter((u) => u.answered),
        helped: hintLevel > 0 || (coachMap[qKey] || []).some((u) => !u.answered),
        locationShown: earned.some((k) => LOCATION_KINDS.includes(k)),
        wordGrade: wordGrades.current[qKey] || null,
        /* word look-ups before answering (stem, options or passage); not counted as help */
        lookups: (lookupMap[qKey] || []).filter((u) => !u.answered),
      },
    }));
  };

  const prev = () => {
    if (slotIdx > 0) {
      setSlotIdx(slotIdx - 1);
      setShowPassage(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const next = () => {
    if (slotIdx + 1 < slots.length) {
      setSlotIdx(slotIdx + 1);
      setShowPassage(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setScreen(openQ ? "open" : "review");
    }
  };

  const retryMissed = () => {
    setAnswers((a) => {
      const kept = {};
      Object.entries(a).forEach(([k, v]) => {
        if (v.correct) kept[k] = v;
      });
      return kept;
    });
    const firstWrong = slots.findIndex((s) => {
      const v = answers[s.level + "-" + s.i];
      return v && !v.correct;
    });
    setSlotIdx(firstWrong === -1 ? 0 : firstWrong);
    setScreen("session");
  };

  const jumpNextUnanswered = () => {
    const i = slots.findIndex((s) => !answers[s.level + "-" + s.i]);
    if (i === -1) setScreen(openQ ? "open" : "review");
    else setSlotIdx(i);
  };

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }}>
      <Fonts />

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showVocab && <VocabDrawer onClose={() => setShowVocab(false)} />}
      {showNotes && <NotesDrawer onClose={() => setShowNotes(false)} />}
      {asking && selection && (
        <AskPanel
          selection={selection}
          passage={src.passage}
          prompt={src.prompt}
          intent={intent}
          currentStem={item?.stem}
          item={screen === "session" && item ? item : null}
          answered={hasAnswered}
          choice={hasAnswered ? answers[slot.level + "-" + slot.i]?.choice : null}
          aboutQuestion={asking === "question"}
          learner={learnerText(loadConfig())}
          onUse={(u) => setCoachMap((m) => ({ ...m, [qKey]: [...(m[qKey] || []), u] }))}
          onClose={() => setAsking(false)}
        />
      )}
      {lookup && (
        <WordCard word={lookup.word} sentence={lookup.sentence} onClose={() => setLookup(null)} />
      )}

      <button
        onClick={() => setShowNotes(true)}
        className="ql-focus fixed z-40 px-3 py-2"
        style={{
          top: 12,
          right: 156,
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 2,
          fontFamily: F.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.slate,
        }}
      >
        Notes
      </button>

      <button
        onClick={() => setShowVocab(true)}
        className="ql-focus fixed z-40 px-3 py-2"
        style={{
          top: 12,
          right: 84,
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 2,
          fontFamily: F.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.slate,
        }}
      >
        Words
      </button>

      <button
        onClick={() => setShowSettings(true)}
        className="ql-focus fixed z-40 px-3 py-2"
        style={{
          top: 12,
          right: 12,
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 2,
          fontFamily: F.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.slate,
        }}
      >
        Model
      </button>

      {screen === "setup" && <Setup onStart={start} onResume={resume} />}
      {screen === "focus" && (
        <FocusReading
          passage={src.passage}
          structure={structure}
          title={src.meta?.title || ""}
          plan={src.plan}
          learner={learnerText(loadConfig())}
          draftKey={"ql:focus:" + passageId(src.passage)}
          onFinish={finishReading}
          onExit={() => setScreen("setup")}
        />
      )}

      {(screen === "session" || screen === "open") && (
        <div>
          <div
            className="sticky top-0 z-10 px-5 py-4"
            style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}
          >
            <div className="max-w-6xl mx-auto flex items-end gap-6">
              <button
                onClick={() => {
                  persistNow();
                  setScreen("setup");
                }}
                title="Saves this passage, then lets you start another"
                className="ql-focus shrink-0 pb-1 text-left"
                style={{
                  fontFamily: F.mono,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: C.slate,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ textTransform: "uppercase" }}>← Save &amp; new</span>
                <br />
                <span style={{ color: C.mute }}>passage</span>
              </button>
              <Climb counts={counts} answered={answered} current={screen === "open" ? 4 : slot?.level} />
              <button
                onClick={persistNow}
                className="ql-focus shrink-0 pb-1 text-right"
                title="Your progress saves by itself; this forces it now"
                style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.06em", color: C.slate, lineHeight: 1.4 }}
              >
                <span style={{ textTransform: "uppercase" }}>Save</span>
                <br />
                <span style={{ color: C.mute }}>{savedAt ? formatWhen(savedAt).split(" · ")[1] : "—"}</span>
              </button>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-5 py-8 grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 order-1">
              {intent?.goal && (
                <div
                  className="mb-3 px-4 py-3"
                  style={{ background: C.tealSoft, border: `1px solid ${C.teal}`, borderRadius: 2 }}
                >
                  <Eyebrow color={C.teal}>What you were trying to do</Eyebrow>
                  <p className="mt-1" style={{ fontFamily: F.read, fontSize: 16, lineHeight: 1.45, color: C.ink }}>
                    {intent.goal}
                  </p>
                </div>
              )}
              <div
                className="px-5 py-6 sm:px-8 sm:py-8"
                style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}
              >
                {screen === "open" && openQ && (
                  <OpenQuestion
                    key={openQ.written_id || openQ.stem}
                    q={openQ}
                    passage={src.passage}
                    structure={structure}
                    onUpdate={(patch) => setOpenQ((o) => ({ ...o, ...patch }))}
                    onFocus={(w, f) => setOpenFocus({ where: w, focus: f })}
                    onDone={() => setScreen("review")}
                  />
                )}

                {screen === "session" && item && (
                  <Question
                    item={item}
                    slotNo={slotIdx + 1}
                    total={slots.length}
                    answer={answers[slot.level + "-" + slot.i]}
                    onAnswer={record}
                    onNext={next}
                    onPrev={prev}
                    savedGrade={wordGrades.current[qKey]}
                    isLast={slotIdx + 1 === slots.length}
                    onWord={(word, sentence) => {
                      setLookup({ word, sentence });
                      /* where she looked a word up, for the research log */
                      const where = sentence === item.stem ? "stem" : item.options.some((o) => o.text === sentence) ? "option" : "passage";
                      setLookupMap((m) => ({ ...m, [qKey]: [...(m[qKey] || []), { word, where, answered: hasAnswered, at: new Date().toISOString() }] }));
                    }}
                    onAskCoach={() => {
                      setSelection(item.stem);
                      setAsking("question");
                    }}
                    where={where}
                    where2={where2}
                    steps={steps}
                    hintLevel={hintLevel}
                    onHint={nextHint}
                    contextLine={contextLine}
                    onGraded={(g) => (wordGrades.current[qKey] = g)}
                    passage={src.passage}
                    flagMeta={{
                      sessionId: sessionId.current,
                      questionId: slot.level + "-" + slot.i,
                      title: (src.prompt || src.passage || "").slice(0, 70).replace(/\s+/g, " "),
                    }}
                    onFlagSaved={(rec) => {
                      const k = slot.level + "-" + slot.i;
                      setAnswers((a) => ({ ...a, [k]: { ...a[k], flag: rec } }));
                    }}
                  />
                )}

                {screen === "session" && !item && status[slot?.level] !== "error" && (
                  <div className="py-14 text-center">
                    <p style={{ fontFamily: F.read, fontSize: 20, color: C.ink }}>
                      {status.intent === "loading"
                        ? "Reading your question first…"
                        : "Writing the level " + slot?.level + " questions…"}
                    </p>
                    <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 14, color: C.slate }}>
                      Read the passage while you wait — that is the point.
                    </p>
                  </div>
                )}

                {screen === "session" && !item && status[slot?.level] === "error" && (
                  <div className="py-12 text-center">
                    <p style={{ fontFamily: F.ui, fontSize: 15, color: C.brick }}>
                      Level {slot?.level} produced nothing usable.
                    </p>
                    <button
                      onClick={jumpNextUnanswered}
                      className="ql-focus mt-4 px-4 py-2"
                      style={{
                        border: `1px solid ${C.ink}`,
                        borderRadius: 2,
                        fontFamily: F.ui,
                        fontSize: 13,
                        color: C.ink,
                      }}
                    >
                      Skip to what's ready
                    </button>
                  </div>
                )}
              </div>

              {genErr && <Diagnosis d={genErr} onOpenSettings={() => setShowSettings(true)} />}

              <div className="mt-4 lg:hidden">
                <button
                  onClick={() => setShowPassage((v) => !v)}
                  className="ql-focus px-4 py-2 w-full"
                  style={{
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    borderRadius: 2,
                    fontFamily: F.ui,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.ink,
                  }}
                >
                  {showPassage ? "Hide the passage" : "Show the passage"}
                </button>
                {showPassage && (
                  <div className="mt-3">
                    <PassagePanel
                      prompt={src.prompt}
                      structure={structure}
                      compact
                      where={screen === "open" ? openFocus.where : where}
                      where2={screen === "open" ? null : item?.level === 3 ? where2 : null}
                      focus={screen === "open" ? openFocus.focus : passageFocus}
                      keyword={screen === "open" ? "" : passageKeyword}
                      onWord={(word, sentence) => setLookup({ word, sentence })}
                      onSelect={setSelection}
                    />
                    <SelectionBar
                      selection={selection}
                      onAsk={() => setAsking(true)}
                      onNote={() => setAsking(true)}
                      onClear={() => setSelection("")}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="hidden lg:block lg:col-span-5 order-2">
              <div className="sticky" style={{ top: 96 }}>
                <PassagePanel
                  prompt={src.prompt}
                  structure={structure}
                  where={screen === "open" ? openFocus.where : where}
                  where2={screen === "open" ? null : item?.level === 3 ? where2 : null}
                  focus={screen === "open" ? openFocus.focus : passageFocus}
                  keyword={screen === "open" ? "" : passageKeyword}
                  onWord={(word, sentence) => setLookup({ word, sentence })}
                  onSelect={setSelection}
                />
                <SelectionBar
                  selection={selection}
                  onAsk={() => setAsking(true)}
                  onNote={() => setAsking(true)}
                  onClear={() => setSelection("")}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {screen === "review" && (
        <Review
          byLevel={byLevel}
          answers={answers}
          onRestart={() => setScreen("setup")}
          onRetry={retryMissed}
          rejected={rejectedRef.current}
          shortfalls={shortfallsRef.current}
          openQ={openQ}
          onOpenWritten={() => setScreen("open")}
          selfRating={selfRating}
          onRate={(n, stats) => {
            const r = {
              ...selfRating,
              rating_id: selfRating.rating_id || "S" + sessionId.current,
              session_id: sessionId.current,
              run_id: runRef.current?.runId || null,
              after_questions: n,
              after_questions_at: new Date().toISOString(),
              rating_version: RATING_VERSION,
              ...stats,
            };
            setSelfRating(r);
            logSelfRating(r);
          }}
        />
      )}
    </div>
  );
}
