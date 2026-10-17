/* Genre-sensitivity tests (agsrules-v0.2 / agsmap-v0.2) — deterministic.
   Run: node tests/agsGenre.test.mjs [--write] */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  AGS_VERSIONS,
  OPENING_QUESTIONS,
  validateMap,
  normaliseMap,
  orderIdeas,
  createSession,
  applyAnswer,
  questionText,
  isRelational,
  classifyAnswer,
  normaliseVerdict,
  normaliseSummary,
  buildSummaryFeedback,
} from "../src/ags.js";
import { buildMapPrompt, buildVerdictPrompt, buildSummaryPrompt, AGS_PROMPT_VERSIONS, MAP_SCHEMA, verdictSchema, summarySchema } from "../src/agsPrompts.js";

const here = new URL(".", import.meta.url);
const passageOf = (f) => readFileSync(new URL("../research/" + f, here), "utf8").split(/\n---\n/)[1].trim();
const TP01 = passageOf("test_passage_free_buses.md");
const TP02 = passageOf("test_passage_last_repair.md");
const MAP1 = JSON.parse(readFileSync(new URL("fixtures/tp01_map.json", here), "utf8"));
const MAP2 = JSON.parse(readFileSync(new URL("fixtures/tp02_map.json", here), "utf8"));
const TP03 = passageOf("test_passage_bread.md");
const MAP3 = JSON.parse(readFileSync(new URL("fixtures/tp03_map.json", here), "utf8"));
const copy = (m) => JSON.parse(JSON.stringify(m));

const results = [];
function test(id, title, fn) {
  try {
    results.push({ id, title, pass: true, detail: fn() || "" });
  } catch (e) {
    results.push({ id, title, pass: false, detail: e.message });
  }
}

test("G1", "Narrative map (TP-02) is valid without a theme; story order kept", () => {
  const v = validateMap(MAP2, TP02);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(v.settings_used.passage_type, "narrative");
  assert.ok(!MAP2.ideas.some((i) => i.role === "theme"));
  assert.deepEqual(orderIdeas(MAP2).map((i) => i.id), ["K0", "K1", "K2", "K3", "K4"]);
  assert.ok(v.warnings.some((w) => w.includes("no character idea")));
  return `valid; no theme forced; order K0–K4 (story order); warning: ${v.warnings.join("; ")}`;
});

test("G2", "Main-idea question and final re-ask follow the passage type", () => {
  assert.equal(validateMap(MAP1, TP01).ok, true);
  assert.equal(MAP1.ideas[0].questions.opening, OPENING_QUESTIONS.informational_argumentative);
  assert.equal(MAP2.ideas[0].questions.opening, "What is this story mainly about?");
  assert.equal(questionText(MAP2, { idea: "K0", move: "final_main_reask" }), "Now, in a sentence, what is this story mainly about?");
  assert.equal(questionText(MAP1, { idea: "K0", move: "final_main_reask" }), "Now, in a sentence, what is the author's main argument or claim?");
  const ex = copy(MAP1);
  ex.passage_type = "informational_explanatory";
  const v = validateMap(ex, TP01);
  assert.ok(v.problems.some((p) => p.includes("must be the informational_explanatory template")));
  return "argumentative / narrative templates in place; an argumentative opening on an explanatory map is rejected";
});

test("G3", "A wrong main question from the model is replaced by the template", () => {
  const raw = copy(MAP2);
  raw.ideas[0].questions.opening = "What is the main argument of this passage?";
  raw.ideas[0].questions.focus = Object.entries(raw.ideas[0].questions.focus).map(([element, question]) => ({ element, question }));
  const { map, audit } = normaliseMap(raw, { passage_id: "TP-02" });
  assert.equal(map.ideas[0].questions.opening, "What is this story mainly about?");
  assert.ok(audit.changes.some((c) => c.includes("replaced by the narrative template")));
  assert.equal(map.passage_type, "narrative");
  return "'main argument' on a story → replaced by 'What is this story mainly about?'; logged in audit";
});

test("G4", "No argument questions for a story or an explanation", () => {
  const m = copy(MAP2);
  m.ideas[3].questions.opening = "What claim does the story make about Mr Lo and Mei?";
  const v = validateMap(m, TP02);
  assert.ok(v.problems.some((p) => p.includes("asks about an argument, but this is a narrative text")));
  return v.problems.find((p) => p.includes("argument"));
});

