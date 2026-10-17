# Quality checks on generated items (validator-v10.1)

Every item the model returns is a **candidate**. Each candidate runs through the checks below and is logged with the result of every check (`pass` / `fail` / `n/a`) and its rejection reasons, **whether it is accepted or not**.

**Passing these checks is NOT evidence that an item is valid for its PIRLS process.** They catch known failure patterns cheaply; their false accepts and false rejects must be measured against blind human ratings.

## Format checks (`stage_rejected = format`)

| Check | Rule | Notes |
|---|---|---|
| `four_options` | exactly 4 options | v9 accepted 3–6 |
| `single_key` | exactly one option marked correct | **v9 kept the first of several correct options; v10 rejects it.** A key given in a separate field (e.g. `"answer": "B"`) is accepted and logged under `repairs`. |
| `distinct_options` | no two options identical after lower-casing and removing punctuation | |
| `stem_complete` | the question ends with "?" or ":" (closing quotes or brackets allowed) and has at least 4 words | **new in v10.1.** Catches stems cut off when the model writes a double quote inside JSON. Also rejects sentence-completion stems, which the v10.1 prompt no longer asks for. |
| (stem) | non-empty question text | |

## Content checks (`stage_rejected = validator`)

| Check | Applies to | Rule | Known limits |
|---|---|---|---|
| `anchor_found` | all processes | the evidence span (`anchor`) is found in the passage: exact match, or a line containing ≥60% of its words longer than 4 letters | **new in v10, mandatory.** Fuzzy matching can locate a near-miss span; `anchor_match` records `exact` or `fuzzy`. |
| `not_copied` | processes 2–4 | ≥85% of the correct option's content words (≥4 needed) occur in one passage line → rejected as retrieval | Heuristic. Can wrongly reject a valid inference that reuses the text's words; misses retrieval that is paraphrased. |
| `not_combo_grid` | process 3 | every option splits on " and " into two halves, with ≤2 distinct first halves and ≤2 distinct second halves | Format-specific: misses grids written without "and" ("X but not Y", "both/neither"). |
| `anchor2_found` | process 3 | a second evidence span is given and found | |
| `anchor2_distinct` | process 3 | the two spans are not the same text | |
| `cross_paragraph` | process 3 | the spans are in different paragraphs | **An AARC-specific experimental constraint, not a PIRLS rule.** Enforced only in strict mode (`l3_strict`, on by default). With strict mode off, the result is still recorded but doesn't reject. |
| `not_duplicate` | all processes | the stem is not a repeat of an earlier stem in the same run | |

## Retries and shortfalls

- Rejected candidates trigger a retry. The retry prompt lists the rejection reasons, which are logged in `rejection_feedback`.
- Each process is capped at `requested × 3 + 2` model calls.
- If the model says the text cannot support a process (`shortfall_reason`), that process stops immediately, without pressure to invent an item.
- Fewer accepted items than requested is logged as a **shortfall**. Weaker items are never substituted.

## What a reviewer should do with this

Rate **all candidates (accepted and rejected)** blind. Then:
- validator false accept = accepted by the checks, judged invalid by human consensus
- validator false reject = rejected by the checks, judged valid by human consensus

## Shadow process-3 meaning check (`l3check-v1`): diagnostic, not a check

This is **not part of the validator**: it never accepts or rejects. After generation, the same model is asked, at temperature 0, whether each parsed process-3 candidate:
- requires integration
- has evidence spans that support a coherent relationship
- can be answered from a single sentence (and if so, quotes it)
- adds an unsupported inference

Results are stored as separate `diagnostics` records and exported as `l3m_*` columns, for comparison with human ratings.

**Limitation:** it uses the same model as the generator, so it may share the generator's blind spots. It is kept separate from the independent AI evaluator used for the Kappa study.
