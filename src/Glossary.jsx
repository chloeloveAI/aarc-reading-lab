import React, { useState, useEffect } from "react";
import { lookupWord, addVocab, listVocab, removeVocab, downloadCSV, whereStored } from "./vocab";
import { speak, speechAvailable, loadSpeechPrefs, saveSpeechPrefs, ACCENTS } from "./speech";
import { formatWhen, relativeWhen } from "./sessions";

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
  zh: "'Noto Sans HK', 'PingFang HK', 'Microsoft JhengHei', sans-serif",
};

export function Speaker({ text, rate, size = 22, title = "Hear it" }) {
  if (!speechAvailable() || !text) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        speak(text, { rate });
      }}
      className="ql-focus shrink-0"
      title={title}
      aria-label={title}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: `1px solid ${C.line}`,
        background: C.card,
        color: C.teal,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}

/* Small cache so re-clicking a word is instant and free. */
const cache = new Map();

export function WordCard({ word, sentence, onClose }) {
  const [data, setData] = useState(cache.get(word.toLowerCase()) || null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let dead = false;
    if (cache.has(word.toLowerCase())) return;
    setData(null);
    setErr("");
    lookupWord(word, sentence)
      .then((d) => {
        if (dead) return;
        cache.set(word.toLowerCase(), d);
        setData(d);
      })
      .catch((e) => !dead && setErr(e.message));
    return () => {
      dead = true;
    };
  }, [word, sentence]);

  useEffect(() => {
    if (loadSpeechPrefs().auto) speak(word);
  }, [word]);

  const save = async () => {
    await addVocab(data);
    setSaved(true);
  };

  return (
    <div
      className="fixed z-50 left-0 right-0 bottom-0 flex justify-center p-3 sm:p-6"
      style={{ pointerEvents: "none" }}
    >
      <div
        className="w-full max-w-lg"
        style={{
          pointerEvents: "auto",
          background: C.card,
          border: `1px solid ${C.ink}`,
          borderRadius: 2,
          boxShadow: "0 8px 30px rgba(22,32,43,0.18)",
        }}
      >
        <div className="px-5 py-4 flex items-baseline justify-between gap-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span style={{ fontFamily: F.read, fontSize: 26, fontWeight: 600, color: C.ink }}>{word}</span>
            <Speaker text={word} size={26} title="Hear the word" />
            <button
              onClick={() => speak(word, { rate: 0.6 })}
              className="ql-focus"
              style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 2, padding: "3px 6px", background: C.card }}
            >
              Slow
            </button>
            {data?.pos && (
              <span style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", color: C.mute }}>
                {data.pos}
              </span>
            )}
          </div>
          <button onClick={onClose} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          {!data && !err && (
            <p style={{ fontFamily: F.ui, fontSize: 14, color: C.slate }}>Looking it up in this sentence…</p>
          )}
          {err && <p style={{ fontFamily: F.ui, fontSize: 14, color: C.brick }}>{err}</p>}
          {data && (
            <div className="space-y-3">
              <p style={{ fontFamily: F.zh, fontSize: 30, lineHeight: 1.2, color: C.teal, fontWeight: 600 }}>
                {data.zh}
              </p>
              <p style={{ fontFamily: F.zh, fontSize: 16, lineHeight: 1.6, color: C.ink }}>{data.meaning_zh}</p>
              <p style={{ fontFamily: F.ui, fontSize: 14, lineHeight: 1.55, color: C.slate }}>{data.meaning_en}</p>
              {data.example && (
                <div
                  className="px-3 py-2 flex items-start gap-3"
                  style={{ background: C.amberSoft, borderRadius: 2 }}
                >
                  <Speaker text={data.example} title="Hear the sentence" />
                  <p style={{ fontFamily: F.read, fontSize: 16, lineHeight: 1.5, color: C.ink }}>{data.example}</p>
                </div>
              )}
              {data.note && (
                <p style={{ fontFamily: F.ui, fontSize: 12, color: C.mute, lineHeight: 1.5 }}>{data.note}</p>
              )}
            </div>
          )}
        </div>

        {data && (
          <div className="px-5 py-3 flex items-center gap-3" style={{ borderTop: `1px solid ${C.line}` }}>
            <button
              onClick={save}
              disabled={saved}
              className="ql-focus px-4 py-2"
              style={{
                background: saved ? C.tealSoft : C.ink,
                color: saved ? C.teal : C.card,
                border: `1px solid ${saved ? C.teal : C.ink}`,
                borderRadius: 2,
                fontFamily: F.ui,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {saved ? "Saved" : "Add to my vocabulary"}
            </button>
            <span style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>
              {saved ? "It's in your list." : "Keeps the sense from this passage."}
            </span>
            <VoicePrefs />
          </div>
        )}
      </div>
    </div>
  );
}

