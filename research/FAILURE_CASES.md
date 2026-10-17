# Real failure cases: Qwen 3.5 27B, prompt items-v10.1

Reported by the researcher on 15 Oct 2026, from one run on a curriculum-guide passage. The records themselves live in the researcher's browser research log. They were never deleted or overwritten, and both the rejected and the accepted candidates are there.
**To preserve them formally:** open **Inspect candidates** (home screen), choose the run, open each item, and add the annotation shown below. Then download **Full log (JSON)**.

## FC-01: Process 3, rejected by the strict paragraph rule
- Stem: *What does the text imply about how teachers should approach the Compulsory Part content?*
- Keyed: *Teachers can arrange content logically based on student needs despite the guide's order.*
- Validator: rejected. `cross_paragraph` failed: "Both evidence spans are in the same paragraph (strict mode)." This is a **structural** rule decision, not a semantic one.
- Researcher assessment (with ChatGPT): its process-3 validity can't be judged from paragraph location alone. It may be closer to **process 2**, because it seems to need only a local inference.
- Still needed: the full `anchor`, `anchor2` and `link`, their locations, and the shadow l3check verdict. All of these are in the inspector and the candidates CSV.
- Annotation to add: **Real failure case**, note "Possibly process 2: local inference; strict rule rejected it on location."
- Policy: strict mode is **not** loosened. Collect several such cases first, then decide whether the strict rule rejects genuinely valid integration items.

## FC-02: Process 4, accepted but suspected misaligned
- Stem: *Which judgment about the text's perspective on curriculum sequencing is best supported by the evidence provided?*
- Keyed: *The guide promotes a flexible approach because it explicitly states that teachers may arrange content in any logical sequence.*
- Assessment: **retrieval disguised as evaluation**. The keyed answer reports the author's stated position. It doesn't evaluate the reasoning, evidence, effectiveness or limitations.
- Annotation to add: **Suspected process misalignment**, note "Retrieval disguised as evaluation (states stated position)."
- Led to: the process-4 wording change in items-v10.2 and the shadow check l4check-v1.

## FC-03: Process 4 call failed and was reported as "thinking"
- The screen said "Level 4 failed at the none pass … spent its token budget thinking."
- **Not yet verified.** Up to v10.2:
  1. the app said "thinking" whenever the model returned *any* reasoning text, however short;
  2. the error box showed only the first 900 characters of the reply, so the cut at the third distractor may be the display limit, not the model's;
  3. when a call failed, the box could show the **previous** successful call's reply. So the visible JSON may come from an earlier call, possibly the call that produced FC-02.
- The facts are in that call's log record: `done_reason`, `eval_count` (output tokens), `num_predict` (2,000 for the "none" pass in v10.1), and the run's `think` setting. Open **Inspect candidates → Failed model calls**, or download **Model calls (CSV)**.
