/* Phase 2 deterministic tests — prompts, schemas, and the code checks on
   model output. Run: node tests/agsPrompts.test.mjs [--write]
   These test the PLUMBING. They do not show that a real model judges
   answers accurately; that is what tests/probe/ is for. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  AGS_PROMPT_VERSIONS,
  AGS_PASSAGE_TOKEN,
  buildMapPrompt,
  MAP_SCHEMA,
  buildVerdictPrompt,
  verdictSchema,
  buildSummaryPrompt,
  summarySchema,
} from "../src/agsPrompts.js";
import { normaliseVerdict, normaliseMap, normaliseSummary, classifyAnswer, validateMap, spanInText } from "../src/ags.js";

const here = new URL(".", import.meta.url);
const md = readFileSync(new URL("../research/test_passage_free_buses.md", here), "utf8");
const PASSAGE = md.split(/\n---\n/)[1].trim();
const MAP = JSON.parse(readFileSync(new URL("fixtures/tp01_map.json", here), "utf8"));
const idea = (id) => MAP.ideas.find((x) => x.id === id);

const results = [];
function test(id, title, fn) {
  try {
    results.push({ id, title, pass: true, detail: fn() || "" });
  } catch (e) {
    results.push({ id, title, pass: false, detail: e.message });
  }
}

test("P1", "Verdict prompt carries what the judge needs, and logs without the passage", () => {
  const k3 = idea("K3");
  const p = buildVerdictPrompt({ passage: PASSAGE, idea: k3, questionText: k3.questions.opening, answer: "Petrol prices went up." });
  for (const must of [k3.statement, "E1: petrol prices rose that year", "THIS IS A RELATIONSHIP IDEA", "Petrol prices went up.", "Eastholme"]) assert.ok(p.includes(must), "missing: " + must);
  const p0 = buildVerdictPrompt({ passage: PASSAGE, idea: idea("K0"), questionText: "q", answer: "a" });
  assert.ok(!p0.includes("THIS IS A RELATIONSHIP IDEA"));
  assert.ok(p0.includes('always "not_applicable"'));
  const log = buildVerdictPrompt({ passage: PASSAGE, idea: k3, questionText: "q", answer: "a", forLog: true });
  assert.ok(log.includes(AGS_PASSAGE_TOKEN) && !log.includes("Eastholme, a neighbouring city"));
  return `versions ${Object.values(AGS_PROMPT_VERSIONS).join(", ")}; relation block only for relationship ideas; logged prompt uses ${AGS_PASSAGE_TOKEN}`;
});

test("P2", "Verdict schema: this idea's elements only, and no field for a model answer", () => {
  const s = verdictSchema(idea("K3"));
  assert.deepEqual(s.properties.elements.required, ["E1", "E2"]);
  const keys = Object.keys(s.properties).sort();
  assert.deepEqual(keys, ["alternative", "answer_language", "contradicts_text", "elements", "expression_unclear", "misreading", "no_attempt", "reason", "relation_expressed"].sort());
  const sm = summarySchema(MAP);
  assert.deepEqual(sm.properties.relations.required, ["K3"]);
  assert.ok(!("feedback" in sm.properties) && !("model_summary" in sm.properties));
  return "verdict schema keys fixed; summary schema has no feedback or model-summary field";
});

test("P3", "Malformed model output falls back to safe values, and every change is audited", () => {
  const raw = { elements: { E1: { status: "PRESENT!!", learner_span: "x" } }, relation_expressed: "kind of", alternative: { judgement: "maybe" }, no_attempt: "no" };
  const n = normaliseVerdict(raw, idea("K3"), "some answer");
  assert.equal(n.verdict.elements.E1, "absent");
  assert.equal(n.verdict.elements.E2, "absent");
  assert.equal(n.verdict.relation_expressed, "missing");
  assert.equal(n.verdict.alternative.judgement, "none");
  assert.equal(n.verdict.no_attempt, false);
  assert.ok(n.audit.invalid_fields.includes("elements.E1.status") && n.audit.invalid_fields.includes("relation_expressed") && n.audit.invalid_fields.includes("no_attempt"));
  const nul = normaliseVerdict(null, idea("K0"), "x");
  assert.ok(nul.audit.invalid_fields.includes("whole_reply"));
  return `invalid fields → defaults; audit: ${n.audit.invalid_fields.join(", ")}`;
});

test("P4", "A 'present' judgement without the learner's actual words is downgraded", () => {
  const answer = "The buses got busier.";
  const raw = { elements: { E1: { status: "present", learner_span: "free buses succeeded in their first year" }, E2: { status: "present", learner_span: "" } }, alternative: { judgement: "none" } };
  const n = normaliseVerdict(raw, idea("K0"), answer);
  assert.equal(n.verdict.elements.E1, "absent");
  assert.equal(n.verdict.elements.E2, "absent");
  assert.equal(n.audit.downgrades.length, 2);
  const c = classifyAnswer({ idea: idea("K0"), verdict: n.verdict, answer, passage: PASSAGE });
  assert.notEqual(c.classification, "correct");
  return `model claimed both elements; neither span is in the answer → both downgraded → ${c.classification}`;
});

test("P5", "Mixed English–Chinese answer: spans in either script are verified", () => {
  const answer = "佢哋話 free buses 第一年成功咗，而且想 council 將佢 make permanent。";
  const raw = {
    answer_language: "mixed",
    elements: { E1: { status: "present", learner_span: "free buses 第一年成功咗" }, E2: { status: "present", learner_span: "想 council 將佢 make permanent" } },
    alternative: { judgement: "none", passage_quote: "", states_relation: false },
  };
  const n = normaliseVerdict(raw, idea("K0"), answer);
  assert.deepEqual(n.verdict.elements, { E1: "present", E2: "present" });
  assert.equal(n.answer_language, "mixed");
  const c = classifyAnswer({ idea: idea("K0"), verdict: n.verdict, answer, passage: PASSAGE });
  assert.equal(c.classification, "correct");
  assert.equal(c.copied, false);
  assert.ok(spanInText("ＦＲＥＥ BUSES", "free buses"), "full-width and case are normalised");
  return "Cantonese–English spans kept (punctuation, width and case ignored) → correct; not flagged as copied";
});

test("P6", "Chinese-only blanks and 'don't know' are no attempt", () => {
  const out = ["。", "？？", "唔知", "不知道。", "  ", "I dont know"].map(
    (a) => classifyAnswer({ idea: idea("K0"), verdict: { elements: { E1: "present", E2: "present" } }, answer: a, passage: PASSAGE }).classification
  );
  assert.ok(out.every((c) => c === "no_attempt"), out.join(","));
  return "。 ？？ 唔知 不知道。 blank, 'I dont know' → no_attempt (even when the model says present)";
});

test("P7", "Alternative quote from the model is verified by code", () => {
  const k3 = idea("K3");
  const mk = (q) => normaliseVerdict({ elements: { E1: { status: "absent" }, E2: { status: "absent" } }, relation_expressed: "wrong_type", alternative: { judgement: "supported", passage_quote: q, states_relation: true } }, k3, "People tried it because it was new, so not all the rise is from it being free.");
  const real = classifyAnswer({ idea: k3, verdict: mk("Some passengers may have tried the bus out of curiosity").verdict, answer: "People tried it because it was new, so not all the rise is from it being free.", passage: PASSAGE });
  const fake = classifyAnswer({ idea: k3, verdict: mk("most riders only wanted to try something new").verdict, answer: "x y", passage: PASSAGE });
  assert.equal(real.classification, "alternative_supported");
  assert.equal(fake.classification, "alternative_uncertain");
  return "real quote → alternative_supported; invented quote → alternative_uncertain";
});

test("P8", "Model map is normalised: always unreviewed, focus list → object, stray relation removed", () => {
  /* simulate a model reply in the MAP_SCHEMA shape, built from the fixture */
  const raw = {
    review_status: "approved",
    passage_type: "informational_argumentative",
    ideas: MAP.ideas.map((i) => ({
      id: i.id,
      role: i.role,
      topic_label: i.topic_label,
      statement: i.statement,
      elements: i.elements,
      evidence: i.evidence,
      relation: i.relation || { type: i.id === "K1" ? "cause" : "none", from: "", to: "", direction: "" },
      depends_on: i.depends_on,
      questions: { opening: i.questions.opening, focus: Object.entries(i.questions.focus).map(([element, question]) => ({ element, question })), link: i.questions.link || "", clarify: i.questions.clarify || "" },
      misreadings: [],
    })),
  };
  assert.ok(MAP_SCHEMA.properties.ideas.items.required.includes("topic_label"));
  const { map, audit } = normaliseMap(raw, { passage_id: "TP-01", map_id: "M-test", map_version: AGS_PROMPT_VERSIONS.map });
  assert.equal(map.review_status, "unreviewed");
  assert.equal(map.ideas[0].questions.focus.E1, MAP.ideas[0].questions.focus.E1);
  assert.equal(map.ideas.find((i) => i.id === "K1").relation, undefined);
  assert.ok(audit.changes.some((c) => c.includes("review_status")) && audit.changes.some((c) => c.includes("K1: relation removed")));
  const v = validateMap(map, PASSAGE);
  assert.equal(v.ok, true, v.problems.join("; "));
  const p = buildMapPrompt({ passage: PASSAGE, forLog: true });
  assert.ok(p.includes(AGS_PASSAGE_TOKEN) && p.includes("NEVER let a question give the idea away"));
  return "model's 'approved' ignored → unreviewed; K1's stray relation removed; normalised map passes validateMap";
});