function VoicePrefs() {
  const [p, setP] = useState(loadSpeechPrefs);
  if (!speechAvailable()) return null;
  const update = (patch) => {
    const next = { ...p, ...patch };
    setP(next);
    saveSpeechPrefs(next);
  };
  return (
    <span className="ml-auto flex items-center gap-2">
      <select
        value={p.accent}
        onChange={(e) => update({ accent: e.target.value })}
        className="ql-focus"
        style={{ fontFamily: F.mono, fontSize: 10, color: C.slate, border: `1px solid ${C.line}`, borderRadius: 2, padding: "3px 4px", background: C.card }}
      >
        {ACCENTS.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <button
        onClick={() => update({ auto: !p.auto })}
        className="ql-focus"
        style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: p.auto ? C.teal : C.mute, border: `1px solid ${p.auto ? C.teal : C.line}`, borderRadius: 2, padding: "3px 6px", background: C.card }}
        title="Say the word automatically when a card opens"
      >
        Auto {p.auto ? "on" : "off"}
      </button>
    </span>
  );
}

export function VocabDrawer({ onClose }) {
  const [items, setItems] = useState([]);
  const [where, setWhere] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    listVocab().then(setItems);
    whereStored().then(setWhere);
  }, []);

  const shown = items.filter(
    (i) =>
      !q ||
      (i.word || "").toLowerCase().includes(q.toLowerCase()) ||
      (i.zh || "").includes(q)
  );

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
        <div className="px-6 py-5 flex items-baseline justify-between gap-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div>
            <h2 style={{ fontFamily: F.read, fontSize: 24, fontWeight: 600, color: C.ink }}>
              My vocabulary
            </h2>
            <p style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mute }}>
              {items.length} words · saved to {where}
            </p>
          </div>
          <button onClick={onClose} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
            Close
          </button>
        </div>

        <div className="px-6 py-4">
          <input
            className="ql-focus"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter"
            style={{
              width: "100%",
              fontFamily: F.ui,
              fontSize: 14,
              color: C.ink,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 2,
              padding: "9px 11px",
            }}
          />
        </div>

        <div className="px-6 pb-4 space-y-3" style={{ maxHeight: "55vh", overflowY: "auto" }}>
          {shown.length === 0 && (
            <p style={{ fontFamily: F.ui, fontSize: 14, color: C.slate }}>
              {items.length === 0
                ? "Click any word in a question or in the passage to look it up, then add it here."
                : "Nothing matches that."}
            </p>
          )}
          {shown.map((i) => (
            <div key={i.word} className="px-4 py-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 2 }}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Speaker text={i.word} size={20} />
                  <span style={{ fontFamily: F.read, fontSize: 19, fontWeight: 600, color: C.ink }}>{i.word}</span>
                  <span style={{ fontFamily: F.zh, fontSize: 17, color: C.teal }}>{i.zh}</span>
                  <span style={{ fontFamily: F.mono, fontSize: 10, textTransform: "uppercase", color: C.mute }}>{i.pos}</span>
                </div>
                <span className="flex items-center gap-3 shrink-0">
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.mute, whiteSpace: "nowrap" }}>
                    {relativeWhen(i.savedAt)}
                  </span>
                  <button
                    onClick={() => removeVocab(i.word).then(setItems)}
                    className="ql-focus"
                    style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}
                  >
                    Remove
                  </button>
                </span>
              </div>
              <p className="mt-1" style={{ fontFamily: F.zh, fontSize: 14, color: C.ink }}>{i.meaning_zh}</p>
              <p style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, lineHeight: 1.5 }}>{i.meaning_en}</p>
              <p className="mt-1" style={{ fontFamily: F.mono, fontSize: 10, color: C.mute }}>
                Added {formatWhen(i.savedAt)}
              </p>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 flex flex-wrap gap-3" style={{ borderTop: `1px solid ${C.line}` }}>
          <button
            onClick={() => downloadCSV(items)}
            disabled={items.length === 0}
            className="ql-focus px-4 py-2"
            style={{ border: `1px solid ${C.ink}`, color: C.ink, borderRadius: 2, fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}
          >
            Export CSV
          </button>
          <span style={{ fontFamily: F.ui, fontSize: 12, color: C.mute, alignSelf: "center" }}>
            Opens in Excel, imports into Anki.
          </span>
        </div>
      </div>
    </div>
  );
}
