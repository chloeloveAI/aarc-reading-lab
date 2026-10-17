/* ------------------------------------------------------------------ *
 * AGS Testing Lab — engine: model calls, mock mode, sample loading, log.
 * Development tool. Separate page (ags.html); Full Climb is untouched
 * (this file only READS the saved Ollama settings via llm.js).
 * ------------------------------------------------------------------ */
import { loadConfig, modelInfo } from "../llm.js";
import { contentWords, words, isRelational, findQuote, paragraphs } from "../ags.js";

import tp01Raw from "../../research/test_passage_free_buses.md?raw";
import tp02Raw from "../../research/test_passage_last_repair.md?raw";
import tp03Raw from "../../research/test_passage_bread.md?raw";
import tp01Map from "../../tests/fixtures/tp01_map.json";
import tp02Map from "../../tests/fixtures/tp02_map.json";
import tp03Map from "../../tests/fixtures/tp03_map.json";

export const LAB_VERSION = "ags-lab-v0.1";

const body = (raw) => raw.split(/\n---\n/)[1].trim();
const clone = (x) => JSON.parse(JSON.stringify(x));

export const SAMPLES = [
  { id: "TP-01", title: "Free Buses, Full Seats?", type: "informational_argumentative", label: "Argumentative", passage: body(tp01Raw), map: tp01Map },
  { id: "TP-02", title: "The Last Repair", type: "narrative", label: "Narrative", passage: body(tp02Raw), map: tp02Map },
  { id: "TP-03", title: "Why Bread Rises", type: "informational_explanatory", label: "Explanatory", passage: body(tp03Raw), map: tp03Map },
].map((s) => ({ ...s, map: clone(s.map) }));

/* ----------------------------- settings ----------------------------- */

const CFG_KEY = "ags:lab:config";
export function loadLabConfig() {
  const base = loadConfig(); /* the app's saved settings, read only */
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
  } catch (e) {}
  return {
    mode: saved.mode || "ollama",
    baseUrl: saved.baseUrl || base.ollama?.baseUrl || "http://localhost:11434",
    model: saved.model || base.ollama?.model || "qwen3.5:27b",
  };
}
export function saveLabConfig(c) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(c));
  } catch (e) {}
}

export async function labModelInfo(c) {
  if (c.mode === "mock") return { name: "mock", note: "keyword matching, not a model" };
  return modelInfo({ provider: "ollama", ollama: { baseUrl: c.baseUrl, model: c.model } });
}

/* ------------------------------ Ollama ------------------------------ */

const SYSTEM = "You check reading for a researcher. Reply with a single JSON object and nothing else: no preamble, no markdown fence.";