test("G5", "No moral, lesson or conclusion the map does not support", () => {
  const m = copy(MAP2);
  m.ideas[4].questions.opening = "What lesson does Mei learn at the market?";
  const v = validateMap(m, TP02);
  assert.ok(v.problems.some((p) => p.includes("moral or theme the map does not support")));
  const t = copy(MAP2);
  t.ideas.push({
    id: "K5",
    role: "theme",
    topic_label: "passing on a craft",
    statement: "Skills are passed on by watching and doing.",
    elements: [{ id: "E1", label: "learning by watching" }, { id: "E2", label: "learning by doing" }],
    evidence: [{ quote: "He had learned the same way" }],
    depends_on: [],
    questions: { opening: "How did Mr Lo first learn his trade at the counter?", focus: { E1: "What did the old man at the counter let him do?", E2: "What does Mei do with the loupe?" } },
  });
  const vt = validateMap(t, TP02);
  assert.ok(vt.problems.some((p) => p.includes("a theme needs at least two supporting quotes")));
  const c = copy(MAP2);
  c.ideas[4].questions.opening = "What does the story conclude about the market?";
  assert.ok(validateMap(c, TP02).problems.some((p) => p.includes("conclusion the map does not include")));
  return "lesson question rejected; a theme with one quote rejected; conclusion question rejected";
});

test("G6", "Follow-up questions must be about this passage, not generic", () => {
  const m = copy(MAP2);
  m.ideas[3].questions.opening = "What happens next in the story?";
  m.ideas[3].questions.focus.E1 = "What is the most important detail here?";
  const v = validateMap(m, TP02);
  assert.ok(v.problems.some((p) => p.startsWith("K3: opening question is generic")));
  assert.ok(v.problems.some((p) => p.startsWith("K3: focus E1 question is generic")));
  return "'What happens next in the story?' and 'What is the most important detail here?' rejected as generic";
});

test("G7", "Roles must fit the passage type", () => {
  const m = copy(MAP1);
  m.ideas[2].role = "character";
  const v = validateMap(m, TP01);
  assert.ok(v.problems.some((p) => p.includes("role 'character' is not used for informational_argumentative")));
  const n = copy(MAP2);
  n.ideas[1].role = "support";
  assert.ok(validateMap(n, TP02).problems.some((p) => p.includes("role 'support' is not used for narrative")));
  return "a 'character' idea in an argumentative map and a 'support' idea in a story are both rejected";
});

test("G8", "A story relationship (motivation, K2) runs through the same rules", () => {
  assert.ok(isRelational(MAP2.ideas[2]));
  const V = (els, x = {}) => ({ elements: els, ...x });
  let s = createSession(MAP2);
  const step = (answer, verdict) => {
    const o = applyAnswer(s, MAP2, { answer, verdict, passage: TP02 });
    s = o.session;
    return o.record;
  };
  const both = V({ E1: "present", E2: "present" });
  step("An old repairer whose stall is closing helps Mei fix the watch herself.", both);
  step("Mei wants it for the wedding but he says there will be no stall by Friday.", both);
  const r1 = step("She knew about the escape wheel. Then he helped her.", V({ E1: "present", E2: "present" }, { relation_expressed: "missing" }));
  assert.equal(r1.idea_id, "K2");
  assert.equal(r1.next.move, "link_question");
  assert.equal(questionText(MAP2, r1.next), "How is Mei's way of learning connected to Mr Lo's own past?");
  const r2 = step("Because she taught herself like he once did, he decided to help her.", V({ E1: "present", E2: "present" }, { relation_expressed: "correct" }));
  assert.equal(r2.outcome, "secured_after_focus");
  return "elements without the link → story-specific link question → then secured_after_focus";
});

test("G9", "Verdict and summary prompts carry genre guidance", () => {
  const vp = buildVerdictPrompt({ passage: TP02, idea: MAP2.ideas[1], questionText: "q", answer: "a", passageType: "narrative" });
  assert.ok(vp.includes("THE TEXT IS a story") && vp.includes("by description"));
  const sp2 = buildSummaryPrompt({ passage: TP02, map: MAP2, summary: "s" });
  assert.ok(sp2.includes("Do NOT expect a moral, lesson or theme") && sp2.includes("ORIGINAL TEXT'S MEANING is the standard"));
  const sp1 = buildSummaryPrompt({ passage: TP01, map: MAP1, summary: "s" });
  assert.ok(sp1.includes("argues for a claim") && !sp1.includes("Do NOT expect a moral"));
  const ex = copy(MAP1);
  ex.passage_type = "informational_explanatory";
  assert.ok(buildSummaryPrompt({ passage: TP01, map: ex, summary: "s" }).includes("Do NOT expect an argument or conclusion"));
  return "story verdicts accept characters named by description; summary guidance differs by type; the text's meaning is the standard";
});

