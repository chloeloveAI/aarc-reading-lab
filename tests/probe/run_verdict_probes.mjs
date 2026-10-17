/* Real-model probe for the AGS answer-verdict prompt (agsverdict-v0.1).
 *
 *   node tests/probe/run_verdict_probes.mjs --model qwen3.5:27b
 *   node tests/probe/run_verdict_probes.mjs --model qwen3.5:27b --repeat 3
 *   node tests/probe/run_verdict_probes.mjs --mock          (plumbing check only)
 *
 * Options: --base http://localhost:11434   --repeat N (default 1)
 *
 * Writes research/probe_results/verdict_<model>_<time>.json and .csv.
 * The CSV has blank researcher_agrees / researcher_note columns for the
 * human check. Results are EMPIRICAL OBSERVATIONS of one model on one
 * passage. They are not a validation of the verdict prompt.            */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildVerdictPrompt, verdictSchema, AGS_PROMPT_VERSIONS, AGS_CALL_SETTINGS } from "../../src/agsPrompts.js";
import { normaliseVerdict, classifyAnswer, AGS_VERSIONS } from "../../src/ags.js";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const MOCK = process.argv.includes("--mock");
const MODEL = arg("--model", MOCK ? "mock" : "");
const BASE = arg("--base", "http://localhost:11434").replace(/\/$/, "");
const REPEAT = Math.max(1, parseInt(arg("--repeat", "1"), 10));
if (!MODEL) {
  console.error("Give a model: --model qwen3.5:27b   (or --mock to check the plumbing)");
  process.exit(2);
}

const here = new URL(".", import.meta.url);
const load = (passageFile, mapFile) => ({
  passage: readFileSync(new URL("../../research/" + passageFile, here), "utf8").split(/\n---\n/)[1].trim(),
  map: JSON.parse(readFileSync(new URL("../fixtures/" + mapFile, here), "utf8")),
});
const SAMPLES = { "TP-01": load("test_passage_free_buses.md", "tp01_map.json"), "TP-02": load("test_passage_last_repair.md", "tp02_map.json") };
const PROBES = JSON.parse(readFileSync(new URL("verdict_probes.json", here), "utf8"));
const S = AGS_CALL_SETTINGS.verdict;

async function modelInfo() {
  if (MOCK) return { name: "mock" };
  const info = { name: MODEL };
  try {
    const s = await (await fetch(BASE + "/api/show", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL }) })).json();
    Object.assign(info, { family: s.details?.family, parameter_size: s.details?.parameter_size, quantization_level: s.details?.quantization_level, parameters: s.parameters || "" });
  } catch (e) {
    info.error = e.message;
  }
  try {
    const t = await (await fetch(BASE + "/api/tags")).json();
    info.digest = (t.models || []).find((m) => m.name === MODEL || m.model === MODEL)?.digest || "";
  } catch (e) {}
  try {
    info.ollama_version = (await (await fetch(BASE + "/api/version")).json()).version;
  } catch (e) {}
  return info;
}

/* mock: echo the expected outcome so only the plumbing is exercised */
function mockReply(probe, idea) {
  const want = probe.expected[0];
  const els = Object.fromEntries(idea.elements.map((e, k) => [e.id, { status: "absent", learner_span: "" }]));
  const span = probe.answer.slice(0, 12);
  if (want === "correct") idea.elements.forEach((e) => (els[e.id] = { status: "present", learner_span: span }));
  if (want === "partial") els[idea.elements[0].id] = { status: "present", learner_span: span };
  return {
    reason: "mock",
    answer_language: "other",
    no_attempt: want === "no_attempt",
    elements: els,
    contradicts_text: want === "incorrect",
    misreading: false,
    relation_expressed: idea.role === "relationship" ? (want === "correct" ? "correct" : "missing") : "not_applicable",
    alternative: want.startsWith("alternative_")
      ? { judgement: want.replace("alternative_", ""), passage_quote: "Some passengers may have tried the bus out of curiosity", states_relation: true }
      : { judgement: "none", passage_quote: "", states_relation: false },
    expression_unclear: false,
  };
}

