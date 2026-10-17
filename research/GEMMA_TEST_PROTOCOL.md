# Testing prompt v10.1 with Gemma 12B locally

## 0. Install and check the version (once)
1. Unzip `aarc-reading-lab-v10.1.zip` over your project folder, then run `npm run dev`. (Run `npm install` first if you unzipped into a new folder.)
2. On the home screen you should see three buttons: **Quick practice · Full practice · Research set**. The Research set shows "10 questions · PIRLS mix 2·3·3·2".
3. Open **Model**. The research section should show **"Process 3 meaning check (shadow mode)"**. If it doesn't, you're on an older version.

## 1. Settings: set once, then don't change mid-batch
**Model panel:**
- Local (Ollama) · model `gemma4:12b` · **2** questions per request · thinking **off** · temperature **0.6**

**Research settings:**
- learner profile **Adult** · text type **Information text** · **process-3 strict mode on** · **meaning check on**

Press **Save**, then **Test connection**.

If you used v10 before, your saved text type may still be "Auto". Check it says **Information text**.

## 2. Exemplars: decide which condition you are running
The exemplars are a variable. Pick one condition per batch and keep it fixed:
- **Condition A (no exemplars):** leave the library empty.
- **Condition B (with exemplars):** after reviewing `research/EXEMPLARS_v10.1.md`, set `permission_confirmed: true` on the approved items in `exemplars_v10.1.json`. Then use Model → Exemplar library → choose that file. The panel must say "5 … with permission confirmed".

Each call records which exemplar IDs it used, so the two conditions can always be told apart afterwards.

**Never use the exemplar passage (spacing effect) as a test passage.**

## 3. Smoke test (about 15 minutes, before the formal batch)
Paste **one** adult informational text you won't use in the formal set. Leave "What you asked" empty, use *Clean up PDF text* if it came from a PDF, then click **Research set**. Check:
- [ ] All four processes appear: 2 / 3 / 3 / 2 questions, or a red **Shortfall** line on the results screen. A shortfall is a valid outcome.
- [ ] No question is cut off mid-sentence.
- [ ] Process-3 hints include "Now connect it with Section …".
- [ ] Wait about a minute after the questions appear, while the shadow check finishes. Then the home screen shows the research log line, and **Candidates (CSV)** has `l3m_status = ok` for the process-3 rows.

If any box fails, send me the two exports before running the batch.

## 4. Formal batch
For each passage (adult informational, 600–1,200 words, with claims, evidence, comparisons and limitations, licensing recorded):
1. **Save & new** → paste the text → **Research set**.
2. Wait until all processes have loaded **and** about one more minute for the shadow check.
3. Don't regenerate the same passage. If you must, the new run gets a new run ID. Decide in advance that the **first** run of each passage is the formal one.

After every 2–3 passages, download **Full log (JSON)** as a backup. The log lives only in this browser.

## 5. Send back
- **Full log (JSON)** and **Candidates (CSV)**, from the home screen
- a list of your passages: title, source, licence, word count, why chosen
- anything odd you noticed: screenshots are fine

## What I'll report from the files
For each process:
- candidates generated, accepted, rejected (by reason), and shortfalls
- retries and latency
- how the shadow meaning check's judgments compare with the rule-based decisions

These are **descriptive technical results only**, not quality claims, until the blind human ratings (Step 4) are in.
