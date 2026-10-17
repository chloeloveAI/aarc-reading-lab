/* ------------------------------------------------------------------ *
 * prompts.js — item-generation prompt, version items-v10.1
 * (PROMPT_VERSION in research.js).
 *
 * Primary framework: PIRLS 2026 Reading Assessment Framework
 *   (Sabatini, Kennedy, Wry & von Davier, 2024, pp. 12–16).
 * Supplementary, for adult informational reading tasks only:
 *   PISA 2018 Reading Framework (OECD, 2019, ch. 2, pp. 34–36).
 * Corrections agreed with the researcher (15 Oct 2026):
 *   P2 — paraphrasing alone is not inference;
 *   P3 — meaningful synthesis; text words may appear in the answer,
 *        but the relationship/conclusion itself must not be stated;
 *   P4 — a justified evaluative judgment, not evaluative keywords.
 * The P3 different-paragraph rule is an AARC-specific experimental
 * constraint (configurable), not a PIRLS requirement.
 * ------------------------------------------------------------------ */

export const LEARNER_PRESETS = {
  primary: "a primary-school pupil (about 9–11 years old) reading in English",
  secondary: "a secondary-school student (about 12–17 years old) reading in English",
  adult: "an adult independent reader or university student",
};

export function learnerText(cfg) {
  const custom = String(cfg.learnerCustom || "").trim();
  return custom || LEARNER_PRESETS[cfg.learnerPreset] || LEARNER_PRESETS.adult;
}

export const PROCESSES = {
  1: {
    name: "Focus on and retrieve explicitly stated information",
    what: "The reader locates information that is explicitly stated in the text and recognises that it is relevant to the question.",
    info: "searching for definitions of words or phrases; looking for specific ideas; finding the topic sentence or main idea when it is explicitly stated; identifying specific information in a table or graphic; retrieving target information of a few words, phrases or numbers",
    story: "identifying the setting (time and place); looking for specific stated events or details",
    test: "The answer is stated in the text. The stem and the correct option use the text's own words or close synonyms, and the evidence lies within a sentence or two.",
    distractors: "other details that ARE stated in the text but answer a different question — the right kind of information from the wrong place — so the reader must locate the correct one.",
    form: "Do not copy the evidence sentence into the stem; make the reader search for it.",
  },
  2: {
    name: "Make straightforward inferences",
    what: "The reader infers an idea or a connection that the text does not state. The inference rests mainly on information in one place: the ideas may be stated, but the connection between them is not. Most readers would reach the same conclusion.",
    info: "inferring that one event or condition caused another; inferring why a step, condition or example is included; applying a stated finding to a closely related case; working out what a word or phrase refers to; identifying which part of the text would help for a particular purpose",
    story: "giving the reason for a character's action; describing the relationship between two characters; inferring a feeling from what a character does",
    test: "The reader must infer something. Rewording a stated sentence is NOT enough: if a reader could answer by matching the words of one or two sentences, even with synonyms, it is process 1 — rewrite it. The correct option should not appear anywhere in the text as a statement.",
    distractors: "plausible connections the text does not support; true details that do not answer the 'why' or 'how'; a reversal of the relationship.",
    form: "",
  },
  3: {
    name: "Interpret and integrate ideas and information",
    what: "The reader builds a more complete understanding of the text by synthesising information from significant portions of it — relating parts to each other or to the whole. The interpretation is grounded in the text but goes beyond what any one sentence says, and it must be supported by evidence in the text, not by personal opinion alone.",
    info: "explaining a causal or claim-and-evidence relationship that runs across paragraphs; comparing and contrasting information in the text; identifying the implicit main idea or the best summary; interpreting a real-world application of information in the text",
    story: "discerning the theme; tracing how a character changes; inferring mood or tone; considering an alternative to a character's actions",
    test:
      "All three must hold:\n" +
      "  1. Meaningful synthesis: the answer needs information from more than one part of the text, and the reader must work out how the parts relate.\n" +
      "  2. No single sentence, or two neighbouring sentences, states the answer. Words and ideas from the text may appear in the answer; what must not be written in the text is the relationship or conclusion itself.\n" +
      "  3. The relationship is supported by the text. Do not invent a cause, motive or conclusion the text does not support.\n" +
      "Never write: questions that list two separately stated facts ('What are the two…'); options built as combinations of two facts ('X and Y', 'X but not Y'); questions that can be answered by finding each half separately.",
    distractors: "an interpretation based on only one part of the text; a literal restatement of a detail; an over-generalisation; a plausible personal opinion that the text does not support.",
    form: "Give the main evidence in \"anchor\", evidence from another part of the text in \"anchor2\", and explain in \"link\" how they combine into the answer.",
  },
  4: {
    name: "Evaluate and critique content and textual elements",
    what: "The reader steps back from the text to evaluate and critique it — its content, the quality of its evidence and reasoning, its language, structure or point of view. An acceptable answer is a justified judgment about the text.",
    info: "judging how well a claim is supported by the evidence given; judging whether information is accurate, complete, up to date or unbiased; identifying the author's point of view, purpose or perspective when the text does not state it; judging the effect of a word choice, example or structure; judging what a table or graphic adds",
    story: "evaluating a character's decision; judging how well the title fits the theme; describing the effect of language such as metaphor or tone",
    test:
      "The reader must APPLY an evaluative criterion to some aspect of the text and reach a justified judgment. Criteria include: is the evidence sufficient or relevant for the claim; is the reasoning sound; what is missing, one-sided or left unaddressed; what a stated limitation does to the conclusion; how well a word choice, example or structure serves the purpose.\n" +
      "  - Identifying or restating the author's stated position, purpose or recommendation is NOT process 4. If the text says it, it is process 1 — rewrite it.\n" +
      "  - The correct option's reason must come from that weighing, never from 'the text states / says / explicitly' something.\n" +
      "  - Evaluative wording ('best supported', 'how effective', 'judgment', 'perspective') does not make an item process 4.\n" +
      "  - Asking what something is for, or what it does, is not process 4 when the text says so.\n" +
      "Knowledge beyond the text may inform the judgment, but the best option must be justified by the text.",
    distractors: "a judgment whose reason the text contradicts; an over-statement of the evidence; a personal opinion with no support in the text; the right judgment with a wrong reason.",
    form: "Ask which judgment is BEST SUPPORTED by the text. Each option states a judgment AND its reason. Exactly one option's reason is supported by the text, and that reason evaluates (evidence, reasoning, completeness, limitation or effect); it does not just report what the text says.",
  },
};

