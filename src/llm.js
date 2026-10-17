/* ------------------------------------------------------------------ *
 * llm.js — one place that knows how to talk to a model.
 *
 * Providers:
 *   ollama   — your local desktop. No key. Default on localhost.
 *   cloud    — OpenRouter through the site's Netlify Function. The browser
 *              only holds an access code; the API key stays on the server.
 *              Default everywhere else.
 *   openai   — any OpenAI-compatible endpoint (Groq, Together, LM Studio,
 *              vLLM, OpenRouter…). Needs a key and a base URL.
 *   anthropic— Claude directly from the browser. Needs a key.
 *
 * Settings live in localStorage on your own machine. That is fine for a
 * desktop app. It is NOT fine on a public URL — see README.
 * ------------------------------------------------------------------ */

const KEY = "ql:config";

const ON_LOCALHOST = (() => {
  try {
    const h = globalThis.location?.hostname || "";
    return !h || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  } catch (e) {
    return true;
  }
})();

export const CLOUD_ENDPOINT = "/.netlify/functions/llm";

export const DEFAULT_CONFIG = {
  provider: ON_LOCALHOST ? "ollama" : "cloud",
  ollama: { baseUrl: "http://localhost:11434", model: "gemma4:12b" },
  /* the real model is chosen on the server; "model" here is just a label */
  cloud: { accessCode: "", model: "openrouter" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "", apiKey: "" },
  anthropic: { model: "claude-sonnet-4-6", apiKey: "" },
  itemsPerCall: 2,
  temperature: 0.6,
  /* Gemma 4 thinks by default and the thinking tokens eat num_predict.
     Off for items; worth turning on for levels 3–4 if you have patience. */
  think: false,
  /* research settings (v10) */
  learnerPreset: "adult",
  learnerCustom: "",
  /* the initial AIESC experiment: adult readers, informational texts */
  textType: "informational",
  l3Strict: true,
  /* shadow process-3 meaning check: recorded, never used to reject */
  l3MeaningCheck: true,
};

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      ollama: { ...DEFAULT_CONFIG.ollama, ...(saved.ollama || {}) },
      cloud: { ...DEFAULT_CONFIG.cloud, ...(saved.cloud || {}) },
      openai: { ...DEFAULT_CONFIG.openai, ...(saved.openai || {}) },
      anthropic: { ...DEFAULT_CONFIG.anthropic, ...(saved.anthropic || {}) },
    };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch (e) {
    /* private mode — settings just won't persist */
  }
}

/* ---------------------------- cleaning ---------------------------- */

/* Gemma 4 emits thought control tokens even when thinking is off, and it
   still likes a stray ```json fence. Strip both before parsing. */
export function cleanModelText(text) {
  let t = String(text || "");
  t = t.replace(/<\|channel\|?>thought[\s\S]*?<\|?channel\|?>/gi, "");
  /* Qwen 3.x may leave an (often empty) <think>…</think> block */
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/<\/?\|?think\|?>/gi, "");
  t = t.replace(/<\/?thought>/gi, "");
  t = t.replace(/```json/gi, "").replace(/```/g, "");
  return t.trim();
}

export function parseJSON(raw) {
  const t = cleanModelText(raw);
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("No JSON object in the reply.");
  let slice = t.slice(a, b + 1);
  try {
    return JSON.parse(slice);
  } catch (e) {
    /* small models leave trailing commas and smart quotes */
    slice = slice
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return JSON.parse(slice);
  }
}

/* --------------------------- the call ----------------------------- */

/**
 * complete(prompt, { config, maxTokens, schema })
 * `schema` is a JSON Schema object. Ollama enforces it natively, which is
 * the single biggest quality lever when running a 12B locally.
 */
export const lastExchange = { raw: "", thinking: "", error: "", mode: "", ms: 0, meta: null };

