/* AGS Testing Lab — learner view + controls. Development tool (ags.html). */
import React, { useMemo, useRef, useState } from "react";
import {
  AGS_VERSIONS,
  validateMap,
  createSession,
  applyAnswer,
  learnerExit,
  sessionOutcomes,
  questionText,
  normaliseVerdict,
  normaliseMap,
  normaliseSummary,
  buildSummaryFeedback,
  orderIdeas,
  words,
} from "../ags.js";
import {
  AGS_PROMPT_VERSIONS,
  AGS_CALL_SETTINGS,
  buildVerdictPrompt,
  verdictSchema,
  buildSummaryPrompt,
  summarySchema,
  buildMapPrompt,
  MAP_SCHEMA,
} from "../agsPrompts.js";
import {
  LAB_VERSION,
  SAMPLES,
  loadLabConfig,
  saveLabConfig,
  labModelInfo,
  ollamaJSON,
  testConnection,
  mockVerdict,
  mockSummary,
  passageBlocks,
  ideaEvidence,
  saveSessionRecord,
} from "./engine.js";
import LabInspector from "./LabInspector.jsx";
import { C, F } from "./theme.js";

const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};

const ACK = {
  correct: "Yes, that's in the text.",
  partial: "That's part of it.",
  incorrect: "Let's look at the text again.",
  no_attempt: "That's fine. Let's look at the text together.",
  alternative_supported: "That's a reasonable reading of the text.",
  alternative_uncertain: "Tell me a little more.",
};

const SUMMARY_TASK = {
  narrative: "Summarise the story in your own words: who is in it, what happens, and how it ends. You don't need to state a moral or lesson.",
  informational_explanatory: "Summarise what the passage explains, in your own words: the main process or idea and how its parts connect.",
  informational_argumentative: "Summarise the author's claim and the main reasons or evidence, in your own words, including any limits the text admits.",
};

function Btn({ children, onClick, kind = "primary", disabled, small }) {
  const st =
    kind === "primary"
      ? { background: C.ink, color: C.card, border: `1px solid ${C.ink}` }
      : kind === "quiet"
      ? { background: "transparent", color: C.slate, border: "none", textDecoration: "underline", padding: 0 }
      : { background: C.card, color: C.ink, border: `1px solid ${C.ink}` };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...st, fontFamily: F.ui, fontSize: small ? 12 : 14, fontWeight: kind === "quiet" ? 400 : 700, borderRadius: 3, padding: kind === "quiet" ? 0 : small ? "5px 10px" : "9px 16px", opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}

function Banner({ tone, children }) {
  const t = tone === "warn" ? { bg: C.amberSoft, fg: C.amber } : tone === "bad" ? { bg: C.brickSoft, fg: C.brick } : { bg: C.tealSoft, fg: C.teal };
  return <div style={{ background: t.bg, color: t.fg, fontFamily: F.ui, fontSize: 13, padding: "8px 14px", borderRadius: 3, marginTop: 8, lineHeight: 1.45 }}>{children}</div>;
}

