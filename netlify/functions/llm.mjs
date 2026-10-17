/* llm.mjs — server-side proxy to OpenRouter.
 * The browser sends an access code and chat messages; the API key and the
 * model name stay in environment variables and never reach the client. */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOKENS_CAP = 4000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed. Use POST.", code: "method" });

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { error: "Request body must be JSON.", code: "bad_request" });
  }
  const { accessCode, messages, max_tokens, temperature, json: wantJson } = body || {};

  const expected = process.env.APP_ACCESS_CODE;
  if (!expected || typeof accessCode !== "string" || accessCode !== expected)
    return json(401, { error: "Wrong access code.", code: "access" });

  if (!Array.isArray(messages) || !messages.length)
    return json(400, { error: "messages must be a non-empty array.", code: "bad_request" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.MODEL;
  if (!apiKey || !model)
    return json(500, { error: "The cloud model is not configured on the server.", code: "config" });

  const tokens = Math.min(Math.max(1, Math.floor(Number(max_tokens) || 1400)), MAX_TOKENS_CAP);
  const temp = Number.isFinite(Number(temperature)) ? Number(temperature) : undefined;

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tangerine-heliotrope-cdf2c8.netlify.app",
        "X-Title": "Question Ladder",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: tokens,
        /* reasoning model: keep thinking tokens from eating max_tokens */
        reasoning: { enabled: false },
        ...(wantJson ? { response_format: { type: "json_object" } } : {}),
        ...(temp !== undefined ? { temperature: temp } : {}),
      }),
    });
  } catch (e) {
    return json(502, { error: "Could not reach OpenRouter.", code: "provider" });
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON reply; handled below */
  }

  if (!res.ok || data?.error) {
    const status = !res.ok ? res.status : Number(data?.error?.code) || 502;
    const message = data?.error?.message || `OpenRouter returned ${res.status}.`;
    /* never pass a provider 401 through as our own "wrong access code" */
    return json(status === 401 ? 502 : status, { error: message, code: "provider", providerStatus: status });
  }

  const choice = data?.choices?.[0];
  return json(200, {
    text: choice?.message?.content || "",
    model: data?.model || model,
    finish_reason: choice?.finish_reason || "",
    usage: data?.usage || null,
  });
};
