# AGS Phase 1 test results

module ags-v0.2 · rules agsrules-v0.2 · fixture TP01-MAP-TEST (test-fixture-1) · run 2026-10-15T16:46:31.175Z

**19 / 19 passed**

| ID | Case | Result | What happened |
| --- | --- | --- | --- |
| R1 | Correct at once | PASS | K0 secured_independent, support 0 → next idea K1 |
| R2 | Partial, then correct | PASS | focused question on E2 → secured_after_focus, support 1 |
| R3 | Contradiction | PASS | incorrect (contradiction) → section pointer, opening question re-asked |
| R4 | Cap after three unsuccessful attempts | PASS | section → paragraph → evidence sentence shown → restated → supported, support 3 → K1 |
| R5 | Relationship: elements present, relation missing | PASS | partial (relation missing) → link_question |
| R6 | Relationship reversed | PASS | incorrect, comprehension error misread_relationship → pointer |
| R7 | Supported alternative (quote verified, relationship stated) | PASS | alternative_accepted, flagged for review; quote found in paragraph 17; map unchanged |
| R8 | Alternative with an unverified quote, and a genuinely uncertain one | PASS | (a) unverified quote → downgraded to uncertain, not credited, clarify once then pointer; (b) uncertain → neutral clarify, support unchanged |
| R9 | Copied answer | PASS | copy rate 1 → one own-words prompt; support stays 0; 'copied' flag kept |
| R10 | No attempt | PASS | no_attempt → section pointer, attempt 1 used |
| R11 | Turn cap (18) reached during K4 | PASS | turn 18 → to_summary; K4 not_reached; further answers refused |
| R12 | Early exit | PASS | exit at turn 5 logged; K2–K4 not_reached |
| R13 | Genuine passage quote, unsupported conclusion → no credit | PASS | genuine quote verified, judged unsupported → incorrect (unsupported_interpretation); quote alone never credits |
| R14 | All elements, wrong relationship → not correct | PASS | reversed → incorrect (misread_relationship); wrong_type → incorrect |
| R15 | Restatement after the cap must meet a minimum (regression) | PASS | blank → not_demonstrated_after_support (restate: no_attempt); incorrect → not_demonstrated; half the elements → supported; relationship without relation → not_demonstrated; both outcomes kept distinct with support 3; K0 still re-asked at the end |
| M-default | Relationship cross-paragraph rule defaults to OFF for AGS | PASS | fixture map valid with rule OFF (K3 evidence both in paragraph 14); setting logged in settings_used |
| M-on | Same map with the rule switched ON | PASS | K3 rejected when ON; setting logged |
| M1 | Evidence quote not in passage | PASS | K1: evidence 1 not found in the passage (not_in_passage) |
| M2 | Leaky question | PASS | K1: opening question gives the idea away (leakage 0.86) |
