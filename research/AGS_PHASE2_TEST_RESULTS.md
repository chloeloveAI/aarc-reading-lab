# AGS Phase 2 test results (deterministic)

prompts agsmap-v0.2 · agsverdict-v0.2 · agssum-v0.2 · run 2026-10-15T16:46:31.270Z

**10 / 10 passed.** These tests check the prompts, schemas and code checks on model output. They do not measure how accurately a real model judges answers.

| ID | Case | Result | What happened |
| --- | --- | --- | --- |
| P1 | Verdict prompt carries what the judge needs, and logs without the passage | PASS | versions agsmap-v0.2, agsverdict-v0.2, agssum-v0.2; relation block only for relationship ideas; logged prompt uses <<PASSAGE>> |
| P2 | Verdict schema: this idea's elements only, and no field for a model answer | PASS | verdict schema keys fixed; summary schema has no feedback or model-summary field |
| P3 | Malformed model output falls back to safe values, and every change is audited | PASS | invalid fields → defaults; audit: elements.E1.status, elements.E2, relation_expressed, alternative.judgement, no_attempt |
| P4 | A 'present' judgement without the learner's actual words is downgraded | PASS | model claimed both elements; neither span is in the answer → both downgraded → incorrect |
| P5 | Mixed English–Chinese answer: spans in either script are verified | PASS | Cantonese–English spans kept (punctuation, width and case ignored) → correct; not flagged as copied |
| P6 | Chinese-only blanks and 'don't know' are no attempt | PASS | 。 ？？ 唔知 不知道。 blank, 'I dont know' → no_attempt (even when the model says present) |
| P7 | Alternative quote from the model is verified by code | PASS | real quote → alternative_supported; invented quote → alternative_uncertain |
| P8 | Model map is normalised: always unreviewed, focus list → object, stray relation removed | PASS | model's 'approved' ignored → unreviewed; K1's stray relation removed; normalised map passes validateMap |
| P9 | Summary assessment: claims must quote the summary; relation needs its idea | PASS | K2 span not in summary → missing; K3 relation span not in summary → missing; invented claim dropped; 3 downgrades audited |
| P10 | AGS prompt and rule modules import nothing from Full Climb | PASS | ags.js and agsPrompts.js have no imports from Full Climb modules |
