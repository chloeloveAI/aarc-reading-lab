# AGS genre sensitivity (ags-v0.2 · agsrules-v0.2 · agsmap/agsverdict/agssum-v0.2)

Status: **proposed feature**, with no screen yet. These are deterministic changes to the rules and prompts. Full Climb is unchanged.

## What changed
**1. Passage type is decided first.** The map prompt classifies the text as `informational_explanatory`, `informational_argumentative` or `narrative`, with a one-sentence reason. Both are stored in the map, and the type appears in `settings_used` on every map check.

**2. The main-idea question is fixed by code, by type.** The model doesn't write it.

| Type | Opening question | Final re-ask |
| --- | --- | --- |
| Explanatory | What is the passage mainly explaining? | Now, in a sentence, what is the passage mainly explaining? |
| Argumentative | What is the author's main argument or claim? | Now, in a sentence, what is the author's main argument or claim? |
| Narrative | What is this story mainly about? | Now, in a sentence, what is this story mainly about? |

If the model writes a different main question, `normaliseMap` replaces it with the template and records the change.

**3. Idea roles fit the type.**

| Type | Roles |
| --- | --- |
| Explanatory | main, detail, explanation, relationship, limitation, conclusion |
| Argumentative | main, support, relationship, limitation, conclusion |
| Narrative | main, character, setting, conflict, event, motivation, resolution, theme |

A role from the wrong type is rejected. Any idea can carry a relationship (a story's motivation or resolution, for example), and the existing relationship rules apply to it unchanged. New relationship types: `motivation` and `resolves`. Story maps keep story order; informational maps keep their role order.

**4. Follow-up questions must be about this passage.** Every non-main question, except the neutral "clarify" question, must name something specific to the text. Questions like "What happens next in the story?" or "What is the most important detail here?" are rejected as generic.

**5. Nothing is forced.**

| A question asking about… | …is rejected when |
| --- | --- |
| an argument or claim | the text is not argumentative |
| a moral, lesson, theme or message | the map has no theme idea |
| a conclusion | the map has no conclusion idea |

Further rules:
- A theme idea needs at least two supporting quotes, there can be at most one, and it can never be the main idea.
- Requirements by type:
  - A story needs at least one conflict or event idea.
  - An informational text needs at least one relationship.
  - A story with no relationship idea, or no separate character idea, gets a warning rather than a rejection.

**6. Summaries are judged against the original text's meaning.** The summary prompt states this directly and adds type-specific guidance:
- Stories: who, the problem, key events, why characters act, the ending. No moral is expected unless the map has one.
- Explanatory: no argument or conclusion is expected unless the map has one.

The verdict prompt tells the model that, in a story, a character named by description ("the old man") counts.

## New narrative test passage: TP-02 "The Last Repair"
- `research/test_passage_last_repair.md`: an original story of about 600 words, CC BY 4.0. It has two characters, a closing market, a deadline conflict, a change of mind with a stated cause, and an imperfect ending. **It deliberately states no moral.**
- `tests/fixtures/tp02_map.json`: a hand-written narrative map with roles main, conflict, motivation (a relationship), event and resolution. It has **no theme idea**. It is unreviewed and for development use only.
- `tests/fixtures/dev_samples.json` lists TP-01 (argumentative) and TP-02 (narrative) for the Testing Lab UI. **There is no explanatory sample yet;** one is needed before that path can be tried in the UI.

## Tests: 39/39 pass
- Phase 1 rules: 19/19 (`AGS_PHASE1_TEST_RESULTS.md`)
- Phase 2 prompts and checks: 10/10 (`AGS_PHASE2_TEST_RESULTS.md`)
- Genre: 10/10, G1–G10 (`AGS_GENRE_TEST_RESULTS.md`)

Found by the genre tests: "What happens next in the story?" first passed as content-specific, because the word "next" appears in the story. Sequence and filler words (next, first, end, now, part…) are now treated as generic.

Two Phase 1 and 2 tests were updated for the new design, not weakened. M2 now tests leakage on a follow-up question, because the main question is a fixed template. P8's simulated model output now includes a passage type.

## Probe kit
Four story probes were added (N01–N04): characters named by description, a mixed Cantonese–English answer, a relationship without its link, and a forced generic moral that should not be credited. There are now 19 probes. Run as before: `node tests/probe/run_verdict_probes.mjs --model qwen3.5:27b --repeat 3`. Confirm the proposed expected values first.

## Still empirical (not shown by these tests)
- Whether Qwen classifies passage types correctly, especially for mixed texts such as a narrative opening to an argument.
- Whether the content-specific questions it writes are good, not just specific.
- Whether its verdicts on story answers are accurate.

These need real model output, checked by a human.

## Full Climb unchanged
- The checksums of all 36 pre-AGS files are unchanged.
- No app file imports the AGS modules.
- The build is still byte-identical to v10.3 (`index-uPG6pbNh.js`).
