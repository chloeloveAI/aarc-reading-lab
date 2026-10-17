/* ------------------------------------------------------------------ *
 * research.js — append-only research log for the technical evaluation.
 *
 * Records, per generation RUN:
 *   - the passage (once, by stable passage_id)
 *   - every model CALL: settings, prompt version + hash, exemplar ids,
 *     latency, raw reply, error
 *   - every CANDIDATE item the model returned — accepted AND rejected —
 *     with each quality check's outcome and the rejection reasons
 *   - per-process SHORTFALLS (fewer accepted items than requested)
 *
 * Nothing here is ever edited or deleted by the app. Generating again,
 * even for the same passage, starts a new run with new ids.
 * Stored in this browser (localStorage "ql:research:v1"); export often.
 * ------------------------------------------------------------------ */

export const PROMPT_VERSION = "items-v10.3";
export const VALIDATOR_VERSION = "validator-v10.2";
export const APP_VERSION = "aarc-reading-lab-v10.4";

const KEY = "ql:research:v1";

/* cyrb53 — small, stable, synchronous string hash (not cryptographic) */
export function hash(str) {
  let h1 = 0xdeadbeef ^ 0,
    h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/* same text → same id, whatever session it was pasted in */
export function passageId(text) {
  return "P-" + hash(String(text).replace(/\r\n?/g, "\n").trim()).slice(0, 12);
}

export function newRunId() {
  const t = new Date();
  const stamp = t.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return "R" + stamp + "-" + Math.random().toString(36).slice(2, 6);
}

function empty() {
  return { schema: "aarc-research-log/1", passages: {}, runs: [], calls: [], candidates: [], shortfalls: [], diagnostics: [], annotations: [], reading_sessions: [] };
}

export function loadLog() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const d = JSON.parse(raw);
    return { ...empty(), ...d };
  } catch (e) {
    return empty();
  }
}

let warned = false;
function append(mutator) {
  const log = loadLog();
  mutator(log);
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
    return true;
  } catch (e) {
    /* storage full — never drop silently */
    if (!warned) {
      warned = true;
      alert(
        "The research log is full in this browser, so new records are NOT being saved. Download the research export now (home screen), then tell Claude so a larger store can be added."
      );
    }
    return false;
  }
}

export function logPassage(pid, text, meta) {
  append((log) => {
    if (!log.passages[pid]) log.passages[pid] = { passage_id: pid, text, words: (text.match(/\S+/g) || []).length, first_seen: new Date().toISOString(), ...meta };
  });
}

export function logRun(run) {
  append((log) => log.runs.push(run));
}

export function logRunEnd(runId, patch) {
  /* the only update the log allows: closing a run's own summary fields */
  append((log) => {
    const r = log.runs.find((x) => x.run_id === runId);
    if (r && !r.ended_at) Object.assign(r, patch);
  });
}

export function logRunModel(runId, model) {
  /* cloud runs: the model OpenRouter actually used is only known after a call */
  append((log) => {
    const r = log.runs.find((x) => x.run_id === runId);
    if (r && r.settings && !r.settings.model) {
      r.settings.model = model;
      if (r.settings.model_info) r.settings.model_info.name = model;
    }
  });
}

/* one focus-reading session: timer, look-ups, highlights, tutor dialogue */
export function logReading(r) {
  append((log) => {
    log.reading_sessions = log.reading_sessions || [];
    log.reading_sessions.push(r);
  });
}

export function logCall(call) {
  append((log) => log.calls.push(call));
}

export function logCandidates(list) {
  if (!list.length) return;
  append((log) => log.candidates.push(...list));
}

export function logShortfall(s) {
  append((log) => log.shortfalls.push(s));
}

/* non-blocking diagnostics (e.g. the shadow process-3 meaning check):
   separate records that point at a candidate_id, never edit it */
export function logDiagnostic(d) {
  append((log) => log.diagnostics.push(d));
}

/* Researcher annotations on a candidate (e.g. "real failure case").
   Append-only: a later annotation supersedes nothing; all are exported.
   These are the DEVELOPER's labels — they must never be shown to blind
   raters, and they are not ratings. */
export const ANNOTATION_TAGS = {
  real_failure_case: "Real failure case",
  suspected_process_misalignment: "Suspected process misalignment",
  valid_item_wrongly_rejected: "Looks valid but was rejected",
  include_in_human_review: "Include in blind human review",
};

