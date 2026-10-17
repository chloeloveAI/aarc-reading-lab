/* ------------------------------------------------------------------ *
 * agsPrompts.js — AGS Phase 2: prompts and JSON schemas.
 *
 * Three model tasks, each versioned and logged:
 *   agsmap-v0.1      build a key-idea map for a passage (once per passage)
 *   agsverdict-v0.1  judge ONE learner answer against ONE idea
 *   agssum-v0.1      assess a learner's independent summary against the map
 *
 * Design rules carried by every prompt:
 *   - the model RECORDS what an answer shows; it never teaches, corrects,
 *     writes feedback for the learner, or writes a model answer;
 *   - every "present" judgement must quote the learner's own words, so code
 *     can verify it (normaliseVerdict / normaliseSummary in ags.js);
 *   - meaning, not wording: English, Chinese (incl. Cantonese) or mixed.
 *
 * Self-contained: imports nothing from the Full Climb code.
 * Whether these prompts produce ACCURATE verdicts is an empirical question
 * (see tests/probe/), not something the deterministic tests establish.
 * ------------------------------------------------------------------ */

import { OPENING_QUESTIONS, ROLES_BY_TYPE, RELATION_TYPES, PASSAGE_TYPES, isRelational } from "./ags.js";

/* v0.2 (16 Oct 2026): genre-sensitive (explanatory / argumentative / narrative) */
export const AGS_PROMPT_VERSIONS = {
  map: "agsmap-v0.2",
  verdict: "agsverdict-v0.2",
  summary: "agssum-v0.2",
};

const TYPE_NAMES = {
  informational_explanatory: "an informational text that explains",
  informational_argumentative: "an informational text that argues for a claim",
  narrative: "a story",
};

/* the passage is stored once in the log; prompts are logged with this token */
export const AGS_PASSAGE_TOKEN = "<<PASSAGE>>";

/* recommended call settings (recorded with each call by the caller) */
export const AGS_CALL_SETTINGS = {
  map: { temperature: 0.2, maxTokens: 5000, think: false },
  verdict: { temperature: 0, maxTokens: 700, think: false },
  summary: { temperature: 0, maxTokens: 1500, think: false },
};

const cap = (t) => (String(t).length > 40000 ? String(t).slice(0, 40000) + "\n[…passage truncated…]" : String(t));
const passageBlock = (passage, forLog) => `<passage>\n${forLog ? AGS_PASSAGE_TOKEN : cap(passage)}\n</passage>`;

/* ============================ 1. KEY-IDEA MAP ============================ */

export const MAP_SCHEMA = {
  type: "object",
  properties: {
    passage_type: { type: "string", enum: PASSAGE_TYPES },
    passage_type_reason: { type: "string" },
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          role: { type: "string", enum: [...new Set(Object.values(ROLES_BY_TYPE).flat())] },
          topic_label: { type: "string" },
          statement: { type: "string" },
          elements: {
            type: "array",
            items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"] },
          },
          evidence: { type: "array", items: { type: "object", properties: { quote: { type: "string" } }, required: ["quote"] } },
          relation: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["none", ...RELATION_TYPES] },
              from: { type: "string" },
              to: { type: "string" },
              direction: { type: "string" },
            },
            required: ["type", "from", "to", "direction"],
          },
          depends_on: { type: "array", items: { type: "string" } },
          questions: {
            type: "object",
            properties: {
              opening: { type: "string" },
              focus: {
                type: "array",
                items: { type: "object", properties: { element: { type: "string" }, question: { type: "string" } }, required: ["element", "question"] },
              },
              link: { type: "string" },
              clarify: { type: "string" },
            },
            required: ["opening", "focus", "link", "clarify"],
          },
          misreadings: { type: "array", items: { type: "string" } },
        },
        required: ["id", "role", "topic_label", "statement", "elements", "evidence", "relation", "depends_on", "questions", "misreadings"],
      },
    },
  },
  required: ["passage_type", "passage_type_reason", "ideas"],
};