export async function complete(prompt, { config, maxTokens = 1400, schema, mode = "schema" } = {}) {
  const cfg = config || loadConfig();
  const t0 = Date.now();
  lastExchange.mode = mode;
  lastExchange.meta = null;
  /* reset, so a failed call can never show the previous call's reply */
  lastExchange.raw = "";
  lastExchange.thinking = "";
  try {
    let out;
    if (cfg.provider === "ollama") out = await callOllama(prompt, cfg, maxTokens, schema, mode);
    else if (cfg.provider === "cloud") out = await callCloud(prompt, cfg, maxTokens, mode);
    else if (cfg.provider === "openai") out = await callOpenAI(prompt, cfg, maxTokens, mode !== "none");
    else out = await callAnthropic(prompt, cfg, maxTokens);
    lastExchange.raw = out;
    lastExchange.error = "";
    lastExchange.ms = Date.now() - t0;
    return out;
  } catch (e) {
    lastExchange.error = e.message;
    lastExchange.ms = Date.now() - t0;
    throw e;
  }
}

async function callOllama(prompt, cfg, maxTokens, schema, mode = "schema") {
  const url = cfg.ollama.baseUrl.replace(/\/$/, "") + "/api/chat";
  /* schema → constrained decoding; json → loose JSON mode; none → plain text.
     Older Ollama builds reject a schema object, so we can step down. */
  const format = mode === "schema" && schema ? schema : mode === "none" ? undefined : "json";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 420000);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.ollama.model,
        stream: false,
        think: !!cfg.think,
        keep_alive: "15m",
        ...(format ? { format } : {}),
        options: {
          temperature: cfg.temperature,
          num_predict: maxTokens,
          num_ctx: 16384,
        },
        messages: [
          {
            role: "system",
            content:
              "You write reading-comprehension assessment items. You reply with a single JSON object and nothing else: no preamble, no explanation, no markdown fence.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError")
      throw new Error("Ollama took over 7 minutes on this request. Check `ollama ps` shows 100% GPU; if not, the model is too big for your graphics card at this context size.");
    /* A failed fetch is opaque — probe a cheap endpoint to tell apart
       "Ollama is unreachable" from "Ollama is up but that call died". */
    const alive = await isAlive(cfg.ollama.baseUrl);
    if (alive)
      throw new Error(
        "Ollama is running and reachable, but this request died. That usually means the model runner crashed or was unloaded — check `ollama ps` and %LOCALAPPDATA%\\Ollama\\server.log. Out of memory is the common cause."
      );
    throw new Error(
      "No response from Ollama at " +
        cfg.ollama.baseUrl +
        ". Either it has stopped, or this page's origin isn't allowed (opening from a file needs OLLAMA_ORIGINS=*)."
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Ollama returned " + res.status + ": " + body.slice(0, 300));
  }
  const data = await res.json();
  const msg = data?.message || {};
  const content = msg.content || "";
  const thinking = msg.thinking || "";
  /* keep this call's own output, even when it fails below */
  lastExchange.raw = content;
  lastExchange.thinking = thinking;
  lastExchange.meta = {
    model: data?.model,
    done_reason: data?.done_reason,
    prompt_tokens: data?.prompt_eval_count,
    /* eval_count counts ALL generated tokens, reasoning included */
    output_tokens: data?.eval_count,
    total_ms: data?.total_duration ? Math.round(data.total_duration / 1e6) : undefined,
    format: format ? (typeof format === "string" ? format : "schema") : "none",
    num_ctx: 16384,
    num_predict: maxTokens,
    think_sent: !!cfg.think,
    content_chars: content.length,
    thinking_chars: thinking.length,
  };
  if (data?.done_reason === "length") {
    const used = `${data?.eval_count ?? "?"} of ${maxTokens} output tokens`;
    /* Thinking exhaustion only when reasoning crowded out the answer */
    if (thinking.length > content.length)
      throw new Error(
        `Thinking exhaustion: the model used ${used}, mostly on reasoning (${thinking.length} characters of reasoning, ${content.length} of answer), although thinking was sent as ${cfg.think ? "on" : "off"}.`
      );
    throw new Error(
      `Output truncated: the answer reached the output limit (${used}) before the JSON was complete. Reasoning: ${thinking.length ? thinking.length + " characters" : "none"}.`
    );
  }
  if (!content && thinking)
    throw new Error("The model produced only reasoning and no answer. Turn thinking off in Settings.");
  return content;
}

