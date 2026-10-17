/* AGS Testing Lab — Researcher Inspector (developer view; reveals hidden ideas). */
import React, { useState } from "react";
import { orderIdeas, isRelational, sessionOutcomes } from "../ags.js";
import { loadLabLog, download, turnsCSV, ideaEvidence } from "./engine.js";
import { C, F } from "./theme.js";

const Section = ({ title, children, open: o = false }) => {
  const [open, setOpen] = useState(o);
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 0" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: C.ink, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
};
const Row = ({ k, v, mono }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, lineHeight: 1.45 }}>
    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, minWidth: 128, flexShrink: 0 }}>{k}</span>
    <span style={{ fontFamily: mono ? F.mono : F.ui, wordBreak: "break-word", color: C.ink }}>{v === "" || v == null ? "–" : v}</span>
  </div>
);
const Pre = ({ children }) => (
  <pre style={{ fontFamily: F.mono, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.paper, border: `1px solid ${C.line}`, padding: 8, maxHeight: 260, overflow: "auto", margin: "4px 0" }}>{children}</pre>
);
const Tag = ({ children, tone }) => (
  <span style={{ fontFamily: F.mono, fontSize: 10.5, padding: "1px 6px", borderRadius: 3, marginRight: 4, background: tone === "good" ? C.tealSoft : tone === "bad" ? C.brickSoft : tone === "warn" ? C.amberSoft : C.paper, color: tone === "good" ? C.teal : tone === "bad" ? C.brick : tone === "warn" ? C.amber : C.slate }}>
    {children}
  </span>
);
const toneOf = (c) => (c === "correct" || c === "alternative_supported" ? "good" : c === "partial" || c === "alternative_uncertain" ? "warn" : "bad");

function MapView({ map, passage }) {
  return orderIdeas(map).map((i) => {
    const ev = ideaEvidence(i, passage);
    return (
      <div key={i.id} style={{ border: `1px solid ${C.line}`, borderRadius: 3, padding: 8, marginBottom: 6, background: C.card }}>
        <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700 }}>
          {i.id} · {i.role} · <span style={{ fontWeight: 400, color: C.slate }}>topic: {i.topic_label}</span>
        </div>
        <Row k="statement (hidden)" v={i.statement} />
        <Row k="elements" v={i.elements.map((e) => `${e.id}: ${e.label}`).join(" · ")} />
        {isRelational(i) && <Row k="relation" v={`${i.relation.type}: ${i.relation.from} → ${i.relation.to}. ${i.relation.direction}`} />}
        <Row k="evidence" v={i.evidence.map((e) => `"${e.quote}"`).join(" · ") + `  (found: ${ev.length}/${i.evidence.length}, blocks ${ev.map((x) => x.paragraph).join(", ")})`} />
        <Row k="opening" v={i.questions.opening} />
        <Row k="focus" v={Object.entries(i.questions.focus || {}).map(([k, q]) => `${k}: ${q}`).join(" · ")} />
        {i.questions.link && <Row k="link" v={i.questions.link} />}
        {i.questions.clarify && <Row k="clarify" v={i.questions.clarify} />}
      </div>
    );
  });
}