export function buildMapPrompt({ passage, learner = "an adult reader", forLog = false }) {
  return `You are an expert in reading comprehension. Build a KEY-IDEA MAP of the text below. The map is a hidden guide for a short guided conversation that helps ${learner} work out what the text says, in their own words, before writing a summary.

${passageBlock(passage, forLog)}

STEP 1. DECIDE THE PASSAGE TYPE
- "informational_explanatory": it mainly explains or describes how or why something is the way it is.
- "informational_argumentative": it mainly tries to persuade the reader of a claim or position, with reasons or evidence.
- "narrative": it is a story, with characters and events.
Give a one-sentence "passage_type_reason". Judge from the text itself. Do not call a text an argument just because it contains facts or opinions.

STEP 2. CHOOSE IDEAS THAT FIT THAT TYPE
Exactly ONE idea with role "main" and id "K0", then 3 to 5 more ideas, ids K1, K2, … in the order a reader meets them.
- informational_explanatory. main = the central thing the passage explains. Other roles: detail (important facts), explanation (how or why something happens), relationship (how two parts bear on each other), limitation (a caution the text states), conclusion (only if the text draws one).
- informational_argumentative. main = the author's claim or position. Other roles: support (reasons or evidence), relationship, limitation (counter-points or weaknesses the text states), conclusion (only if the text draws one).
- narrative. main = what the story is mainly about: who, and what happens to them. Other roles: character, setting (only where it matters to the story), conflict (the central problem), event (key events, in story order), motivation (why a character acts), resolution (how the conflict ends or is left), theme.
At least one idea must be a RELATIONSHIP between two parts of the text: give it a "relation". For an informational text it may be a cause, an explanation, a contrast, evidence for a point, or a limit. For a story it is often a motivation (why someone acts) or what resolves the conflict.

DO NOT FORCE WHAT THE TEXT LACKS
- Do not invent an argument, claim, conclusion, moral, lesson or theme. A story may have no stated moral. An explanation may make no argument.
- Use role "theme" only if the story itself clearly supports one, with at least two quotes, and never as the main idea.
- Only ideas the text states or clearly supports. No outside knowledge, no opinion of the text.

FOR EACH IDEA
- "topic_label": 1 to 4 words naming WHAT the idea is about, without saying what the text says about it (e.g. 'fuel prices'; 'Mei's request').
- "statement": the idea in one sentence, at most 30 words. Hidden from the reader.
- "elements": 2 or 3 meaning units an answer must contain, ids E1, E2, E3, each "label" at most 10 words.
- "evidence": 1 to 3 quotes, each 6 to 20 words COPIED EXACTLY from the text, character for character. No paraphrase, no ellipses. An idea with a relation needs at least 2 quotes, one for each side; they may be in the same paragraph.
- "relation": for an idea that links two of its elements: "type" (${RELATION_TYPES.join(", ")}), "from" and "to" (two different element ids) and "direction" (one sentence: what leads to or bears on what). Otherwise {"type":"none","from":"","to":"","direction":""}.
- "depends_on": ids of ideas a reader should grasp first (earlier ids only), or [].
- "misreadings": 1 to 3 likely wrong readings of this idea, each at most 15 words.

QUESTIONS (shown to the reader one at a time)
- K0 "opening" must be exactly: informational_explanatory → '${OPENING_QUESTIONS.informational_explanatory}'; informational_argumentative → '${OPENING_QUESTIONS.informational_argumentative}'; narrative → '${OPENING_QUESTIONS.narrative}'.
- Every other question is about THIS text: name the actual people, things, places, events or numbers it is about (e.g. 'Why does Mr Lo first refuse the job?', not 'What happens next?'). Never a generic question that would fit any text.
- "opening": one short question, at most 20 words, about this idea only.
- "focus": one question for EACH element: [{"element":"E1","question":"…"}, …], each at most 18 words, asking about that element only.
- "link": for an idea with a relation, one question asking how the two sides bear on each other; otherwise "".
- "clarify": one neutral question inviting the reader to say more, using the text, without hinting at the answer.
- NEVER let a question give the idea away: do not reuse the statement's key words, do not state any element, do not ask yes/no questions.
- Do not ask about an argument or claim unless the text is argumentative; do not ask about a moral, lesson, theme or conclusion the text does not have.
- Inside any text value, never use the double-quote character; write 'single quotes'.

Return ONLY JSON: {"passage_type":"…","passage_type_reason":"…","ideas":[…]}`;
}

/* ============================ 2. ANSWER VERDICT ========================== */

const INTERP_SCHEMA = {
  type: "object",
  properties: { judgement: { type: "string", enum: ["none", "defensible", "uncertain", "unsupported"] }, learner_span: { type: "string" } },
  required: ["judgement", "learner_span"],
};

