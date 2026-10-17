import React, { useState, useEffect } from "react";
import { complete, parseJSON } from "./llm";

/* ------------------------------------------------------------------ *
 * Scaffold for the written question.
 *
 * The question is broken into parts, one per criterion. Each part has the
 * same coarse-to-fine help as the MCQs — section → paragraph → the
 * sentences → a key word → a smaller question → a sentence starter — and
 * a notes box. The learner's own notes then become her draft. The AI
 * never writes the answer for her.
 * ------------------------------------------------------------------ */

const C = {
  ink: "#16202B",
  slate: "#5A6B7B",
  mute: "#8496A4",
  line: "#D3DBE0",
  card: "#FFFFFF",
  teal: "#1F6F6A",
  tealSoft: "#DDEDEB",
  amberSoft: "#FDF3DC",
  brick: "#A8402B",
};
const F = {
  ui: "'Public Sans', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const SCAFFOLD_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterion: { type: "string" },
          subq: { type: "string" },
          anchor: { type: "string" },
          keyword: { type: "string" },
          keyword_hint: { type: "string" },
          starter: { type: "string" },
        },
        required: ["criterion", "subq", "anchor", "keyword", "keyword_hint", "starter"],
      },
    },
  },
  required: ["parts"],
};

function buildScaffoldPrompt(stem, criteria, passage) {
  const cap = 30000;
  const p = passage.length > cap ? passage.slice(0, cap) + "\n[…truncated…]" : passage;
  return `A reader must write an answer to the question below. It is hard for her, so break it into small parts she can think through one at a time. You are building scaffolding, NOT writing her answer.

<passage>
${p}
</passage>

QUESTION: ${stem}
WHAT A STRONG ANSWER CONTAINS:
${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Return one part per criterion, in the same order. For each part:
- "criterion": the criterion, copied.
- "subq": one smaller, simpler question (at most 20 words) that helps her think about this criterion. It must be answerable from the passage.
- "anchor": 6 to 14 words copied EXACTLY from the passage — the span that holds the most useful evidence for this part. Character for character, no ellipses.
- "keyword": 1 to 4 words copied from the anchor — the word or phrase she must understand for this part.
- "keyword_hint": what the keyword means in this passage, at most 20 words.
- "starter": the opening words of one sentence (at most 12 words) that she will finish in her own words. It must NOT contain the answer or the judgement — only a frame, e.g. "One limit the passage gives is…".

Return ONLY JSON:
{"parts":[{"criterion":"...","subq":"...","anchor":"...","keyword":"...","keyword_hint":"...","starter":"..."}]}`;
}

/* steps follow the MCQ ladder: location first, the answer-shaped help last */
function partSteps(part, where) {
  const steps = [];
  if (where?.section) steps.push("section");
  if (where?.para && (where.section?.paras || 0) > 1) steps.push("paragraph");
  if (where) steps.push("sentence");
  if (part.keyword) steps.push("keyword");
  if (part.subq) steps.push("subq");
  if (part.starter) steps.push("starter");
  return steps;
}

function Part({ n, total, part, where, level, onLevel, notes, onNotes, active, onActivate, sectionLabel }) {
  const steps = partSteps(part, where);
  const shown = steps.slice(0, level);
  const row = { fontFamily: F.ui, fontSize: 14, lineHeight: 1.5, color: C.ink };
  const tag = (i) => (
    <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.08em", color: C.slate, marginRight: 8 }}>
      HINT {i + 1}
    </span>
  );
  const render = (k, i) => {
    if (k === "section") return <p style={row}>{tag(i)}Look in <strong>{sectionLabel(where.section)}</strong>.</p>;
    if (k === "paragraph") return <p style={row}>{tag(i)}Focus on <strong>paragraph {where.para}</strong> of Section {where.section?.n}.</p>;
    if (k === "sentence") return <p style={row}>{tag(i)}The sentence that matters is now marked in the passage.</p>;
    if (k === "keyword")
      return (
        <p style={row}>
          {tag(i)}Key word: <strong>“{part.keyword}”</strong> — {part.keyword_hint}
        </p>
      );
    if (k === "subq") return <p style={row}>{tag(i)}Think about: <em>{part.subq}</em></p>;
    if (k === "starter")
      return (
        <div style={row}>
          <p>{tag(i)}You could start: <strong>“{part.starter}”</strong></p>
          <button
            onClick={() => onNotes((notes ? notes.trimEnd() + " " : "") + part.starter.replace(/[.…]+$/, "") + " ")}
            className="ql-focus mt-1"
            style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
          >
            Put this starter in my notes
          </button>
        </div>
      );
    return null;
  };

  return (
    <div
      onClick={onActivate}
      className="px-4 py-3"
      style={{ background: C.card, border: `1px solid ${active ? C.teal : C.line}`, borderRadius: 2 }}
    >
      <p style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.1em", color: active ? C.teal : C.mute }}>
        PART {n} OF {total}
      </p>
      <p className="mt-1" style={{ ...row, fontWeight: 700 }}>{part.criterion}</p>
      {shown.length > 0 && (
        <div className="mt-2 px-3 py-2 space-y-2" style={{ background: C.amberSoft, borderRadius: 2 }}>
          {shown.map((k, i) => (
            <div key={k}>{render(k, i)}</div>
          ))}
        </div>
      )}
      {level < steps.length && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onActivate();
            onLevel(level + 1);
          }}
          className="ql-focus mt-2"
          style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
        >
          {level === 0 ? "Help me with this part" : "Next hint"} ({level + 1} of {steps.length})
        </button>
      )}
      <textarea
        className="ql-focus mt-2"
        rows={2}
        value={notes}
        onFocus={onActivate}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Your notes for this part — a few words is fine"
        style={{ width: "100%", fontFamily: F.ui, fontSize: 14, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 2, color: C.ink }}
      />
    </div>
  );
}

