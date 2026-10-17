/* Phase 1 deterministic tests for src/ags.js — run: node tests/ags.test.mjs
   Scripted model verdicts only; no model is called. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  AGS_VERSIONS,
  DEFAULT_AGS_CONFIG,
  validateMap,
  classifyAnswer,
  createSession,
  applyAnswer,
  learnerExit,
  sessionOutcomes,
  findQuote,
} from "../src/ags.js";

const here = new URL(".", import.meta.url);
const md = readFileSync(new URL("../research/test_passage_free_buses.md", here), "utf8");
const PASSAGE = md.split(/\n---\n/)[1].trim();
const MAP = JSON.parse(readFileSync(new URL("fixtures/tp01_map.json", here), "utf8"));
const MAP_SNAPSHOT = JSON.stringify(MAP);
const idea = (id) => MAP.ideas.find((x) => x.id === id);

/* verdict helpers */
const V = (els, extra = {}) => ({ elements: els, ...extra });
const ALL = V({ E1: "present", E2: "present" });
const NONE = V({ E1: "absent", E2: "absent" });

/* drive a session through a list of { answer, verdict } */
function run(steps, cfg) {
  let s = createSession(MAP, cfg);
  const recs = [];
  for (const st of steps) {
    const out = applyAnswer(s, MAP, { passage: PASSAGE, ...st });
    s = out.session;
    recs.push(out.record);
  }
  return { s, recs };
}
/* K0 handled in 4 turns (3 wrong + restate): used to reach later ideas */
const capIdea = () => [
  { answer: "Something unrelated", verdict: NONE },
  { answer: "Still unrelated", verdict: NONE },
  { answer: "Again unrelated", verdict: NONE },
  { answer: "Restated after seeing the sentence", verdict: ALL },
];
const correct = (answer = "A correct answer in my own words") => ({ answer, verdict: ALL });

const results = [];
function test(id, title, fn) {
  try {
    const detail = fn();
    results.push({ id, title, pass: true, detail: detail || "" });
  } catch (e) {
    results.push({ id, title, pass: false, detail: e.message });
  }
}

/* ------------------------------ R1–R14 ------------------------------ */

test("R1", "Correct at once", () => {
  const { s, recs } = run([{ answer: "They say free buses worked in the first year and want them kept and copied.", verdict: ALL }]);
  const r = recs[0];
  assert.equal(r.classification.classification, "correct");
  assert.equal(r.outcome, "secured_independent");
  assert.equal(r.support_level, 0);
  assert.equal(s.pending.idea, "K1");
  return "K0 secured_independent, support 0 → next idea K1";
});

test("R2", "Partial, then correct", () => {
  const { s, recs } = run([
    { answer: "Free buses worked.", verdict: V({ E1: "present", E2: "absent" }) },
    { answer: "Free buses worked and the Alliance wants the policy kept for good.", verdict: ALL },
  ]);
  assert.equal(recs[0].classification.classification, "partial");
  assert.equal(recs[0].next.move, "focused_question");
  assert.equal(recs[0].next.element, "E2");
  assert.equal(recs[1].outcome, "secured_after_focus");
  assert.equal(s.ideas.K0.support, 1);
  return "focused question on E2 → secured_after_focus, support 1";
});

test("R3", "Contradiction", () => {
  const { recs } = run([{ answer: "The text says free buses failed.", verdict: V({ E1: "contradicted", E2: "absent" }, { contradicts_text: true }) }]);
  const c = recs[0].classification;
  assert.equal(c.classification, "incorrect");
  assert.ok(c.comprehension_errors.includes("contradiction"));
  assert.equal(recs[0].next.move, "pointer");
  assert.equal(recs[0].next.pointer, "section");
  assert.equal(recs[0].next.question_ref, "K0.opening");
  return "incorrect (contradiction) → section pointer, opening question re-asked";
});

test("R4", "Cap after three unsuccessful attempts", () => {
  const { s, recs } = run(capIdea());
  assert.deepEqual(recs.slice(0, 3).map((r) => r.next.move), ["pointer", "pointer", "cap_show_evidence"]);
  assert.deepEqual([recs[0].next.pointer, recs[1].next.pointer], ["section", "paragraph"]);
  assert.equal(recs[3].outcome, "supported");
  assert.equal(recs[3].support_level, 3);
  assert.equal(s.pending.idea, "K1");
  return "section → paragraph → evidence sentence shown → restated → supported, support 3 → K1";
});

/* helper: reach K3 quickly (K0, K1, K2 correct at once) */
const toK3 = [correct(), correct(), correct()];