const TEXT_TYPES = {
  auto: "Decide from the passage whether it is an information text or a story, and use the matching tasks.",
  narrative: "This is a story (narrative) text.",
  informational: "This is an information text.",
};

function taskLines(P, textType) {
  if (textType === "informational") return `Typical tasks: ${P.info}.`;
  if (textType === "narrative") return `Typical tasks: ${P.story}.`;
  return `Typical tasks in an information text: ${P.info}.\nTypical tasks in a story: ${P.story}.`;
}

/* Exemplars: at most one GOOD and one BAD per process (BAD only where supplied). */
function exemplarBlock(exemplars, level) {
  const good = exemplars.find((e) => e.role !== "negative");
  const bad = exemplars.find((e) => e.role === "negative");
  if (!good && !bad) return "";
  const L = ["A", "B", "C", "D"];
  const show = (e, mark) =>
    `Q: ${e.stem}\n` + e.options.map((o, i) => `${L[i]}. ${o}${mark && i === e.correct ? "   <- correct" : ""}`).join("\n");
  let out = "\nEXAMPLES FROM A DIFFERENT TEXT — a style guide only. Do not reuse their content or wording.";
  if (good)
    out +=
      `\nGOOD process ${level} item (text: ${good.passage_excerpt || "another passage"}):\n` +
      show(good, true) +
      (good.skill ? `\nSkill: ${good.skill}` : "") +
      (good.process_rationale ? `\nWhy it is process ${level}: ${good.process_rationale}` : "");
  if (bad)
    out +=
      `\n\nBAD item — NEVER write items like this:\n` +
      show(bad, false) +
      (bad.why_bad ? `\nWhy it is bad: ${bad.why_bad}` : "");
  return out + "\n";
}

function trimPassage(text) {
  const cap = 40000;
  return text.length > cap ? text.slice(0, cap) + "\n[…passage truncated…]" : text;
}

/* PASSAGE_TOKEN lets the log store the prompt without duplicating the passage */
export const PASSAGE_TOKEN = "<<PASSAGE>>";