test("G10", "Map prompt asks for the type first and forbids forcing", () => {
  const p = buildMapPrompt({ passage: TP02, forLog: true });
  for (const t of Object.values(OPENING_QUESTIONS)) assert.ok(p.includes(t));
  for (const must of ["STEP 1. DECIDE THE PASSAGE TYPE", "DO NOT FORCE WHAT THE TEXT LACKS", "A story may have no stated moral", "Never a generic question"]) assert.ok(p.includes(must), must);
  assert.deepEqual(MAP_SCHEMA.required, ["passage_type", "passage_type_reason", "ideas"]);
  return `prompt ${AGS_PROMPT_VERSIONS.map}: type decided first, three templates given, forcing forbidden; schema requires passage_type`;
});

test("G11", "Explanatory map (TP-03): valid, text order, nothing argumentative", () => {
  const v = validateMap(MAP3, TP03);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(MAP3.ideas[0].questions.opening, "What is the passage mainly explaining?");
  assert.deepEqual(orderIdeas(MAP3).map((i) => i.id), ["K0", "K1", "K2", "K3", "K4"]);
  const words = TP03.split(/\s+/).length;
  assert.ok(words >= 500 && words <= 650, words + " words");
  const a = copy(MAP3);
  a.ideas[4].questions.opening = "What does the author argue about baking bread?";
  assert.ok(validateMap(a, TP03).problems.some((p) => p.includes("asks about an argument")));
  const c = copy(MAP3);
  c.ideas[4].questions.opening = "What does the passage conclude about the oven?";
  assert.ok(validateMap(c, TP03).problems.some((p) => p.includes("conclusion the map does not include")));
  return `valid; ${words} words; text order kept (temperature after gas and gluten); argument and conclusion questions rejected`;
});

test("G12", "Story interpretation is optional, recorded apart from the plot", () => {
  const k0 = MAP2.ideas[0];
  const none = { E1: "absent", E2: "absent" };
  /* (a) a defensible reading but no events → partial, asked about the plot */
  const ansA = "It is about how a skill gets passed on from one generation to the next.";
  const nA = normaliseVerdict({ elements: { E1: { status: "absent" }, E2: { status: "absent" } }, interpretation: { judgement: "defensible", learner_span: "how a skill gets passed on" } }, k0, ansA);
  const cA = classifyAnswer({ idea: k0, verdict: nA.verdict, answer: ansA, passage: TP02 });
  assert.equal(cA.classification, "partial");
  assert.ok(cA.expression_flags.includes("interpretation_only") && cA.needs_review);
  let s = createSession(MAP2);
  const o = applyAnswer(s, MAP2, { answer: ansA, verdict: nA.verdict, passage: TP02 });
  assert.equal(o.record.next.move, "focused_question");
  /* (b) the plot AND a reading → correct, reading kept */
  const ansB = "An old repairer losing his stall helps Mei fix her grandmother's watch herself; it is about passing on a skill.";
  const cB = classifyAnswer({ idea: k0, verdict: { elements: { E1: "present", E2: "present" }, interpretation: { judgement: "defensible", learner_span: "passing on a skill" } }, answer: ansB, passage: TP02 });
  assert.equal(cB.classification, "correct");
  assert.equal(cB.interpretation.judgement, "defensible");
  /* (c) a stock moral the story does not support → not credited */
  const cC = classifyAnswer({ idea: k0, verdict: { elements: none, interpretation: { judgement: "unsupported", learner_span: "never give up" } }, answer: "The lesson is never give up on your dreams.", passage: TP02 });
  assert.equal(cC.classification, "incorrect");
  /* (d) a claimed reading the learner never wrote is dropped */
  const nD = normaliseVerdict({ elements: {}, interpretation: { judgement: "defensible", learner_span: "kindness to strangers" } }, k0, "He fixes a watch.");
  assert.equal(nD.verdict.interpretation.judgement, "none");
  /* (e) the plain plot with no reading at all is fully correct */
  const cE = classifyAnswer({ idea: k0, verdict: { elements: { E1: "present", E2: "present" } }, answer: "A closing stall, and Mei fixes the watch with his help.", passage: TP02 });
  assert.equal(cE.classification, "correct");
  return "reading only → partial + plot question (flagged); plot + reading → correct, reading recorded; stock moral → incorrect; invented reading dropped; plot without reading → correct";
});