/* scaffold: the stored parts (or null); onScaffold saves them with the session.
   onFocus(where, focus) drives the passage highlight. */
export default function WritingScaffold({ q, passage, structure, locate, sectionLabel, scaffold, onScaffold, onFocus, onUseNotes }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [active, setActive] = useState(0);
  const [levels, setLevels] = useState(scaffold?.levels || {});
  const [notes, setNotes] = useState(scaffold?.notes || {});

  const parts = scaffold?.parts || null;
  const wheres = (parts || []).map((p) => locate(structure, p.anchor));

  /* the passage shows only what the active part's hints have reached */
  useEffect(() => {
    if (!parts) return onFocus(null, "none");
    const k = partSteps(parts[active], wheres[active]).slice(0, levels[active] || 0);
    const focus = k.includes("sentence") ? "sentence" : k.includes("paragraph") ? "paragraph" : k.includes("section") ? "section" : "none";
    onFocus(wheres[active], focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, levels, parts]);

  const persist = (patch) => onScaffold({ ...scaffold, levels, notes, ...patch });

  const build = async () => {
    setBusy(true);
    setErr("");
    try {
      const raw = await complete(buildScaffoldPrompt(q.stem, q.criteria || [], passage), { maxTokens: 1600, schema: SCAFFOLD_SCHEMA });
      const d = parseJSON(raw);
      const list = (d.parts || []).filter((p) => p && p.criterion).map((p) => ({
        criterion: String(p.criterion),
        subq: String(p.subq || ""),
        anchor: String(p.anchor || ""),
        keyword: String(p.keyword || ""),
        keyword_hint: String(p.keyword_hint || ""),
        starter: String(p.starter || ""),
      }));
      if (!list.length) throw new Error("no parts");
      onScaffold({ parts: list, levels: {}, notes: {} });
    } catch (e) {
      setErr("Couldn't break the question down this time. Try again.");
    }
    setBusy(false);
  };

  if (!parts)
    return (
      <div className="mt-4">
        <button
          onClick={build}
          disabled={busy}
          className="ql-focus px-4 py-2"
          style={{ border: `1px solid ${C.ink}`, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink, background: C.card }}
        >
          {busy ? "Breaking the question into parts…" : "Break this question into parts for me"}
        </button>
        {err && <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.brick }}>{err}</p>}
      </div>
    );

  const filled = parts.filter((_, i) => (notes[i] || "").trim()).length;
  return (
    <div className="mt-4 space-y-3">
      {parts.map((p, i) => (
        <Part
          key={i}
          n={i + 1}
          total={parts.length}
          part={p}
          where={wheres[i]}
          level={levels[i] || 0}
          onLevel={(lv) => {
            const next = { ...levels, [i]: lv };
            setLevels(next);
            persist({ levels: next });
          }}
          notes={notes[i] || ""}
          onNotes={(t) => {
            const next = { ...notes, [i]: t };
            setNotes(next);
            persist({ notes: next });
          }}
          active={active === i}
          onActivate={() => setActive(i)}
          sectionLabel={sectionLabel}
        />
      ))}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() =>
            onUseNotes(
              parts
                .map((_, i) => (notes[i] || "").trim())
                .filter(Boolean)
                /* each part becomes its own sentence, ready to tidy */
                .map((t) => (/[.!?…]$/.test(t) ? t : t + "."))
                .join("\n")
            )
          }
          disabled={!filled}
          className="ql-focus px-4 py-2"
          style={{ background: filled ? C.teal : C.mute, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}
        >
          Put my notes into my answer
        </button>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
          {filled} of {parts.length} parts have notes · then tidy it into full sentences below
        </span>
      </div>
    </div>
  );
}