/* Cloud: the Netlify Function forwards to OpenRouter. No key in the browser. */
async function callCloud(prompt, cfg, maxTokens, mode = "schema") {
  const accessCode = (cfg.cloud?.accessCode || "").trim();
  if (!accessCode) throw new Error("Enter the access code in Settings to use the cloud model.");
  const system =
    mode === "none"
      ? "You write reading-comprehension assessment items."
      : "You write reading-comprehension assessment items. You reply with a single JSON object and nothing else: no preamble, no explanation, no markdown fence.";
  let res;
  try {
    res = await fetch(CLOUD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode,
        max_tokens: Math.min(maxTokens, 4000),
        temperature: cfg.temperature,
        /* schema or json mode → OpenRouter json_object */
        json: mode !== "none",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    throw new Error("Network error: couldn't reach the cloud model. Check your internet connection and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* e.g. a platform timeout page */
  }
  if (res.status === 401 && data?.code === "access")
    throw new Error("Wrong access code. Check it in Settings → Cloud (OpenRouter).");
  if (!res.ok) {
    if (!data)
      throw new Error(
        res.status === 504 || res.status === 502
          ? "The cloud model took too long to answer (" + res.status + "). Try fewer questions per request, or try again."
          : "The cloud service returned " + res.status + "."
      );
    throw new Error("Cloud model error (" + (data.providerStatus || res.status) + "): " + (data.error || "unknown error"));
  }
  const content = data?.text || "";
  lastExchange.raw = content;
  lastExchange.meta = {
    model: data?.model,
    done_reason: data?.finish_reason,
    prompt_tokens: data?.usage?.prompt_tokens,
    output_tokens: data?.usage?.completion_tokens,
    usage: data?.usage || null,
    num_predict: Math.min(maxTokens, 4000),
    content_chars: content.length,
  };
  /* same message as the Ollama path, so the app diagnoses it the same way */
  if (data?.finish_reason === "length" || !content) {
    const used = `${data?.usage?.completion_tokens ?? "?"} of ${Math.min(maxTokens, 4000)} output tokens`;
    throw new Error(
      `Output truncated: the answer reached the output limit (${used}) before the JSON was complete. Reasoning: none.`
    );
  }
  return content;
}

async function callOpenAI(prompt, cfg, maxTokens, jsonMode) {
  const url = cfg.openai.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cfg.openai.apiKey,
    },
    body: JSON.stringify({
      model: cfg.openai.model,
      max_tokens: maxTokens,
      temperature: cfg.temperature,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        {
          role: "system",
          content:
            "You write reading-comprehension assessment items. Reply with a single JSON object and nothing else.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error("Endpoint returned " + res.status + ".");
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callAnthropic(prompt, cfg, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
      /* required, or the browser preflight is refused */
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: cfg.anthropic.model,
      max_tokens: maxTokens,
      temperature: cfg.temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error("Anthropic returned " + res.status + ".");
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/* ------------------------- helpers for UI -------------------------- */

export async function isAlive(baseUrl) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(baseUrl.replace(/\/$/, "") + "/api/tags", { signal: ctl.signal });
    clearTimeout(t);
    return r.ok;
  } catch (e) {
    return false;
  }
}

/* the exact model build, for reproducibility (Ollama only) */
export async function modelDigest(cfg) {
  if (cfg.provider !== "ollama") return "";
  try {
    const res = await fetch(cfg.ollama.baseUrl.replace(/\/$/, "") + "/api/tags");
    const data = await res.json();
    const m = (data.models || []).find((x) => x.name === cfg.ollama.model || x.model === cfg.ollama.model);
    return m?.digest || "";
  } catch (e) {
    return "";
  }
}

/* Full model identity for the research log (Ollama only): exact build
   (digest), quantisation, parameter count, family, the Modelfile's own
   sampling defaults (top_p, top_k, presence_penalty… — these apply to
   every call unless the app overrides them) and the Ollama version.     */
export async function modelInfo(cfg) {
  if (cfg.provider !== "ollama") return { name: cfg[cfg.provider]?.model || "" };
  const base = cfg.ollama.baseUrl.replace(/\/$/, "");
  const name = cfg.ollama.model;
  const info = { name };
  try {
    const tags = await (await fetch(base + "/api/tags")).json();
    const m = (tags.models || []).find((x) => x.name === name || x.model === name);
    if (m) {
      info.digest = m.digest || "";
      info.size_bytes = m.size;
      info.modified_at = m.modified_at;
    }
  } catch (e) {
    info.error_tags = e.message;
  }
  try {
    const res = await fetch(base + "/api/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
    });
    const s = await res.json();
    const d = s.details || {};
    info.family = d.family || "";
    info.parameter_size = d.parameter_size || "";
    info.quantization_level = d.quantization_level || "";
    info.format = d.format || "";
    info.parameters = s.parameters || ""; /* Modelfile PARAMETER lines, verbatim */
    info.capabilities = s.capabilities || [];
    const mi = s.model_info || {};
    const ctxKey = Object.keys(mi).find((k) => k.endsWith(".context_length"));
    if (ctxKey) info.native_context_length = mi[ctxKey];
  } catch (e) {
    info.error_show = e.message;
  }
  try {
    info.ollama_version = (await (await fetch(base + "/api/version")).json()).version || "";
  } catch (e) {
    info.ollama_version = "";
  }
  return info;
}

export async function listOllamaModels(baseUrl) {
  const res = await fetch(baseUrl.replace(/\/$/, "") + "/api/tags");
  if (!res.ok) throw new Error("Ollama returned " + res.status);
  const data = await res.json();
  return (data.models || []).map((m) => m.name).sort();
}

export async function testConnection(cfg) {
  const text = await complete('Reply with exactly {"ok":true}', {
    config: cfg,
    maxTokens: 40,
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
  });
  const parsed = parseJSON(text);
  if (!parsed || parsed.ok !== true) throw new Error("Model replied, but not with valid JSON.");
  return true;
}

/* ---------------------------- schemas ------------------------------ */

export const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill: { type: "string" },
          stem: { type: "string" },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                correct: { type: "boolean" },
                why: { type: "string" },
              },
              required: ["text", "correct", "why"],
            },
          },
          hint: { type: "string" },
          anchor: { type: "string" },
          keyword: { type: "string" },
          keyword_meaning: { type: "string" },
          guide: { type: "string" },
          takeaway: { type: "string" },
        },
        required: ["skill", "stem", "options", "hint", "anchor", "keyword", "keyword_meaning", "guide", "takeaway"],
      },
    },
    shortfall_reason: { type: "string" },
  },
  required: ["items"],
};