/* the passage, with highlight levels: light (section), strong (paragraph), and a marked quote */
function Passage({ passage, hl }) {
  const blocks = useMemo(() => passageBlocks(passage), [passage]);
  const ref = useRef({});
  React.useEffect(() => {
    const first = [...(hl?.strong || []), ...(hl?.light || [])][0];
    if (first != null && ref.current[first]) ref.current[first].scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hl]);
  /* mark every evidence quote found in this block (case-insensitive) */
  const mark = (text) => {
    const qs = (hl?.quotes || []).map((q) => q.toLowerCase());
    const spans = [];
    qs.forEach((q) => {
      const i = text.toLowerCase().indexOf(q);
      if (i >= 0) spans.push([i, i + q.length]);
    });
    if (!spans.length) return text;
    spans.sort((a, b) => a[0] - b[0]);
    const out = [];
    let pos = 0;
    spans.forEach(([a, b], k) => {
      if (a < pos) return;
      out.push(text.slice(pos, a));
      out.push(<mark key={k} style={{ background: C.mark, padding: "0 2px" }}>{text.slice(a, b)}</mark>);
      pos = b;
    });
    out.push(text.slice(pos));
    return <>{out}</>;
  };
  return (
    <div style={{ fontFamily: F.read, fontSize: 17, lineHeight: 1.65, color: C.ink }}>
      {blocks.map((b) => {
        const strong = hl?.strong?.has(b.i);
        const light = !strong && hl?.light?.has(b.i);
        const style = {
          margin: b.i === 0 ? "0 0 12px" : b.heading ? "18px 0 6px" : "0 0 12px",
          fontWeight: b.heading ? 700 : 400,
          fontSize: b.i === 0 ? 22 : b.heading ? 16 : 17,
          fontFamily: b.heading ? F.ui : F.read,
          background: strong ? "#FFF6CC" : light ? "#FFFBEA" : "transparent",
          borderLeft: strong ? `4px solid ${C.amber}` : light ? `4px solid ${C.line}` : "4px solid transparent",
          padding: "2px 10px",
          transition: "background 0.3s",
        };
        return (
          <p key={b.i} ref={(el) => (ref.current[b.i] = el)} style={style}>
            {strong ? mark(b.text) : b.text}
          </p>
        );
      })}
    </div>
  );
}

function highlightFor(map, passage, pending) {
  if (!pending?.idea) return null;
  const idea = map.ideas.find((i) => i.id === pending.idea);
  const ev = ideaEvidence(idea, passage);
  if (!ev.length) return null;
  const blocks = new Set(ev.map((e) => e.paragraph));
  if (pending.move === "pointer" && pending.pointer === "section") {
    const light = new Set();
    blocks.forEach((b) => [b - 1, b, b + 1].forEach((x) => x > 0 && light.add(x)));
    return { light, strong: new Set() };
  }
  if (pending.move === "pointer") return { light: new Set(), strong: blocks };
  /* at the cap, every evidence sentence for the idea is shown, not just the first */
  if (pending.move === "cap_show_evidence") return { light: new Set(), strong: blocks, quotes: ev.map((e) => e.quote) };
  return null;
}

const PROMPT_LINE = {
  focused_question: "Let's look at one part.",
  link_question: "Now think about how these connect.",
  pointer: "Look again at the highlighted part of the text, then try again.",
  clarify: "",
  own_words: "",
  cap_show_evidence: "Here are the sentences that help. Read them, then say this part in your own words.",
  final_main_reask: "One last question.",
};

