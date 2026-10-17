# AARC exemplar set v10.1: review copy

Generated from `research/exemplars_v10.1.json`. The passage, its licence and its provenance are in `research/exemplar_passage_spacing.md`.

| | |
|---|---|
| Passage | "Why Cramming Fails: The Case for Spacing Out Study": original text (about 650 words, adult informational), **CC BY 4.0**, drafted by Claude for the AARC project; no third-party text |
| Use | **Exemplars only.** Never a formal evaluation passage, to avoid contamination. Each run logs `exemplar_ids` in its call records. |
| Status | Drafts for the researcher's review. `permission_confirmed` is **false** until the researcher approves each item. |
| Frameworks | Process labels follow PIRLS 2026 (Sabatini et al., 2024, pp. 12–15); adult informational tasks are informed by PISA 2018 (OECD, 2019, pp. 34–36) |
| Checked | Every evidence quote appears word for word in the passage. The four GOOD items pass all v10.1 code checks; the BAD process-3 item is rejected by the combination-grid check. |

## SP-P1: process 1, GOOD

**Skill:** retrieve a stated detail

**Question:** What did Ebbinghaus memorise in his experiments?

- A. Obscure facts
- B. Foreign vocabulary
- C. Lists of nonsense syllables  ✅ **correct**
- D. Simple mathematics procedures

**Evidence in the text:** “he memorised lists of nonsense syllables”

**Why this is process 1:** The answer is stated in one sentence and the stem and correct option use the text's own words (PIRLS 2026 p. 12: exact words within a sentence or two = focus on and retrieve; PISA 2018 p. 34: literal or close to literal matching).

**Distractors:** All three distractors are materials the text DOES mention, for other studies (obscure facts: the online study; foreign vocabulary and mathematics procedures: later research), so the reader must locate the right sentence rather than recognise a familiar phrase.

## SP-P2: process 2, GOOD

**Skill:** infer a consequence from a stated finding

**Question:** Based on the online study, what is most likely true of a person who must remember some facts for a year but reviews them one day after learning them?

- A. Their gap is shorter than ideal  ✅ **correct**
- B. Their gap is the ideal one for long-term memory
- C. Their review is wasted, because a single review has no effect
- D. They are certain to forget everything within a week

**Evidence in the text:** “people tested after a year benefited most from a gap of several weeks”

**Why this is process 2:** The text never says that a one-day gap is too short for a year. The reader must connect the stated finding (several weeks is best for a year) to the new case. The inference rests on one place in the text and the meaning stays clear (PIRLS 2026 p. 13). It is not a paraphrase of a stated sentence: the answer itself is nowhere in the text.

**Distractors:** B reverses the finding; C is unsupported (the study shows that reviews help); D over-generalises from 'shorter than ideal' to total forgetting.

## SP-P3: process 3, GOOD

**Skill:** integrate a causal explanation across paragraphs

**Question:** Taking paragraphs 4 and 5 together, why can a study method that feels easy be a poor guide to lasting learning?

- A. Easy methods work only for complex skills such as writing an argument
- B. Feeling at ease means the learner has stopped paying attention
- C. Rereading takes more total time than spacing the same material
- D. Material reread straight away has not been forgotten, so there is no effortful recall to strengthen it  ✅ **correct**

**Evidence in the text:** “learners tend to mistake this ease for learning” · “this effort of recalling it is what strengthens the memory”

**How the evidence combines:** Paragraph 4 says immediate rereading feels easy; paragraph 5 says the effort of recalling partly forgotten material strengthens memory. Together: the ease exists precisely because the effortful recall that builds memory is missing.

**Why this is process 3:** No sentence states this causal chain. The reader must synthesise an explanation from two paragraphs: a concept (the ease and the missing effort are two sides of one process) that is grounded in the text but not written in it (PIRLS 2026 p. 14; PISA 2018 p. 35: causal coherence relationships across the passage). The answer reuses words from the text ('effortful recall'), which is allowed: what matters is that the relationship has to be built by the reader.

**Distractors:** A misapplies a detail from the limitations paragraph; B is a plausible personal theory the text never offers; C contradicts the text's premise that total study time stays the same.

## SP-P3-WEAK: process 3, BAD (deliberately weak)

**Skill:** (none: retrieval of two separate facts)

**Question:** Which two facts are both stated in the passage?

- A. Ebbinghaus tested only himself, and the online study tested people up to a year later  (keyed)
- B. Ebbinghaus tested only himself, and the online study tested people up to a week later
- C. Ebbinghaus tested many students, and the online study tested people up to a year later
- D. Ebbinghaus tested many students, and the online study tested people up to a week later

**Evidence in the text:** “Using himself as the only participant” · “were then tested up to a year later”

**Why it is bad:** This is NOT process 3. It staples together two unrelated facts from different paragraphs and asks the reader to retrieve each one; the options are a 2 x 2 grid of 'X and Y' combinations. No interpretation or synthesis is needed, and finding the two evidence spans in different paragraphs does not make it integration.

## SP-P4: process 4, GOOD

**Skill:** judge how well a claim is supported

**Question:** Which statement best judges how well the author supports the claim that schools should build review into their timetables?

- A. Completely, because one study with more than a thousand adults proves that spacing works in schools
- B. Reasonably well, because the research evidence is broad, and the author openly admits it still needs testing in real classrooms  ✅ **correct**
- C. Not at all, because Ebbinghaus was the only participant in his experiments
- D. Poorly, because the author never discusses any weaknesses in the evidence

**Evidence in the text:** “repeated in hundreds of studies” · “The evidence also has limits” · “What researchers still need are careful studies in real classrooms”

**Why this is process 4:** The reader steps back from the content to judge the quality of the author's argument, weighing the strength of the evidence against the limitations the author states: a justified judgment about the text (PIRLS 2026 p. 15; PISA 2018 p. 35: assessing quality and credibility). Each option is a judgment plus a reason, and only one reason is supported by the text.

**Distractors:** A over-states one study (obscure facts, online, not schools); C ignores the century of later evidence; D is contradicted by the paragraph on limits.

## To use them
1. Review each item; edit the JSON if needed and record the edits in `exemplar_passage_spacing.md`.
2. Set `"permission_confirmed": true` on each approved item.
3. Model settings → Exemplar library → choose `exemplars_v10.1.json`. The panel shows how many are confirmed.
4. Only confirmed items are sent to the model: at most one GOOD and one BAD per process.
