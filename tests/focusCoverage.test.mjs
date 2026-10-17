/* v10.4 deterministic tests — quarters, the coverage plan, the tutor's
   "read so far" text, and the coverage block in the item prompt.
   Run: node tests/focusCoverage.test.mjs
   These test the PLUMBING. They do not show that a real model writes
   good items for the planned quarter; that needs a real run. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { quarterMap, lineQuarters, quarterStarts, passageWithQuarters, buildBlueprint, blueprintSummary, rankFocus, maxTargeted, stemLocationProblem, keyPlan, placeKey } from "../src/coverage.js";
import { textUpTo, buildTutorPrompt } from "../src/tutor.js";
import { buildItemPromptV10 } from "../src/prompts.js";
import { coachLeak } from "../src/coach.js";

const here = new URL(".", import.meta.url);
const md = readFileSync(new URL("../research/test_passage_free_buses.md", here), "utf8");
const PASSAGE = md.split(/\n---\n/)[1].trim();
const LINES = PASSAGE.split("\n");

const results = [];
function test(id, title, fn) {
  try {
    results.push({ id, title, pass: true, detail: fn() || "" });
  } catch (e) {
    results.push({ id, title, pass: false, detail: e.message });
  }
}

test("C1", "Every quarter 1–4 is used and quarters never go backwards", () => {
  const q = lineQuarters(LINES);
  const textQ = q.filter((_, i) => LINES[i].trim());
  assert.deepEqual([...new Set(textQ)].sort(), [1, 2, 3, 4]);
  for (let i = 1; i < q.length; i++) assert.ok(q[i] >= q[i - 1]);
  return `quarters start at lines ${JSON.stringify(quarterStarts(LINES))}`;
});

const squash = (t) => t.replace(/\s+/g, "");
test("C2", "Quarter markers are added on their own lines; the text is unchanged", () => {
  const marked = passageWithQuarters(LINES);
  const markers = marked.split("\n").filter((l) => /^\[QUARTER \d OF 4 STARTS HERE\]$/.test(l));
  assert.equal(markers.length, 4);
  assert.equal(squash(marked.split("\n").filter((l) => !/^\[QUARTER/.test(l)).join("\n")), squash(LINES.join("\n")));
});

/* the case that failed in the preview: few, very long paragraphs */
const LONG = [
  "AI and learning",
  Array.from({ length: 14 }, (_, i) => `Sentence ${i + 1} of the first paragraph talks about artificial intelligence in schools and what the results show.`).join(" "),
  Array.from({ length: 3 }, (_, i) => `Short paragraph sentence ${i + 1} about research gaps.`).join(" "),
  Array.from({ length: 6 }, (_, i) => `Closing sentence ${i + 1} about what teachers should do next with these findings.`).join(" "),
];
test("C9", "Long paragraphs: every quarter still gets a marker (cut at a sentence boundary)", () => {
  const marked = passageWithQuarters(LONG);
  for (let q = 1; q <= 4; q++) assert.ok(marked.includes(`[QUARTER ${q} OF 4 STARTS HERE]`), "missing quarter " + q);
  assert.equal(squash(marked.split("\n").filter((l) => !/^\[QUARTER/.test(l)).join("")), squash(LONG.join("")));
  const qm = quarterMap(LONG);
  assert.deepEqual(qm.available, [1, 2, 3, 4]);
  const mid = LONG[1].toLowerCase().indexOf("sentence 10 of");
  assert.equal(qm.posQuarter(1, mid), 2);
  return "markers inside paragraph 1: " + marked.split("\n").filter((l) => /^\[QUARTER/.test(l)).length;
});
test("C10", "A very short text uses only the quarters it has; the plan never asks for a missing one", () => {
  const tiny = ["One short sentence about buses.", "Another short sentence about fares."];
  const qm = quarterMap(tiny);
  assert.ok(qm.available.length < 4);
  const b = buildBlueprint([1, 2, 2, 1], [], qm.available);
  assert.ok(b.every((sl) => qm.available.includes(sl.quarter)));
  return "available " + qm.available.join(",");
});

test("C3", "6-question plan (1·2·2·1): every quarter used, loads differ by at most 1", () => {
  const b = buildBlueprint([1, 2, 2, 1]);
  const s = blueprintSummary(b);
  assert.equal(s.total, 6);
  assert.ok(s.per_quarter.every((n) => n >= 1));
  assert.ok(Math.max(...s.per_quarter) - Math.min(...s.per_quarter) <= 1);
  assert.deepEqual(b.map((x) => x.level), [1, 2, 2, 3, 3, 4]);
  return "per quarter " + s.per_quarter.join("·");
});

test("C4", "10-question plan (2·3·3·2): every quarter used, loads differ by at most 1", () => {
  const s = blueprintSummary(buildBlueprint([2, 3, 3, 2]));
  assert.ok(Math.max(...s.per_quarter) - Math.min(...s.per_quarter) <= 1);
  return "per quarter " + s.per_quarter.join("·");
});

test("C5", "Reader focus: at most one third of questions (2 of 6, 3 of 10)", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ kind: "tutor", text: "part " + i, quarter: (i % 4) + 1 }));
  assert.equal(blueprintSummary(buildBlueprint([1, 2, 2, 1], many)).targeted, 2);
  assert.equal(blueprintSummary(buildBlueprint([2, 3, 3, 2], many)).targeted, 3);
  assert.equal(maxTargeted(6), 2);
});

