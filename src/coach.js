/* ------------------------------------------------------------------ *
 * coach.js — the question coach (help while answering a question).
 *
 * Different from the reading tutor on purpose:
 *   reading tutor  → explains meaning, before any questions exist
 *   question coach → while she is being assessed: answers plain facts and
 *                    word meanings, but does NOT interpret and does NOT
 *                    say where to look; it asks one question back instead.
 * After she has answered, the coach may explain fully.
 *
 * The code checks every reply before it is shown: if it repeats the
 * correct option or points at a place in the text, it is rewritten once,
 * then replaced by a neutral nudge. Using the coach counts as help.
 * ------------------------------------------------------------------ */

import { complete, parseJSON } from "./llm.js";

export const COACH_VERSION = "coach-v2";

export const COACH_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string" },
    reply: { type: "string" },
    followups: { type: "array", items: { type: "string" } },
  },
  required: ["kind", "reply", "followups"],
};

const STOP = new Set(
  "the a an of to in on for and or but is are was were be by with as at from that this these those it its into than then so if not no can may must will would should could have has had do does they their them there what which who why how about more most some".split(
    " "
  )
);
const words = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/* phrases that send the reader to a place in the text */
const LOCATION = /\b(section|paragraph|para|line)\s*\d+\b|\b(first|second|third|fourth|fifth|last|final|next|previous|following|earlier|later|opening|closing|concluding)\s+(section|paragraph|part|sentence|line)s?\b|\b(re-?read|look at|go back to|scroll)\s+(the\s+)?(section|paragraph|part|sentence|line)\b|\bstarts? with\b|\bbegins? with\b/i;

/**
 * coachLeak(reply, item) → "" when safe, otherwise the reason.
 * Pure function, tested in tests/focusCoverage.test.mjs.
 */
export function coachLeak(reply, item) {
  const r = String(reply || "");
  if (LOCATION.test(r)) return "points to a place in the text";
  const key = (item?.options || []).find((o) => o.correct)?.text || "";
  const kw = words(key);
  if (kw.length >= 3) {
    const rw = new Set(words(r));
    const share = kw.filter((w) => rw.has(w)).length / kw.length;
    if (share >= 0.6) return "repeats the correct option";
  }
  return "";
}

function buildCoachPrompt({ selection, question, passage, item, answered, choice = null, aboutQuestion = false, learner, history = [], strict = false }) {
  const opts = (item?.options || []).map((o, i) => `${"ABCD"[i]}. ${o.text}${o.correct ? "   <-- correct" : ""}`).join("\n");
  const turns = history.map((t) => `READER: ${t.question}\nCOACH: ${t.answer}`).join("\n");
  const before = `You are a reading coach. A reader is answering a multiple-choice question about a text and has asked you about a part of it.
${learner ? `\nREADER: ${learner}.\n` : ""}
THE TEXT:
<text>
${String(passage).slice(0, 30000)}
</text>

THE QUESTION SHE IS WORKING ON:
${item?.stem || "(none)"}
${opts}

${aboutQuestion ? "SHE IS ASKING ABOUT THE QUESTION ITSELF (its wording), not about a part of the text." : `THE PART SHE SELECTED: "${selection}"`}
${turns ? `\nEARLIER IN THIS CHAT:\n${turns}\n` : ""}
HER MESSAGE: ${question}
`;
  if (answered)
    return (
      before +
      `
She has ALREADY answered this question, so you may now explain fully.
${chosenLine(item, choice)}
- If she chose a WRONG option: first explain why HER option (name its letter) does not fit what the text says, then why the correct option does. Never tell her she chose the correct answer.
- If she chose the correct option: confirm it and explain why, and why the most tempting wrong option fails.
- Use the text as evidence; you may quote a few words of it.
Rules: at most 130 words in "reply", plain language, talk to her as "you". "kind": "explain". "followups": 2 short questions (at most 9 words) she might ask next.
Return ONLY JSON: {"kind":"explain","reply":"...","followups":["...","..."]}`
    );
  return (
    before +
    `
She has NOT answered yet. Your job is to keep the thinking with her.
- If she asks something FACTUAL or about a WORD (who someone is, what a word or phrase means, what a number refers to), answer it directly and briefly, and correct any misreading. A word may come from the question or an option: explain its meaning, but never say whether that option is right. "kind": "fact".
- If she asks WHAT THE QUESTION IS ASKING: say it again in simpler words and name the kind of answer it wants (a reason, a cause, a purpose, a feeling, a judgment…). Do not hint at the answer or at where it is. "kind": "clarify".
- If she asks for an INTERPRETATION (why, what it shows, what it suggests, how parts connect, which option is right), do NOT interpret and do NOT explain the idea. Instead ask her ONE short question that helps her think it through herself. "kind": "guide".
- Never say, hint at or rule out any option. Never use the words of the correct option.
- Never say where to look: no section or paragraph numbers, no "the next paragraph", no "the sentence that starts with". She must find and read the text herself.
- At most 60 words in "reply". Talk to her as "you". Always finish your sentence.
- "followups": 2 short things she might ask next (at most 9 words), such as "What does this word mean?" — never "Which option is right?".${
      strict ? "\nIMPORTANT: your previous reply gave away too much. Be shorter and only ask her a question back." : ""
    }
Return ONLY JSON: {"kind":"fact","reply":"...","followups":["...","..."]}`
  );
}

const LET = "ABCDEF";
function chosenLine(item, choice) {
  const opts = item?.options || [];
  if (choice == null || !opts[choice]) return "(Her choice is not known.)";
  const key = opts.findIndex((o) => o.correct);
  return opts[choice].correct
    ? `SHE CHOSE ${LET[choice]} — the CORRECT option.`
    : `SHE CHOSE ${LET[choice]} ("${opts[choice].text}") — WRONG. The correct option is ${LET[key]}.`;
}

const NUDGE =
  "I can't help with that part without giving the answer away. Read the text around your selection again and ask yourself: what is the writer doing here, and how does it connect to the question?";

export { buildCoachPrompt };

export async function coachTurn({ selection, question, passage, item, answered, choice, aboutQuestion, learner, history }) {
  const ask = async (strict) => {
    const raw = await complete(buildCoachPrompt({ selection, question, passage, item, answered, choice, aboutQuestion, learner, history, strict }), {
      maxTokens: 600,
      schema: COACH_SCHEMA,
      mode: "schema",
    });
    const d = parseJSON(raw);
    return {
      kind: String(d.kind || "").trim(),
      answer: String(d.reply || "").trim(),
      followups: (Array.isArray(d.followups) ? d.followups : []).map(String).filter(Boolean).slice(0, 3),
    };
  };
  let r = await ask(false);
  if (answered) return { ...r, leak: "", retried: false, grounded: true };
  let leak = coachLeak(r.answer, item);
  let retried = false;
  if (leak) {
    retried = true;
    r = await ask(true);
    leak = coachLeak(r.answer, item);
    if (leak) r = { kind: "nudge", answer: NUDGE, followups: [] };
  }
  return { ...r, leak, retried, grounded: true };
}
