# Supplementary material

**Paper:** *Regulating AI Assistance in Reading: Two Formative Design Iterations of AARC Reading Lab* (submitted to AIESC 2027).

This folder and the tagged source code are the supplementary material referred to in the paper. It contains the prompts, hint-ladder texts, item-screening and leak-check rules with their thresholds, and the anonymised coding matrix (C01–C37). It contains **no participant data**: session recordings, transcripts and research-log exports are held privately by the author.

## Which code is which iteration

| Paper | Tag | Branch / commit | App version |
|---|---|---|---|
| Iteration 1 (Section III-B) | `v10.3-iteration1` | `main` @ `018c983` | `aarc-reading-lab-v10.3`, prompt `items-v10.2`, checks `validator-v10.1` |
| Iteration 2 (Section III-C) | `v10.4-iteration2` | `v10-4-focus-reading` @ `0a7dddd` (+ this folder) | `aarc-reading-lab-v10.4`, prompt `items-v10.3`, checks `validator-v10.2` |

Models: Iteration 1 used Qwen 3.5 27B (4-bit quantised) run locally through Ollama; Iteration 2 used `qwen/qwen3.8-flash` through OpenRouter via the Netlify function `netlify/functions/llm.mjs`. Every run records provider, model name, prompt and check versions in the research log (`src/research.js`).

## Where each element of the paper lives in the code

| Paper element | File(s) |
|---|---|
| Rules R1–R11 (Table I) and the item checks (R6) | `VALIDATOR.md`, `CHANGES.md` (sections 3–7) |
| Iteration 1 hint ladder: section → paragraph → key-word meaning → guiding question → evidence | `main`: `src/App.jsx`, `hintSteps()` |
| Iteration 2 hint ladder: strategy → guiding question → where to look (strong help) → key word | `src/App.jsx`, `hintSteps()` and `LOCATION_KINDS`; `CHANGES.md` §5, §7 |
| Question coach and its leak check (R4): location phrases rejected; a reply sharing ≥ 0.6 of the key's content words is rejected when the key has ≥ 3 content words; one regeneration, then a neutral nudge | `src/coach.js`, `coachLeak()` |
| Reading tutor limited to the text read so far (R2); prior text capped at 14,000 characters | `src/tutor.js`, `textUpTo()` |
| Construct: premise check, marking prompt with one "strong answer", improvement prompt ("keep her own sentences … only fix what is wrong and add what is missing"), share of wording kept | `src/written.js`: `buildPremisePrompt()`, `buildMarkPrompt2()`, `buildImprovePrompt()`, `keptShare()` |
| Construct scaffold ladder (location-first; noted in the paper as not yet reordered) | `src/Scaffold.jsx`, `partSteps()` |
| Item-generation prompts and coverage plan (R5) | `src/prompts.js`, `src/coverage.js`; `research/PROMPT_v10.1.md` (earlier version) |
| What counts as "unaided" on the results page (R7), self-ratings | `src/App.jsx` (results and self-rating sections) |
| Bilingual dictionary (English → Traditional Chinese) | `src/vocab.js` |
| Research log schema (`aarc-research-log/1`) and exports | `src/research.js` |
| Tests of the quarter plan, tutor text restriction, answer-key positions and leak check | `tests/focusCoverage.test.mjs` |

## Coding matrix (Section IV-B)

- `coding_matrix_C01-C37.csv` — the 37 excerpts with participant code, iteration, source type, initial code, theme, analytic memo, design implication, evidence confidence, evidence type and research-question tags. The *evidence paraphrase* column holds the author's English translations/paraphrases of Cantonese speech, not verbatim quotations; transcript line numbers refer to private transcripts.
- `theme_matrix.csv` — themes by session (P1–P6) with interpretive cautions.
- `codebook_and_method.csv` — coding procedure and evidence rules.
- `participant_background.csv` — session codes, iteration and self-rated confidence in reading academic English (1–5).

Participant names have been replaced by the codes used in the paper (P3 and P4 are the same reader). Internal workbook fields used for the author's own checking were omitted.

## Running the prototype

See the repository `README.md`. In brief: `npm install`, `npm run dev`, then choose a provider in Settings (local Ollama, an OpenAI-compatible endpoint, or the cloud proxy, which needs the Netlify environment variables `OPENROUTER_API_KEY`, `MODEL` and `APP_ACCESS_CODE`). The research log is kept in the browser's local storage and exported from the app; nothing is sent to the author.

A hosted Iteration-2 instance is available at https://aarc-reading-lab.netlify.app (an access code is required for the cloud model; it is supplied to reviewers with the submission).
