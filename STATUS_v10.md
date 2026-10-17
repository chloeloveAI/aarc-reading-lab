# AARC Reading Lab: implementation status after v10 (Steps 1–3)
15 Oct 2026 · from Claude (prototype) to ChatGPT and the researcher (paper)

## Status of each feature
**Test levels:** *stand-in* means checked in a browser with a mock model that returns scripted good and bad items. No Gemma 12B output has been examined yet.

| Feature | Built | Tested |
|---|---|---|
| MCQ generation for 4 PIRLS-informed processes; Research set of 2 per process | yes | stand-in |
| Prompt `items-v10.0`: generic text framing, learner profile, text type, skill label, explicit shortfall option | yes | stand-in, plus unit tests |
| Quality checks `validator-v10.0`: 4 distinct options, single key, evidence found (all processes), not copied (P2–4), not a combination grid (P3), second evidence span (P3), cross-paragraph (P3, configurable), no duplicates | yes | 10/10 unit cases; stand-in run |
| Append-only research log: runs, calls, all candidates incl. rejected, shortfalls; stable IDs; CSV and JSON export | yes | stand-in, end to end |
| Exemplar library: only `permission_confirmed` entries used, max 1 per process | yes | unit test; library currently **empty** |
| Learner flow: evidence hints, key-word explanation grading, flag + blind rating, written-answer scaffold | yes (v9) | stand-in |
| Full-item blind rating sheets (H1, H2) | **no** (Step 4) | — |
| Independent AI rubric-judge run | **no** (Step 5) | — |
| Revising after feedback; transfer to a new text | **no** | — |

## Changes that affect Section IV (Prototype / Evaluation)
1. **Generation is reproducible and auditable.** Each run logs the prompt version, validator version, provider, model, Ollama model digest, temperature, items per request, thinking, context size, learner profile, text type and strict mode. Each call logs the exact prompt (passage stored once, by ID), a prompt hash, latency, token counts and the raw reply.
2. **The candidate is the unit of analysis.** Every candidate, accepted or rejected, has a `candidate_id` and per-check pass/fail/n/a results. This supports measuring the validator's false accepts and false rejects against human consensus.
3. **Shortfalls are reported, not hidden.** If fewer valid items are produced than requested, the process is recorded as a shortfall (with the model's stated reason, if any). Weaker items are never substituted.
4. **The v10 item prompt is decoupled from the reader's own question.** The goal-analysis card still runs in the learner interface when a question is supplied, but it doesn't influence item generation.
5. **The level-3 cross-paragraph rule is a configurable design constraint** (strict mode on by default). It is not described as a PIRLS requirement.

## Wording for the paper
- **Safe:** "The prototype implements … [features in the table]"; "rule-based screening rejects candidates matching N predefined failure patterns"; "all candidates and screening outcomes are logged for independent review".
- **Not yet:** any figure for Gemma 12B (acceptance or rejection rates, item quality, shortfalls, latency), or Kappa.
- **Not for AIESC:** learning outcomes, learner data.
- **Exact names to cite:** prompt `items-v10.0`, validator `validator-v10.0`, app `aarc-reading-lab-v10`.

## Next
- **Researcher:** run the Gemma 12B batch (`research/GEMMA_TEST_PROTOCOL.md`) and send the JSON and CSV. Analysis comes after that.
- **Claude, Step 4:** a shuffled blind-rating workbook per rater, with intended process, AI and validator outcomes hidden, and first ratings locked on import.
- **Claude, Step 5:** an independent AI judge run using the same rubric as the humans. It is separate from the generator and the validator.
- **Needed from the researcher before Step 4:** the frozen rubric (dimensions, scale, thresholds).

## Framing point for the researcher
In v9/v10, the AI sets the questions and controls the hint order. The learner's **regulation** of AI help (deciding when, how much and whether to accept it; withdrawal; checking confidence against unaided performance) is only partly implemented. The paper's framing and the meaning of the "AARC" acronym need to match what the prototype does.