test("C6", "One of each kind before a second of any kind; saved word goes to a process-2 slot", () => {
  const f = [
    { kind: "tutor", text: "a", quarter: 2 },
    { kind: "tutor", text: "b", quarter: 3 },
    { kind: "vocab", text: "abreast", quarter: 1 },
  ];
  const b = buildBlueprint([1, 2, 2, 1], f);
  const kinds = b.filter((x) => x.focus).map((x) => x.focus.kind).sort();
  assert.deepEqual(kinds, ["tutor", "vocab"]);
  const v = b.find((x) => x.focus?.kind === "vocab");
  assert.equal(v.level, 2);
  assert.equal(v.quarter, 1);
});

test("C7", "Targeted slot takes the quarter of the reader's focus; a tutor part goes to process 3 first", () => {
  const b = buildBlueprint([2, 3, 3, 2], [{ kind: "tutor", text: "x", quarter: 4, start_line: 20, end_line: 21 }]);
  const t = b.find((x) => x.focus);
  assert.equal(t.level, 3);
  assert.equal(t.quarter, 4);
  assert.equal(t.focus.start_line, 20);
});

test("C8", "Duplicate focus (same text) counts once", () => {
  const r = rankFocus([{ kind: "highlight", text: "Same  text", quarter: 1 }, { kind: "highlight", text: "same text", quarter: 1 }]);
  assert.equal(r.length, 1);
});

test("T1", "Tutor text stops at the end of the highlight — nothing after it", () => {
  const i = LINES.findIndex((l) => /Eastholme/.test(l));
  assert.ok(i > 0, "test passage changed");
  const hl = LINES[i].split(/(?<=\.)\s/)[0];
  const prior = textUpTo(LINES, i, hl);
  assert.ok(prior.endsWith(hl.split(/\s+/).slice(-6).join(" ")));
  assert.ok(!prior.includes(LINES[i + 1] && LINES[i + 1].trim() ? LINES[i + 1].trim().slice(0, 30) : "@@none@@"));
  const later = LINES.slice(i + 1).join(" ");
  const laterWord = (later.match(/\b[A-Z][a-z]{6,}\b/g) || []).find((w) => !LINES.slice(0, i + 1).join(" ").includes(w));
  if (laterWord) assert.ok(!prior.includes(laterWord), "later text leaked: " + laterWord);
  return `prior text ${prior.length} characters, ends at the highlight`;
});

test("T2", "Tutor prompt forbids talking about later text and carries the dialogue", () => {
  const p = buildTutorPrompt({ highlight: "free travel", prior: "Some earlier text.", history: [{ role: "tutor", text: "It means no fares." }], question: "Why?" });
  assert.match(p, /has NOT read anything after this/);
  assert.match(p, /Never mention, guess or hint at what comes later/);
  assert.match(p, /TUTOR: It means no fares\./);
  assert.match(p, /HER NEW MESSAGE: Why\?/);
});

