/* ------------------------------------------------------------------ *
 * FocusReading.jsx — the reader reads the passage alone, before any
 * questions exist.
 *
 *  - a count-up timer (active time pauses while the tab is hidden)
 *  - tap a word → its meaning; "Add to my vocabulary" marks it as new
 *  - select a sentence, several sentences or a paragraph → Highlight, or
 *    Explain it (tutor), which only uses the text read so far
 *  - progress: how far into the text her highlights reach
 *
 * Everything she does is returned by onFinish() for the research log and
 * for the coverage plan of the questions.
 * ------------------------------------------------------------------ */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { WordCard } from "./Glossary";
import { tutorTurn, textUpTo, TUTOR_VERSION } from "./tutor";
import { quarterMap, normLine } from "./coverage";
import SelfRating, { RATING_VERSION } from "./SelfRating";

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

const wc = (s) => (String(s).match(/\S+/g) || []).length;
const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function loadDraft(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "null");
    return d && typeof d === "object" ? d : null;
  } catch (e) {
    return null;
  }
}
function saveDraft(key, d) {
  try {
    localStorage.setItem(key, JSON.stringify(d));
  } catch (e) {
    /* storage full or blocked: the session still works, it just won't survive a reload */
  }
}

/* one line of text, with highlights marked and words tappable */
function LineText({ text, marks, onWord }) {
  /* marks: [{from, to, id, explained}] as character ranges in this line */
  const segs = [];
  let pos = 0;
  [...marks]
    .sort((a, b) => a.from - b.from)
    .forEach((m) => {
      if (m.from > pos) segs.push({ t: text.slice(pos, m.from) });
      if (m.to > Math.max(pos, m.from)) segs.push({ t: text.slice(Math.max(pos, m.from), m.to), m });
      pos = Math.max(pos, m.to);
    });
  if (pos < text.length) segs.push({ t: text.slice(pos) });

  const words = (t, k) =>
    String(t)
      .split(/([A-Za-z][A-Za-z'’-]*)/g)
      .map((p, i) =>
        /^[A-Za-z]/.test(p) && p.length > 2 ? (
          <span
            key={k + "-" + i}
            onClick={(e) => {
              /* a drag-selection ends with a click; leave that to the selection bar */
              const sel = String(window.getSelection?.() || "").trim();
              if (sel && sel.split(/\s+/).length > 1) return;
              e.stopPropagation();
              onWord(p, text);
            }}
            style={{ cursor: "pointer" }}
          >
            {p}
          </span>
        ) : (
          <React.Fragment key={k + "-" + i}>{p}</React.Fragment>
        )
      );

  return (
    <>
      {segs.map((s, i) =>
        s.m ? (
          <mark
            key={i}
            style={{
              background: s.m.explained ? C.tealSoft : C.amberSoft,
              borderBottom: `2px solid ${s.m.explained ? C.teal : C.amber}`,
              color: "inherit",
              padding: "1px 0",
            }}
          >
            {words(s.t, i)}
          </mark>
        ) : (
          <React.Fragment key={i}>{words(s.t, i)}</React.Fragment>
        )
      )}
    </>
  );
}

function TutorSheet({ hl, thread, busy, err, onSend, onRetry, onClose }) {
  const [q, setQ] = useState("");
  const box = useRef(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [thread.length, busy]);
  const last = [...thread].reverse().find((t) => t.role === "tutor");
  const send = (text) => {
    const t = String(text || "").trim();
    if (!t || busy) return;
    setQ("");
    onSend(t);
  };
  return (
    <div
      role="dialog"
      aria-label="Tutor"
      className="fixed z-40 flex flex-col"
      style={{
        right: 0,
        bottom: 0,
        left: 0,
        maxHeight: "78vh",
        background: C.card,
        borderTop: `2px solid ${C.teal}`,
        boxShadow: "0 -8px 30px rgba(22,32,43,0.18)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="max-w-2xl w-full mx-auto flex flex-col" style={{ minHeight: 0, flex: 1 }}>
        <div className="px-4 pt-3 pb-2 flex items-start gap-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.teal }}>
              Tutor · explains only what you've read so far
            </div>
            <p className="mt-1" style={{ fontFamily: F.read, fontSize: 14, color: C.slate, lineHeight: 1.4 }}>
              “{hl.text.length > 160 ? hl.text.slice(0, 160) + "…" : hl.text}”
            </p>
          </div>
          <button onClick={onClose} className="ql-focus px-3 py-1.5" style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 2 }}>
            Back to reading
          </button>
        </div>
        <div ref={box} className="px-4 py-3 overflow-y-auto space-y-3" style={{ flex: 1, minHeight: 120 }}>
          {thread.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: t.role === "reader" ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "88%",
                  padding: "8px 12px",
                  borderRadius: 2,
                  background: t.role === "reader" ? C.ink : C.paper,
                  color: t.role === "reader" ? C.card : C.ink,
                  fontFamily: t.role === "reader" ? F.ui : F.read,
                  fontSize: t.role === "reader" ? 14 : 16,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {t.text}
                {t.check && (
                  <div className="mt-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.teal, fontWeight: 600 }}>
                    Check: {t.check}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p style={{ fontFamily: F.ui, fontSize: 13, color: C.slate }}>The tutor is thinking…</p>}
          {err && (
            <div className="px-3 py-2" style={{ background: C.amberSoft, fontFamily: F.ui, fontSize: 13, color: C.brick }}>
              {err}{" "}
              <button onClick={onRetry} className="ql-focus underline" style={{ fontWeight: 700 }}>
                Try again
              </button>
            </div>
          )}
        </div>
        <div className="px-4 pt-2 pb-3" style={{ borderTop: `1px solid ${C.line}` }}>
          {last?.followups?.length > 0 && !busy && (
            <div className="flex flex-wrap gap-2 mb-2">
              {last.followups.map((f, i) => (
                <button
                  key={i}
                  onClick={() => send(f)}
                  className="ql-focus px-2.5 py-1"
                  style={{ fontFamily: F.ui, fontSize: 12, color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 99, background: C.card }}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(q);
            }}
          >
            <input
              id="tutor-question"
              className="ql-focus"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={last?.check ? "Answer the check, or ask something…" : "Ask the tutor about this part…"}
              style={{ flex: 1, minWidth: 0, fontFamily: F.ui, fontSize: 15, padding: "9px 12px", border: `1px solid ${C.line}`, borderRadius: 2, color: C.ink, background: C.card }}
            />
            <button
              type="submit"
              disabled={busy || !q.trim()}
              className="ql-focus px-4"
              style={{ background: C.teal, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700, opacity: busy || !q.trim() ? 0.5 : 1 }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function FocusReading({ passage, structure, title, plan, learner, draftKey, onFinish, onExit }) {
  const { lines, sections } = structure;
  const qm = useMemo(() => quarterMap(lines), [lines]);
  /* quarter of a piece of text inside a line (sentence level) */
  const quarterOf = (line, text) => {
    const at = normLine(lines[line] || "").indexOf(normLine(text || "").trim().slice(0, 40));
    return qm.posQuarter(line, Math.max(0, at));
  };
  const totalWords = useMemo(() => lines.reduce((a, l) => a + wc(l), 0) || 1, [lines]);
  const wordsBefore = useMemo(() => {
    let acc = 0;
    return lines.map((l) => {
      const b = acc;
      acc += wc(l);
      return b;
    });
  }, [lines]);

  const draft = useMemo(() => (draftKey ? loadDraft(draftKey) : null), [draftKey]);
  const [startedAt] = useState(() => draft?.started_at || new Date().toISOString());
  const [activeMs, setActiveMs] = useState(draft?.active_ms || 0);
  const [highlights, setHighlights] = useState(draft?.highlights || []);
  const [lookups, setLookups] = useState(draft?.lookups || []);
  const [threads, setThreads] = useState(draft?.threads || {});
  const [furthest, setFurthest] = useState(draft?.furthest_line_seen || 0);
  const [pending, setPending] = useState(null);
  const [lookup, setLookup] = useState(null);
  const [tutorFor, setTutorFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);
  /* AARC calibration: how much she thinks she understood, before any question */
  const [selfRating, setSelfRating] = useState(null);
  const textBox = useRef(null);
  const lastTick = useRef(Date.now());

  /* count-up timer: active time only grows while the page is visible */
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      /* measure before moving the reference point (the state update runs later) */
      const delta = now - lastTick.current;
      lastTick.current = now;
      if (!document.hidden && delta > 0 && delta < 5000) setActiveMs((m) => m + delta);
    }, 1000);
    const vis = () => (lastTick.current = Date.now());
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  /* keep a draft, so a reload or a closed tab doesn't lose the reading */
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(
      () => saveDraft(draftKey, { started_at: startedAt, active_ms: activeMs, highlights, lookups, threads, furthest_line_seen: furthest }),
      600
    );
    return () => clearTimeout(t);
  }, [draftKey, startedAt, activeMs, highlights, lookups, threads, furthest]);

  /* furthest line that has been on screen (scroll progress) */
  useEffect(() => {
    const onScroll = () => {
      const els = textBox.current?.querySelectorAll("[data-line]") || [];
      let far = 0;
      els.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) far = Math.max(far, Number(el.dataset.line));
      });
      setFurthest((f) => Math.max(f, far));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* text selection inside the passage → the highlight bar */
  useEffect(() => {
    let t = null;
    const onSel = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = window.getSelection?.();
        if (!sel || sel.isCollapsed || !textBox.current) return;
        const text = String(sel).replace(/\s+/g, " ").trim();
        if (text.length < 3) return;
        const lineOf = (node) => {
          const el = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.("[data-line]");
          return el && textBox.current.contains(el) ? Number(el.dataset.line) : null;
        };
        const a = lineOf(sel.anchorNode);
        const b = lineOf(sel.focusNode);
        if (a == null || b == null) return;
        setPending({ text: text.slice(0, 2500), startLine: Math.min(a, b), endLine: Math.max(a, b) });
      }, 250);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", onSel);
    };
  }, []);

  const progressLine = highlights.reduce((m, h) => Math.max(m, h.end_line), -1);
  const pctAt = (line) => (line < 0 ? 0 : Math.round(((wordsBefore[line] + wc(lines[line])) / totalWords) * 100));
  const progressPct = pctAt(progressLine);
  const tutorCount = Object.values(threads).reduce((n, th) => n + th.filter((t) => t.role === "tutor").length, 0);

  const addHighlight = (p, explained) => {
    const h = {
      id: "H" + uid(),
      text: p.text,
      start_line: p.startLine,
      end_line: p.endLine,
      quarter: quarterOf(p.startLine, p.text),
      words: wc(p.text),
      at: new Date().toISOString(),
      explained: !!explained,
    };
    setHighlights((hs) => [...hs, h]);
    setPending(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      /* ignore */
    }
    return h;
  };

  const ask = useCallback(
    async (hl, question, history) => {
      setBusy(true);
      setErr("");
      const prior = textUpTo(lines, hl.end_line, hl.text);
      const t0 = Date.now();
      try {
        const r = await tutorTurn({ highlight: hl.text, prior, history, question, learner });
        setThreads((th) => ({
          ...th,
          [hl.id]: [...(th[hl.id] || []), { role: "tutor", text: r.reply, check: r.check, followups: r.followups, at: new Date().toISOString(), ms: Date.now() - t0, prior_chars: prior.length }],
        }));
      } catch (e) {
        setErr("The tutor couldn't answer: " + e.message);
      } finally {
        setBusy(false);
      }
    },
    [lines, learner]
  );

  const explain = (p) => {
    const h = addHighlight(p, true);
    setTutorFor(h.id);
    ask(h, "", []);
  };

  const openTutor = (h) => {
    setTutorFor(h.id);
    if (!h.explained) setHighlights((hs) => hs.map((x) => (x.id === h.id ? { ...x, explained: true } : x)));
    if (!(threads[h.id] || []).length) ask(h, "", []);
  };

  const send = (text) => {
    const h = highlights.find((x) => x.id === tutorFor);
    if (!h) return;
    const history = threads[h.id] || [];
    const next = [...history, { role: "reader", text, at: new Date().toISOString() }];
    setThreads((th) => ({ ...th, [h.id]: next }));
    ask(h, text, next);
  };

  const finish = () => {
    const ended = new Date().toISOString();
    const tutor = highlights
      .filter((h) => (threads[h.id] || []).length)
      .map((h) => ({ highlight_id: h.id, turns: threads[h.id] }));
    const focus = [
      ...highlights.map((h) => {
        const th = threads[h.id] || [];
        const firstQ = th.find((t) => t.role === "reader")?.text || "";
        return th.length
          ? { kind: "tutor", text: h.text, quarter: h.quarter, question: firstQ, start_line: h.start_line, end_line: h.end_line }
          : { kind: "highlight", text: h.text, quarter: h.quarter, start_line: h.start_line, end_line: h.end_line };
      }),
      ...lookups.filter((l) => l.saved).map((l) => ({ kind: "vocab", text: l.word, quarter: l.quarter, sentence: l.sentence, start_line: l.line, end_line: l.line })),
    ];
    const data = {
      reading_id: "F" + uid(),
      tutor_version: TUTOR_VERSION,
      started_at: startedAt,
      ended_at: ended,
      total_ms: Date.parse(ended) - Date.parse(startedAt),
      active_ms: activeMs,
      passage_words: totalWords,
      highlights,
      lookups,
      tutor,
      tutor_turns: tutor.reduce((n, t) => n + t.turns.length, 0),
      progress_highlight_pct: progressPct,
      furthest_line_seen: furthest,
      progress_scroll_pct: pctAt(furthest),
      focus,
      self_rating_after_reading: selfRating,
      rating_version: RATING_VERSION,
    };
    if (draftKey)
      try {
        localStorage.removeItem(draftKey);
      } catch (e) {
        /* ignore */
      }
    onFinish(data);
  };

  /* character ranges of highlights in a line */
  const marksFor = (i, text) =>
    highlights
      .filter((h) => i >= h.start_line && i <= h.end_line)
      .map((h) => {
        if (h.start_line !== h.end_line) return { from: 0, to: text.length, id: h.id, explained: h.explained };
        const idx = text.toLowerCase().replace(/\s+/g, " ").indexOf(h.text.toLowerCase());
        return idx > -1 ? { from: idx, to: idx + h.text.length, id: h.id, explained: h.explained } : { from: 0, to: text.length, id: h.id, explained: h.explained };
      });

  const hlOpen = highlights.find((h) => h.id === tutorFor);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-40">
      {/* sticky reading bar */}
      <div
        /* leaves room for the app's Notes · Words · Model buttons: above on phones, to the right on wider screens */
        className="sticky z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-3 pt-16 xl:pt-3 flex flex-wrap items-center gap-x-5 gap-y-2"
        style={{ top: "env(safe-area-inset-top, 0px)", background: C.paper, borderBottom: `1px solid ${C.line}` }}
      >
        <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.teal }}>Focus reading</div>
        <div style={{ fontFamily: F.mono, fontSize: 18, color: C.ink, fontVariantNumeric: "tabular-nums" }} aria-label="Reading time">
          {clock(activeMs)}
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 140 }}>
          <div style={{ height: 6, background: C.line, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: progressPct + "%", height: "100%", background: C.teal, transition: "width .3s" }} />
          </div>
          <div className="mt-1" style={{ fontFamily: F.ui, fontSize: 11, color: C.slate }}>
            {progressPct ? `Highlighted up to ${progressPct}% of the text` : "Highlight as you read to show how far you've got"}
          </div>
        </div>
        <button
          onClick={() => {
            setTutorFor(null);
            setPending(null);
            setConfirmFinish(true);
          }}
          className="ql-focus px-4 py-2"
          style={{ background: C.ink, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}
        >
          I've finished reading
        </button>
      </div>

      {confirmFinish && (
        /* fixed to the bottom of the screen, so it is visible wherever the reader has scrolled */
        <div
          role="dialog"
          aria-label="Finish reading"
          className="fixed z-50 left-0 right-0 bottom-0 px-4 py-4"
          style={{ background: C.card, borderTop: `2px solid ${C.ink}`, boxShadow: "0 -8px 30px rgba(22,32,43,0.18)", paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="max-w-3xl mx-auto">
          <p style={{ fontFamily: F.ui, fontSize: 14, color: C.slate, lineHeight: 1.5 }}>
            Finish reading? Your {plan?.counts?.reduce((a, b) => a + b, 0) || ""} questions will be written now, from the whole text. You'll still see the passage while you answer, but you can't come back to focus reading.
          </p>
          <div className="mt-3">
            <SelfRating id="rate-after-reading" value={selfRating} onChange={setSelfRating} question="Before any questions: how much of the text do you think you understand? (0–10)" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <button
              onClick={finish}
              disabled={selfRating == null}
              className="ql-focus px-4 py-2"
              style={{ background: selfRating == null ? C.mute : C.teal, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700, cursor: selfRating == null ? "not-allowed" : "pointer" }}
            >
              Make my questions
            </button>
            <button onClick={() => setConfirmFinish(false)} className="ql-focus px-4 py-2" style={{ border: `1px solid ${C.ink}`, color: C.ink, borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}>
              Keep reading
            </button>
            {selfRating == null && <span style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>Choose a number first.</span>}
          </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        {title && <h1 style={{ fontFamily: F.read, fontSize: 28, lineHeight: 1.2, color: C.ink, textWrap: "balance" }}>{title}</h1>}
        <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, lineHeight: 1.5, maxWidth: "62ch" }}>
          Read at your own pace. Tap a word to see its meaning. Select a sentence or a paragraph to highlight it, or ask the tutor to explain it. The ¶ button selects a whole paragraph.
        </p>
        <div className="mt-2 flex flex-wrap gap-4" style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
          <span>{lookups.length} words looked up</span>
          <span>{lookups.filter((l) => l.saved).length} added to vocabulary</span>
          <span>{highlights.length} highlights</span>
          <span>{tutorCount} tutor exchanges</span>
        </div>
      </div>

      <article
        ref={textBox}
        className="mt-6 px-4 sm:px-8 py-6"
        style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2, fontFamily: F.read, fontSize: 19, lineHeight: 1.7, color: C.ink }}
      >
        {lines.map((raw, i) => {
          const line = raw.replace(/\*\*/g, "");
          const sec = sections.find((s) => s.start === i);
          if (!line.trim()) return <div key={i} data-line={i} style={{ height: "0.6em" }} />;
          const heading = /^#{1,6}\s/.test(line.trim());
          const text = heading ? line.replace(/^#{1,6}\s*/, "") : line;
          return (
            <div key={i}>
              {sec && (
                <div className={sec.n === 1 ? "mb-2" : "mt-6 mb-2"} style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.mute }}>
                  Section {sec.n}
                </div>
              )}
              <div className="flex gap-2" style={{ alignItems: "baseline" }}>
                <button
                  aria-label="Select this paragraph"
                  title="Select this paragraph"
                  onClick={() => setPending({ text: text.trim(), startLine: i, endLine: i })}
                  className="ql-focus"
                  style={{ fontFamily: F.ui, fontSize: 12, color: C.mute, flex: "none", width: 16, lineHeight: 1 }}
                >
                  ¶
                </button>
                <p
                  data-line={i}
                  style={{ margin: "0 0 0.5em", minWidth: 0, flex: 1, fontWeight: heading ? 600 : 400, fontSize: heading ? 21 : undefined }}
                >
                  <LineText
                    text={text}
                    marks={marksFor(i, text)}
                    onWord={(word, sentence) => {
                      setLookups((ls) => [...ls, { word, sentence: sentence.slice(0, 300), line: i, quarter: quarterOf(i, word), saved: false, at: new Date().toISOString() }]);
                      setLookup({ word, sentence, line: i });
                    }}
                  />
                </p>
              </div>
            </div>
          );
        })}
      </article>

      {highlights.length > 0 && (
        <section className="mt-6">
          <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.slate }}>Your highlights</div>
          <ul className="mt-2 space-y-2">
            {highlights.map((h) => (
              <li key={h.id} className="px-3 py-2 flex flex-wrap items-center gap-2" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}>
                <span style={{ fontFamily: F.read, fontSize: 15, color: C.ink, flex: "1 1 220px", minWidth: 0 }}>
                  “{h.text.length > 120 ? h.text.slice(0, 120) + "…" : h.text}”
                </span>
                <button onClick={() => openTutor(h)} className="ql-focus px-3 py-1" style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 2 }}>
                  {(threads[h.id] || []).length ? "Open tutor" : "Ask the tutor"}
                </button>
                <button
                  onClick={() => setHighlights((hs) => hs.filter((x) => x.id !== h.id))}
                  className="ql-focus px-2"
                  aria-label="Remove highlight"
                  style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        <button onClick={onExit} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
          ← Leave without making questions
        </button>
      </div>

      {/* selection bar */}
      {pending && !hlOpen && !confirmFinish && (
        <div
          className="fixed z-40 left-0 right-0 bottom-0 px-4 py-3"
          style={{ background: C.ink, paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
            <span style={{ fontFamily: F.read, fontSize: 14, color: C.card, flex: "1 1 200px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              “{pending.text}”
            </span>
            <button onClick={() => addHighlight(pending, false)} className="ql-focus px-3 py-2" style={{ background: C.amber, color: C.ink, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}>
              Highlight
            </button>
            <button onClick={() => explain(pending)} className="ql-focus px-3 py-2" style={{ background: C.teal, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}>
              Explain this
            </button>
            <button onClick={() => setPending(null)} className="ql-focus px-2 py-2" style={{ fontFamily: F.ui, fontSize: 13, color: C.card }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {hlOpen && (
        <TutorSheet
          hl={hlOpen}
          thread={threads[hlOpen.id] || []}
          busy={busy}
          err={err}
          onSend={send}
          onRetry={() => {
            const th = threads[hlOpen.id] || [];
            const lastReader = [...th].reverse().find((t) => t.role === "reader");
            ask(hlOpen, lastReader?.text || "", th);
          }}
          onClose={() => {
            setTutorFor(null);
            setErr("");
          }}
        />
      )}

      {lookup && (
        <WordCard
          word={lookup.word}
          sentence={lookup.sentence}
          onClose={() => setLookup(null)}
          onSaved={() =>
            setLookups((ls) => {
              /* mark the most recent lookup of this word as saved */
              const idx = ls.map((l) => l.word.toLowerCase()).lastIndexOf(lookup.word.toLowerCase());
              return ls.map((l, k) => (k === idx ? { ...l, saved: true, saved_at: new Date().toISOString() } : l));
            })
          }
        />
      )}
    </div>
  );
}
