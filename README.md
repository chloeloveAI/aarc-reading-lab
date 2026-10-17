# Question Ladder — local setup

Runs on your desktop. Writes its questions with whatever model you point it at:
your local Gemma 4, any OpenAI-compatible endpoint, or Claude with your own key.

---

## 1. Run the app

You need Node 18 or newer (`node -v` to check; if it's missing, get it from nodejs.org).

```bash
cd question-ladder
npm install
npm run dev
```

It opens at **http://localhost:5173**. The `.jsx` never runs directly — Vite compiles
it in memory and serves plain JavaScript to the browser. That is all the tooling does.

To make a version you can double-click without Node running:

```bash
npm run build      # writes dist/
npm run preview    # serves dist/ at http://localhost:4173
```

---

## 2. Point it at Gemma 4

**Step 1 — confirm the tag.** Ollama tags are exact strings, and the app has to match:

```bash
ollama list
```

If `gemma4:12b` isn't there yet: `ollama pull gemma4:12b` (about 8 GB at the default
4-bit quantisation). It wants 16 GB of RAM or VRAM to run comfortably.

**Step 2 — let the browser talk to Ollama.** This is the step that traps everyone.
Ollama refuses requests from web pages unless you allow the origin, and the failure
looks like a network error rather than a permission error.

| Your OS | What to run |
|---|---|
| macOS | `launchctl setenv OLLAMA_ORIGINS "http://localhost:5173"` then quit and reopen Ollama |
| Windows | Quit Ollama from the system tray, run `setx OLLAMA_ORIGINS "http://localhost:5173"` in Command Prompt, reopen Ollama |
| Linux | `OLLAMA_ORIGINS="http://localhost:5173" ollama serve` |

**Step 3 — pick it in the app.** Click **Model**, top right. Leave the provider on
*Local (Ollama)*; the model dropdown fills itself from `ollama list`. Press
**Test connection** — it sends one tiny prompt and checks that clean JSON comes back.

If the dropdown is empty, step 2 didn't take.

---

## 3. Bring your own API key instead

Click **Model**, then either:

- **OpenAI-compatible** — works with Groq, Together, OpenRouter, DeepSeek, LM Studio,
  vLLM, and anything else that speaks `/chat/completions`. Fill in the base URL, the
  model name, and the key.
- **Anthropic** — paste an `sk-ant-…` key. The app already sends the
  `anthropic-dangerous-direct-browser-access` header, without which the browser
  preflight is rejected.

The key is kept in this browser's local storage and sent from this browser. On your own
desktop that is fine. **Do not deploy this to a public URL with a key in it** — anyone
opening the page could read it from devtools. If you ever want it online, put a ten-line
server in front and keep the key there:

```js
// proxy.js — node proxy.js, then set Base URL to http://localhost:8787/v1
import express from "express";
const app = express();
app.use(express.json());
app.post("/v1/chat/completions", async (req, res) => {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MY_KEY}` },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});
app.listen(8787);
```

---

## 4. What to expect from a 12B

It will not write distractors as well as a frontier model. Distractors are the hard part
— a weak one is obviously wrong and the item stops teaching you anything. Three things in
the code already push against that:

- **Schema-enforced output.** Every request sends a JSON Schema in Ollama's `format`
  field, so the model cannot ramble or drop a field. This matters more than any prompt
  wording.
- **Thought-token stripping.** Gemma 4 emits an empty thought block even when thinking is
  off, which would otherwise break parsing. `cleanModelText()` in `src/llm.js` removes it.
- **Small requests.** Default is 2 questions per call, not 5. Each level is chunked and
  retried up to 3 times, with a stricter instruction on the retry.

Knobs, all in **Model** settings:

| Symptom | Change |
|---|---|
| Items come back malformed or a level fails | Questions per request → 1 |
| Options are wordy or drift off the passage | Temperature → 0.3 |
| Level 1 questions quote the passage verbatim | Temperature → 0.8, or edit the level 1 `spec` in `App.jsx` |
| Level 3–4 items are shallow | This is the real limit of a 12B — use a hosted model for the top of the ladder |

**Long passages.** `num_ctx` is set to 16384 in `src/llm.js`. A very long AI reply plus the
prompt template can overflow that, and the symptom is items about the first half only.
Raise it there if you have the memory.

**Optional.** Gemma 4 supports thinking via a `<|think|>` token at the start of the turn.
Adding it to the system message in `callOllama` will improve levels 3 and 4 noticeably and
slow generation down a lot. Worth trying once you've seen the baseline.

---

## Files

```
src/App.jsx       the whole app — levels, prompts, screens
src/llm.js        provider switching, JSON cleaning, schemas
src/Settings.jsx  the Model panel
```

The four PIRLS level definitions and their `spec` text sit at the top of `App.jsx`. That
is the file to edit when you want the ladder to ask differently.