export const INTENT_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    decisions: { type: "array", items: { type: "string" } },
    must_grasp: { type: "array", items: { type: "string" } },
    easy_to_miss: { type: "array", items: { type: "string" } },
  },
  required: ["goal", "decisions", "must_grasp", "easy_to_miss"],
};

export const ASK_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    grounded: { type: "boolean" },
    followups: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "grounded", "followups"],
};

export const PROBE_SCHEMA = {
  type: "object",
  properties: { questions: { type: "array", items: { type: "string" } } },
  required: ["questions"],
};

export const OPEN_SCHEMA = {
  type: "object",
  properties: {
    stem: { type: "string" },
    criteria: { type: "array", items: { type: "string" } },
  },
  required: ["stem", "criteria"],
};

/* Level 3 needs two pieces of evidence and the link between them.
   Schema-constrained decoding only emits declared fields, so they are required here. */
export const ITEMS_SCHEMA_L3 = (() => {
  const base = JSON.parse(JSON.stringify(ITEMS_SCHEMA));
  const item = base.properties.items.items;
  item.properties.anchor2 = { type: "string" };
  item.properties.link = { type: "string" };
  item.required = [...item.required, "anchor2", "link"];
  return base;
})();

export const GRADE_BANDS = ["Excellent", "Good", "Satisfactory", "Weak", "Poor", "Unacceptable"];

export const WORD_GRADE_SCHEMA = {
  type: "object",
  properties: {
    band: { type: "string", enum: GRADE_BANDS },
    feedback: { type: "string" },
    improve: { type: "string" },
  },
  required: ["band", "feedback", "improve"],
};

export const MARK_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["strong", "developing", "thin"] },
    strengths: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    nudge: { type: "string" },
    model: { type: "string" },
  },
  required: ["verdict", "strengths", "missing", "nudge", "model"],
};
