import React, { useState, useEffect } from "react";
import { askAboutSelection, probeQuestions, addNote, listNotes, removeNote } from "./notes";
import { formatWhen, relativeWhen } from "./sessions";
import { coachTurn } from "./coach";

const C = {
  ink: "#16202B",
  slate: "#5A6B7B",
  mute: "#8496A4",
  line: "#D3DBE0",
  paper: "#E9EDEF",
  card: "#FFFFFF",
  teal: "#1F6F6A",
  tealSoft: "#DDEDEB",
  amber: "#F2C14E",
  amberSoft: "#FDF3DC",
  brick: "#A8402B",
};
const F = {
  read: "'Newsreader', Georgia, serif",
  ui: "'Public Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export function SelectionBar({ selection, onAsk, onNote, onClear }) {
  if (!selection) return null;
  const short = selection.length > 70 ? selection.slice(0, 70) + "…" : selection;
  return (
    <div
      className="mt-2 px-3 py-2 flex flex-wrap items-center gap-2"
      style={{ background: C.tealSoft, border: `1px solid ${C.teal}`, borderRadius: 2 }}
    >
      <span style={{ fontFamily: F.read, fontSize: 14, color: C.ink, flex: "1 1 200px" }}>“{short}”</span>
      <button
        onClick={onAsk}
        className="ql-focus px-3 py-1.5"
        style={{ background: C.ink, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 12, fontWeight: 700 }}
      >
        Ask about this
      </button>
      <button
        onClick={onNote}
        className="ql-focus px-3 py-1.5"
        style={{ border: `1px solid ${C.ink}`, color: C.ink, borderRadius: 2, fontFamily: F.ui, fontSize: 12, fontWeight: 700 }}
      >
        Save as note
      </button>
      <button onClick={onClear} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
        Clear
      </button>
    </div>
  );
}