test("R5", "Relationship: elements present, relation missing", () => {
  const { recs } = run([...toK3, { answer: "Petrol went up. Eastholme rose 9 per cent.", verdict: V({ E1: "present", E2: "present" }, { relation_expressed: "missing" }) }]);
  const r = recs[3];
  assert.equal(r.idea_id, "K3");
  assert.equal(r.classification.classification, "partial");
  assert.equal(r.classification.relation_status, "missing");
  assert.equal(r.next.move, "link_question");
  return "partial (relation missing) → link_question";
});

test("R6", "Relationship reversed", () => {
  const { recs } = run([...toK3, { answer: "Free buses made petrol prices rise.", verdict: V({ E1: "present", E2: "absent" }, { relation_expressed: "reversed" }) }]);
  const c = recs[3].classification;
  assert.equal(c.classification, "incorrect");
  assert.ok(c.comprehension_errors.includes("misread_relationship"));
  assert.equal(recs[3].next.move, "pointer");
  return "incorrect, comprehension error misread_relationship → pointer";
});

test("R7", "Supported alternative (quote verified, relationship stated)", () => {
  const before = JSON.stringify(MAP);
  const { s, recs } = run([
    ...toK3,
    {
      answer: "Some people may just have tried the bus because it was new, so not all of the rise comes from it being free.",
      verdict: V(NONE.elements, {
        relation_expressed: "wrong_type",
        alternative: { judgement: "supported", quote: "Some passengers may have tried the bus out of curiosity", states_relation: true, explanation: "Curiosity is a stated alternative explanation." },
      }),
    },
  ]);
  const r = recs[3];
  assert.equal(r.classification.classification, "alternative_supported");
  assert.equal(r.classification.quote_check.found, true);
  assert.equal(r.outcome, "alternative_accepted");
  assert.equal(s.ideas.K3.needs_review, true);
  assert.equal(JSON.stringify(MAP), before, "map must not change");
  return `alternative_accepted, flagged for review; quote found in paragraph ${r.classification.quote_check.paragraph}; map unchanged`;
});

test("R8", "Alternative with an unverified quote, and a genuinely uncertain one", () => {
  /* (a) model says 'supported' but the quote is not in the passage */
  const a = run([
    ...toK3,
    { answer: "Many students got new bus passes, so that explains it.", verdict: V(NONE.elements, { alternative: { judgement: "supported", quote: "many students received new bus passes that year", states_relation: true } }) },
    { answer: "I think it was the student passes.", verdict: V(NONE.elements, { alternative: { judgement: "supported", quote: "many students received new bus passes that year", states_relation: true } }) },
  ]);
  const ra = a.recs[3];
  assert.equal(ra.classification.classification, "alternative_uncertain");
  assert.ok(ra.classification.expression_flags.includes("alternative_quote_not_verified"));
  assert.equal(ra.next.move, "clarify");
  assert.notEqual(a.recs[4].outcome, "alternative_accepted");
  assert.equal(a.recs[4].next.move, "pointer", "clarification is offered once, then evidence pointer");
  /* (b) model judges a plausible but unestablished reading 'uncertain' */
  const b = run([...toK3, { answer: "Maybe the hospital and university made people ride more.", verdict: V(NONE.elements, { alternative: { judgement: "uncertain", quote: "especially those serving the hospital and the university" } }) }]);
  assert.equal(b.recs[3].classification.classification, "alternative_uncertain");
  assert.equal(b.recs[3].next.move, "clarify");
  assert.equal(b.s.ideas.K3.support, 0, "a neutral clarification does not count as help");
  return "(a) unverified quote → downgraded to uncertain, not credited, clarify once then pointer; (b) uncertain → neutral clarify, support unchanged";
});

test("R9", "Copied answer", () => {
  const copiedAns = "Our Alliance campaigned for the policy for six years, and we believe the first year has proved it right.";
  const { s, recs } = run([
    { answer: copiedAns, verdict: ALL },
    { answer: "They think the free buses worked and want them made permanent.", verdict: ALL },
  ]);
  assert.equal(recs[0].classification.copied, true);
  assert.equal(recs[0].next.move, "own_words");
  assert.equal(recs[1].outcome, "secured_independent");
  assert.equal(s.ideas.K0.support, 0);
  assert.ok(s.ideas.K0.expression_flags.includes("copied"));
  return `copy rate ${recs[0].classification.copy_rate} → one own-words prompt; support stays 0; 'copied' flag kept`;
});