test("G13", "Interpretation field exists only for stories", () => {
  assert.ok("interpretation" in verdictSchema(MAP2.ideas[0], "narrative").properties);
  assert.ok(!("interpretation" in verdictSchema(MAP3.ideas[0], "informational_explanatory").properties));
  assert.ok("interpretation" in summarySchema(MAP2).properties && !("interpretation" in summarySchema(MAP3).properties));
  const p = buildVerdictPrompt({ passage: TP02, idea: MAP2.ideas[0], questionText: "q", answer: "a", passageType: "narrative" });
  assert.ok(p.includes("An interpretation is OPTIONAL"));
  assert.ok(!buildVerdictPrompt({ passage: TP03, idea: MAP3.ideas[0], questionText: "q", answer: "a", passageType: "informational_explanatory" }).includes("interpretation (stories only)"));
  return "story verdicts and summaries carry an optional interpretation; informational ones do not";
});

test("G14", "Summary feedback: at most 3 points, in priority order, no answers given", () => {
  const summary = "Bread rises because yeast eats sugar and makes gas. Salt makes bread rise much faster than anything else. Gluten holds things.";
  const raw = {
    ideas: {
      K0: { status: "missing", learner_span: "" },
      K1: { status: "covered", learner_span: "yeast eats sugar and makes gas" },
      K2: { status: "covered", learner_span: "Gluten holds things" },
      K3: { status: "distorted", learner_span: "Salt makes bread rise much faster" },
      K4: { status: "missing", learner_span: "" },
    },
    relations: { K1: { status: "correct", learner_span: "yeast eats sugar and makes gas" }, K2: { status: "missing", learner_span: "" } },
    unsupported_claims: [{ learner_span: "Salt makes bread rise much faster than anything else" }],
  };
  const a = normaliseSummary(raw, MAP3, summary);
  const fb = buildSummaryFeedback(MAP3, a, { summary, passage: TP03 });
  assert.equal(fb.points.length, 3);
  assert.deepEqual(fb.points.map((p) => p.type), ["distortion", "unsupported_claim", "missing_main_idea"]);
  assert.ok(fb.all_points.some((p) => p.type === "missing_relationship" && p.idea === "K2"));
  for (const p of fb.all_points) for (const i of MAP3.ideas) assert.ok(!p.text.includes(i.statement));
  assert.ok(/words: a little short/.test(fb.length_note));
  assert.ok(!fb.all_points.some((p) => p.type === "length"));
  /* a story summary with no moral gets no point about a moral */
  const s2 = "Mr Lo's stall is closing. Mei wants her grandmother's watch fixed for her sister's wedding; he refuses, then helps her repair it herself.";
  const a2 = normaliseSummary({ ideas: Object.fromEntries(MAP2.ideas.map((i) => [i.id, { status: "missing", learner_span: "" }])), relations: {}, unsupported_claims: [] }, MAP2, s2);
  const fb2 = buildSummaryFeedback(MAP2, a2, { summary: s2, passage: TP02 });
  assert.ok(!fb2.all_points.some((p) => /moral|lesson|theme/i.test(p.text)));
  return `points: ${fb.points.map((p) => p.type).join(" > ")}; length is a note, never a point; no story feedback asks for a moral`;
});

test("G15", "Feedback guard replaces any point that would give an idea away", () => {
  const m = copy(MAP3);
  m.ideas[3].topic_label = m.ideas[3].statement; /* a leaking label */
  const a = normaliseSummary({ ideas: { K3: { status: "missing" } }, relations: {}, unsupported_claims: [] }, m, "x");
  const fb = buildSummaryFeedback(m, a, { summary: "x", passage: TP03 });
  const p = fb.all_points.find((x) => x.idea === "K3");
  assert.equal(p.replaced_by_guard, true);
  assert.equal(p.text, "Look again at the highlighted part of the text.");
  return "a point that would reveal the hidden statement is replaced by the neutral template";
});

const passed = results.filter((r) => r.pass).length;
const lines = [
  `# AGS genre-sensitivity test results`,
  ``,
  `module ${AGS_VERSIONS.module} · rules ${AGS_VERSIONS.rules} · prompts ${Object.values(AGS_PROMPT_VERSIONS).join(" · ")} · run ${new Date().toISOString()}`,
  ``,
  `**${passed} / ${results.length} passed.** These tests are deterministic. Whether a real model classifies passage types correctly, and writes good genre-specific questions, has to be checked on real model output.`,
  ``,
  `| ID | Case | Result | What happened |`,
  `| --- | --- | --- | --- |`,
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/")} |`),
];
console.log(lines.join("\n"));
if (process.argv.includes("--write")) writeFileSync(new URL("../research/AGS_GENRE_TEST_RESULTS.md", here), lines.join("\n") + "\n");
process.exit(passed === results.length ? 0 : 1);
