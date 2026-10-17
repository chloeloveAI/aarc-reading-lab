/* ------------------------------------------------------------------ *
 * vocab.js — where saved words live, and how a word gets explained.
 *
 * Storage picks itself: if vocab_server.py is running, words go to
 * vocabulary.json on disk. If not, they go to this browser instead, and
 * nothing breaks — you just can't open the file in a text editor.
 * ------------------------------------------------------------------ */

import { complete, parseJSON } from "./llm";

const LOCAL_KEY = "ql:vocab";
let backend = null; // "server" | "local"

async function detect() {
  if (backend) return backend;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("/api/vocab", { signal: ctl.signal });
    clearTimeout(t);
    backend = r.ok ? "server" : "local";
  } catch (e) {
    backend = "local";
  }
  return backend;
}

export async function whereStored() {
  return (await detect()) === "server" ? "vocabulary.json on disk" : "this browser only";
}

export async function listVocab() {
  if ((await detect()) === "server") {
    try {
      const r = await fetch("/api/vocab");
      const d = await r.json();
      return d.items || [];
    } catch (e) {
      /* fall through to local */
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
      const r = await fetch("/api/vocab", {
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

export async function addVocab(entry) {
  const items = await listVocab();
  const key = (entry.word || "").trim().toLowerCase();
  const existing = items.findIndex((i) => (i.word || "").trim().toLowerCase() === key);
  const record = { ...entry, savedAt: new Date().toISOString() };
  if (existing > -1) items[existing] = { ...items[existing], ...record };
  else items.unshift(record);
  await persist(items);
  return items;
}

export async function removeVocab(word) {
  const items = (await listVocab()).filter(
    (i) => (i.word || "").trim().toLowerCase() !== (word || "").trim().toLowerCase()
  );
  await persist(items);
  return items;
}

/* Anki takes a plain CSV: front, back, extra. */
export function toCSV(items) {
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const rows = [["word", "chinese", "part_of_speech", "meaning_en", "meaning_zh", "example", "source", "saved"]];
  items.forEach((i) =>
    rows.push([i.word, i.zh, i.pos, i.meaning_en, i.meaning_zh, i.example, i.context, i.savedAt].map(esc))
  );
  return "\uFEFF" + rows.map((r) => r.join(",")).join("\n"); // BOM so Excel reads the Chinese
}

export function downloadCSV(items) {
  const blob = new Blob([toCSV(items)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vocabulary.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------- lookup ------------------------------ */

export const VOCAB_SCHEMA = {
  type: "object",
  properties: {
    word: { type: "string" },
    zh: { type: "string" },
    pos: { type: "string" },
    meaning_en: { type: "string" },
    meaning_zh: { type: "string" },
    example: { type: "string" },
    note: { type: "string" },
  },
  required: ["word", "zh", "pos", "meaning_en", "meaning_zh", "example"],
};

export async function lookupWord(word, sentence) {
  const prompt = `Explain one English word for a Hong Kong learner reading an article.

WORD: ${word}

THE SENTENCE IT APPEARS IN:
${sentence}

Rules:
- Explain the word AS USED IN THAT SENTENCE. Many words have several senses; pick the one that fits this context and ignore the others.
- All Chinese must be Traditional Chinese (繁體中文) as written in Hong Kong. Never Simplified.
- "zh": the Chinese equivalent, 2–6 characters.
- "pos": part of speech in English (noun, verb, adjective…).
- "meaning_en": a plain-English definition, at most 20 words, not reusing the word itself.
- "meaning_zh": 繁體中文解釋, at most 25 characters.
- "example": one new sentence using the word in the same sense, at most 16 words. Not copied from the passage.
- "note": optional, at most 15 words — a collocation, a common confusion, or a register warning. Omit if there is nothing useful.

Return ONLY JSON.`;
  const raw = await complete(prompt, { maxTokens: 500, schema: VOCAB_SCHEMA, mode: "schema" });
  const d = parseJSON(raw);
  return {
    word: String(d.word || word).trim(),
    zh: String(d.zh || "").trim(),
    pos: String(d.pos || "").trim(),
    meaning_en: String(d.meaning_en || "").trim(),
    meaning_zh: String(d.meaning_zh || "").trim(),
    example: String(d.example || "").trim(),
    note: String(d.note || "").trim(),
    context: String(sentence || "").slice(0, 300),
  };
}
