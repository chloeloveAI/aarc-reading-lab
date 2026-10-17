# AGS Phase 1: rule core (ags-v0.1 · agsrules-v0.1)

Status: **proposed feature**. The rule logic is implemented and passes deterministic tests. There is no screen, no prompt, no model call and no learner use yet. Nothing here supports a claim about learning or comprehension.

## Files (all new)
| File | Contents |
| --- | --- |
| `src/ags.js` | Map checks, answer classification, next-move rules, caps, outcomes and support levels, copy rate and leakage measures. Pure functions only. |
| `tests/ags.test.mjs` | R1–R14 plus four map tests. Run with `node tests/ags.test.mjs`. |
| `tests/fixtures/tp01_map.json` | A hand-written test map for TP-01 (K0–K4). It is unreviewed and for testing only. |
| `research/AGS_PHASE1_TEST_RESULTS.md` | The output of the last test run. |

## How alternative answers are classified
The model gives a **judgement**. Code then checks the **evidence** and decides the **outcome**. A real passage quotation is required for credit, but never enough on its own.

| Model judgement | Code check | Classification | What happens next |
| --- | --- | --- | --- |
| `supported` | The quote is found in the passage (at least 4 words); for a relationship idea, the answer also states a relationship | **alternative_supported** | Credited as `alternative_accepted` and flagged for human review. The map is not changed. |
| `supported` | The quote is not found, or no relationship is stated | Downgraded to **alternative_uncertain** (or partial if some map elements are present), with the reason flagged | Not credited and not marked wrong. One neutral clarification question. |
| `uncertain` | (none) | **alternative_uncertain** | One neutral clarification question while attempts remain. It does not raise the support level. After that, the normal evidence pointer. |
| `unsupported` | (none) | **incorrect**, with error `unsupported_interpretation` | Evidence pointer. A genuine quotation in the answer earns nothing (R13). |

Two rules come first:
- A contradiction, a misreading, a reversed relationship, or a wrong relationship type is classified **incorrect** before any alternative is considered. The one exception is a wrong-type relationship the model judges a supported alternative; that goes through the evidence check above.
- An answer with all map elements present but the wrong relationship is never correct (R14).

## Settings logged
`validateMap` returns `settings_used`, and every turn record carries `settings`. Both include `relationCrossParagraph`, which is **off by default for AGS**. Full Climb's process-3 strict rule is a separate setting in a separate module and stays on.

## Full Climb unchanged: evidence
- SHA-256 checksums of all 36 previously tracked files were taken before Phase 1 and re-checked afterwards: **all unchanged**.
- No file in `src/` imports `ags.js`.
- The production build is byte-identical to v10.3: same bundle `index-uPG6pbNh.js`.

## Correction after independent review (16 Oct 2026)
ChatGPT found that a blank restatement after the evidence cap was still recorded as `supported`. It is now `not_demonstrated_after_support` unless the restatement meets a defined minimum. Regression test R15 covers this; see `AGS_PHASE2.md`.

## Found by the tests
R14 first failed. An answer with every element present but the wrong *type* of relationship was classified **partial**, not incorrect. The rule was fixed, not the test: a wrong relationship type now counts as a misread relationship unless it is judged a supported alternative.

## Known limits (to be handled in later phases)
- Phase 1 gives quote locations as block indices, where headings count as blocks. Phase 3 will align them with the app's section and paragraph numbering.
- The rules are only as good as the model's verdict. If the model wrongly judges an alternative "supported" and the quote is real, the answer is credited. It is still flagged for human review. Whether the verdicts are accurate is the V1–V3 question for the development run.
- Copy rate measures word-for-word overlap only. It doesn't detect close paraphrase.

## Next
Phase 2 (prompts and schemas) starts only after the researcher approves these results.