test("P9", "Summary assessment: claims must quote the summary; relation needs its idea", () => {
  const summary = "The Alliance says free buses worked and wants them kept. Bus trips went up a lot. Petrol also got more expensive.";
  const raw = {
    ideas: {
      K0: { status: "covered", learner_span: "free buses worked and wants them kept" },
      K1: { status: "covered", learner_span: "Bus trips went up a lot" },
      K2: { status: "covered", learner_span: "most riders were former drivers" },
      K3: { status: "covered", learner_span: "Petrol also got more expensive" },
      K4: { status: "weird" },
    },
    relations: { K3: { status: "correct", learner_span: "so free fares were not the only cause" } },
    unsupported_claims: [{ learner_span: "Bus trips went up a lot" }, { learner_span: "invented sentence" }],
  };
  const n = normaliseSummary(raw, MAP, summary);
  assert.equal(n.ideas.K2.status, "missing");
  assert.equal(n.ideas.K4.status, "missing");
  assert.equal(n.relations.K3.status, "missing");
  assert.deepEqual(n.unsupported_claims, ["Bus trips went up a lot"]);
  const sp = buildSummaryPrompt({ passage: PASSAGE, map: MAP, summary, forLog: true });
  assert.ok(sp.includes("Never write a corrected or model summary"));
  return `K2 span not in summary → missing; K3 relation span not in summary → missing; invented claim dropped; ${n.audit.downgrades.length} downgrades audited`;
});