function Turn({ t }) {
  const [open, setOpen] = useState(false);
  const c = t.classification || {};
  const n = t.normalised || {};
  const v = n.verdict || {};
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 3, padding: 8, marginBottom: 6, background: C.card }}>
      <button onClick={() => setOpen((x) => !x)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%" }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
          turn {t.turn} · {t.idea_id} · {t.question_asked?.move}
          {t.attempt ? ` · attempt ${t.attempt}` : ""}
          {t.restatement ? " · restatement" : ""}
        </div>
        <div style={{ fontFamily: F.ui, fontSize: 13, color: C.ink, margin: "2px 0" }}>“{t.answer || "(blank)"}”</div>
        <Tag tone={toneOf(c.classification)}>{c.classification}</Tag>
        {t.outcome && <Tag tone={/not_/.test(t.outcome) ? "bad" : "good"}>{t.outcome}</Tag>}
        {(c.expression_flags || []).map((f) => (
          <Tag key={f}>{f}</Tag>
        ))}
        {c.needs_review && <Tag tone="warn">needs review</Tag>}
        {(n.audit?.downgrades || []).length > 0 && <Tag tone="warn">{n.audit.downgrades.length} code downgrade(s)</Tag>}
        <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.mute }}>→ {t.next?.move}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <Row k="question shown" v={t.question_shown} />
          <Row k="asked the model" v={t.verdict_question} />
          <div style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, marginTop: 6 }}>1 · Model verdict (after code checks)</div>
          <Row k="elements" v={Object.entries(v.elements || {}).map(([k, s]) => `${k}:${s}${n.learner_spans?.[k] ? ` ("${n.learner_spans[k]}")` : ""}`).join("  ")} />
          <Row k="relation" v={v.relation_expressed || "n/a"} />
          <Row k="alternative" v={`${v.alternative?.judgement}${v.alternative?.quote ? ` · quote: "${v.alternative.quote}"` : ""}`} />
          {v.interpretation && <Row k="interpretation" v={`${v.interpretation.judgement}${v.interpretation.learner_span ? ` ("${v.interpretation.learner_span}")` : ""}`} />}
          <Row k="flags" v={[v.no_attempt && "no_attempt", v.contradicts_text && "contradicts_text", v.misreading && "misreading", v.expression?.unclear && "unclear"].filter(Boolean).join(" ") || "none"} />
          <Row k="language" v={n.answer_language} />
          <Row k="model's reason" v={n.reason} />
          <Row k="code downgrades" v={(n.audit?.downgrades || []).join(" | ") || "none"} />
          <Row k="invalid fields" v={(n.audit?.invalid_fields || []).join(" ") || "none"} />
          <div style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, marginTop: 6 }}>2 · Rules (code)</div>
          <Row k="classification" v={c.classification} />
          <Row k="rule path" v={(c.rule_path || []).join(" → ")} mono />
          <Row k="missing elements" v={(c.missing_elements || []).join(" ")} />
          <Row k="errors" v={(c.comprehension_errors || []).join(" ") || "none"} />
          <Row k="quote check" v={c.quote_check ? `${c.quote_check.found ? "found" : "NOT found"} (block ${c.quote_check.paragraph ?? "–"})` : "–"} />
          <Row k="copy rate" v={c.copy_rate} />
          <Row k="next move" v={`${t.next?.move}${t.next?.element ? " " + t.next.element : ""}${t.next?.pointer ? " (" + t.next.pointer + ")" : ""}`} />
          <Row k="support level" v={t.support_level} />
          <div style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 700, marginTop: 6 }}>3 · Call</div>
          <Row k="mode" v={t.mode + (t.model_called ? "" : " (blank answer: no call)")} />
          <Row k="tokens / time" v={t.meta?.mock ? "mock" : `${t.meta?.output_tokens ?? "?"} of ${t.meta?.num_predict ?? "?"} · ${t.meta?.latency_ms ? (t.meta.latency_ms / 1000).toFixed(1) + " s" : "?"} · ${t.meta?.done_reason ?? ""}`} mono />
          <Row k="prompt hash" v={t.prompt_hash} mono />
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate, marginTop: 4 }}>raw reply</div>
          <Pre>{t.raw_reply || "(none)"}</Pre>
        </div>
      )}
    </div>
  );
}

