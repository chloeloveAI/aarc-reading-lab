import React, { useState } from "react";
import { complete, parseJSON, loadConfig } from "./llm";
import { FLAW_TYPES, VERDICTS, FLAG_SCHEMA, buildFlagPrompt, saveFlag } from "./flags";

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
  brickSoft: "#F8E5E0",
};
const F = {
  read: "'Newsreader', Georgia, serif",
  ui: "'Public Sans', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};
const VERDICT_STYLE = {
  upheld: { bg: C.teal, text: "Upheld — you're right" },
  "partly upheld": { bg: "#8A6A12", text: "Partly upheld" },
  "not upheld": { bg: C.brick, text: "Not upheld" },
};
const MIN_WORDS = 8;

/* Blind rating: hide the AI's verdict until you have given yours, so your
   judgement can't be pulled towards it. On by default; remembered here. */
const BLIND_KEY = "ql:blindRating";
function loadBlind() {
  try {
    return localStorage.getItem(BLIND_KEY) !== "off";
  } catch (e) {
    return true;
  }
}
function saveBlind(on) {
  try {
    localStorage.setItem(BLIND_KEY, on ? "on" : "off");
  } catch (e) {
    /* fine — default stays on */
  }
}

function modelName() {
  const c = loadConfig();
  return c.provider + ":" + (c[c.provider]?.model || "?");
}

/* Shows after answering. The learner says what is wrong and argues it;
   the AI judges the argument against the passage. */
export default function FlagPanel({ item, answer, passage, evidence, meta, onSaved }) {
  const existing = answer?.flag || null;
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [argument, setArgument] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const words = (argument.match(/\S+/g) || []).length;
  const [notes, setNotes] = useState(existing?.human?.notes || "");
  const [blind, setBlindState] = useState(loadBlind);
  const setBlind = (on) => {
    setBlindState(on);
    saveBlind(on);
  };
  const [savedNote, setSavedNote] = useState("");

  /* your own judgement as the human rater — saved straight into the log */
  const rate = (patch) => {
    const first = !existing?.human?.verdict && patch.verdict;
    const human = {
      verdict: existing?.human?.verdict || "",
      notes,
      ...existing?.human,
      ...patch,
      ratedAt: new Date().toISOString(),
      ...(first ? { blind: !!(blind && existing?.judge), firstVerdict: patch.verdict } : {}),
    };
    const rec = { ...existing, human };
    saveFlag(rec);
    onSaved(rec);
    setSavedNote("Saved");
    setTimeout(() => setSavedNote(""), 1500);
  };
  const label = { fontFamily: F.ui, fontSize: 14, lineHeight: 1.5, color: C.ink };

  const submit = async () => {
    setBusy(true);
    setErr("");
    const base = {
      id: meta.sessionId + ":" + meta.questionId,
      flaggedAt: new Date().toISOString(),
      sessionId: meta.sessionId,
      candidateId: item.candidateId || "",
      runId: item.runId || "",
      passageId: item.passageId || "",
      title: meta.title,
      questionId: meta.questionId,
      model: modelName(),
      item: { level: item.level, stem: item.stem, options: item.options.map((o) => ({ text: o.text, correct: o.correct })), anchor: item.anchor },
      choice: answer.choice,
      learnerCorrect: !!answer.correct,
      evidence: evidence || item.anchor || "",
      types,
      argument: argument.trim(),
      judge: null,
    };
    let rec = base;
    try {
      const raw = await complete(
        buildFlagPrompt({ item, choice: answer.choice, types, argument: argument.trim(), passage, evidence }),
        { maxTokens: 700, schema: FLAG_SCHEMA }
      );
      const d = parseJSON(raw);
      const verdict = VERDICTS.find((v) => v === String(d.verdict || "").trim().toLowerCase());
      if (!verdict) throw new Error("no verdict");
      rec = {
        ...base,
        judge: {
          verdict,
          confirmed: (d.confirmed || []).map(String).filter((k) => FLAW_TYPES.some((f) => f.key === k)),
          learner_option_defensible: d.learner_option_defensible === true,
          reasoning: String(d.reasoning || ""),
          fix: String(d.fix || ""),
        },
      };
    } catch (e) {
      setErr("The AI couldn't judge it this time. Your flag is saved anyway, so it still counts in the export.");
    }
    saveFlag(rec);
    onSaved(rec);
    setBusy(false);
    setOpen(false);
  };

  if (existing) {
    const j = existing.judge;
    const v = j ? VERDICT_STYLE[j.verdict] : null;
    const hidden = blind && j && !existing.human?.verdict;
    return (
      <div className="mt-5 px-4 py-3" style={{ background: C.amberSoft, borderRadius: 2 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>⚑ YOU FLAGGED THIS QUESTION</span>
          {v && !hidden && (
            <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.card, background: v.bg, padding: "2px 8px", borderRadius: 2 }}>
              {v.text}
            </span>
          )}
        </div>
        {hidden ? (
          <p className="mt-2" style={{ ...label, color: C.slate }}>
            The AI has judged your flag. Its verdict is hidden until you give yours below, so it can't sway you.
          </p>
        ) : j ? (
          <>
            <p className="mt-2" style={label}>{j.reasoning}</p>
            {j.learner_option_defensible && !existing.learnerCorrect && (
              <p className="mt-1" style={{ ...label, color: C.teal }}>Your chosen answer can be defended from the passage.</p>
            )}
            {j.fix && <p className="mt-1" style={{ ...label, color: C.slate }}>Suggested fix: {j.fix}</p>}
          </>
        ) : (
          <p className="mt-2" style={{ ...label, color: C.slate }}>Saved, not yet judged.</p>
        )}
        {err && <p className="mt-1" style={{ ...label, color: C.brick }}>{err}</p>}

        <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>YOUR VERDICT (HUMAN RATER)</span>
            {VERDICTS.map((v) => {
              const on = existing.human?.verdict === v;
              return (
                <button
                  key={v}
                  onClick={() => rate({ verdict: v, notes })}
                  className="ql-focus px-2 py-1"
                  style={{
                    fontFamily: F.ui,
                    fontSize: 12,
                    borderRadius: 2,
                    border: `1px solid ${on ? C.ink : C.line}`,
                    background: on ? C.ink : C.card,
                    color: on ? C.card : C.ink,
                  }}
                >
                  {v}
                </button>
              );
            })}
            {existing.human?.verdict && j && (
              <span style={{ fontFamily: F.mono, fontSize: 11, color: existing.human.verdict === j.verdict ? C.teal : C.brick }}>
                {existing.human.verdict === j.verdict ? "✓ agrees with AI" : "✗ disagrees with AI"}
              </span>
            )}
          </div>
          <textarea
            className="ql-focus mt-2"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (existing.human?.notes || "") && rate({ notes })}
            placeholder="Your notes (saved when you click away)"
            style={{ width: "100%", fontFamily: F.ui, fontSize: 13, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 2, color: C.ink, background: C.card }}
          />
          <div className="flex items-center gap-3 flex-wrap">
            {savedNote && <span style={{ fontFamily: F.mono, fontSize: 11, color: C.teal }}>{savedNote}</span>}
            {existing.human?.blind && (
              <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
                rated blind · first verdict: {existing.human.firstVerdict}
              </span>
            )}
            <label className="flex items-center gap-1" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, cursor: "pointer" }}>
              <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
              Blind rating — hide the AI's verdict until I've given mine
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="ql-focus mt-4"
        style={{ display: "block", fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}
      >
        ⚑ Flag this question — I think it's flawed
      </button>
    );

  return (
    <div className="mt-5 px-4 py-4" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}>
      <p style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", color: C.slate }}>⚑ WHAT'S WRONG WITH IT? (TICK ANY)</p>
      <div className="mt-2 space-y-1">
        {FLAW_TYPES.map((f) => (
          <label key={f.key} className="flex gap-2 items-start" style={{ ...label, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={types.includes(f.key)}
              onChange={(e) => setTypes((t) => (e.target.checked ? [...t, f.key] : t.filter((k) => k !== f.key)))}
              style={{ marginTop: 5 }}
            />
            {f.label}
          </label>
        ))}
      </div>
      <p className="mt-3" style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", color: C.slate }}>YOUR ARGUMENT — POINT TO THE PASSAGE</p>
      <textarea
        className="ql-focus mt-1"
        rows={4}
        value={argument}
        onChange={(e) => setArgument(e.target.value)}
        placeholder="e.g. Option C can also be right because the passage says…"
        style={{ width: "100%", fontFamily: F.ui, fontSize: 14, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 2, color: C.ink }}
      />
      <div className="mt-2 flex items-center gap-4 flex-wrap">
        <button
          onClick={submit}
          disabled={busy || words < MIN_WORDS || types.length === 0}
          className="ql-focus px-4 py-2"
          style={{
            background: busy || words < MIN_WORDS || types.length === 0 ? C.mute : C.ink,
            color: C.card,
            borderRadius: 2,
            fontFamily: F.ui,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {busy ? "The AI is judging your argument…" : "Submit for judging"}
        </button>
        <button onClick={() => setOpen(false)} className="ql-focus" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate }}>
          Cancel
        </button>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: words < MIN_WORDS ? C.mute : C.teal }}>
          {words < MIN_WORDS ? `${MIN_WORDS - words} more word${MIN_WORDS - words === 1 ? "" : "s"} needed` : "ready"}
          {types.length === 0 ? " · tick at least one" : ""}
        </span>
      </div>
    </div>
  );
}