export function logAnnotation(a) {
  return append((log) => {
    log.annotations = log.annotations || [];
    log.annotations.push({ annotation_id: "A" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), annotator: "developer (H1)", ...a });
  });
}

/* rule-based checks, grouped so structural and surface rules are not
   confused with any judgement of meaning */
export const STRUCTURAL_CHECKS = ["four_options", "single_key", "distinct_options", "stem_complete", "anchor_found", "anchor2_found", "anchor2_distinct", "cross_paragraph"];
export const SURFACE_CONTENT_CHECKS = ["not_copied", "not_combo_grid", "not_duplicate", "distinct_evidence"];
/* coverage (v10.4): evidence from the planned quarter; targeted items use the reader's focus */
export const COVERAGE_CHECKS = ["in_target_quarter", "focus_addressed"];

export function logSummary() {
  const log = loadLog();
  const acc = log.candidates.filter((c) => c.accepted).length;
  return { runs: log.runs.length, candidates: log.candidates.length, accepted: acc, rejected: log.candidates.length - acc, shortfalls: log.shortfalls.length };
}

/* ---------------------------- export ------------------------------ */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const csvCell = (v) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

export function exportLogJSON(extra = {}) {
  download(`aarc-research-log-${stamp()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), app_version: APP_VERSION, ...extra, ...loadLog() }, null, 2), "application/json");
}

/* one row per candidate — accepted and rejected — with its run's settings */
const CHECKS = ["four_options", "single_key", "distinct_options", "stem_complete", "anchor_found", "not_copied", "anchor2_found", "anchor2_distinct", "cross_paragraph", "not_combo_grid", "not_duplicate", "distinct_evidence", "in_target_quarter", "focus_addressed"];

export function exportCandidatesCSV() {
  const log = loadLog();
  const runs = Object.fromEntries(log.runs.map((r) => [r.run_id, r]));
  const calls = Object.fromEntries(log.calls.map((c) => [c.call_id, c]));
  const passages = log.passages || {};
  /* latest shadow meaning check per candidate (there is normally one) */
  const l3m = {};
  (log.diagnostics || []).filter((d) => d.check === "l3_meaning").forEach((d) => (l3m[d.candidate_id] = d));
  const l4m = {};
  (log.diagnostics || []).filter((d) => d.check === "l4_meaning").forEach((d) => (l4m[d.candidate_id] = d));
  const ann = {};
  (log.annotations || []).forEach((a) => (ann[a.candidate_id] = ann[a.candidate_id] || []).push(a));
  const failed = (c, list) => list.filter((k) => c.checks?.[k] === false).join(" ");
  const yn = (v) => (v === true ? "yes" : v === false ? "no" : "");
  const cols = [
    ["candidate_id", (c) => c.candidate_id],
    ["run_id", (c) => c.run_id],
    ["passage_id", (c) => c.passage_id],
    ["call_id", (c) => c.call_id],
    ["intended_process", (c) => c.intended_process],
    ["attempt_pass", (c) => calls[c.call_id]?.pass_mode],
    ["accepted", (c) => (c.accepted ? "yes" : "no")],
    ["stage_rejected", (c) => c.stage_rejected || ""],
    /* rule-based decision only; says nothing about meaning */
    ["failed_structural_checks", (c) => failed(c, STRUCTURAL_CHECKS)],
    ["failed_surface_content_checks", (c) => failed(c, SURFACE_CONTENT_CHECKS)],
    ["failed_coverage_checks", (c) => failed(c, COVERAGE_CHECKS)],
    /* developer annotations (never shown to blind raters) */
    ["researcher_tags", (c) => [...new Set((ann[c.candidate_id] || []).map((a) => a.tag))].join(" ")],
    ["researcher_notes", (c) => (ann[c.candidate_id] || []).map((a) => a.note).filter(Boolean).join(" | ")],
    ["reasons", (c) => (c.reasons || []).join(" | ")],
    ...CHECKS.map((k) => ["check_" + k, (c) => (c.checks?.[k] == null ? "n/a" : c.checks[k] ? "pass" : "fail")]),
    ["anchor_match", (c) => c.anchor_match || ""],
    ["slot_id", (c) => c.slot_id || ""],
    ["target_quarter", (c) => c.target_quarter ?? ""],
    ["anchor_quarter", (c) => c.anchor_quarter ?? ""],
    ["target_focus_kind", (c) => c.target_focus?.kind || ""],
    ["target_focus_text", (c) => c.target_focus?.text || ""],
    ["reading_id", (c) => runs[c.run_id]?.reading_id || ""],
    ["skill", (c) => c.item?.skill],
    ["stem", (c) => c.item?.stem ?? c.raw?.stem],
    ["option_A", (c) => c.item?.options?.[0]?.text],
    ["option_B", (c) => c.item?.options?.[1]?.text],
    ["option_C", (c) => c.item?.options?.[2]?.text],
    ["option_D", (c) => c.item?.options?.[3]?.text],
    ["keyed_answer", (c) => (c.item ? LETTERS[c.item.options.findIndex((o) => o.correct)] : "")],
    ["anchor", (c) => c.item?.anchor],
    ["anchor_section", (c) => c.anchor_loc?.section ?? ""],
    ["anchor_paragraph", (c) => c.anchor_loc?.para ?? ""],
    ["anchor2", (c) => c.item?.anchor2],
    ["anchor2_section", (c) => c.anchor2_loc?.section ?? ""],
    ["anchor2_paragraph", (c) => c.anchor2_loc?.para ?? ""],
    ["link", (c) => c.item?.link],
    ["prompt_version", (c) => runs[c.run_id]?.prompt_version],
    ["validator_version", (c) => runs[c.run_id]?.validator_version],
    ["l3_strict", (c) => (runs[c.run_id]?.settings?.l3Strict ? "yes" : "no")],
    ["provider", (c) => runs[c.run_id]?.settings?.provider],
    ["model", (c) => runs[c.run_id]?.settings?.model],
    ["model_digest", (c) => runs[c.run_id]?.settings?.model_digest],
    ["model_quantisation", (c) => runs[c.run_id]?.settings?.model_info?.quantization_level || ""],
    ["model_parameter_size", (c) => runs[c.run_id]?.settings?.model_info?.parameter_size || ""],
    ["model_family", (c) => runs[c.run_id]?.settings?.model_info?.family || ""],
    ["modelfile_parameters", (c) => (runs[c.run_id]?.settings?.model_info?.parameters || "").replace(/\s+/g, " ").trim()],
    ["ollama_version", (c) => runs[c.run_id]?.settings?.model_info?.ollama_version || ""],
    ["think", (c) => (runs[c.run_id]?.settings?.think ? "on" : "off")],
    ["num_ctx", (c) => runs[c.run_id]?.settings?.num_ctx ?? ""],
    ["temperature", (c) => runs[c.run_id]?.settings?.temperature],
    ["items_per_call", (c) => runs[c.run_id]?.settings?.itemsPerCall],
    ["learner_profile", (c) => runs[c.run_id]?.settings?.learner],
    ["text_type", (c) => runs[c.run_id]?.settings?.textType],
    ["exemplar_ids", (c) => (calls[c.call_id]?.exemplar_ids || []).join(" ")],
    ["call_latency_ms", (c) => calls[c.call_id]?.latency_ms ?? ""],
    ["call_output_tokens", (c) => calls[c.call_id]?.meta?.output_tokens ?? ""],
    ["call_done_reason", (c) => calls[c.call_id]?.meta?.done_reason ?? ""],
    ["call_num_predict", (c) => calls[c.call_id]?.meta?.num_predict ?? calls[c.call_id]?.max_tokens ?? ""],
    ["call_think_sent", (c) => { const m = calls[c.call_id]?.meta; return m?.think_sent == null ? (runs[c.run_id]?.settings?.think ? "on" : "off") : m.think_sent ? "on" : "off"; }],
    ["call_thinking_chars", (c) => calls[c.call_id]?.meta?.thinking_chars ?? ""],
    ["passage_title", (c) => passages[c.passage_id]?.title || ""],
    ["passage_source", (c) => runs[c.run_id]?.passage_meta?.source || passages[c.passage_id]?.source || ""],
    ["passage_licence", (c) => runs[c.run_id]?.passage_meta?.licence || passages[c.passage_id]?.licence || ""],
    ["passage_words", (c) => passages[c.passage_id]?.words ?? ""],
    /* shadow process-3 meaning check — diagnostic only, never used to reject */
    ["l3m_status", (c) => (c.intended_process === 3 ? l3m[c.candidate_id]?.status || "not run" : "n/a")],
    ["l3m_requires_integration", (c) => yn(l3m[c.candidate_id]?.result?.requires_integration)],
    ["l3m_spans_coherent", (c) => yn(l3m[c.candidate_id]?.result?.spans_coherent)],
    ["l3m_single_sentence_answerable", (c) => yn(l3m[c.candidate_id]?.result?.single_sentence_answerable)],
    ["l3m_single_sentence_quote", (c) => l3m[c.candidate_id]?.result?.single_sentence_quote || ""],
    ["l3m_unsupported_inference", (c) => yn(l3m[c.candidate_id]?.result?.unsupported_inference)],
    ["l3m_reason", (c) => l3m[c.candidate_id]?.result?.reason || l3m[c.candidate_id]?.error || ""],
    ["l3m_version", (c) => l3m[c.candidate_id]?.check_version || ""],
    ["l3m_model", (c) => l3m[c.candidate_id]?.model || ""],
    /* shadow process-4 meaning check — diagnostic only */
    ["l4m_status", (c) => (c.intended_process === 4 ? l4m[c.candidate_id]?.status || "not run" : "n/a")],
    ["l4m_applies_evaluative_criterion", (c) => yn(l4m[c.candidate_id]?.result?.applies_evaluative_criterion)],
    ["l4m_criterion", (c) => l4m[c.candidate_id]?.result?.criterion || ""],
    ["l4m_answer_stated_in_text", (c) => yn(l4m[c.candidate_id]?.result?.answer_stated_in_text)],
    ["l4m_stated_quote", (c) => l4m[c.candidate_id]?.result?.stated_quote || ""],
    ["l4m_superficial_evaluative_wording", (c) => yn(l4m[c.candidate_id]?.result?.superficial_evaluative_wording)],
    ["l4m_reason", (c) => l4m[c.candidate_id]?.result?.reason || l4m[c.candidate_id]?.error || ""],
    ["l4m_version", (c) => l4m[c.candidate_id]?.check_version || ""],
    ["created_at", (c) => c.created_at],
  ];
  const rows = [cols.map((c) => c[0]).join(",")].concat(log.candidates.map((c) => cols.map(([, g]) => csvCell(g(c))).join(",")));
  download(`aarc-candidates-${stamp()}.csv`, "﻿" + rows.join("\r\n"), "text/csv");
}

/* one row per model CALL, including failed calls (truncation, parse
   errors) that produced no candidate */
export function exportCallsCSV() {
  const log = loadLog();
  const cols = [
    ["call_id", (c) => c.call_id],
    ["run_id", (c) => c.run_id],
    ["intended_process", (c) => c.intended_process],
    ["pass_mode", (c) => c.pass_mode],
    ["items_requested", (c) => c.items_requested],
    ["ok", (c) => (c.ok ? "yes" : "no")],
    ["error_kind", (c) => c.error_kind || (c.ok ? "" : "unclassified (pre-v10.2)")],
    ["error", (c) => c.error || ""],
    ["done_reason", (c) => c.meta?.done_reason ?? ""],
    ["output_tokens_eval_count", (c) => c.meta?.output_tokens ?? ""],
    ["num_predict", (c) => c.meta?.num_predict ?? c.max_tokens ?? ""],
    ["prompt_tokens", (c) => c.meta?.prompt_tokens ?? ""],
    ["think_sent", (c) => (c.meta?.think_sent == null ? "" : c.meta.think_sent ? "on" : "off")],
    ["answer_chars", (c) => c.meta?.content_chars ?? (c.raw_reply || "").length],
    ["thinking_chars", (c) => c.meta?.thinking_chars ?? ""],
    ["latency_ms", (c) => c.latency_ms ?? ""],
    ["prompt_version", (c) => c.prompt_version],
    ["shortfall_reason", (c) => c.shortfall_reason || ""],
    ["raw_reply", (c) => c.raw_reply || ""],
  ];
  const rows = [cols.map((c) => c[0]).join(",")].concat(log.calls.map((c) => cols.map(([, g]) => csvCell(g(c))).join(",")));
  download(`aarc-calls-${stamp()}.csv`, "\ufeff" + rows.join("\r\n"), "text/csv");
}

/* one row per focus-reading event: session summary, word look-up,
   highlight, tutor turn — in time order within each session */
export function exportReadingCSV() {
  const log = loadLog();
  const runs = log.runs || [];
  const cols = ["reading_id", "run_id", "passage_id", "event", "at", "quarter", "line", "text", "saved_to_vocab", "role", "highlight_id", "reading_active_ms", "reading_total_ms", "progress_highlight_pct", "progress_scroll_pct", "tutor_version"];
  const rows = [cols.join(",")];
  for (const r of log.reading_sessions || []) {
    const run = runs.find((x) => x.reading_id === r.reading_id);
    const base = { reading_id: r.reading_id, run_id: run?.run_id || "", passage_id: r.passage_id || "", tutor_version: r.tutor_version || "" };
    const ev = [];
    ev.push({ ...base, event: "session", at: r.started_at, reading_active_ms: r.active_ms, reading_total_ms: r.total_ms, progress_highlight_pct: r.progress_highlight_pct, progress_scroll_pct: r.progress_scroll_pct });
    (r.lookups || []).forEach((l) => ev.push({ ...base, event: "word_lookup", at: l.at, quarter: l.quarter, line: l.line, text: l.word, saved_to_vocab: l.saved ? "yes" : "no" }));
    (r.highlights || []).forEach((h) => ev.push({ ...base, event: "highlight", at: h.at, quarter: h.quarter, line: h.start_line, text: h.text, highlight_id: h.id }));
    (r.tutor || []).forEach((t) => (t.turns || []).forEach((u) => ev.push({ ...base, event: "tutor_turn", at: u.at, role: u.role, text: u.text, highlight_id: t.highlight_id })));
    ev.sort((x, y) => String(x.at).localeCompare(String(y.at)));
    ev.forEach((e) => rows.push(cols.map((k) => csvCell(e[k])).join(",")));
  }
  download(`aarc-reading-${stamp()}.csv`, "\ufeff" + rows.join("\r\n"), "text/csv");
}

/* ------------------------- exemplar library ------------------------ *
 * Curated example items shown to the model as a style guide.
 * Only entries with permission_confirmed === true are ever used.          */

const EX_KEY = "ql:exemplars:v1";

export function loadExemplars() {
  try {
    const d = JSON.parse(localStorage.getItem(EX_KEY) || "[]");
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

export function saveExemplars(list) {
  try {
    localStorage.setItem(EX_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

/* validate an imported file; returns { ok: [...], problems: [...] } */
export function checkExemplars(data) {
  const list = Array.isArray(data) ? data : data?.exemplars;
  const ok = [];
  const problems = [];
  if (!Array.isArray(list)) return { ok, problems: ["The file needs an array, or {\"exemplars\": [...]}."] };
  list.forEach((e, i) => {
    const where = "Entry " + (i + 1) + (e?.id ? ` (${e.id})` : "");
    if (!e || typeof e !== "object") return problems.push(where + ": not an object.");
    if (![1, 2, 3, 4].includes(Number(e.process))) return problems.push(where + ": process must be 1–4.");
    if (!e.stem || !Array.isArray(e.options) || e.options.length !== 4) return problems.push(where + ": needs a stem and exactly 4 options.");
    const key = typeof e.correct === "number" ? e.correct : LETTERS.indexOf(String(e.correct || "").toUpperCase());
    if (key < 0 || key > 3) return problems.push(where + ": correct must be 0–3 or A–D.");
    ok.push({
      id: String(e.id || "EX-" + (i + 1)),
      process: Number(e.process),
      text_type: e.text_type || "any",
      skill: e.skill || "",
      passage_excerpt: e.passage_excerpt || "",
      role: e.role === "negative" ? "negative" : "positive",
      stem: String(e.stem),
      options: e.options.map(String),
      correct: key,
      evidence: Array.isArray(e.evidence) ? e.evidence.map(String) : [],
      process_rationale: String(e.process_rationale || ""),
      why_bad: String(e.why_bad || ""),
      source: e.source || "",
      permission_confirmed: e.permission_confirmed === true,
    });
  });
  return { ok, problems };
}