test("P10", "AGS prompt and rule modules import nothing from Full Climb", () => {
  for (const f of ["../src/agsPrompts.js", "../src/ags.js"]) {
    const src = readFileSync(new URL(f, here), "utf8");
    const imports = [...src.matchAll(/^import .* from ['"](.+)['"]/gm)].map((m) => m[1]);
    assert.ok(imports.every((m) => !/\.\/(prompts|App|llm|research|flags|Flag|Inspector|Settings|Scaffold)/.test(m)), f + " imports " + imports.join(","));
  }
  return "ags.js and agsPrompts.js have no imports from Full Climb modules";
});

const passed = results.filter((r) => r.pass).length;
const lines = [
  `# AGS Phase 2 test results (deterministic)`,
  ``,
  `prompts ${Object.values(AGS_PROMPT_VERSIONS).join(" · ")} · run ${new Date().toISOString()}`,
  ``,
  `**${passed} / ${results.length} passed.** These tests check the prompts, schemas and code checks on model output. They do not measure how accurately a real model judges answers.`,
  ``,
  `| ID | Case | Result | What happened |`,
  `| --- | --- | --- | --- |`,
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/")} |`),
];
console.log(lines.join("\n"));
if (process.argv.includes("--write")) writeFileSync(new URL("../research/AGS_PHASE2_TEST_RESULTS.md", here), lines.join("\n") + "\n");
process.exit(passed === results.length ? 0 : 1);
