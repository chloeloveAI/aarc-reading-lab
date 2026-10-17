# AGS Phase 2: prompts and schemas (agsmap-v0.1 · agsverdict-v0.1 · agssum-v0.1)

Status: **proposed feature**. The prompts, schemas and code checks are implemented. There is no screen and no learner use yet. Deterministic tests show the plumbing works. **They do not show that a model judges answers accurately.** That needs the probe run and human checking below.

## Phase 1 correction (approved review item)
After the evidence cap, a learner's restatement is recorded as `supported` **only** if it meets a minimum (`meetsRestateMinimum` in `ags.js`):

| Restatement | Outcome |
| --- | --- |
| Correct, or a code-verified supported alternative | `supported` |
| Not a relationship idea: partial, at least half the elements, no comprehension error | `supported` |
| Relationship idea without the relationship itself | `not_demonstrated_after_support` |
| Blank, no attempt, incorrect, or uncertain | `not_demonstrated_after_support` |

Both outcomes carry support level 3, so they are kept apart by outcome, not by level. The restatement's own classification is logged as `restate_classification`. If the main idea ends as either outcome, it is still asked once more at the end.
Regression test **R15** covers a blank restatement (even when the model wrongly says "present"), an incorrect one, a half-element one, a relationship without the relation, a check that the two outcomes stay distinct in the log, and the final re-ask.

## New files
| File | Contents |
| --- | --- |
| `src/agsPrompts.js` | The three prompts, their JSON schemas (the verdict and summary schemas are built per idea or per map) and recommended call settings. It imports nothing from Full Climb. |
| `src/ags.js` (additions) | `normaliseVerdict`, `normaliseMap`, `normaliseSummary`, `looseNorm` / `spanInText`, Chinese no-attempt phrases, and the `topic_label` check |
| `tests/agsPrompts.test.mjs` | P1–P10 |
| `tests/probe/verdict_probes.json` | 15 probe answers on TP-01, with **proposed** expected outcomes |
| `tests/probe/run_verdict_probes.mjs` | Runs the probes against a local model and writes JSON and CSV for human checking |

## How Phase 2 addresses the three concerns
**Verdict accuracy.** The model's verdict is never taken as-is.
- Each element marked present or contradicted must quote the learner's own words (`learner_span`). Code checks that those words really are in the answer; if not, the element is downgraded to absent and the downgrade is logged (P4).
- Values outside the allowed set fall back to safe defaults and are listed in `audit.invalid_fields` (P3).
- The summary assessment follows the same rule, and a relationship counts only if its idea is covered (P9).
- The model is told to judge meaning, not to credit what the learner "probably meant".

**Alternative interpretations.**
- The prompt defines supported, uncertain and unsupported, and says quoting the text never makes an interpretation supported.
- Code then verifies the passage quote (P7). Reviewed alternatives can be shown to the model through a map's `accepted_alternatives`, which change only through human review.

**Mixed English–Chinese answers.**
- The prompt says English, Chinese (including written Cantonese) or a mix are all fine, and spelling and grammar don't matter.
- The span check works on any script, ignoring punctuation, full-width characters and case (P5).
- Chinese blanks and "唔知 / 不知道" are no attempt (P6).
- Copy rate only measures English word overlap with the English passage, so a Chinese answer is never flagged as copied.

## Results
Phase 1: **19/19** (R1–R15 + 4 map tests). Phase 2: **10/10** (P1–P10). Full outputs are in `AGS_PHASE1_TEST_RESULTS.md` and `AGS_PHASE2_TEST_RESULTS.md`.

## Full Climb unchanged
- The checksums of all 36 pre-AGS files are unchanged.
- No app file imports `ags.js` or `agsPrompts.js`.
- The production build is still byte-identical to v10.3 (`index-uPG6pbNh.js`).

## The empirical step: running the probes (on your PC)
1. Unzip the project, open a terminal in the project folder, and make sure Ollama is running.
2. **Before running, confirm or change the `expected` values** in `tests/probe/verdict_probes.json`. They are my proposals.
3. Run `node tests/probe/run_verdict_probes.mjs --model qwen3.5:27b --repeat 3`. Three repeats show whether verdicts are stable at temperature 0.
4. Open the CSV in `research/probe_results/`. For each row, fill in `researcher_agrees` (yes/no) and a note where useful. Judge the model's element and alternative calls, not only whether the classification matched.
5. Send me the JSON and CSV.

The 15 probes:

| Category | Probes |
| --- | --- |
| English paraphrase | V01, V06 |
| Mixed Cantonese–English | V02, V10 (relationship) |
| Written Chinese | V03 |
| Misspelling | V04 |
| Partial | V05 |
| Misreading | V07 |
| Relationship missing / reversed | V08, V09 |
| Alternatives: supported / uncertain / unsupported with a real quote | V11, V12, V13 |
| Chinese "don't know" | V14 |
| Copied | V15 |

What this can and cannot show:
- It's one model, one passage and 15 answers. It can reveal systematic errors, such as missing Cantonese paraphrase or crediting quotes. It cannot validate the prompt.
- Validation needs answers from real learners, double-rated by humans, with human–AI agreement reported. That belongs to the later pilot.
- `--mock` checks only the plumbing; its results mean nothing about any model.

## Next
Phase 3 (the map library, map review and Pilot mode) waits for your decision after the probe results.