test("P1", "Item prompt: coverage plan names each item's quarter and the reader focus", () => {
  const p = buildItemPromptV10({
    level: 2,
    count: 2,
    passage: PASSAGE,
    markedPassage: passageWithQuarters(LINES),
    slots: [
      { quarter: 2, focus: null },
      { quarter: 1, focus: { kind: "vocab", text: "abreast" } },
    ],
    usedAnchors: ["Bus journeys in Eastholme rose by 9 per cent"],
  });
  assert.match(p, /\[QUARTER 1 OF 4 STARTS HERE\]/);
  assert.match(p, /Item 1: its "anchor" \(the main evidence\) must come from QUARTER 2\./);
  assert.match(p, /looked up the word 'abreast'/);
  assert.match(p, /Evidence already used/);
});

test("P2", "Item prompt for the log keeps the passage token, not the marked text", () => {
  const p = buildItemPromptV10({ level: 1, count: 1, passage: PASSAGE, markedPassage: passageWithQuarters(LINES), slots: [{ quarter: 1 }], forLog: true });
  assert.ok(!p.includes("[QUARTER 1 OF 4 STARTS HERE]"));
  assert.match(p, /<<PASSAGE>>/);
});

test("L1", "Stem naming the final section is rejected when the evidence is in an earlier section", () => {
  assert.match(stemLocationProblem("Why does the author mention roadworks in the final section?", 8, 9), /section 9 .* section 8/);
  assert.equal(stemLocationProblem("Why does the author mention roadworks in the final section?", 9, 9), "");
  assert.equal(stemLocationProblem("In Section 3, what does 'centre' mean?", 3, 9), "");
  assert.match(stemLocationProblem("In the third section, why…?", 5, 9), /names section 3/);
  assert.match(stemLocationProblem("What does the last quarter suggest?", 9, 9), /quarter/);
  assert.equal(stemLocationProblem("Why does the author mention roadworks?", 8, 9), "");
});

test("K1", "Answer key: every block of four candidates uses A, B, C and D once; same run → same order", () => {
  const plan = keyPlan("R20261017-test");
  assert.deepEqual([...plan].sort(), [0, 1, 2, 3]);
  assert.deepEqual(keyPlan("R20261017-test"), plan);
  const opts = [{ text: "right", correct: true }, { text: "b" }, { text: "c" }, { text: "d" }];
  const seen = new Set();
  for (let k = 0; k < 4; k++) {
    const r = placeKey(opts, plan[k], "C" + k);
    assert.equal(r.options.length, 4);
    assert.equal(r.options.filter((o) => o.correct).length, 1);
    assert.equal(r.options[plan[k]].text, "right");
    assert.equal(r.from, 0);
    seen.add(r.options.findIndex((o) => o.correct));
  }
  assert.equal(seen.size, 4);
  return "plan " + plan.map((i) => "ABCD"[i]).join("");
});

test("Q1", "Question coach: replies that point to a place or repeat the key are caught", () => {
  const item = { options: [{ text: "Removing fares attracted people who previously drove or stayed home", correct: true }, { text: "x" }, { text: "y" }, { text: "z" }] };
  assert.match(coachLeak("Read the next paragraph carefully.", item), /place/);
  assert.match(coachLeak("Look at paragraph 2 of Section 5.", item), /place/);
  assert.match(coachLeak("Find the sentence that starts with 'We understand'.", item), /place/);
  assert.match(coachLeak("It shows removing fares attracted people who previously drove or stayed at home.", item), /correct option/);
  assert.equal(coachLeak("'Councillors' are members of the city council. Are they part of the Alliance?", item), "");
  assert.equal(coachLeak("What do you think the writer wants you to notice about the councillors' argument?", item), "");
});

const passed = results.filter((r) => r.pass).length;
console.log(
  [
    `# v10.4 focus reading and coverage tests (deterministic)`,
    ``,
    `**${passed} / ${results.length} passed.**`,
    ``,
    `| ID | Case | Result | What happened |`,
    `| --- | --- | --- | --- |`,
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/")} |`),
  ].join("\n")
);
process.exit(passed === results.length ? 0 : 1);
