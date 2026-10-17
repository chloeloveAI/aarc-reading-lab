/* ------------------------------------------------------------------ *
 * Inspector.jsx — developer view of the research log (v10.3).
 * Read-only over generated data; the only thing it can write is an
 * append-only researcher annotation. Never shown to blind raters.
 *
 * Keeps three things visibly apart:
 *   1. rule-based decision (structural + surface-content checks)
 *   2. shadow meaning check (same model, non-blocking, diagnostic)
 *   3. researcher annotations (developer labels, not ratings)
 * ------------------------------------------------------------------ */
import React, { useMemo, useState } from "react";
import { loadLog, logAnnotation, ANNOTATION_TAGS, STRUCTURAL_CHECKS, SURFACE_CONTENT_CHECKS, exportCallsCSV } from "./research";

const C = {
  ink: "#16202B",
  slate: "#5A6B7B",
  mute: "#8496A4",
  line: "#D3DBE0",
  card: "#FFFFFF",
  paper: "#F4F6F7",
  teal: "#1F6F6A",
  tealSoft: "#DDEDEB",
  amberSoft: "#FDF3DC",
  brick: "#A8402B",
  brickSoft: "#F8E5E0",
};
const F = {
  ui: "'Public Sans', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};
const L = ["A", "B", "C", "D"];
const loc = (l) => (l ? `section ${l.section ?? "?"}, paragraph ${l.para ?? "?"}` : "not found in the text");
const yn = (v) => (v === true ? "yes" : v === false ? "no" : "–");

function Box({ title, note, tone = "plain", children }) {
  const bg = tone === "rule" ? C.paper : tone === "shadow" ? C.amberSoft : tone === "dev" ? C.tealSoft : C.card;
  return (
    <div className="mt-3 px-3 py-2" style={{ background: bg, border: `1px solid ${C.line}`, borderRadius: 2 }}>
      <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.slate }}>{title}</div>
      {note && <div style={{ fontFamily: F.ui, fontSize: 11, color: C.mute, marginTop: 2 }}>{note}</div>}
      <div className="mt-1" style={{ fontFamily: F.ui, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex gap-2" style={{ alignItems: "baseline" }}>
      <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, minWidth: 150 }}>{k}</span>
      <span style={{ fontFamily: mono ? F.mono : F.ui, fontSize: mono ? 12 : 13, wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

function Shadow({ d, process }) {
  if (process !== 3 && process !== 4) return null;
  const title = `Shadow meaning check — process ${process} (${d?.check_version || "not run"})`;
  const note = "Semantic diagnostic by the same model at temperature 0. Non-blocking: it did not affect acceptance.";
  if (!d) return <Box title={title} note={note} tone="shadow">Not run for this candidate (runs after the whole set is generated; older runs had no process-4 check).</Box>;
  if (d.status !== "ok") return <Box title={title} note={note} tone="shadow">Error: {d.error}</Box>;
  const r = d.result || {};
  return (
    <Box title={title} note={note} tone="shadow">
      {process === 3 ? (
        <>
          <Row k="requires integration" v={yn(r.requires_integration)} />
          <Row k="spans coherent" v={yn(r.spans_coherent)} />
          <Row k="1-sentence answerable" v={yn(r.single_sentence_answerable)} />
          {r.single_sentence_quote && <Row k="that sentence" v={r.single_sentence_quote} />}
          <Row k="unsupported inference" v={yn(r.unsupported_inference)} />
        </>
      ) : (
        <>
          <Row k="applies a criterion" v={yn(r.applies_evaluative_criterion)} />
          <Row k="criterion" v={r.criterion || "–"} />
          <Row k="answer stated in text" v={yn(r.answer_stated_in_text)} />
          {r.stated_quote && <Row k="stated where" v={r.stated_quote} />}
          <Row k="superficial wording" v={yn(r.superficial_evaluative_wording)} />
        </>
      )}
      <Row k="reason" v={r.reason || "–"} />
    </Box>
  );
}

function Annotate({ cid, list, onSaved }) {
  const [tag, setTag] = useState("real_failure_case");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const save = () => {
    const ok = logAnnotation({ candidate_id: cid, tag, note: note.trim() });
    setMsg(ok === false ? "Not saved — storage full." : "Saved.");
    if (ok !== false) {
      setNote("");
      onSaved();
    }
  };
  return (
    <Box title="Researcher annotation (developer only)" note="Append-only. Exported with the log; never shown to blind raters. Not a rating." tone="dev">
      {list.map((a) => (
        <div key={a.annotation_id} style={{ fontSize: 12 }}>
          <strong>{ANNOTATION_TAGS[a.tag] || a.tag}</strong> · {a.at.slice(0, 16).replace("T", " ")}
          {a.note ? ` — ${a.note}` : ""}
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2 items-center">
        <select className="ql-focus" value={tag} onChange={(e) => setTag(e.target.value)} style={{ fontFamily: F.ui, fontSize: 12, padding: "4px 6px", border: `1px solid ${C.line}` }}>
          {Object.entries(ANNOTATION_TAGS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="ql-focus"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (e.g. closer to process 2: local inference)"
          aria-label="Annotation note"
          style={{ flex: "1 1 220px", fontFamily: F.ui, fontSize: 12, padding: "4px 8px", border: `1px solid ${C.line}` }}
        />
        <button onClick={save} className="ql-focus px-3 py-1" style={{ background: C.ink, color: C.card, fontFamily: F.ui, fontSize: 12, fontWeight: 700, borderRadius: 2 }}>
          Add
        </button>
        {msg && <span style={{ fontSize: 12, color: C.slate }}>{msg}</span>}
      </div>
    </Box>
  );
}

function Candidate({ c, call, diag, notes, onSaved }) {
  const [open, setOpen] = useState(false);
  const it = c.item;
  const failedS = STRUCTURAL_CHECKS.filter((k) => c.checks?.[k] === false);
  const failedC = SURFACE_CONTENT_CHECKS.filter((k) => c.checks?.[k] === false);
  const m = call?.meta || {};
  return (
    <div className="mt-3 px-4 py-3" style={{ background: C.card, border: `1px solid ${c.accepted ? C.line : C.brick}`, borderRadius: 2 }}>
      <button onClick={() => setOpen((v) => !v)} className="ql-focus text-left w-full">
        <div style={{ fontFamily: F.mono, fontSize: 11, color: c.accepted ? C.teal : C.brick }}>
          P{c.intended_process} · {c.accepted ? "ACCEPTED" : "REJECTED (" + (c.stage_rejected || "?") + ")"} · {c.candidate_id}
          {notes.length ? " · ⚑ " + [...new Set(notes.map((a) => ANNOTATION_TAGS[a.tag] || a.tag))].join(", ") : ""}
        </div>
        <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 2 }}>{it?.stem || String(c.raw?.stem || "(no parsable item)")}</div>
      </button>
      {open && (
        <div>
          {it && (
            <Box title="Item">
              {it.options.map((o, i) => (
                <div key={i} style={{ fontWeight: o.correct ? 700 : 400 }}>
                  {L[i]}. {o.text} {o.correct ? " ← keyed" : ""}
                  <div style={{ fontSize: 12, color: C.slate, fontWeight: 400 }}>why: {o.why}</div>
                </div>
              ))}
              <Row k="skill" v={it.skill || "–"} />
              <Row k="hint" v={it.hint || "–"} />
            </Box>
          )}
          {it && (
            <Box title="Evidence">
              <Row k="anchor" v={it.anchor || "–"} />
              <Row k="anchor location" v={loc(c.anchor_loc) + ` (match: ${c.anchor_match || "–"})`} />
              {c.intended_process === 3 && (
                <>
                  <Row k="anchor2" v={it.anchor2 || "–"} />
                  <Row k="anchor2 location" v={loc(c.anchor2_loc)} />
                  <Row k="link" v={it.link || "–"} />
                </>
              )}
            </Box>
          )}
          <Box title="Rule-based decision (validator)" note="Structural and surface checks only. They do not judge whether the item measures the intended process." tone="rule">
            <Row k="decision" v={c.accepted ? "accepted" : "rejected"} />
            <Row k="failed structural" v={failedS.join(", ") || "none"} mono />
            <Row k="failed surface-content" v={failedC.join(", ") || "none"} mono />
            <Row k="reasons" v={(c.reasons || []).join(" | ") || "–"} />
          </Box>
          <Shadow d={diag} process={c.intended_process} />
          <Box title="Model call" tone="rule">
            <Row k="call" v={`${c.call_id} · pass ${call?.pass_mode || "?"}`} mono />
            <Row k="tokens" v={`${m.output_tokens ?? "?"} of num_predict ${m.num_predict ?? call?.max_tokens ?? "?"} · done_reason ${m.done_reason ?? "?"}`} mono />
            <Row k="thinking" v={`sent ${m.think_sent == null ? "(not recorded before v10.3)" : m.think_sent ? "on" : "off"} · reasoning ${m.thinking_chars ?? "?"} chars`} mono />
            <Row k="latency" v={call?.latency_ms != null ? (call.latency_ms / 1000).toFixed(1) + " s" : "?"} mono />
          </Box>
          <Annotate cid={c.candidate_id} list={notes} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

function FailedCall({ c }) {
  const [open, setOpen] = useState(false);
  const m = c.meta || {};
  return (
    <div className="mt-2 px-3 py-2" style={{ background: C.brickSoft, border: `1px solid ${C.brick}`, borderRadius: 2 }}>
      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.brick }}>
        P{c.intended_process} · {c.call_id} · pass {c.pass_mode} · {c.error_kind || "unclassified (pre-v10.3)"}
      </div>
      <div style={{ fontFamily: F.ui, fontSize: 13, color: C.ink }}>{c.error}</div>
      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
        done_reason {String(m.done_reason ?? "?")} · eval_count {String(m.output_tokens ?? "?")} / num_predict {String(m.num_predict ?? c.max_tokens ?? "?")} · think sent{" "}
        {m.think_sent == null ? "?" : m.think_sent ? "on" : "off"} · answer {String(m.content_chars ?? (c.raw_reply || "").length)} chars · reasoning {String(m.thinking_chars ?? "?")} chars
      </div>
      <button onClick={() => setOpen((v) => !v)} className="ql-focus" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, textDecoration: "underline" }}>
        {open ? "Hide" : "Show"} stored output
      </button>
      {open && (
        <pre style={{ fontFamily: F.mono, fontSize: 11, whiteSpace: "pre-wrap", background: C.card, padding: 8, maxHeight: 360, overflow: "auto" }}>
          {c.raw_reply || "(empty)"}
          {c.thinking_reply ? "\n\n--- reasoning ---\n" + c.thinking_reply : ""}
          {!c.error_kind ? "\n\n[Before v10.3, a failed call could store the PREVIOUS call's reply here. Treat this text as unverified.]" : ""}
        </pre>
      )}
    </div>
  );
}

export default function Inspector({ onClose }) {
  const [tick, setTick] = useState(0);
  const log = useMemo(() => loadLog(), [tick]);
  const runs = [...log.runs].reverse();
  const [runId, setRunId] = useState(runs[0]?.run_id || "");
  const [proc, setProc] = useState("all");
  const [status, setStatus] = useState("all");
  const run = log.runs.find((r) => r.run_id === runId);
  const calls = Object.fromEntries(log.calls.map((c) => [c.call_id, c]));
  const diags = {};
  (log.diagnostics || []).forEach((d) => (diags[d.candidate_id] = d));
  const ann = {};
  (log.annotations || []).forEach((a) => (ann[a.candidate_id] = ann[a.candidate_id] || []).push(a));
  const cands = log.candidates.filter(
    (c) => c.run_id === runId && (proc === "all" || String(c.intended_process) === proc) && (status === "all" || (status === "rejected" ? !c.accepted : c.accepted))
  );
  const failedCalls = log.calls.filter((c) => c.run_id === runId && !c.ok && (proc === "all" || String(c.intended_process) === proc));
  const sel = { fontFamily: F.ui, fontSize: 13, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 2, background: C.card };
  const mi = run?.settings?.model_info;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "rgba(22,32,43,0.45)" }}>
      <div className="max-w-4xl mx-auto my-6 px-5 py-5" style={{ background: C.paper, borderRadius: 2 }}>
        <div className="flex items-center justify-between gap-3">
          <div style={{ fontFamily: F.ui, fontSize: 20, fontWeight: 700, color: C.ink }}>Inspect candidates</div>
          <button onClick={onClose} className="ql-focus px-3 py-2" style={{ border: `1px solid ${C.ink}`, borderRadius: 2, fontFamily: F.ui, fontSize: 13 }}>
            Close
          </button>
        </div>
        <p style={{ fontFamily: F.ui, fontSize: 12, color: C.slate, marginTop: 4 }}>
          Developer view. Do not show this screen to the blind raters: it reveals the intended process, the validator decision and the shadow checks.
        </p>
        {!runs.length ? (
          <p className="mt-4">No runs in the research log yet.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <select style={sel} value={runId} onChange={(e) => setRunId(e.target.value)} aria-label="Run">
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.started_at?.slice(0, 16).replace("T", " ")} · {r.settings?.model} · {r.prompt_version} · {(log.passages[r.passage_id]?.title || "").slice(0, 30)}
                  </option>
                ))}
              </select>
              <select style={sel} value={proc} onChange={(e) => setProc(e.target.value)} aria-label="Process">
                <option value="all">All processes</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={String(n)}>
                    Process {n}
                  </option>
                ))}
              </select>
              <select style={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="all">Accepted and rejected</option>
                <option value="rejected">Rejected only</option>
                <option value="accepted">Accepted only</option>
              </select>
              <button onClick={exportCallsCSV} className="ql-focus" style={{ fontFamily: F.ui, fontSize: 13, color: C.slate, textDecoration: "underline" }}>
                Model calls (CSV)
              </button>
            </div>
            {run && (
              <div className="mt-2" style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
                {run.run_id} · {run.prompt_version} / {run.validator_version} · {mi ? `${mi.name} ${mi.parameter_size || ""} ${mi.quantization_level || ""}` : run.settings?.model} · temp{" "}
                {run.settings?.temperature} · think {run.settings?.think ? "on" : "off"} · requested {(run.requested || []).join("/")}
              </div>
            )}
            {failedCalls.length > 0 && (
              <div className="mt-4">
                <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}>Failed model calls ({failedCalls.length}): no candidate was produced</div>
                {failedCalls.map((c) => (
                  <FailedCall key={c.call_id} c={c} />
                ))}
              </div>
            )}
            <div className="mt-4" style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}>
              Candidates ({cands.length})
            </div>
            {cands.map((c) => (
              <Candidate key={c.candidate_id} c={c} call={calls[c.call_id]} diag={diags[c.candidate_id]} notes={ann[c.candidate_id] || []} onSaved={() => setTick((t) => t + 1)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