export async function ollamaJSON(c, { prompt, schema, temperature, maxTokens, timeoutMs = 420000 }) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    let res;
    try {
      res = await fetch(c.baseUrl.replace(/\/$/, "") + "/api/chat", {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: c.model,
          stream: false,
          think: false,
          keep_alive: "15m",
          format: schema,
          options: { temperature, num_predict: maxTokens, num_ctx: 16384 },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
      });
    } catch (e) {
      if (e.name === "AbortError") throw new Error(`No reply from Ollama within ${Math.round(timeoutMs / 60000)} minutes. Check that 'ollama ps' shows 100% GPU.`);
      throw new Error(`Could not reach Ollama at ${c.baseUrl}. Is it running? (${e.message})`);
    }
    if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const d = await res.json();
    const content = (d.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const meta = {
      done_reason: d.done_reason,
      output_tokens: d.eval_count,
      prompt_tokens: d.prompt_eval_count,
      num_predict: maxTokens,
      thinking_chars: (d.message?.thinking || "").length,
      latency_ms: Date.now() - t0,
      model: d.model,
    };
    if (d.done_reason === "length") {
      const e = new Error(`Output truncated: the reply reached ${d.eval_count} of ${maxTokens} output tokens before the JSON was complete.`);
      Object.assign(e, { raw: content, meta });
      throw e;
    }
    try {
      const parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
      return { content, parsed, meta };
    } catch (err) {
      const e = new Error("The model's reply was not valid JSON.");
      Object.assign(e, { raw: content, meta });
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(c) {
  if (c.mode === "mock") return "Mock mode: no model is called.";
  const out = await ollamaJSON(c, {
    prompt: 'Reply with exactly {"ok":true}',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    temperature: 0,
    maxTokens: 40,
    timeoutMs: 180000,
  });
  if (out.parsed?.ok !== true) throw new Error("The model replied, but not with the expected JSON.");
  return `Connected to ${c.model} (${(out.meta.latency_ms / 1000).toFixed(1)} s).`;
}

/* ------------------------------- mock ------------------------------- *
 * NOT a model and NOT a judgement of understanding: simple word overlap,
 * so the interface can be tested without Ollama. Every mock record says so.
 * --------------------------------------------------------------------- */

const stem = (w) => w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "");
function overlapSpan(label, answer) {
  const want = new Set(contentWords(label).map(stem));
  const got = words(answer).filter((w) => want.has(stem(w)));
  const share = want.size ? new Set(got.map(stem)).size / want.size : 0;
  return share >= 0.34 && got.length ? got[0] : "";
}
const LINKER = /\b(because|so|therefore|which|led|leads|cause[sd]?|why|since|result|but|although|after|then|thanks)\b|因為|所以|因此|於是/i;
const READING = /\b(lesson|moral|theme|message|teaches|shows that|is about how)\b/i;

export function mockVerdict(idea, answer, passageType) {
  const elements = {};
  (idea.elements || []).forEach((e) => {
    const span = overlapSpan(e.label, answer);
    elements[e.id] = { status: span ? "present" : "absent", learner_span: span };
  });
  const allPresent = Object.values(elements).every((x) => x.status === "present");
  const m = answer.match(READING);
  return {
    reason: "MOCK: keyword overlap with the element labels. Not a model judgement.",
    answer_language: /[一-鿿]/.test(answer) ? (/[a-z]/i.test(answer) ? "mixed" : "zh") : "en",
    no_attempt: false,
    elements,
    contradicts_text: false,
    misreading: false,
    relation_expressed: isRelational(idea) ? (allPresent && LINKER.test(answer) ? "correct" : "missing") : "not_applicable",
    alternative: { judgement: "none", passage_quote: "", states_relation: false },
    expression_unclear: false,
    ...(passageType === "narrative" ? { interpretation: m ? { judgement: "uncertain", learner_span: m[0] } : { judgement: "none", learner_span: "" } } : {}),
  };
}

export function mockSummary(map, summary) {
  const ideas = {};
  const relations = {};
  (map.ideas || []).forEach((i) => {
    const spans = (i.elements || []).map((e) => overlapSpan(e.label, summary)).filter(Boolean);
    const covered = spans.length >= Math.ceil((i.elements || []).length / 2);
    ideas[i.id] = { status: covered ? "covered" : "missing", learner_span: covered ? spans[0] : "" };
    if (isRelational(i)) relations[i.id] = { status: covered && LINKER.test(summary) ? "correct" : "missing", learner_span: covered && LINKER.test(summary) ? summary.match(LINKER)[0] : "" };
  });
  return { reason: "MOCK: keyword overlap. Not a model judgement.", ideas, relations, unsupported_claims: [], too_much_detail: false, expression_unclear: false };
}

/* ----------------------------- passage ------------------------------ */

/* blocks as the rule module numbers them (paragraph index from findQuote) */
export function passageBlocks(passage) {
  return paragraphs(passage).map((text, i) => ({ i, text, heading: i === 0 || (text.length < 60 && !/[.!?:"']$/.test(text)) }));
}

/* where an idea's evidence is: block indices + the quote text */
export function ideaEvidence(idea, passage) {
  return (idea?.evidence || [])
    .map((e) => ({ quote: e.quote, ...findQuote(passage, e.quote) }))
    .filter((x) => x.found);
}

/* ---------------------------- research log --------------------------- *
 * Append-only list of sessions; a session record is only ever extended. */

const LOG_KEY = "ags:lab:log:v1";
export function loadLabLog() {
  try {
    const d = JSON.parse(localStorage.getItem(LOG_KEY) || "{}");
    return { schema: "ags-lab-log/1", sessions: [], ...d };
  } catch (e) {
    return { schema: "ags-lab-log/1", sessions: [] };
  }
}
export function saveSessionRecord(rec) {
  const log = loadLabLog();
  const i = log.sessions.findIndex((s) => s.session_id === rec.session_id);
  if (i === -1) log.sessions.push(rec);
  else log.sessions[i] = rec; /* the same session, extended */
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
    return true;
  } catch (e) {
    return false;
  }
}

export function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function turnsCSV(sessions) {
  const cols = [
    "session_id", "sample_id", "passage_type", "mode", "model", "map_source", "map_review_status", "turn", "idea_id", "move", "question_shown", "answer",
    "classification", "elements", "relation_status", "alternative", "interpretation", "comprehension_errors", "expression_flags", "code_downgrades",
    "next_move", "support_level", "outcome", "latency_ms", "output_tokens", "model_reason",
  ];
  const rows = [];
  sessions.forEach((s) =>
    (s.turns || []).forEach((t) =>
      rows.push({
        session_id: s.session_id, sample_id: s.sample_id, passage_type: s.passage_type, mode: s.mode, model: s.model_info?.name, map_source: s.map_source, map_review_status: s.map_review_status,
        turn: t.turn, idea_id: t.idea_id, move: t.question_asked?.move, question_shown: t.question_shown, answer: t.answer,
        classification: t.classification?.classification,
        elements: Object.entries(t.normalised?.verdict?.elements || {}).map(([k, v]) => `${k}:${v}`).join(" "),
        relation_status: t.classification?.relation_status || "", alternative: t.classification?.alternative_outcome, interpretation: t.classification?.interpretation?.judgement,
        comprehension_errors: (t.classification?.comprehension_errors || []).join(" "), expression_flags: (t.classification?.expression_flags || []).join(" "),
        code_downgrades: (t.normalised?.audit?.downgrades || []).join(" | "),
        next_move: t.next?.move, support_level: t.support_level, outcome: t.outcome || "", latency_ms: t.meta?.latency_ms ?? "", output_tokens: t.meta?.output_tokens ?? "", model_reason: t.normalised?.reason,
      })
    )
  );
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