/* item given → "question coach" (while answering); otherwise the general ask panel */
export function AskPanel({ selection, passage, prompt, intent, currentStem, onClose, item, answered, choice = null, aboutQuestion = false, learner, onUse }) {
  const coach = !!item;
  const [probes, setProbes] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const [err, setErr] = useState("");
  const [savedIdx, setSavedIdx] = useState(-1);

  useEffect(() => {
    let dead = false;
    if (coach) {
      /* no model-made "worth asking" list here: it could lead straight to the answer */
      const L = "ABCDEF";
      const key = (item?.options || []).findIndex((o) => o.correct);
      const wrong = answered && choice != null && item?.options?.[choice] && !item.options[choice].correct;
      setProbes(
        answered
          ? wrong
            ? [`Why is my answer (${L[choice]}) wrong?`, `Why is ${L[key]} right?`, aboutQuestion ? "What was the question asking?" : "What does this part mean?"]
            : [`Why is ${L[key]} right?`, "Why are the other options wrong?", aboutQuestion ? "What was the question asking?" : "What does this part mean?"]
          : aboutQuestion
          ? ["What is this question asking me?", "What kind of answer does it want?", "What does a word in the question mean?"]
          : ["What does this word or phrase mean?", "Who or what is this about?", "I don't understand this sentence."]
      );
      return;
    }
    probeQuestions({ selection, passage, prompt, intent })
      .then((p) => !dead && setProbes(p))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [selection, passage, prompt, intent]);

  const run = async (question) => {
    if (!question.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = coach
        ? await coachTurn({ selection, question, passage, item, answered, choice, aboutQuestion, learner, history: thread })
        : await askAboutSelection({ selection, question, passage, prompt, intent, currentStem });
      setThread((t) => [...t, { question, ...r }]);
      if (coach && onUse) onUse({ selection, question, reply: r.answer, kind: r.kind, leak: r.leak || "", retried: !!r.retried, answered: !!answered, about: aboutQuestion ? "question" : "text", at: new Date().toISOString() });
      setQ("");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const save = async (entry, i) => {
    await addNote({
      selection,
      question: entry.question,
      answer: entry.answer,
      source: prompt ? prompt.slice(0, 80) : "",
    });
    setSavedIdx(i);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(22,32,43,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl"
        style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: coach ? `3px solid ${C.amber}` : `1px solid ${C.line}`, borderRadius: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div>
            {coach && (
              <div className="mb-3">
                <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.brick }}>Question coach</span>
                <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, lineHeight: 1.5 }}>
                  {answered
                    ? "You've answered this question, so the coach can now explain fully."
                    : "Answers facts and word meanings. For harder questions it asks you a question back. It won't give the answer or tell you where to look. Using it counts as help on this question."}
                </p>
              </div>
            )}
            <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.mute }}>
              {aboutQuestion ? "The question" : "You selected"}
            </span>
            <p className="mt-1" style={{ fontFamily: F.read, fontSize: 17, lineHeight: 1.5, color: C.ink }}>
              “{selection}”
            </p>
          </div>
          <button onClick={onClose} className="ql-focus shrink-0" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
            Close
          </button>
        </div>

        <div className="px-6 py-5 space-y-4" style={{ maxHeight: "58vh", overflowY: "auto" }}>
          {probes.length > 0 && thread.length === 0 && (
            <div>
              <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.teal }}>
                {coach ? "You could ask" : "Worth asking"}
              </span>
              <div className="mt-2 space-y-2">
                {probes.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => run(p)}
                    disabled={busy}
                    className="ql-focus w-full text-left px-4 py-3"
                    style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2, fontFamily: F.read, fontSize: 16, color: C.ink }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((t, i) => (
            <div key={i}>
              <p style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.slate }}>{t.question}</p>
              <p
                className="mt-1 px-4 py-3"
                style={{ fontFamily: F.read, fontSize: 16, lineHeight: 1.6, color: C.ink, background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}
              >
                {t.answer}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {!t.grounded && (
                  <span style={{ fontFamily: F.ui, fontSize: 11, color: C.brick }}>
                    Partly outside the passage — treat with care.
                  </span>
                )}
                <button
                  onClick={() => save(t, i)}
                  className="ql-focus"
                  style={{ fontFamily: F.ui, fontSize: 12, color: savedIdx === i ? C.teal : C.slate, textDecoration: "underline" }}
                >
                  {savedIdx === i ? "Saved to notes" : "Save as note"}
                </button>
              </div>
              {t.followups?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.followups.map((f, j) => (
                    <button
                      key={j}
                      onClick={() => run(f)}
                      disabled={busy}
                      className="ql-focus px-3 py-1.5"
                      style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 2, fontFamily: F.ui, fontSize: 12, color: C.ink }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && <p style={{ fontFamily: F.ui, fontSize: 13, color: C.slate }}>Thinking about it…</p>}
          {err && <p style={{ fontFamily: F.ui, fontSize: 13, color: C.brick }}>{err}</p>}
        </div>

        <div className="px-6 py-4" style={{ borderTop: `1px solid ${C.line}` }}>
          <textarea
            className="ql-focus"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Or ask your own question about this part."
            style={{
              width: "100%",
              minHeight: 64,
              fontFamily: F.ui,
              fontSize: 14,
              lineHeight: 1.5,
              color: C.ink,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 2,
              padding: "10px 12px",
              resize: "vertical",
            }}
          />
          <button
            onClick={() => run(q)}
            disabled={busy || !q.trim()}
            className="ql-focus mt-3 px-5 py-2.5"
            style={{ background: busy ? C.slate : C.ink, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}
          >
            Ask
          </button>
          {currentStem && (
            <span className="ml-3" style={{ fontFamily: F.ui, fontSize: 11, color: C.mute }}>
              {coach && !answered ? "Counts as help on this question." : coach ? "You've answered, so it can explain fully." : "It won't answer the question you're on."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotesDrawer({ onClose }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    listNotes().then((n) =>
      setItems([...n].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))))
    );
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(22,32,43,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl"
        style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 flex items-baseline justify-between" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h2 style={{ fontFamily: F.read, fontSize: 24, fontWeight: 600, color: C.ink }}>My notes</h2>
          <button onClick={onClose} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
            Close
          </button>
        </div>
        <div className="px-6 py-5 space-y-4" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {items.length === 0 && (
            <p style={{ fontFamily: F.ui, fontSize: 14, color: C.slate }}>
              Select a sentence in the passage, ask about it, then save the answer here.
            </p>
          )}
          {items.map((n) => (
            <div key={n.id} className="px-4 py-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}>
              <p style={{ fontFamily: F.read, fontSize: 14, color: C.slate, borderLeft: `3px solid ${C.amber}`, paddingLeft: 8 }}>
                “{n.selection}”
              </p>
              {n.question && (
                <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink }}>{n.question}</p>
              )}
              {n.answer && (
                <p className="mt-1" style={{ fontFamily: F.read, fontSize: 15, lineHeight: 1.55, color: C.ink }}>{n.answer}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <span style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
                  {formatWhen(n.savedAt)} · {relativeWhen(n.savedAt)}
                </span>
                <button
                  onClick={() => removeNote(n.id).then(setItems)}
                  className="ql-focus"
                  style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
