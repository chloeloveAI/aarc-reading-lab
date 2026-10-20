/* ------------------------------------------------------------------ *
 * tutor.js — focus-reading tutor.
 *
 * The reader has only read up to the part she highlighted. So the tutor
 * sees ONLY the highlighted part and the text before it — never the rest
 * of the passage — and explains in a short dialogue. It must not predict
 * or reveal what comes later.
 * ------------------------------------------------------------------ */

import { complete, parseJSON } from "./llm.js";

export const TUTOR_VERSION = "tutor-v1";

export const TUTOR_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    check: { type: "string" },
    followups: { type: "array", items: { type: "string" } },
  },
  required: ["reply", "followups"],
};

/* The text a reader has reached: every line before the highlight's last
   line, plus that line up to the end of the highlight. */
export function textUpTo(lines, endLine, highlightText) {
  const before = lines.slice(0, endLine).join("\n");
  const last = String(lines[endLine] || "");
  const tail = String(highlightText || "").trim().split(/\s+/).slice(-6).join(" ");
  let cut = last.length;
  if (tail) {
    const i = last.toLowerCase().indexOf(tail.toLowerCase());
    if (i > -1) cut = i + tail.length;
  }
  return (before ? before + "\n" : "") + last.slice(0, cut);
}

const cap = (s, n) => {
  s = String(s || "");
  /* keep the END of the prior text: the part nearest the highlight matters most */
  return s.length > n ? "[…earlier text omitted…]\n" + s.slice(-n) : s;
};

export function buildTutorPrompt({ highlight, prior, history = [], question = "", learner = "" }) {
  const turns = history
    .map((t) => (t.role === "reader" ? "READER: " : "TUTOR: ") + t.text)
    .join("\n");
  return `You are a patient reading tutor in a one-to-one dialogue. A reader is reading a text for the first time and has stopped at a part she wants explained.
${learner ? `\nREADER: ${learner}.\n` : ""}
THE TEXT SHE HAS READ SO FAR (it ends where she stopped — she has NOT read anything after this):
<read_so_far>
${cap(prior, 14000)}
</read_so_far>

THE PART SHE HIGHLIGHTED:
"${highlight}"
${turns ? `\nTHE DIALOGUE SO FAR:\n${turns}\n` : ""}
${question ? `HER NEW MESSAGE: ${question}` : "This is your first turn: explain what the highlighted part means."}

Rules:
- Explain the MEANING of the highlighted part in plain words: what it says, what any hard words or phrases mean here, and how it connects to what came BEFORE it in the text.
- Use only the text she has read so far. Never mention, guess or hint at what comes later in the text. If she asks about something later, say she will find out as she reads on.
- Talk to her as "you". Short sentences. At most 110 words in "reply", and always finish your last sentence.
- Do not lecture: explain one idea at a time, then stop.
- "check": one short question (at most 15 words) she can answer to check she understood. Leave it empty if she only asked a quick factual question.
- "followups": 2 or 3 short things she might ask next (at most 9 words each), e.g. "Can you say that more simply?".

Return ONLY JSON:
{"reply":"...","check":"...","followups":["...","..."]}`;
}

export async function tutorTurn({ highlight, prior, history, question, learner }) {
  const prompt = buildTutorPrompt({ highlight, prior, history, question, learner });
  const raw = await complete(prompt, { maxTokens: 800, schema: TUTOR_SCHEMA, mode: "schema" });
  const d = parseJSON(raw);
  return {
    reply: String(d.reply || "").trim(),
    check: String(d.check || "").trim(),
    followups: (Array.isArray(d.followups) ? d.followups : []).map(String).filter(Boolean).slice(0, 3),
    prompt_chars: prompt.length,
  };
}
