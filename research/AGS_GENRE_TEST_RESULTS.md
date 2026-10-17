# AGS genre-sensitivity test results

module ags-v0.2 · rules agsrules-v0.2 · prompts agsmap-v0.2 · agsverdict-v0.2 · agssum-v0.2 · run 2026-10-15T16:46:31.462Z

**15 / 15 passed.** These tests are deterministic. Whether a real model classifies passage types correctly, and writes good genre-specific questions, has to be checked on real model output.

| ID | Case | Result | What happened |
| --- | --- | --- | --- |
| G1 | Narrative map (TP-02) is valid without a theme; story order kept | PASS | valid; no theme forced; order K0–K4 (story order); warning: no character idea: check the characters are covered in the main idea |
| G2 | Main-idea question and final re-ask follow the passage type | PASS | argumentative / narrative templates in place; an argumentative opening on an explanatory map is rejected |
| G3 | A wrong main question from the model is replaced by the template | PASS | 'main argument' on a story → replaced by 'What is this story mainly about?'; logged in audit |
| G4 | No argument questions for a story or an explanation | PASS | K3: opening question asks about an argument, but this is a narrative text |
| G5 | No moral, lesson or conclusion the map does not support | PASS | lesson question rejected; a theme with one quote rejected; conclusion question rejected |
| G6 | Follow-up questions must be about this passage, not generic | PASS | 'What happens next in the story?' and 'What is the most important detail here?' rejected as generic |
| G7 | Roles must fit the passage type | PASS | a 'character' idea in an argumentative map and a 'support' idea in a story are both rejected |
| G8 | A story relationship (motivation, K2) runs through the same rules | PASS | elements without the link → story-specific link question → then secured_after_focus |
| G9 | Verdict and summary prompts carry genre guidance | PASS | story verdicts accept characters named by description; summary guidance differs by type; the text's meaning is the standard |
| G10 | Map prompt asks for the type first and forbids forcing | PASS | prompt agsmap-v0.2: type decided first, three templates given, forcing forbidden; schema requires passage_type |
| G11 | Explanatory map (TP-03): valid, text order, nothing argumentative | PASS | valid; 511 words; text order kept (temperature after gas and gluten); argument and conclusion questions rejected |
| G12 | Story interpretation is optional, recorded apart from the plot | PASS | reading only → partial + plot question (flagged); plot + reading → correct, reading recorded; stock moral → incorrect; invented reading dropped; plot without reading → correct |
| G13 | Interpretation field exists only for stories | PASS | story verdicts and summaries carry an optional interpretation; informational ones do not |
| G14 | Summary feedback: at most 3 points, in priority order, no answers given | PASS | points: distortion > unsupported_claim > missing_main_idea; length is a note, never a point; no story feedback asks for a moral |
| G15 | Feedback guard replaces any point that would give an idea away | PASS | a point that would reveal the hidden statement is replaced by the neutral template |