export function verdictSchema(idea, passageType = null) {
  const els = (idea.elements || []).map((e) => e.id);
  const schema = {
    type: "object",
    properties: {
      reason: { type: "string" },
      answer_language: { type: "string", enum: ["en", "zh", "mixed", "other"] },
      no_attempt: { type: "boolean" },
      elements: {
        type: "object",
        properties: Object.fromEntries(
          els.map((id) => [
            id,
            {
              type: "object",
              properties: { status: { type: "string", enum: ["present", "absent", "contradicted"] }, learner_span: { type: "string" } },
              required: ["status", "learner_span"],
            },
          ])
        ),
        required: els,
      },
      contradicts_text: { type: "boolean" },
      misreading: { type: "boolean" },
      relation_expressed: { type: "string", enum: ["correct", "missing", "reversed", "wrong_type", "not_applicable"] },
      alternative: {
        type: "object",
        properties: {
          judgement: { type: "string", enum: ["none", "supported", "uncertain", "unsupported"] },
          passage_quote: { type: "string" },
          states_relation: { type: "boolean" },
        },
        required: ["judgement", "passage_quote", "states_relation"],
      },
      expression_unclear: { type: "boolean" },
    },
    required: ["reason", "answer_language", "no_attempt", "elements", "contradicts_text", "misreading", "relation_expressed", "alternative", "expression_unclear"],
  };
  if (passageType === "narrative") {
    schema.properties.interpretation = INTERP_SCHEMA;
    schema.required.push("interpretation");
  }
  return schema;
}

const INTERP_RULE = `- interpretation (stories only): if the answer offers a theme, message, moral or other reading of what the story means, record it. "defensible" = a careful reader could support it from the story's events; "uncertain" = possible but weakly supported; "unsupported" = the story gives no basis for it (for example a stock moral that does not fit). Copy the reader's words into learner_span. "none" if no interpretation is offered. An interpretation is OPTIONAL: never treat its absence as a gap, and it never replaces the story's events in the elements above.`;

export function buildVerdictPrompt({ passage, idea, questionText, answer, passageType = null, forLog = false }) {
  const isRel = isRelational(idea);
  const typeLine = passageType ? `
THE TEXT IS ${TYPE_NAMES[passageType] || passageType}.${passageType === "narrative" ? " A reader may name characters by name or by description (e.g. 'the old man'); both count." : ""}` : "";
  const els = (idea.elements || []).map((e) => `- ${e.id}: ${e.label}`).join("\n");
  const rel = isRel && idea.relation
    ? `\nTHIS IS A RELATIONSHIP IDEA. The relationship (${idea.relation.type}): ${idea.relation.direction}`
    : "";
  const alts = (idea.accepted_alternatives || []).length
    ? `\nREVIEWED ALTERNATIVE READINGS that a human has already accepted:\n${idea.accepted_alternatives.map((a) => `- ${a.statement || a}`).join("\n")}`
    : "";
  const elKeys = (idea.elements || []).map((e) => `"${e.id}":{"status":"absent","learner_span":""}`).join(",");
  return `You are checking ONE short answer that a reader wrote about a text. You do not teach, correct, hint or rewrite. You only record what the answer shows, for a researcher.

${passageBlock(passage, forLog)}${typeLine}

THE QUESTION THE READER WAS ASKED: ${questionText}

THE IDEA THIS QUESTION IS ABOUT (the reader cannot see this): ${idea.statement}
ITS ELEMENTS:
${els}${rel}${alts}

THE READER'S ANSWER, between the markers:
<<<
${answer}
>>>

HOW TO JUDGE
- Judge MEANING, not wording. The answer may be in English, Chinese (including written Cantonese), or a mix. Spelling, grammar, language choice and length do not matter.
- elements: an element is "present" only if the reader's own words convey it. Copy those exact words from the answer, in whatever language they are written, into "learner_span". If you cannot point to such words, the element is "absent" and learner_span is "". Never credit what the reader probably meant but did not say.
- "contradicted": the answer says the opposite of the element. Copy the words that do so into learner_span.
- contradicts_text: true if the answer states something the text contradicts.
- misreading: true if the answer confuses who, what or which part of the text the question is about.
- relation_expressed: ${isRel ? `"correct" if the answer links the elements in the right way and direction; "missing" if it mentions them without linking them; "reversed" if it links them the wrong way round; "wrong_type" if it links them with a different kind of relationship.` : `always "not_applicable" for this idea.`}
- alternative: use this when the answer does NOT match the idea but makes a different point about the question.
  "supported": a careful reader of THIS text would accept it as a reasonable answer to the question, AND a sentence of the text directly supports it. Copy 6 to 20 words of that sentence exactly into passage_quote.
  "uncertain": plausible, but the text does not clearly establish it.
  "unsupported": the text contradicts it or gives no basis for it, even if the answer quotes the text.
  "none": the answer matches the idea, or makes no other point.
  Quoting the text does not make an interpretation supported. ${isRel ? `states_relation: true only if the alternative itself states how one thing bears on another.` : `states_relation: false.`}
- no_attempt: true if the answer is blank, says it does not know (in any language), or is unrelated to the question.
- expression_unclear: true if the meaning is hard to follow, in any language.
${passageType === "narrative" ? INTERP_RULE + "\n" : ""}- reason: at most 40 words, for the researcher. Never write a corrected answer or a model answer.
- Inside any text value except learner_span, never use the double-quote character.

Return ONLY JSON:
{"reason":"...","answer_language":"en","no_attempt":false,"elements":{${elKeys}},"contradicts_text":false,"misreading":false,"relation_expressed":"${isRel ? "missing" : "not_applicable"}","alternative":{"judgement":"none","passage_quote":"","states_relation":false},"expression_unclear":false${passageType === "narrative" ? ',"interpretation":{"judgement":"none","learner_span":""}' : ""}}`;
}