async function callModel(prompt, schema) {
  const t0 = Date.now();
  const res = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: S.think,
      format: schema,
      options: { temperature: S.temperature, num_predict: S.maxTokens, num_ctx: 16384 },
      messages: [
        { role: "system", content: "You check reading answers for a researcher. Reply with a single JSON object and nothing else." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error("Ollama " + res.status + ": " + (await res.text()).slice(0, 200));
  const d = await res.json();
  const content = (d.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return {
    content,
    meta: { done_reason: d.done_reason, eval_count: d.eval_count, prompt_eval_count: d.prompt_eval_count, latency_ms: Date.now() - t0, thinking_chars: (d.message?.thinking || "").length },
  };
}

const info = await modelInfo();
const rows = [];
for (let rep = 1; rep <= REPEAT; rep++) {
  for (const p of PROBES.cases) {
    const { passage: PASSAGE, map: MAP } = SAMPLES[p.sample || "TP-01"];
    const idea = MAP.ideas.find((i) => i.id === p.idea);
    const questionText = p.ask === "link" ? idea.questions.link : idea.questions.opening;
    const prompt = buildVerdictPrompt({ passage: PASSAGE, idea, questionText, answer: p.answer, passageType: MAP.passage_type });
    let raw = null, meta = {}, error = "", content = "";
    try {
      if (MOCK) raw = mockReply(p, idea);
      else {
        const out = await callModel(prompt, verdictSchema(idea));
        content = out.content;
        meta = out.meta;
        raw = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
      }
    } catch (e) {
      error = e.message;
    }
    const n = normaliseVerdict(raw, idea, p.answer);
    const c = classifyAnswer({ idea, verdict: n.verdict, answer: p.answer, passage: PASSAGE });
    const agree = p.expected.includes(c.classification);
    rows.push({
      repeat: rep,
      case_id: p.id,
      sample: p.sample || "TP-01",
      category: p.category,
      idea: p.idea,
      answer: p.answer,
      expected: p.expected.join(" or "),
      classification: c.classification,
      matches_expected: agree ? "yes" : "no",
      elements: Object.entries(n.verdict.elements).map(([k, v]) => `${k}:${v}`).join(" "),
      learner_spans: Object.entries(n.learner_spans).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(" | "),
      relation: n.verdict.relation_expressed || "",
      alternative: n.verdict.alternative.judgement,
      alt_quote_found: c.quote_check ? (c.quote_check.found ? "yes" : "no") : "",
      answer_language: n.answer_language,
      expression_flags: c.expression_flags.join(" "),
      code_downgrades: n.audit.downgrades.join(" | "),
      invalid_fields: n.audit.invalid_fields.join(" "),
      model_reason: n.reason,
      error,
      done_reason: meta.done_reason || "",
      output_tokens: meta.eval_count ?? "",
      latency_ms: meta.latency_ms ?? "",
      raw_reply: content || (MOCK ? JSON.stringify(raw) : ""),
      researcher_agrees: "",
      researcher_note: "",
    });
    process.stdout.write(`${p.id} r${rep}: ${c.classification}${agree ? "" : "  (expected " + p.expected.join("/") + ")"}${error ? "  ERROR " + error : ""}\n`);
  }
}

const matched = rows.filter((r) => r.matches_expected === "yes").length;
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const safe = MODEL.replace(/[^a-z0-9.-]+/gi, "_");
const outDir = new URL("../../research/probe_results/", here);
mkdirSync(outDir, { recursive: true });
const meta = {
  kind: MOCK ? "MOCK (plumbing check, not a model result)" : "real model observation",
  probe_set: PROBES.probe_set,
  expected_status: PROBES.expected_status,
  prompt_version: AGS_PROMPT_VERSIONS.verdict,
  rules_version: AGS_VERSIONS.rules,
  call_settings: S,
  model: info,
  repeat: REPEAT,
  matched_expected: `${matched} / ${rows.length}`,
  run_at: new Date().toISOString(),
};
writeFileSync(new URL(`verdict_${safe}_${stamp}.json`, outDir), JSON.stringify({ meta, rows }, null, 2));
const cols = Object.keys(rows[0]);
const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
writeFileSync(new URL(`verdict_${safe}_${stamp}.csv`, outDir), "﻿" + [cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\r\n"));
console.log(`\n${meta.kind}: ${matched}/${rows.length} match the PROPOSED expectations. Files in research/probe_results/ (verdict_${safe}_${stamp}.*)`);