/* v10.4 coverage plan: one line per item in this request */
function coverageBlock(slots, usedAnchors) {
  if (!slots || !slots.length) return "";
  const q = (t) => String(t || "").replace(/"/g, "'").replace(/\s+/g, " ").trim().slice(0, 400);
  const lines = slots.map((s, i) => {
    const head = `Item ${i + 1}: its "anchor" (the main evidence) must come from QUARTER ${s.quarter}.`;
    const f = s.focus;
    if (!f) return head;
    if (f.kind === "vocab")
      return `${head} While reading, the reader looked up the word '${q(f.text)}' and saved it as new to her. Test what '${q(f.text)}' means IN THIS TEXT: the "anchor" is copied from the sentence where it appears, the four options are possible meanings, the correct one fits this context, and the distractors are other real senses of the word or meanings that misread the sentence. Set "keyword" to '${q(f.text)}'.`;
    const asked = f.kind === "tutor" ? ` She asked the tutor to explain it${f.question ? `, and asked: '${q(f.question)}'` : ""}.` : "";
    return `${head} While reading, the reader ${f.kind === "tutor" ? "highlighted and asked about" : "highlighted"} this part: '${q(f.text)}'.${asked} Build the item around the idea in that part, so it checks whether she now understands it. Take the evidence from that part. Do not reuse a tutor's wording.`;
  });
  return `
COVERAGE PLAN. The text is split into four quarters, each starting with a line like [QUARTER 2 OF 4 STARTS HERE]. Those marker lines are not part of the text: never copy them into an anchor. Write the items in this order:
${lines.join("\n")}
Every item must test a DIFFERENT idea and use DIFFERENT evidence from the other items.${
    usedAnchors && usedAnchors.length
      ? `\nEvidence already used by earlier questions — choose other evidence: ${usedAnchors.map((a) => `'${q(a).slice(0, 120)}'`).join("; ")}`
      : ""
  }
`;
}

export function buildItemPromptV10({ level, count, passage, usedStems = [], cfg = {}, exemplars = [], forLog = false, markedPassage = "", slots = null, usedAnchors = [] }) {
  const P = PROCESSES[level];
  const strict = cfg.l3Strict !== false;
  const textType = cfg.textType || "auto";
  return `You are an expert designer of reading-comprehension assessment. You follow the four comprehension processes of the PIRLS 2026 reading framework. You write multiple-choice questions that make a learner go back into the text to find, connect and judge evidence.

LEARNER: ${learnerText(cfg)}.
Write the stem and options in language this learner can read easily. Do not make the idea being tested easier than the process requires.

TEXT TYPE: ${TEXT_TYPES[textType] || TEXT_TYPES.auto}

THE TEXT. Every item must be grounded in it:
<passage>
${forLog ? PASSAGE_TOKEN : trimPassage(slots && markedPassage ? markedPassage : passage)}
</passage>

Write exactly ${count} multiple-choice item${count > 1 ? "s" : ""} for this comprehension process:
PROCESS ${level} — ${P.name}.
What it is: ${P.what}
${taskLines(P, textType)}
Classification test: ${P.test}
Distractors: ${P.distractors}${P.form ? `\nItem form: ${P.form}` : ""}${
    level === 3
      ? strict
        ? "\nAARC experiment constraint: \"anchor\" and \"anchor2\" must come from DIFFERENT paragraphs."
        : "\n\"anchor\" and \"anchor2\" must be different sentences; they may be in the same paragraph."
      : ""
  }
${exemplarBlock(exemplars, level)}${coverageBlock(slots, usedAnchors)}
Rules for every item:
- The correct answer must be grounded in this text. A reader who has not read it must not be able to answer correctly from general knowledge alone.
- The stem is a complete question ending with a question mark.
- Exactly 4 options and exactly one correct. Never "all of the above" or "none of the above". Keep the four options similar in length.
- Do not test the same detail as another item.
- Inside any text value, never use the double-quote character. Write 'single quotes' instead.
- "skill": 2 to 6 words naming the skill tested, e.g. "judge how well a claim is supported".
- "why" for each option: at most 18 words — why it is right, or exactly what makes it wrong.
- "hint": a locator only (which part to re-read), no answer content, at most 12 words.
- "anchor": 6 to 14 words copied EXACTLY from the text, character for character — the span holding the evidence. No paraphrase, no ellipses.
${level === 3 ? `- "anchor2": REQUIRED — 6 to 14 words copied EXACTLY from the text: the second piece of evidence.\n- "link": one sentence, at most 25 words, saying how the two spans combine into the answer.\n` : ""}- "keyword": 1 to 4 words copied from the anchor — the word the reader must understand. It must not give away the answer.
- "keyword_meaning": what the keyword means in this text, at most 20 words, without stating the answer.
- "guide": one guiding question, at most 20 words, that never names or paraphrases the correct option.
- "takeaway": one sentence, at most 22 words, naming the idea the item tested.
${usedStems.length ? `- Do not repeat or paraphrase these stems already used: ${usedStems.map((s) => `'${s.replace(/"/g, "'")}'`).join("; ")}\n` : ""}
If this text cannot support a genuine item for this process, do NOT invent one and do NOT write an easier one: return {"items":[],"shortfall_reason":"..."}.

Return ONLY JSON. No markdown fence, no preamble:
{"items":[{"skill":"...","stem":"...","options":[{"text":"...","correct":true,"why":"..."},{"text":"...","correct":false,"why":"..."},{"text":"...","correct":false,"why":"..."},{"text":"...","correct":false,"why":"..."}],"hint":"...","anchor":"...",${level === 3 ? '"anchor2":"...","link":"...",' : ""}"keyword":"...","keyword_meaning":"...","guide":"...","takeaway":"..."}]}`;
}

/* ------------------------------------------------------------------ *
 * Shadow meaning check for process-3 candidates (l3check-v1).
 * A NON-BLOCKING diagnostic: recorded, never used to accept/reject in
 * the pilot. Separate from the independent AI evaluator (Step 5).
 * ------------------------------------------------------------------ */

export const L3CHECK_VERSION = "l3check-v1";

export const L3CHECK_SCHEMA = {
  type: "object",
  properties: {
    requires_integration: { type: "boolean" },
    spans_coherent: { type: "boolean" },
    single_sentence_answerable: { type: "boolean" },
    single_sentence_quote: { type: "string" },
    unsupported_inference: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["requires_integration", "spans_coherent", "single_sentence_answerable", "single_sentence_quote", "unsupported_inference", "reason"],
};

export function buildL3CheckPrompt({ item, passage, forLog = false }) {
  const L = ["A", "B", "C", "D"];
  return `You are checking ONE multiple-choice reading question that claims to test interpreting and integrating ideas across a text. Judge it strictly from the text. Do not improve or rewrite it.

<passage>
${forLog ? PASSAGE_TOKEN : trimPassage(passage)}
</passage>

QUESTION: ${item.stem}
${item.options.map((o, i) => `${L[i]}. ${o.text}${o.correct ? "   <- keyed correct" : ""}`).join("\n")}
Evidence span 1: ${item.anchor || "(none)"}
Evidence span 2: ${item.anchor2 || "(none)"}
Claimed link: ${item.link || "(none)"}

Answer each:
- "requires_integration": true only if reaching the keyed answer requires combining information from more than one part of the text and working out how the parts relate.
- "spans_coherent": true only if the two evidence spans, taken together, really support the keyed answer through a coherent relationship.
- "single_sentence_answerable": true if one sentence (or two neighbouring sentences) of the text already states the keyed answer, even in other words.
- "single_sentence_quote": if single_sentence_answerable is true, copy that sentence exactly; otherwise "".
- "unsupported_inference": true if the keyed answer adds a cause, motive or interpretation that the text does not support.
- "reason": at most 40 words explaining your judgments. Never use the double-quote character inside it.

Return ONLY JSON:
{"requires_integration":false,"spans_coherent":false,"single_sentence_answerable":false,"single_sentence_quote":"","unsupported_inference":false,"reason":"..."}`;
}

/* ------------------------------------------------------------------ *
 * Shadow meaning check for process-4 candidates (l4check-v1).
 * NON-BLOCKING, like l3check: recorded, never used to accept/reject.
 * ------------------------------------------------------------------ */

export const L4CHECK_VERSION = "l4check-v1";

export const L4CHECK_SCHEMA = {
  type: "object",
  properties: {
    applies_evaluative_criterion: { type: "boolean" },
    criterion: { type: "string" },
    answer_stated_in_text: { type: "boolean" },
    stated_quote: { type: "string" },
    superficial_evaluative_wording: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["applies_evaluative_criterion", "criterion", "answer_stated_in_text", "stated_quote", "superficial_evaluative_wording", "reason"],
};

export function buildL4CheckPrompt({ item, passage, forLog = false }) {
  const L = ["A", "B", "C", "D"];
  return `You are checking ONE multiple-choice reading question that claims to test evaluating and critiquing a text. Judge it strictly from the text. Do not improve or rewrite it.

<passage>
${forLog ? PASSAGE_TOKEN : trimPassage(passage)}
</passage>

QUESTION: ${item.stem}
${item.options.map((o, i) => `${L[i]}. ${o.text}${o.correct ? "   <- keyed correct" : ""}`).join("\n")}
Evidence span: ${item.anchor || "(none)"}

Answer each:
- "applies_evaluative_criterion": true only if reaching the keyed answer requires the reader to apply a criterion to the text (sufficiency or relevance of evidence, soundness of reasoning, completeness or bias, effect of a stated limitation, effect of language or structure), not just to find what the text says.
- "criterion": the criterion applied, in at most 6 words, or "none".
- "answer_stated_in_text": true if the keyed answer (judgment and reason) is essentially stated in the text, for example the author's own stated position or purpose.
- "stated_quote": if answer_stated_in_text is true, copy the sentence that states it exactly; otherwise "".
- "superficial_evaluative_wording": true if the item looks evaluative only because of words like 'best supported', 'judgment' or 'effective', while the task is really retrieval or a simple inference.
- "reason": at most 40 words explaining your judgments. Never use the double-quote character inside it.

Return ONLY JSON:
{"applies_evaluative_criterion":false,"criterion":"none","answer_stated_in_text":false,"stated_quote":"","superficial_evaluative_wording":false,"reason":"..."}`;
}