export default function Lab() {
  const [cfg, setCfg] = useState(loadLabConfig);
  const [conn, setConn] = useState("");
  const [sampleId, setSampleId] = useState("TP-01");
  const sample = SAMPLES.find((s) => s.id === sampleId);
  const [map, setMap] = useState(sample.map);
  const [mapSource, setMapSource] = useState("dev_fixture");
  const [gen, setGen] = useState(null);
  const [stage, setStage] = useState("setup");
  const [sess, setSess] = useState(null);
  const [rec, setRec] = useState(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(null);
  const [ack, setAck] = useState("");
  const [hl, setHl] = useState(null);
  const [draft, setDraft] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [inspect, setInspect] = useState(false);

  const mapCheck = useMemo(() => validateMap(map, sample.passage), [map, sample]);
  const persist = (r) => {
    setRec(r);
    if (!saveSessionRecord(r)) setErr({ message: "The browser's storage is full: this session is no longer being saved. Download the log from the Inspector." });
  };
  const setConfig = (patch) => {
    const n = { ...cfg, ...patch };
    setCfg(n);
    saveLabConfig(n);
    setConn("");
  };

  const pickSample = (id) => {
    const s = SAMPLES.find((x) => x.id === id);
    setSampleId(id);
    setMap(JSON.parse(JSON.stringify(s.map)));
    setMapSource("dev_fixture");
    setGen(null);
  };

  /* ---------------------- model or mock call ---------------------- */
  async function judge(kind, args) {
    if (cfg.mode === "mock") return { parsed: kind === "verdict" ? mockVerdict(args.idea, args.answer, map.passage_type) : mockSummary(map, args.summary), content: "(mock)", meta: { mock: true } };
    const st = AGS_CALL_SETTINGS[kind];
    return ollamaJSON(cfg, { prompt: args.prompt, schema: args.schema, temperature: st.temperature, maxTokens: st.maxTokens });
  }

  /* ----------------------------- start ----------------------------- */
  async function start() {
    if (!mapCheck.ok) return;
    const s = createSession(map);
    const info = await labModelInfo(cfg).catch((e) => ({ name: cfg.model, error: e.message }));
    const r = {
      session_id: "AGS-" + new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6),
      lab_version: LAB_VERSION,
      started_at: new Date().toISOString(),
      sample_id: sample.id,
      passage_title: sample.title,
      passage_type: map.passage_type,
      mode: cfg.mode,
      model_info: info,
      call_settings: AGS_CALL_SETTINGS,
      versions: { ...AGS_VERSIONS, prompts: AGS_PROMPT_VERSIONS },
      map_source: mapSource,
      map_review_status: map.review_status,
      map,
      map_check: mapCheck,
      rules_config: s.cfg,
      turns: [],
      events: [],
      summary: { drafts: [] },
    };
    setSess(s);
    persist(r);
    setStage("guided");
    setAck("");
    setHl(null);
    setAnswer("");
    setDraft("");
    setShowLabels(false);
    setErr(null);
  }

  /* --------------------------- one answer --------------------------- */
  async function submit() {
    if (busy || !sess) return;
    const pending = sess.pending;
    const idea = map.ideas.find((i) => i.id === pending.idea);
    const shown = questionText(map, pending);
    const verdictQuestion = ["own_words", "cap_show_evidence", "pointer"].includes(pending.move) ? idea.questions.opening : shown;
    setErr(null);
    let raw = null,
      content = "",
      meta = {},
      prompt = "";
    if (answer.trim()) {
      setBusy(cfg.mode === "mock" ? "Checking (mock)…" : `Checking your answer with ${cfg.model}…`);
      try {
        prompt = buildVerdictPrompt({ passage: sample.passage, idea, questionText: verdictQuestion, answer, passageType: map.passage_type });
        const out = await judge("verdict", { prompt, schema: verdictSchema(idea, map.passage_type), idea, answer });
        raw = out.parsed;
        content = out.content;
        meta = out.meta;
      } catch (e) {
        setBusy("");
        setErr({ message: e.message, raw: e.raw, meta: e.meta });
        persist({ ...rec, events: [...rec.events, { type: "verdict_call_failed", at: new Date().toISOString(), idea_id: idea.id, answer, error: e.message, raw_reply: e.raw || "", meta: e.meta || null }] });
        return;
      }
      setBusy("");
    }
    const normalised = normaliseVerdict(raw || {}, idea, answer);
    const { session, record } = applyAnswer(sess, map, { answer, verdict: normalised.verdict, passage: sample.passage });
    const turn = {
      ...record,
      question_shown: shown,
      verdict_question: verdictQuestion,
      mode: cfg.mode,
      model_called: !!answer.trim(),
      raw_reply: content,
      normalised,
      meta,
      prompt_hash: prompt ? hash(prompt) : "",
      at: new Date().toISOString(),
    };
    const next = { ...rec, turns: [...rec.turns, turn] };
    const cls = record.classification;
    setAck(
      cls.expression_flags.includes("interpretation_only")
        ? "That's one reading of the story. Now, what actually happens in it?"
        : record.restatement
        ? record.outcome === "supported"
          ? "Thanks. Let's go on."
          : "Let's go on; you can come back to this in your summary."
        : ACK[cls.classification] || ""
    );
    setAnswer("");
    setSess(session);
    if (session.phase === "done") {
      next.outcomes = sessionOutcomes(session);
      next.guided_ended_at = new Date().toISOString();
      next.guided_exit_reason = session.exit_reason;
      setStage("summary");
      setHl(null);
    } else setHl(highlightFor(map, sample.passage, session.pending));
    persist(next);
  }

  function goToSummary() {
    const { session } = learnerExit(sess);
    setSess(session);
    persist({ ...rec, outcomes: sessionOutcomes(session), guided_ended_at: new Date().toISOString(), guided_exit_reason: "learner_exit", events: [...rec.events, { type: "learner_exit", at: new Date().toISOString(), turn: sess.turns }] });
    setStage("summary");
    setHl(null);
    setAck("");
  }

  /* ----------------------------- summary ----------------------------- */
  const drafts = rec?.summary?.drafts || [];
  async function submitSummary() {
    const n = drafts.length + 1;
    setErr(null);
    setBusy(cfg.mode === "mock" ? "Checking (mock)…" : `Checking your summary with ${cfg.model}…`);
    let out;
    const prompt = buildSummaryPrompt({ passage: sample.passage, map, summary: draft });
    try {
      out = await judge("summary", { prompt, schema: summarySchema(map), summary: draft });
    } catch (e) {
      setBusy("");
      setErr({ message: e.message, raw: e.raw, meta: e.meta });
      persist({ ...rec, events: [...rec.events, { type: "summary_call_failed", at: new Date().toISOString(), draft: n, error: e.message, raw_reply: e.raw || "", meta: e.meta || null }] });
      return;
    }
    setBusy("");
    const assessment = normaliseSummary(out.parsed, map, draft);
    const feedback = buildSummaryFeedback(map, assessment, { summary: draft, passage: sample.passage });
    const d = {
      draft: n,
      text: draft,
      at: new Date().toISOString(),
      words: words(draft).length,
      topic_labels_opened: showLabels,
      mode: cfg.mode,
      raw_reply: out.content,
      raw_parsed: out.parsed,
      assessment,
      feedback,
      meta: out.meta,
      prompt_hash: hash(prompt),
    };
    persist({ ...rec, summary: { ...rec.summary, drafts: [...drafts, d] } });
    if (n >= 2) setStage("done");
  }

  function openLabels() {
    setShowLabels(true);
    persist({ ...rec, events: [...rec.events, { type: "topic_labels_opened", at: new Date().toISOString(), draft: drafts.length + 1 }] });
  }

  /* ------------------------- map generation ------------------------- */
  async function generateMap() {
    setErr(null);
    setGen(null);
    if (cfg.mode === "mock") {
      setGen({ note: "Mock mode cannot generate a map: switch to Ollama. The hand-written development map stays in use." });
      return;
    }
    setBusy(`Building a key-idea map with ${cfg.model}… (this can take a few minutes)`);
    const prompt = buildMapPrompt({ passage: sample.passage });
    try {
      const st = AGS_CALL_SETTINGS.map;
      const out = await ollamaJSON(cfg, { prompt, schema: MAP_SCHEMA, temperature: st.temperature, maxTokens: st.maxTokens, timeoutMs: 900000 });
      const { map: m, audit } = normaliseMap(out.parsed, { passage_id: sample.id, map_id: "GEN-" + Date.now().toString(36), map_version: AGS_PROMPT_VERSIONS.map });
      setGen({ map: m, audit, check: validateMap(m, sample.passage), raw: out.content, meta: out.meta, prompt_hash: hash(prompt) });
    } catch (e) {
      setErr({ message: e.message, raw: e.raw, meta: e.meta });
    }
    setBusy("");
  }

  /* ------------------------------ render ------------------------------ */
  const pending = sess?.pending;
  const order = orderIdeas(map).map((i) => i.id);
  const partNo = pending?.idea ? order.indexOf(pending.idea) + 1 : order.length;
  const lastDraft = drafts[drafts.length - 1];

  const header = (
    <div style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: F.ui, fontWeight: 800, fontSize: 18, color: C.ink }}>AGS Testing Lab</div>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
            Adaptive Guided Summarisation · proposed feature · {LAB_VERSION} · {AGS_VERSIONS.rules} · {AGS_PROMPT_VERSIONS.verdict}
          </div>
        </div>
        <div style={{ ...{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },  fontFamily: F.ui, fontSize: 13 }}>
          <select aria-label="Mode" value={cfg.mode} onChange={(e) => setConfig({ mode: e.target.value })} disabled={stage !== "setup"} style={{ padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 3 }}>
            <option value="ollama">Ollama (real model)</option>
            <option value="mock">Mock (no model)</option>
          </select>
          {cfg.mode === "ollama" && (
            <>
              <input aria-label="Model" value={cfg.model} onChange={(e) => setConfig({ model: e.target.value })} disabled={stage !== "setup"} style={{ width: 150, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 3, fontFamily: F.mono, fontSize: 12 }} />
              <input aria-label="Ollama address" value={cfg.baseUrl} onChange={(e) => setConfig({ baseUrl: e.target.value })} disabled={stage !== "setup"} style={{ width: 190, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 3, fontFamily: F.mono, fontSize: 12 }} />
              <Btn
                kind="secondary"
                small
                onClick={async () => {
                  setConn("Testing…");
                  try {
                    setConn(await testConnection(cfg));
                  } catch (e) {
                    setConn("✗ " + e.message);
                  }
                }}
              >
                Test
              </Btn>
            </>
          )}
          <Btn kind={inspect ? "primary" : "secondary"} small onClick={() => setInspect((v) => !v)}>
            {inspect ? "Hide" : "Researcher"} Inspector
          </Btn>
        </div>
      </div>
      {conn && (
        <div style={{ ...{ maxWidth: 1152, margin: '0 auto', padding: '0 16px 8px' },  fontFamily: F.ui, fontSize: 12, color: conn.startsWith("✗") ? C.brick : C.teal }}>
          {conn}
        </div>
      )}
    </div>
  );

  const banners = (
    <div style={{ maxWidth: 1152, margin: '0 auto', padding: '0 16px' }}>
      {cfg.mode === "mock" && <Banner tone="warn">MOCK MODE: answers are judged by simple word matching, not by a model. Use it to test the interface only; its judgements mean nothing.</Banner>}
      {map.review_status !== "approved" && (
        <Banner tone="warn">
          UNREVIEWED DEVELOPMENT MAP ({mapSource === "model_generated" ? "generated by the model" : "hand-written test fixture"}). For development testing only. Not for research or learner pilots.
        </Banner>
      )}
      {err && (
        <Banner tone="bad">
          <strong>{err.message}</strong>
          {err.meta && (
            <div style={{ fontFamily: F.mono, fontSize: 11, marginTop: 4 }}>
              done_reason {String(err.meta.done_reason ?? "?")} · output tokens {String(err.meta.output_tokens ?? "?")} of {String(err.meta.num_predict ?? "?")}
            </div>
          )}
          <div style={{ marginTop: 4 }}>Nothing was recorded as an answer. You can try again. The failed call is in the log.</div>
        </Banner>
      )}
      {busy && <Banner tone="ok">{busy}</Banner>}
    </div>
  );

  let main;
  if (stage === "setup") {
    main = (
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ fontFamily: F.ui, fontSize: 15, color: C.slate, marginBottom: 12 }}>Choose a passage to work through as a learner.</div>
        <div style={{ ...{ display: 'grid', gap: 12 },  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              onClick={() => pickSample(s.id)}
              style={{ textAlign: "left", background: C.card, border: `2px solid ${s.id === sampleId ? C.ink : C.line}`, borderRadius: 4, padding: 14, cursor: "pointer" }}
            >
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
                {s.id} · {s.label}
              </div>
              <div style={{ fontFamily: F.read, fontSize: 19, fontWeight: 700, color: C.ink, marginTop: 4 }}>{s.title}</div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, marginTop: 6 }}>
                {words(s.passage).length} words · {s.map.ideas.length} key ideas · development map
              </div>
            </button>
          ))}
        </div>
        <div style={{ ...{ marginTop: 16, padding: 16 },  background: C.card, border: `1px solid ${C.line}`, borderRadius: 4 }}>
          <div style={{ fontFamily: F.ui, fontSize: 14, color: C.ink }}>
            <strong>{sample.title}</strong>, {sample.label.toLowerCase()} · map: {mapSource === "model_generated" ? "generated by the model" : "hand-written development map"} ·{" "}
            {mapCheck.ok ? <span style={{ color: C.teal }}>passes the map checks</span> : <span style={{ color: C.brick }}>fails the map checks</span>}
          </div>
          {!mapCheck.ok && <div style={{ fontFamily: F.mono, fontSize: 11, color: C.brick, marginTop: 6 }}>{mapCheck.problems.join(" · ")}</div>}
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Btn onClick={start} disabled={!mapCheck.ok || !!busy}>
              Start as a learner
            </Btn>
            <Btn kind="secondary" onClick={generateMap} disabled={!!busy}>
              Build a new map with the model (development)
            </Btn>
            {mapSource === "model_generated" && (
              <Btn kind="quiet" onClick={() => pickSample(sample.id)}>
                Back to the hand-written map
              </Btn>
            )}
          </div>
          {gen && (
            <div style={{ ...{ marginTop: 12 },  fontFamily: F.ui, fontSize: 13, color: C.ink }}>
              {gen.note ? (
                gen.note
              ) : (
                <>
                  Model map: type <strong>{gen.map.passage_type || "?"}</strong> · {gen.map.ideas.length} ideas ·{" "}
                  {gen.check.ok ? <span style={{ color: C.teal }}>passes the checks</span> : <span style={{ color: C.brick }}>fails {gen.check.problems.length} check(s)</span>} ·{" "}
                  {gen.meta?.output_tokens} tokens · {(gen.meta?.latency_ms / 1000).toFixed(0)} s
                  {!gen.check.ok && <div style={{ fontFamily: F.mono, fontSize: 11, color: C.brick, marginTop: 4 }}>{gen.check.problems.join(" · ")}</div>}
                  {gen.audit.changes.length > 0 && <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, marginTop: 4 }}>Code changes: {gen.audit.changes.join(" · ")}</div>}
                  <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                    <Btn
                      small
                      disabled={!gen.check.ok}
                      onClick={() => {
                        setMap(gen.map);
                        setMapSource("model_generated");
                      }}
                    >
                      Use this map
                    </Btn>
                    <span style={{ color: C.slate }}>The full map is in the Inspector.</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  } else {
    const right =
      stage === "guided" ? (
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
            Guided questions · part {Math.max(1, partNo)} of {order.length} · turn {sess.turns + 1} of {sess.cfg.maxTurns}
          </div>
          {ack && <div style={{ fontFamily: F.ui, fontSize: 14, color: C.teal, marginTop: 10 }}>{ack}</div>}
          {PROMPT_LINE[pending.move] && <div style={{ fontFamily: F.ui, fontSize: 14, color: C.slate, marginTop: 10 }}>{PROMPT_LINE[pending.move]}</div>}
          <div style={{ fontFamily: F.read, fontSize: 21, color: C.ink, marginTop: 8, lineHeight: 1.35 }}>
            {pending.move === "cap_show_evidence" ? map.ideas.find((i) => i.id === pending.idea).questions.opening : questionText(map, pending)}
          </div>
          <textarea
            aria-label="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && submit()}
            placeholder="A short answer in your own words. English, Chinese or a mix is fine."
            rows={4}
            style={{ width: "100%", marginTop: 12, padding: 10, fontFamily: F.ui, fontSize: 15, border: `1px solid ${C.line}`, borderRadius: 3, resize: "vertical" }}
          />
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <Btn onClick={submit} disabled={!!busy}>
              Submit
            </Btn>
            <Btn kind="quiet" onClick={goToSummary} disabled={!!busy}>
              Go to my summary
            </Btn>
            <span style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>Ctrl+Enter to submit</span>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>{stage === "done" ? "Finished" : drafts.length ? "Revise your summary" : "Your summary"}</div>
          <div style={{ fontFamily: F.ui, fontSize: 15, color: C.ink, marginTop: 8, lineHeight: 1.5 }}>{SUMMARY_TASK[map.passage_type]}</div>
          <div style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, marginTop: 4 }}>Aim for about {sess.cfg.summaryWordTarget.join("–")} words. This is a guide, not a rule.</div>

          {lastDraft && (
            <div style={{ ...{ marginTop: 16, padding: 12 },  background: C.paper, border: `1px solid ${C.line}`, borderRadius: 3 }}>
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>
                Draft {lastDraft.draft} (saved, read-only) · {lastDraft.feedback.length_note}
              </div>
              <div style={{ fontFamily: F.read, fontSize: 15, color: C.ink, marginTop: 6, whiteSpace: "pre-wrap" }}>{lastDraft.text}</div>
              <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.ink, marginTop: 10 }}>Feedback</div>
              {lastDraft.feedback.points.length === 0 ? (
                <div style={{ fontFamily: F.ui, fontSize: 14, color: C.teal, marginTop: 4 }}>Your summary covers the key ideas the text sets out.</div>
              ) : (
                <ol style={{ margin: "6px 0 0 18px", fontFamily: F.ui, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                  {lastDraft.feedback.points.map((p, k) => (
                    <li key={k} style={{ marginBottom: 6 }}>
                      {p.text}{" "}
                      {p.block != null && (
                        <Btn kind="quiet" onClick={() => setHl({ light: new Set(), strong: new Set([p.block]) })}>
                          Show where
                        </Btn>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {stage === "summary" && (
            <>
              {!showLabels ? (
                <div style={{ marginTop: 12 }}>
                  <Btn kind="quiet" onClick={openLabels}>
                    Optional: show the topics to cover
                  </Btn>
                </div>
              ) : (
                <div style={{ ...{ marginTop: 12 },  fontFamily: F.ui, fontSize: 13, color: C.slate }}>
                  Topics: {orderIdeas(map).map((i) => i.topic_label).join(" · ")}
                </div>
              )}
              <textarea
                aria-label="Your summary"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={9}
                placeholder={drafts.length ? "Revise your summary here. Draft 1 above stays as it was." : "Write your summary in your own words."}
                style={{ width: "100%", marginTop: 10, padding: 10, fontFamily: F.read, fontSize: 16, lineHeight: 1.5, border: `1px solid ${C.line}`, borderRadius: 3, resize: "vertical" }}
              />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Btn onClick={submitSummary} disabled={!!busy || !draft.trim()}>
                  {drafts.length ? "Submit my revision" : "Submit my summary"}
                </Btn>
                <span style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>{words(draft).length} words</span>
              </div>
            </>
          )}

          {stage === "done" && (
            <div style={{ marginTop: 16 }}>
              <Banner tone="ok">Both drafts are saved. The Inspector shows how each answer and summary was judged.</Banner>
              <div style={{ marginTop: 12 }}>
                <Btn
                  kind="secondary"
                  onClick={() => {
                    setStage("setup");
                    setSess(null);
                    setRec(null);
                    setHl(null);
                  }}
                >
                  Try another passage
                </Btn>
              </div>
            </div>
          )}
        </div>
      );

    main = (
      <div style={{ ...{ maxWidth: 1152, margin: '0 auto', padding: '20px 16px', display: 'grid', gap: 24 },  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: "16px 12px", maxHeight: "80vh", overflowY: "auto" }}>
          <Passage passage={sample.passage} hl={hl} />
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: 18, position: "sticky", top: 12 }}>{right}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper }}>
      {header}
      {banners}
      {main}
      {inspect && <LabInspector rec={rec} sess={sess} map={map} gen={gen} sample={sample} mapCheck={mapCheck} onClose={() => setInspect(false)} />}
    </div>
  );
}