export default function LabInspector({ rec, sess, map, gen, sample, mapCheck, onClose }) {
  const outcomes = sess ? sessionOutcomes(sess) : [];
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)", background: C.paper, borderLeft: `2px solid ${C.ink}`, overflowY: "auto", zIndex: 50, padding: "14px 16px", boxShadow: "-6px 0 18px rgba(0,0,0,0.12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: F.ui, fontSize: 17, fontWeight: 800 }}>Researcher Inspector</div>
        <button onClick={onClose} style={{ fontFamily: F.ui, fontSize: 13, border: `1px solid ${C.ink}`, background: C.card, padding: "4px 10px", borderRadius: 3, cursor: "pointer" }}>
          Close
        </button>
      </div>
      <div style={{ fontFamily: F.ui, fontSize: 12, color: C.brick, margin: "4px 0 8px" }}>Developer view: this panel shows the hidden ideas and every judgement. Close it while answering as a learner.</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "4px 0 10px" }}>
        {rec && (
          <button style={linkBtn} onClick={() => download(`${rec.session_id}.json`, JSON.stringify(rec, null, 2))}>
            Download this session (JSON)
          </button>
        )}
        <button style={linkBtn} onClick={() => download(`ags-lab-log-${stamp}.json`, JSON.stringify(loadLabLog(), null, 2))}>
          All sessions (JSON)
        </button>
        <button style={linkBtn} onClick={() => download(`ags-lab-turns-${stamp}.csv`, turnsCSV(loadLabLog().sessions), "text/csv")}>
          All turns (CSV)
        </button>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.mute }}>{loadLabLog().sessions.length} session(s) saved in this browser</span>
      </div>

      <Section title="Session" open>
        {rec ? (
          <>
            <Row k="session" v={rec.session_id} mono />
            <Row k="passage" v={`${rec.sample_id} · ${rec.passage_title} · ${rec.passage_type}`} />
            <Row k="mode / model" v={`${rec.mode} · ${rec.model_info?.name || ""} ${rec.model_info?.parameter_size || ""} ${rec.model_info?.quantization_level || ""}`} />
            <Row k="versions" v={`${rec.versions.module} · ${rec.versions.rules} · ${Object.values(rec.versions.prompts).join(" · ")} · ${rec.lab_version}`} mono />
            <Row k="map" v={`${rec.map_source} · review: ${rec.map_review_status} · ${rec.map_check.ok ? "checks passed" : "checks failed"}`} />
            <Row k="rules settings" v={`attempts ${rec.rules_config.maxAttemptsPerIdea} · turns ${rec.rules_config.maxTurns} · cross-paragraph ${rec.rules_config.relationCrossParagraph ? "on" : "off"}`} />
            <Row k="events" v={(rec.events || []).map((e) => e.type).join(", ") || "none"} />
          </>
        ) : (
          <div style={{ fontFamily: F.ui, fontSize: 13, color: C.slate }}>No session yet: start one as a learner.</div>
        )}
      </Section>

      <Section title={`Key-idea map: ${sample.id} (${map.passage_type})`}>
        <Row k="map checks" v={mapCheck.ok ? "passed" : mapCheck.problems.join(" · ")} />
        {mapCheck.warnings?.length > 0 && <Row k="warnings" v={mapCheck.warnings.join(" · ")} />}
        <MapView map={map} passage={sample.passage} />
      </Section>

      {gen?.map && (
        <Section title="Model-generated map (last attempt)">
          <Row k="checks" v={gen.check.ok ? "passed" : gen.check.problems.join(" · ")} />
          <Row k="code changes" v={gen.audit.changes.join(" · ") || "none"} />
          <Row k="type reason" v={gen.map.passage_type_reason} />
          <MapView map={gen.map} passage={sample.passage} />
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>raw reply</div>
          <Pre>{gen.raw}</Pre>
        </Section>
      )}

      {sess && (
        <Section title="Progress by idea" open>
          <table style={{ width: "100%", fontFamily: F.ui, fontSize: 12, borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.slate }}>
                <th>idea</th>
                <th>outcome</th>
                <th>support</th>
                <th>attempts</th>
                <th>flags</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o) => (
                <tr key={o.idea_id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td>{o.idea_id}</td>
                  <td>{o.outcome || (sess.pending?.idea === o.idea_id ? "in progress" : "–")}</td>
                  <td>{o.support_level ?? "–"}</td>
                  <td>{o.attempts}</td>
                  <td>
                    {o.needs_review ? "review " : ""}
                    {o.expression_flags.join(" ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontFamily: F.mono, fontSize: 10.5, color: C.mute, marginTop: 4 }}>support: 0 none · 1 focused question · 2 pointer · 3 evidence shown</div>
          {sess.final_main_reask && <Row k="final re-ask" v={sess.final_main_reask.classification} />}
        </Section>
      )}

      {rec?.turns?.length > 0 && (
        <Section title={`Turns (${rec.turns.length}): how each answer was judged`} open>
          {rec.turns.map((t) => (
            <Turn key={t.turn} t={t} />
          ))}
        </Section>
      )}

      {rec?.summary?.drafts?.length > 0 && (
        <Section title="Summary drafts" open>
          {rec.summary.drafts.map((d) => (
            <div key={d.draft} style={{ border: `1px solid ${C.line}`, borderRadius: 3, padding: 8, marginBottom: 6, background: C.card }}>
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>
                draft {d.draft} · {d.words} words · copy rate {d.feedback.copy_rate} · topic labels {d.topic_labels_opened ? "opened" : "not opened"} · {d.mode}
              </div>
              {Object.entries(d.assessment.ideas).map(([id, x]) => (
                <Row key={id} k={id} v={`${x.status}${x.learner_span ? ` ("${x.learner_span}")` : ""}${d.assessment.relations[id] ? ` · relation ${d.assessment.relations[id].status}` : ""}`} />
              ))}
              {d.assessment.interpretation && <Row k="interpretation" v={`${d.assessment.interpretation.judgement}${d.assessment.interpretation.learner_span ? ` ("${d.assessment.interpretation.learner_span}")` : ""}`} />}
              <Row k="unsupported" v={d.assessment.unsupported_claims.join(" | ") || "none"} />
              <Row k="model's reason" v={d.assessment.reason} />
              <Row k="code downgrades" v={d.assessment.audit.downgrades.join(" | ") || "none"} />
              <Row k="feedback shown" v={d.feedback.points.map((p) => `[${p.type}] ${p.text}`).join(" · ") || "none"} />
              <Row k="not shown (cap 3)" v={d.feedback.all_points.slice(3).map((p) => p.type).join(", ") || "none"} />
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.slate }}>raw reply</div>
              <Pre>{d.raw_reply}</Pre>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

const linkBtn = { fontFamily: F.ui, fontSize: 12.5, color: C.slate, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer" };