/* ============================ 3. SUMMARY ASSESSMENT ====================== */

export function summarySchema(map) {
  const ideaIds = (map.ideas || []).map((i) => i.id);
  const relIds = (map.ideas || []).filter(isRelational).map((i) => i.id);
  return {
    type: "object",
    properties: {
      reason: { type: "string" },
      ideas: {
        type: "object",
        properties: Object.fromEntries(
          ideaIds.map((id) => [
            id,
            {
              type: "object",
              properties: { status: { type: "string", enum: ["covered", "missing", "distorted"] }, learner_span: { type: "string" } },
              required: ["status", "learner_span"],
            },
          ])
        ),
        required: ideaIds,
      },
      relations: {
        type: "object",
        properties: Object.fromEntries(
          relIds.map((id) => [
            id,
            {
              type: "object",
              properties: { status: { type: "string", enum: ["correct", "missing", "reversed", "wrong_type"] }, learner_span: { type: "string" } },
              required: ["status", "learner_span"],
            },
          ])
        ),
        required: relIds,
      },
      unsupported_claims: {
        type: "array",
        items: { type: "object", properties: { learner_span: { type: "string" } }, required: ["learner_span"] },
      },
      too_much_detail: { type: "boolean" },
      expression_unclear: { type: "boolean" },
      ...(map.passage_type === "narrative" ? { interpretation: INTERP_SCHEMA } : {}),
    },
    required: ["reason", "ideas", "relations", "unsupported_claims", "too_much_detail", "expression_unclear", ...(map.passage_type === "narrative" ? ["interpretation"] : [])],
  };
}

export function buildSummaryPrompt({ passage, map, summary, forLog = false }) {
  const ideas = (map.ideas || [])
    .map(
      (i) =>
        `- ${i.id} (${i.role}): ${i.statement}${isRelational(i) ? `\n    relationship (${i.relation.type}): ${i.relation.direction}` : ""}`
    )
    .join("\n");
  const type = map.passage_type;
  const genre =
    type === "narrative"
      ? "This is a story. A good summary tells who is involved, the central problem, the key events in order, why characters act, and how it ends. Do NOT expect a moral, lesson or theme unless one is in the key ideas below."
      : type === "informational_argumentative"
      ? "This text argues for a claim. A good summary gives the claim, the main reasons or evidence, and any limits the text itself states."
      : "This text explains. A good summary gives what is being explained, the important details, and how they connect. Do NOT expect an argument or conclusion unless one is in the key ideas below.";
  return `You are checking a reader's own summary of a text against a hidden list of its key ideas. You do not write feedback, corrections or a model summary. You only record what the summary shows, for a researcher.

${passageBlock(passage, forLog)}

${genre} The ORIGINAL TEXT'S MEANING is the standard: credit any accurate wording, and treat a point as distorted only if it changes what the text says.

KEY IDEAS (the reader cannot see these):
${ideas}

THE READER'S SUMMARY, between the markers:
<<<
${summary}
>>>

HOW TO JUDGE
- Judge MEANING, not wording. English, Chinese (including written Cantonese) or a mix are all acceptable; spelling and grammar do not matter.
- ideas: "covered" if the summary conveys the idea in the reader's own words: copy those exact words into learner_span. "distorted" if it states the idea wrongly: copy the words. "missing" otherwise, with learner_span "". A different but text-supported way of expressing an idea counts as covered.
- relations (ideas with a relationship only): "correct" if the summary links the two sides in the right way and direction; "missing" if it does not link them; "reversed" if wrong way round; "wrong_type" if it links them with a different kind of relationship. Copy the linking words, or "".
- unsupported_claims: each statement in the summary that the text does not support, copied exactly.
- too_much_detail: true if minor details crowd out the key ideas.
- expression_unclear: true if the meaning is hard to follow.
${type === "narrative" ? INTERP_RULE.replace("the answer", "the summary").replace("in the elements above", "in the key ideas above") + "\n" : ""}- reason: at most 50 words, for the researcher. Never write a corrected or model summary.

Return ONLY JSON matching the schema.`;
}
