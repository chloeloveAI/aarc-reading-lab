/* ------------------------------------------------------------------ *
 * notes.js — reading notes, and asking the model about a selection.
 *
 * The asking model is deliberately constrained: it explains, it does not
 * resolve the multiple-choice item you are currently on. Otherwise the
 * fastest route through the ladder becomes "ask", not "read".
 * ------------------------------------------------------------------ */

import { complete, parseJSON, ASK_SCHEMA, PROBE_SCHEMA, INTENT_SCHEMA } from "./llm";

const LOCAL_KEY = "ql:notes";
let backend = null;

async function detect() {
  if (backend) return backend;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("/api/notes", { signal: ctl.signal });
    clearTimeout(t);
    backend = r.ok ? "server" : "local";
  } catch (e) {
    backend = "local";
  }
  return backend;
}

export async function listNotes() {
  if ((await detect()) === "server") {
    try {
      const r = await fetch("/api/notes");
      const d = await r.json();
      return d.items || [];
    } catch (e) {
      /* fall through */
    }
  }
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

async function persist(items) {
  if ((await detect()) === "server") {
    try {
      const r = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (r.ok) return true;
    } catch (e) {
      backend = "local"; /* server went away mid-session — keep going locally */
    }
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    return false;
  }
}

export async function addNote(note) {
  const items = await listNotes();
  /* saving the same answer twice shouldn't produce two cards */
  const dupe = items.some(
    (n) => n.selection === note.selection && n.question === note.question && n.answer === note.answer
  );
  if (dupe) return items;
  items.unshift({ ...note, id: String(Date.now()), savedAt: new Date().toISOString() });
  await persist(items);
  return items;
}

export async function removeNote(id) {
  const items = (await listNotes()).filter((n) => n.id !== id);
  await persist(items);
  return items;
}

/* ------------------------- reading the prompt ---------------------- */

/* Runs once per passage, before any item is written. Everything the
   ladder asks afterwards is aimed at this. */
export async function analyseIntent(prompt, passage) {
  const p = `A learner asked an AI a question and got a long answer. Before writing comprehension questions, work out what she was actually trying to accomplish, so the questions test what matters to her rather than trivia.

HER QUESTION:
${prompt || "(not supplied)"}

THE ANSWER SHE RECEIVED (first part):
${String(passage).slice(0, 6000)}

Return ONLY JSON:
{"goal":"...","decisions":["..."],"must_grasp":["..."],"easy_to_miss":["..."]}

- "goal": what she is trying to do, in at most 25 words. Not a summary of the answer — her purpose.
- "decisions": 2–4 choices she has to make that this answer bears on. At most 12 words each.
- "must_grasp": 3–5 ideas she cannot act correctly without. At most 12 words each.
- "easy_to_miss": 2–3 details in the answer a fast reader would skip that would cost her later. At most 14 words each.`;
  const raw = await complete(p, { maxTokens: 700, schema: INTENT_SCHEMA, mode: "schema" });
  const d = parseJSON(raw);
  return {
    goal: String(d.goal || "").trim(),
    decisions: (d.decisions || []).map(String).slice(0, 4),
    must_grasp: (d.must_grasp || []).map(String).slice(0, 5),
    easy_to_miss: (d.easy_to_miss || []).map(String).slice(0, 3),
  };
}

/* --------------------------- ask & probe --------------------------- */

export async function askAboutSelection({ selection, question, passage, prompt, intent, currentStem }) {
  const p = `Answer a learner's question about one part of a long answer she is reading.

WHAT SHE IS TRYING TO DO: ${intent?.goal || "(unknown)"}
HER ORIGINAL QUESTION TO THE AI: ${prompt || "(not supplied)"}

THE FULL ANSWER SHE IS READING:
${String(passage).slice(0, 30000)}

THE PART SHE SELECTED:
"${selection}"

HER QUESTION ABOUT IT:
${question}

Rules:
- Answer from the passage first. If the passage does not cover it, you may add what you know, but say which part is outside the passage and set "grounded" to false.
- Connect the answer back to what she is trying to do. A definition alone is not useful to her.
- At most 120 words, and always finish your last sentence. Plain language. No preamble, no restating her question.
${currentStem ? `- She is currently working on this comprehension question: "${currentStem}". Do NOT tell her the answer to it or say which option is correct. Explain the concept; let her decide.` : ""}
- "followups": 2 short questions she should ask next, each at most 12 words, that would deepen her grasp of her own goal.

Return ONLY JSON:
{"answer":"...","grounded":true,"followups":["...","..."]}`;
  const raw = await complete(p, { maxTokens: 900, schema: ASK_SCHEMA, mode: "schema" });
  const d = parseJSON(raw);
  return {
    answer: String(d.answer || "").trim(),
    grounded: d.grounded !== false,
    followups: (d.followups || []).map(String).slice(0, 3),
  };
}

/* The model proposes the questions she might not think to ask. */
export async function probeQuestions({ selection, passage, prompt, intent }) {
  const p = `A learner is reading a long AI answer and has selected one part of it.

WHAT SHE IS TRYING TO DO: ${intent?.goal || "(unknown)"}
HER ORIGINAL QUESTION: ${prompt || "(not supplied)"}
THE PART SHE SELECTED: "${selection}"

SURROUNDING CONTEXT:
${String(passage).slice(0, 12000)}

Write 3 questions SHE should be asking about this selection — the ones a careful reader with her goal would ask and a hurried one would not. Aim at consequences, limits and trade-offs, not definitions. Each at most 14 words, each answerable from the passage or from reasoning about it.

Return ONLY JSON: {"questions":["...","...","..."]}`;
  const raw = await complete(p, { maxTokens: 400, schema: PROBE_SCHEMA, mode: "schema" });
  return (parseJSON(raw).questions || []).map(String).slice(0, 3);
}