test("R10", "No attempt", () => {
  const { recs } = run([{ answer: "I don't know", verdict: NONE }]);
  assert.equal(recs[0].classification.classification, "no_attempt");
  assert.equal(recs[0].next.move, "pointer");
  assert.equal(recs[0].next.pointer, "section");
  assert.equal(recs[0].attempt, 1);
  return "no_attempt → section pointer, attempt 1 used";
});

test("R11", "Turn cap (18) reached during K4", () => {
  const steps = [...capIdea(), ...capIdea(), ...capIdea(), ...capIdea(), { answer: "wrong", verdict: NONE }, { answer: "still wrong", verdict: NONE }];
  const { s, recs } = run(steps);
  assert.equal(recs.length, 18);
  assert.equal(recs[17].turn_cap_reached, true);
  assert.equal(s.phase, "done");
  assert.equal(s.exit_reason, "turn_cap");
  assert.equal(s.ideas.K4.outcome, "not_reached");
  assert.equal(s.pending.move, "to_summary");
  assert.throws(() => applyAnswer(s, MAP, { answer: "more", verdict: ALL, passage: PASSAGE }));
  return "turn 18 → to_summary; K4 not_reached; further answers refused";
});

test("R12", "Early exit", () => {
  const { s } = run([correct(), ...capIdea()]);
  assert.equal(s.turns, 5);
  const out = learnerExit(s);
  assert.equal(out.session.exit_reason, "learner_exit");
  const o = sessionOutcomes(out.session);
  assert.deepEqual(
    o.map((x) => x.outcome),
    ["secured_independent", "supported", "not_reached", "not_reached", "not_reached"]
  );
  return "exit at turn 5 logged; K2–K4 not_reached";
});

test("R13", "Genuine passage quote, unsupported conclusion → no credit", () => {
  const ans = "'Some passengers may have tried the bus out of curiosity', so the roadworks had nothing to do with traffic.";
  /* reach K4: K0–K3 correct */
  const pre = [correct(), correct(), correct(), { answer: "ok", verdict: V({ E1: "present", E2: "present" }, { relation_expressed: "correct" }) }];
  const a = run([...pre, { answer: ans, verdict: V(NONE.elements, { alternative: { judgement: "unsupported", quote: "Some passengers may have tried the bus out of curiosity" } }) }]);
  const ra = a.recs[4];
  assert.equal(ra.idea_id, "K4");
  assert.equal(ra.classification.quote_check.found, true, "the quote is genuine");
  assert.equal(ra.classification.classification, "incorrect");
  assert.equal(ra.classification.alternative_outcome, "alternative_unsupported");
  assert.ok(ra.classification.comprehension_errors.includes("unsupported_interpretation"));
  assert.notEqual(ra.outcome, "alternative_accepted");
  /* and with no alternative judgement at all, the quote alone earns nothing */
  const b = run([...pre, { answer: ans, verdict: NONE }]);
  assert.equal(b.recs[4].classification.classification, "incorrect");
  return "genuine quote verified, judged unsupported → incorrect (unsupported_interpretation); quote alone never credits";
});

test("R14", "All elements, wrong relationship → not correct", () => {
  const rev = run([...toK3, { answer: "Eastholme's 9 per cent rise pushed up petrol prices.", verdict: V({ E1: "present", E2: "present" }, { relation_expressed: "reversed" }) }]);
  assert.equal(rev.recs[3].classification.classification, "incorrect");
  assert.ok(rev.recs[3].classification.comprehension_errors.includes("misread_relationship"));
  const wt = run([...toK3, { answer: "Petrol prices and Eastholme are both examples of free travel working.", verdict: V({ E1: "present", E2: "present" }, { relation_expressed: "wrong_type" }) }]);
  assert.notEqual(wt.recs[3].classification.classification, "correct");
  assert.equal(wt.recs[3].classification.classification, "incorrect");
  return "reversed → incorrect (misread_relationship); wrong_type → incorrect";
});

