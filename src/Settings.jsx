import React, { useState, useEffect } from "react";
import { loadConfig, saveConfig, listOllamaModels, testConnection, modelInfo, DEFAULT_CONFIG } from "./llm";
import { LEARNER_PRESETS, learnerText } from "./prompts";
import { loadExemplars, saveExemplars, checkExemplars } from "./research";

const C = {
  ink: "#16202B",
  slate: "#5A6B7B",
  mute: "#8496A4",
  line: "#D3DBE0",
  paper: "#E9EDEF",
  card: "#FFFFFF",
  teal: "#1F6F6A",
  amberSoft: "#FDF3DC",
  brick: "#A8402B",
  brickSoft: "#F8E5E0",
};
const F = {
  read: "'Newsreader', Georgia, serif",
  ui: "'Public Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

const PROVIDERS = [
  { key: "ollama", label: "Local (Ollama)", note: "Your desktop. No key, no cost, nothing leaves the machine." },
  { key: "cloud", label: "Cloud (OpenRouter)", note: "Hosted model through this site's server. Needs only an access code." },
  { key: "openai", label: "OpenAI-compatible", note: "Groq, Together, OpenRouter, LM Studio, vLLM." },
  { key: "anthropic", label: "Anthropic", note: "Claude, straight from the browser." },
];

export default function Settings({ onClose, onSaved }) {
  const [cfg, setCfg] = useState(loadConfig);
  const [models, setModels] = useState([]);
  const [state, setState] = useState({ kind: "idle", msg: "" });
  const [exemplars, setExemplars] = useState(loadExemplars);
  const [exMsg, setExMsg] = useState("");

  const importExemplars = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const { ok, problems } = checkExemplars(data);
      if (!ok.length) return setExMsg("Nothing imported. " + problems.join(" "));
      /* replaces the library; ids already present are overwritten by the file */
      saveExemplars(ok);
      setExemplars(ok);
      const usable = ok.filter((e) => e.permission_confirmed).length;
      setExMsg(`Imported ${ok.length}; ${usable} have permission confirmed and will be used.` + (problems.length ? " Skipped: " + problems.join(" ") : ""));
    } catch (e) {
      setExMsg("That file isn't valid JSON.");
    }
  };

  const refreshModels = async (baseUrl) => {
    try {
      setModels(await listOllamaModels(baseUrl || cfg.ollama.baseUrl));
    } catch (e) {
      setModels([]);
    }
  };

  useEffect(() => {
    if (cfg.provider === "ollama") refreshModels(cfg.ollama.baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.provider]);

  const set = (path, value) =>
    setCfg((c) =>
      path.includes(".")
        ? { ...c, [path.split(".")[0]]: { ...c[path.split(".")[0]], [path.split(".")[1]]: value } }
        : { ...c, [path]: value }
    );

  const test = async () => {
    setState({ kind: "busy", msg: "Sending a test prompt…" });
    try {
      await testConnection(cfg);
      let extra = "";
      if (cfg.provider === "ollama") {
        const m = await modelInfo(cfg);
        extra =
          ` Model: ${m.name} · ${m.parameter_size || "?"} · ${m.quantization_level || "?"} · build ${(m.digest || "?").slice(0, 12)}` +
          ` · Ollama ${m.ollama_version || "?"}. This is recorded with every run.`;
      }
      setState({ kind: "ok", msg: "Connected, and the model returns clean JSON." + extra });
    } catch (e) {
      setState({ kind: "bad", msg: e.message });
    }
  };

  const save = () => {
    saveConfig(cfg);
    onSaved && onSaved(cfg);
    onClose();
  };

  const field = {
    fontFamily: F.mono,
    fontSize: 13,
    color: C.ink,
    background: C.card,
    border: `1px solid ${C.line}`,
    borderRadius: 2,
    padding: "9px 11px",
    width: "100%",
  };
  const label = { fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 5 };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(22,32,43,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl"
        style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 flex items-baseline justify-between" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h2 style={{ fontFamily: F.read, fontSize: 24, fontWeight: 600, color: C.ink }}>Which model writes the questions</h2>
          <button onClick={onClose} className="ql-focus" style={{ fontFamily: F.mono, fontSize: 12, color: C.slate }}>
            Close
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="space-y-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.key}
                onClick={() => set("provider", p.key)}
                className="ql-focus w-full text-left px-4 py-3 flex gap-3 items-start"
                style={{
                  background: cfg.provider === p.key ? C.card : "transparent",
                  border: `1px solid ${cfg.provider === p.key ? C.teal : C.line}`,
                  borderRadius: 2,
                }}
              >
                <span
                  className="shrink-0"
                  style={{
                    width: 14,
                    height: 14,
                    marginTop: 3,
                    borderRadius: 999,
                    border: `1.5px solid ${cfg.provider === p.key ? C.teal : C.line}`,
                    background: cfg.provider === p.key ? C.teal : "transparent",
                  }}
                />
                <span>
                  <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: C.ink, display: "block" }}>
                    {p.label}
                  </span>
                  <span style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>{p.note}</span>
                </span>
              </button>
            ))}
          </div>

          {cfg.provider === "ollama" && (
            <div className="space-y-4">
              <div>
                <label style={label}>Ollama address</label>
                <input
                  className="ql-focus"
                  style={field}
                  value={cfg.ollama.baseUrl}
                  onChange={(e) => set("ollama.baseUrl", e.target.value)}
                  onBlur={(e) => refreshModels(e.target.value)}
                />
              </div>
              <div>
                <label style={label}>Model</label>
                {models.length > 0 ? (
                  <select
                    className="ql-focus"
                    style={field}
                    value={cfg.ollama.model}
                    onChange={(e) => set("ollama.model", e.target.value)}
                  >
                    {!models.includes(cfg.ollama.model) && <option value={cfg.ollama.model}>{cfg.ollama.model}</option>}
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      className="ql-focus"
                      style={field}
                      value={cfg.ollama.model}
                      onChange={(e) => set("ollama.model", e.target.value)}
                      placeholder="gemma4:12b"
                    />
                    <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>
                      Couldn't read your installed models. Run <span style={{ fontFamily: F.mono }}>ollama list</span> and
                      type the tag exactly as it appears.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {cfg.provider === "cloud" && (
            <div className="space-y-4">
              <div>
                <label style={label}>Access code</label>
                <input
                  className="ql-focus"
                  style={field}
                  type="password"
                  autoComplete="off"
                  value={cfg.cloud.accessCode}
                  onChange={(e) => set("cloud.accessCode", e.target.value)}
                />
                <p className="mt-2" style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>
                  Saved in this browser. The OpenRouter key and model are kept on the server and never sent here.
                </p>
              </div>
            </div>
          )}

          {cfg.provider === "openai" && (
            <div className="space-y-4">
              <div>
                <label style={label}>Base URL</label>
                <input
                  className="ql-focus"
                  style={field}
                  value={cfg.openai.baseUrl}
                  onChange={(e) => set("openai.baseUrl", e.target.value)}
                  placeholder="https://api.groq.com/openai/v1"
                />
              </div>
              <div>
                <label style={label}>Model</label>
                <input
                  className="ql-focus"
                  style={field}
                  value={cfg.openai.model}
                  onChange={(e) => set("openai.model", e.target.value)}
                />
              </div>
              <div>
                <label style={label}>API key</label>
                <input
                  className="ql-focus"
                  style={field}
                  type="password"
                  value={cfg.openai.apiKey}
                  onChange={(e) => set("openai.apiKey", e.target.value)}
                />
              </div>
            </div>
          )}

          {cfg.provider === "anthropic" && (
            <div className="space-y-4">
              <div>
                <label style={label}>Model</label>
                <input
                  className="ql-focus"
                  style={field}
                  value={cfg.anthropic.model}
                  onChange={(e) => set("anthropic.model", e.target.value)}
                />
              </div>
              <div>
                <label style={label}>API key</label>
                <input
                  className="ql-focus"
                  style={field}
                  type="password"
                  value={cfg.anthropic.apiKey}
                  onChange={(e) => set("anthropic.apiKey", e.target.value)}
                  placeholder="sk-ant-…"
                />
              </div>
            </div>
          )}

          {(cfg.provider === "openai" || cfg.provider === "anthropic") && (
            <p className="px-3 py-2" style={{ fontFamily: F.ui, fontSize: 12, color: C.ink, background: C.amberSoft, borderRadius: 2 }}>
              The key is stored in this browser and sent from this browser. Safe on your own desktop. If you ever put this
              app on a public URL, move the key behind the proxy in the README instead.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={label}>Questions per request</label>
              <select
                className="ql-focus"
                style={field}
                value={cfg.itemsPerCall}
                onChange={(e) => set("itemsPerCall", Number(e.target.value))}
              >
                <option value={1}>1 — slowest, most reliable</option>
                <option value={2}>2 — good for a 12B</option>
                <option value={3}>3 — for a large hosted model</option>
              </select>
            </div>
            <div>
              <label style={label}>Model thinking</label>
              <select
                className="ql-focus"
                style={field}
                value={cfg.think ? "on" : "off"}
                onChange={(e) => set("think", e.target.value === "on")}
              >
                <option value="off">Off — faster, leaves tokens for the answer</option>
                <option value="on">On — better levels 3–4, much slower</option>
              </select>
            </div>
            <div>
              <label style={label}>Temperature</label>
              <input
                className="ql-focus"
                style={field}
                type="number"
                step="0.1"
                min="0"
                max="1.5"
                value={cfg.temperature}
                onChange={(e) => set("temperature", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
            <p style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", color: C.slate }}>RESEARCH SETTINGS (V10)</p>
            <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 12, color: C.mute }}>
              Saved with every generation run, so each item can be traced to the settings that produced it.
            </p>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label style={label}>Learner profile</label>
                <select className="ql-focus" style={field} value={cfg.learnerPreset} onChange={(e) => set("learnerPreset", e.target.value)}>
                  {Object.keys(LEARNER_PRESETS).map((k) => (
                    <option key={k} value={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Text type</label>
                <select className="ql-focus" style={field} value={cfg.textType} onChange={(e) => set("textType", e.target.value)}>
                  <option value="auto">Auto — the model decides</option>
                  <option value="narrative">Story (narrative)</option>
                  <option value="informational">Information text</option>
                </select>
              </div>
              <div className="col-span-2">
                <label style={label}>Custom learner description (overrides the profile)</label>
                <input
                  className="ql-focus"
                  style={field}
                  value={cfg.learnerCustom}
                  placeholder={LEARNER_PRESETS[cfg.learnerPreset]}
                  onChange={(e) => set("learnerCustom", e.target.value)}
                />
                <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 11, color: C.mute }}>Sent to the model as: “{learnerText(cfg)}”.</p>
              </div>
              <div className="col-span-2">
                <label className="flex items-start gap-2" style={{ ...label, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.l3Strict !== false} onChange={(e) => set("l3Strict", e.target.checked)} style={{ marginTop: 3 }} />
                  <span>
                    Process 3 strict mode — the two evidence spans must be in different paragraphs.
                    <span style={{ display: "block", fontWeight: 400, color: C.mute, fontSize: 11 }}>
                      An experimental design constraint, not a PIRLS rule. On by default for the first experiment.
                    </span>
                  </span>
                </label>
              </div>
              <div className="col-span-2">
                <label className="flex items-start gap-2" style={{ ...label, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.l3MeaningCheck !== false} onChange={(e) => set("l3MeaningCheck", e.target.checked)} style={{ marginTop: 3 }} />
                  <span>
                    Process 3 meaning check (shadow mode)
                    <span style={{ display: "block", fontWeight: 400, color: C.mute, fontSize: 11 }}>
                      After generation, the model judges each process-3 candidate (integration, coherent evidence, single-sentence answerable, unsupported inference). Recorded only — never used to reject. Same model as the generator.
                    </span>
                  </span>
                </label>
              </div>
              <div className="col-span-2">
                <label style={label}>Exemplar library</label>
                <p style={{ fontFamily: F.ui, fontSize: 12, color: C.slate }}>
                  {exemplars.length} example item{exemplars.length === 1 ? "" : "s"} loaded ·{" "}
                  {exemplars.filter((e) => e.permission_confirmed).length} with permission confirmed (only these are shown to the model, 1 per process).
                </p>
                <input
                  type="file"
                  accept="application/json,.json"
                  className="mt-1"
                  style={{ fontFamily: F.ui, fontSize: 12 }}
                  onChange={(e) => e.target.files?.[0] && importExemplars(e.target.files[0])}
                />
                {exMsg && <p className="mt-1" style={{ fontFamily: F.ui, fontSize: 12, color: C.ink }}>{exMsg}</p>}
              </div>
            </div>
          </div>

          {state.kind !== "idle" && (
            <p
              className="px-3 py-2"
              style={{
                fontFamily: F.ui,
                fontSize: 13,
                borderRadius: 2,
                color: state.kind === "bad" ? C.brick : C.ink,
                background: state.kind === "bad" ? C.brickSoft : C.card,
                border: `1px solid ${state.kind === "bad" ? C.brick : C.line}`,
              }}
            >
              {state.msg}
            </p>
          )}
        </div>

        <div className="px-6 py-4 flex flex-wrap gap-3 items-center" style={{ borderTop: `1px solid ${C.line}` }}>
          <button
            onClick={save}
            className="ql-focus px-5 py-3"
            style={{ background: C.ink, color: C.card, borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}
          >
            Save
          </button>
          <button
            onClick={test}
            disabled={state.kind === "busy"}
            className="ql-focus px-5 py-3"
            style={{ border: `1px solid ${C.ink}`, color: C.ink, borderRadius: 2, fontFamily: F.ui, fontSize: 14, fontWeight: 700 }}
          >
            Test connection
          </button>
          <button
            onClick={() => setCfg({ ...DEFAULT_CONFIG })}
            className="ql-focus"
            style={{ fontFamily: F.ui, fontSize: 13, color: C.mute, textDecoration: "underline" }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
