/* ------------------------------------------------------------------ *
 * written.js — the written (process 4) question, v10.4.
 *
 *  1. premise check: everything the question names must exist in the text
 *     in that role (a "framework" that is really the problem → regenerate)
 *  2. mark the first answer: working · missing · one nudge · a strong answer
 *  3. she revises once (or skips)
 *  4. "Your answer, improved": HER wording kept, additions marked, each
 *     with a short reason
 * Everything is returned as plain data so the session can save it.
 * ------------------------------------------------------------------ */

import { complete, parseJSON } from "./llm.js";

export const WRITTEN_VERSION = "written-v2";

const cap = (t, n = 30000) => (String(t).length > n ? String(t).slice(0, n) + "\n[…passage truncated…]" : String(t));
const str = (v) => (v == null ? "" : String(v).trim());
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/* ---------------------------- 1. premise ---------------------------- */

export const PREMISE_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["ok", "problems"],
};

export function buildPremisePrompt({ stem, criteria, passage }) {
  return `Check ONE written-response reading question against the text. Do not rewrite it.

<text>
${cap(passage)}
</text>

QUESTION: ${stem}
CRITERIA FOR A STRONG ANSWER: ${(criteria || []).join(" | ")}

The question is FAULTY ("ok": false) if any of these is true:
- It names something (a framework, finding, claim, method, problem, contradiction, group) that the text does not contain, or gives it a different role from the one the text gives it. Example: calling something "a framework" when the text presents it as a problem.
- It claims a contradiction, tension or link that the text does not support.
- A criterion asks for something the text gives no basis for.
Otherwise "ok": true.
"problems": each problem in at most 25 words, quoting the faulty words. Empty when ok.
Return ONLY JSON: {"ok":true,"problems":[]}`;
}

export async function checkPremise({ stem, criteria, passage }) {
  const raw = await complete(buildPremisePrompt({ stem, criteria, passage }), { maxTokens: 500, schema: PREMISE_SCHEMA, mode: "schema" });
  const d = parseJSON(raw);
  return { ok: d.ok !== false && !list(d.problems).length, problems: list(d.problems) };
}

/* ----------------------------- 2. mark ------------------------------ */

export const MARK2_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["strong", "developing", "thin"] },
    strengths: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    nudge: { type: "string" },
    model: { type: "string" },
  },
  required: ["verdict", "strengths", "missing", "nudge", "model"],
};

export function buildMarkPrompt2({ passage, stem, criteria, answer }) {
  return `Mark this written answer. Be direct and specific; no flattery, no padding.

<passage>
${cap(passage)}
</passage>

QUESTION: ${stem}
CRITERIA: ${(criteria || []).join(" | ")}

LEARNER'S ANSWER:
${answer}

Return ONLY JSON with ALL five fields:
{"verdict":"strong|developing|thin","strengths":["..."],"missing":["..."],"nudge":"...","model":"..."}
- strengths and missing: 1–3 items each, at most 20 words per item, each pointing at something concrete in her answer or in the passage.
- If the question asks her to judge or evaluate and she only explains, say so in "missing".
- nudge: one question that would push her thinking further. At most 20 words.
- model: REQUIRED, never empty. A strong answer in 3–4 sentences, using the passage.`;
}

/* models sometimes rename fields; accept the common variants */
export function normaliseMark(d) {
  const v = str(d?.verdict).toLowerCase();
  return {
    verdict: ["strong", "developing", "thin"].includes(v) ? v : "developing",
    strengths: list(d?.strengths || d?.working),
    missing: list(d?.missing || d?.gaps),
    nudge: str(d?.nudge || d?.question),
    model: str(d?.model || d?.model_answer || d?.strong_answer || d?.example_answer || d?.exemplar),
  };
}

export const STRONG_SCHEMA = { type: "object", properties: { model: { type: "string" } }, required: ["model"] };

export async function markAnswer({ passage, stem, criteria, answer }) {
  const raw = await complete(buildMarkPrompt2({ passage, stem, criteria, answer }), { maxTokens: 1400, schema: MARK2_SCHEMA, mode: "schema" });
  const mark = normaliseMark(parseJSON(raw));
  if (!mark.model) mark.model = await strongAnswer({ passage, stem, criteria });
  return mark;
}

/* a strong answer on its own — used when the marking reply left it out */
export async function strongAnswer({ passage, stem, criteria }) {
  try {
    const raw = await complete(
      `Write a strong answer to this reading question in 3–4 sentences, using evidence from the passage. Take a clear position and justify it.

<passage>
${cap(passage)}
</passage>

QUESTION: ${stem}
CRITERIA: ${(criteria || []).join(" | ")}

Return ONLY JSON: {"model":"..."}`,
      { maxTokens: 700, schema: STRONG_SCHEMA, mode: "schema" }
    );
    return str(parseJSON(raw).model);
  } catch (e) {
    return "";
  }
}

/* --------------------------- 4. improved ---------------------------- */

export const IMPROVE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["strong", "developing", "thin"] },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, added: { type: "boolean" }, why: { type: "string" } },
        required: ["text", "added"],
      },
    },
  },
  required: ["verdict", "segments"],
};

export function buildImprovePrompt({ passage, stem, criteria, answer, missing }) {
  return `Improve a learner's written answer WITHOUT replacing it. Keep her own sentences and wording wherever they are correct; only fix what is wrong and add what is missing.

<passage>
${cap(passage)}
</passage>

QUESTION: ${stem}
CRITERIA: ${(criteria || []).join(" | ")}
WHAT WAS MISSING: ${(missing || []).join(" | ") || "(not given)"}

HER ANSWER:
${answer}

Return the improved answer as "segments", in reading order:
- {"text": "...", "added": false} for her own words, kept as she wrote them (you may fix small grammar slips).
- {"text": "...", "added": true, "why": "..."} for every part you add or rewrite. "why": at most 15 words, naming what it adds (e.g. "states a judgment", "uses evidence from the text").
- Add at most 3 parts. The result must still sound like her, not like a new essay.
"verdict": how strong HER answer (before your additions) is: strong, developing or thin.
Return ONLY JSON: {"verdict":"developing","segments":[{"text":"...","added":false},{"text":"...","added":true,"why":"..."}]}`;
}

/* how much of her own wording survives in the kept segments (0–1) */
export function keptShare(answer, segments) {
  const w = (t) => String(t || "").toLowerCase().match(/[a-z']{4,}/g) || [];
  const hers = w(answer);
  if (!hers.length) return 0;
  const kept = new Set(w((segments || []).filter((s) => !s.added).map((s) => s.text).join(" ")));
  return hers.filter((x) => kept.has(x)).length / hers.length;
}

export async function improveAnswer({ passage, stem, criteria, answer, missing }) {
  const raw = await complete(buildImprovePrompt({ passage, stem, criteria, answer, missing }), { maxTokens: 1600, schema: IMPROVE_SCHEMA, mode: "schema" });
  const d = parseJSON(raw);
  const segments = (Array.isArray(d.segments) ? d.segments : [])
    .map((s) => ({ text: str(s?.text), added: !!s?.added, why: str(s?.why) }))
    .filter((s) => s.text);
  const v = str(d.verdict).toLowerCase();
  return {
    verdict: ["strong", "developing", "thin"].includes(v) ? v : "developing",
    segments,
    kept_share: Math.round(keptShare(answer, segments) * 100) / 100,
  };
}