test("R15", "Restatement after the cap must meet a minimum (regression)", () => {
  const three = [
    { answer: "Something unrelated", verdict: NONE },
    { answer: "Still unrelated", verdict: NONE },
    { answer: "Again unrelated", verdict: NONE },
  ];
  /* (a) blank restatement */
  const a = run([...three, { answer: "", verdict: ALL /* even if the model wrongly says present */ }]);
  assert.equal(a.recs[3].classification.classification, "no_attempt");
  assert.equal(a.recs[3].outcome, "not_demonstrated_after_support");
  assert.equal(a.recs[3].restate_minimum_met, false);
  /* (b) incorrect restatement */
  const b = run([...three, { answer: "The text says free buses failed.", verdict: V({ E1: "contradicted", E2: "absent" }, { contradicts_text: true }) }]);
  assert.equal(b.recs[3].outcome, "not_demonstrated_after_support");
  /* (c) half the elements, no error → meets the minimum */
  const c = run([...three, { answer: "They say the free buses worked.", verdict: V({ E1: "present", E2: "absent" }) }]);
  assert.equal(c.recs[3].outcome, "supported");
  /* (d) relationship idea: elements without the relation → not met */
  const d = run([
    ...toK3,
    ...three,
    { answer: "Petrol rose. Eastholme rose too.", verdict: V({ E1: "present", E2: "present" }, { relation_expressed: "missing" }) },
  ]);
  assert.equal(d.recs[6].idea_id, "K3");
  assert.equal(d.recs[6].outcome, "not_demonstrated_after_support");
  /* (e) outcomes stay distinguishable in the per-idea summary */
  const oa = sessionOutcomes(a.s).find((x) => x.idea_id === "K0");
  const oc = sessionOutcomes(c.s).find((x) => x.idea_id === "K0");
  assert.equal(oa.outcome, "not_demonstrated_after_support");
  assert.equal(oa.restate_classification, "no_attempt");
  assert.equal(oc.outcome, "supported");
  assert.equal(oa.support_level, 3);
  assert.equal(oc.support_level, 3);
  /* (f) main idea not demonstrated → still gets the one final re-ask */
  const relOk = { answer: "Petrol rose and Eastholme grew without free fares, so not all growth is due to free travel.", verdict: V({ E1: "present", E2: "present" }, { relation_expressed: "correct" }) };
  const f = run([...three, { answer: "", verdict: NONE }, correct(), correct(), relOk, correct()]);
  assert.equal(f.s.pending.move, "final_main_reask");
  return "blank → not_demonstrated_after_support (restate: no_attempt); incorrect → not_demonstrated; half the elements → supported; relationship without relation → not_demonstrated; both outcomes kept distinct with support 3; K0 still re-asked at the end";
});

/* ------------------------- map checks (setting) ------------------------- */

test("M-default", "Relationship cross-paragraph rule defaults to OFF for AGS", () => {
  assert.equal(DEFAULT_AGS_CONFIG.relationCrossParagraph, false);
  const v = validateMap(MAP, PASSAGE);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(v.settings_used.relationCrossParagraph, false);
  const k3 = idea("K3").evidence.map((e) => findQuote(PASSAGE, e.quote).paragraph);
  assert.equal(k3[0], k3[1], "fixture K3 evidence is deliberately in one paragraph");
  return `fixture map valid with rule OFF (K3 evidence both in paragraph ${k3[0]}); setting logged in settings_used`;
});

test("M-on", "Same map with the rule switched ON", () => {
  const v = validateMap(MAP, PASSAGE, { relationCrossParagraph: true });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("K3") && p.includes("one paragraph")));
  assert.equal(v.settings_used.relationCrossParagraph, true);
  return "K3 rejected when ON; setting logged";
});

test("M1", "Evidence quote not in passage", () => {
  const bad = JSON.parse(MAP_SNAPSHOT);
  bad.ideas[1].evidence[0].quote = "bus journeys doubled in the first month alone";
  const v = validateMap(bad, PASSAGE);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.startsWith("K1: evidence 1 not found")));
  return v.problems[0];
});

test("M2", "Leaky question", () => {
  const bad = JSON.parse(MAP_SNAPSHOT);
  /* (the main-idea question is a fixed template since v0.2, so test a follow-up) */
  bad.ideas[1].questions.opening = "Did bus journeys rise by 35 per cent while city-centre traffic fell by about 6 per cent?";
  const v = validateMap(bad, PASSAGE);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.startsWith("K1: opening question gives the idea away")));
  return v.problems.find((p) => p.includes("gives the idea away"));
});

/* ------------------------------ report ------------------------------ */

const passed = results.filter((r) => r.pass).length;
const lines = [
  `# AGS Phase 1 test results`,
  ``,
  `module ${AGS_VERSIONS.module} · rules ${AGS_VERSIONS.rules} · fixture ${MAP.map_id} (${MAP.map_version}) · run ${new Date().toISOString()}`,
  ``,
  `**${passed} / ${results.length} passed**`,
  ``,
  `| ID | Case | Result | What happened |`,
  `| --- | --- | --- | --- |`,
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/")} |`),
];
console.log(lines.join("\n"));
if (process.argv.includes("--write")) writeFileSync(new URL("../research/AGS_PHASE1_TEST_RESULTS.md", here), lines.join("\n") + "\n");
process.exit(passed === results.length ? 0 : 1);
