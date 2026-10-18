# Changes — v10.4 (17 Oct 2026)

Prompt `items-v10.3` · validator `validator-v10.2` · coverage `coverage-v2` · tutor `tutor-v1` · app `aarc-reading-lab-v10.4`.
**Runs before and after this change are not comparable without noting the version.**

## 1. Cloud model (OpenRouter) through the site
- New provider **Cloud (OpenRouter)**. The browser sends only an access code to `netlify/functions/llm.mjs`; the OpenRouter key (`OPENROUTER_API_KEY`), the model (`MODEL`) and the code (`APP_ACCESS_CODE`) live in Netlify environment variables.
- Thinking is turned off for reasoning models and JSON mode is used for structured requests. Output is capped at 4,000 tokens per call.
- Cloud runs are logged with provider `openrouter` and the model name OpenRouter reports in its reply. A hosted model has no digest: it can change without notice, so record the run date.
- An empty cloud reply is now logged as `empty_reply` (or `provider_filtered`), not as `output_truncated`.

## 2. Focus reading (before any questions)
- Turn on **Start with focus reading** on the start screen (on by default). The reader reads the passage alone first, with a count-up timer. Active time pauses while the tab is hidden.
- Tap a word for its meaning; **Add to my vocabulary** marks it as new to the reader.
- Select a sentence, several sentences or a paragraph (the ¶ button selects a paragraph) → **Highlight**, or **Explain this** to open the tutor.
- The **tutor** sees only the highlighted part and the text before it, never the rest of the passage. It explains in a short dialogue, offers a check question and follow-ups, and must not hint at later text.
- Progress = how far into the text the highlights reach (% of words). Scroll progress is logged separately.
- A draft is kept in the browser, so a reload during reading doesn't lose it.
- Everything is logged as a `reading_sessions` record (look-ups, saved words, highlights, every tutor turn, times). New export: **Focus reading (CSV)**, one row per event.

## 3. Questions written after reading, across the whole text
- Questions are written when the reader finishes focus reading (6 = 1·2·2·1 or 10 = 2·3·3·2, as before).
- The passage is split into four quarters by word count. A **coverage plan** gives every question a quarter, so all four quarters are used and no quarter has more than one question above another.
- Up to **one third** of the questions (2 of 6, 3 of 10) are built around what the reader did: parts she asked the tutor about first, then saved words (as "what does this word mean here?" items, process 2), then highlights. One of each kind is used before a second of any kind.
- The prompt marks the quarters and lists each item's quarter and focus, plus evidence already used.
- New checks: `distinct_evidence`, `in_target_quarter`, `focus_addressed` (see VALIDATOR.md). The run record holds `coverage_plan`, `coverage_summary` and `reading_id`; every candidate holds `slot_id`, `target_quarter`, `anchor_quarter` and `target_focus`.
- Research caveat: targeted questions differ between readers by design. Analyse targeted and untargeted items separately (`target_focus_kind` in the candidates CSV).

## 4. Fixes found in the first preview test
- **Correct answer was nearly always A.** Models write the key first. The app now moves the correct option to a planned position (each block of four candidates uses A, B, C and D once, in a seeded order per run) and reorders the distractors. The order is fixed per item; the position the model wrote is kept as `key_as_written` in the candidates CSV.
- **Question named the wrong section** ("roadworks in the final section" when the roadworks are in section 8). New check `location_consistent`: a stem that names a section must match where its evidence is; any mention of a "quarter" is rejected. The prompt also says quarters are for planning only.
- **Process-3 hints pointed at one place first.** The first two hints named only the first evidence span and the passage outlined only that place, which steered readers into a one-place reading. Now hint 1 names both sections ("This question joins two parts of the text: … and … Read both."), hint 2 names both paragraphs, the passage outlines both places at every step, and the last hint marks both spans. Hint counts before and after this change are not comparable for process 3.
- **Saved-word questions** must quote the words around the term, and the passage marks that sentence straight away (no hint needed), with the label "A word you saved while reading".

## 5. Help while answering: thinking first, location last
- **New hint ladder** (all processes): 1 strategy for the process (e.g. process 3: "Which two ideas does it ask you to connect?") · 2 key word in her own words · 3 the item's guiding question · 4 **strong help**: the section(s) to look in (both, for process 3). The paragraph step and the "evidence marked" step before answering are gone: location hints turned reading into search. The exact evidence is shown only after answering, as feedback.
- **Question coach** (`coach-v1`) replaces the general ask panel while a question is open. It answers facts and word meanings directly; for interpretation it asks one question back. It never names a place in the text or repeats the correct option: every reply is checked in code, rewritten once, then replaced by a neutral nudge. After she answers, it can explain fully.
- **Coach use before answering counts as help.** Each answer now records `coach` (turns before answering), `coachAfter`, `helped` and `locationShown`. Results line: "X of N answered without help · Y needed to be shown where to look · Z used the question coach".
- Selecting up to 1,500 characters (a whole paragraph) now opens "Ask about this"; the old limit was 400 and longer selections did nothing.
- Research note: hint counts and "answered without a hint" from before v10.4 are not comparable with these.

## 6. Quarters cut at sentences (coverage-v2)
- coverage-v1 cut the text into quarters between paragraphs. On a passage with a few very long paragraphs, a whole quarter fell inside one paragraph, so its marker was missing; the plan still asked for a question "from Quarter 2", and the model correctly declined. That level was then recorded as a shortfall.
- Now quarters are cut at sentence boundaries (a sentence belongs to the quarter where it starts), so a marker can sit inside a long paragraph; the text itself is unchanged.
- The plan only uses quarters that exist (a text of fewer than four sentences has fewer quarters).
- The quarter of evidence, highlights and saved words is judged by sentence, not by paragraph.
- Runs made with coverage-v1 on long-paragraph passages may show false shortfalls; check `coverage_version` in the run record.

## 7. Key-word hint moved last; no quarter labels anywhere
- The key-word hint ("Think about 'direction'. What does it mean here?") is now the LAST step, after "where to look". It is taken from the evidence sentence, so before the location it could not be answered, and searching for the word led straight to the evidence. Order now: strategy · guiding question · where to look (strong help) · key word.
- New check `no_planning_labels`: an item is rejected if any text the reader sees (stem, options, "why", link, hints) contains a quarter label such as "Q1" or "quarter 3". The earlier stem check rejected every "quarter"; ordinary phrases like "a quarter of the cost" are now allowed.

## 8. Tests
- New: `tests/focusCoverage.test.mjs` (20 deterministic cases: quarters, the coverage plan, the tutor's read-so-far text, the coverage block in the prompt, section-name check, answer-key positions, the coach's leak check, long-paragraph and short-text quarters, and the written question: W1–W3).

## 10. Evidence marked at sentence level after answering
- After a right or wrong answer, the passage marks only the 1–3 sentences that hold the evidence, in **bold** with a light highlight — never the whole paragraph. Before, when the model's evidence quote did not match the text word for word, the whole paragraph was tinted.
- Exact quote → every sentence the quote touches. Quote not exact → the run of 1–3 sentences that contains most of the quote's content words. Process 3 marks the sentences for both pieces of evidence.
- Sentence splitting ignores "e.g.", "i.e.", "Dr.", initials, and full stops followed by a lower-case word. Pure functions `sentenceSpans` and `evidenceSpans` in `src/coverage.js`; test E1.

## 14. The written question can be skipped
- "Skip the written question" next to "Get feedback" ends the session after the multiple-choice questions (for short sessions). The second self-rating and the results still follow.
- Logged as `skipped: true` in `written_answers` (column `skipped` in "Written answers (CSV)"); the review shows "Skipped."; Resume goes to the results, not back to the written question.

## 13. Self-rated understanding (AARC calibration, self-rating-v1)
- **After focus reading:** before the questions are made, she rates "how much of the text do you think you understand?" on 0–10. "Make my questions" stays disabled until she chooses.
- **After all questions (and the written question):** the results screen first asks the same question again, before showing any score, so the score cannot shape the rating. Then it shows: after reading x/10 · after the questions y/10 · correct without any help n of N.
- "Correct without any help" = answered correctly with no hint and no question coach — the performance side of calibration.
- Saved in the session (not asked again on Resume) and in the research log (`self_ratings`, one record per reading session, with `answered_total`, `correct_total`, `unaided_correct`). New export "Self-ratings (CSV)". The merge tool combines `self_ratings`.
- Interpretation note for the paper: a rise from the first to the second rating can reflect familiarity rather than understanding; compare it with unaided performance, not read it as a learning gain on its own.

## 12. Choosing by letter; word meanings in the question and options; coach knows her choice (coach-v2)
- **Only the letter chooses.** Each option has a large A/B/C/D button ("choose") on its left. Every word in the question and in the options can now be tapped for its meaning, before and after answering, without choosing that option by mistake.
- **"What is this question asking?"** under every question opens the question coach on the question itself. Before answering, the coach rephrases the question in simpler words and names the kind of answer wanted (`kind: "clarify"`), without hinting at the answer or the place. It still counts as help (logged with `about: "question"`, so it can be separated from help about the text).
- **The coach knows her choice.** After answering, the prompt says which letter she chose and whether it was wrong. For a wrong answer the coach first explains why her option does not fit the text, then why the correct one does. Ready-made questions: "Why is my answer (A) wrong?", "Why is B right?". The link under the question reads "Ask the coach why my answer is wrong". (Before, the coach did not know her choice and could wrongly say she had chosen the correct answer.)
- **Research log:** each answer now saves `lookups` (words she looked up before answering, and where: stem, option or passage). Word look-ups are not counted as help.
- Test Q2.

## 11. Key-word hint marks the word in the text
- When she opens the last hint ("Think about '…'"), the key word is also marked in the passage (bold, amber), and the panel scrolls to it. Header: "Narrowed to Section n · key word marked".
- Only the occurrence inside the evidence sentence is marked (so a common word is not lit up across the paragraph). If the word is not in the evidence sentence, its occurrences in the evidence section are marked. Endings are allowed ("log" matches "logs").
- After she answers, the key-word mark gives way to the evidence sentence(s) in bold.
- For the research data: the key-word hint now also shows the location exactly, so treat it as location help (it already came after "where to look").

## 9. Written question (written-v2, `src/written.js`)
- **Premise check.** After the written question is generated, a second call checks that everything it names (framework, finding, contradiction, link) exists in the text in that role. If not, the question is regenerated once with the problems listed. The check result is logged either way (`premise.ok`, `premise.regenerated`, `premise.attempts`).
- **The strong answer is never empty.** The marking reply is read under several field names (`model`, `model_answer`, `strong_answer`…); if none is there, one extra call writes the strong answer.
- **One revision first.** After feedback she gets "Try once more" with the nudge. She revises (or chooses "Skip, show me"). Only then are the improved answer and the strong answer shown.
- **"Your answer, improved".** Built from her revision (or first answer if skipped): her words are kept, added or changed parts are highlighted and numbered, each with a short reason. `kept_share` records how much of her wording survived.
- **Saved automatically.** Her first answer is saved the moment she submits (before the marking call, so a failed call never loses it), then the mark, the revision and the improved/strong answers as each arrives. Saved in the session (so "Resume" goes back to exactly where she was) and in the research log (`written_answers`).
- **Review screen** now shows the written question: first answer with its verdict, revision, improved answer and strong answer. If the written question is unfinished, a link returns to it. Resuming a session whose multiple-choice questions are all answered opens the written question if unfinished, otherwise the review.
- **New export:** "Written answers (CSV)", one row per written answer. The merge tool also combines `written_answers`.

# Changes — 15 Oct 2026

## 1. Hints no longer give the answer away
- Nothing in the passage is highlighted before you answer, unless you ask for a hint.
- The old "Where do I look?" link and the Off / Paragraph / Exact highlight switch are gone.
- New step-by-step hint ladder (you have to ask for each step in order):
  1. **Section**: "Look in Section 3 · M5. Evaluate". The section is outlined.
  2. **Paragraph**: "Focus on paragraph 2 of Section 3". Skipped when the section has only one paragraph.
  3. **Key word**: you write what the word means first, then you can compare with its meaning in this text.
  4. **Guiding question** about what the sentence means in context.
  5. **Evidence**: only now is the exact sentence marked.
- After you answer, the evidence sentence is marked as feedback, as before.
- Each answer records how many hints were used. The results screen shows "X of Y answered without a hint · Z needed the evidence shown".

## 2. Questions follow the order of the text
- The passage is split into numbered sections, shown as "SECTION 1, SECTION 2…" in the passage panel.
  - Headings are used when the text has them (markdown `#`, bold lines, or short title lines such as "M5. Evaluate").
  - With no headings, the text is cut into sections of roughly 250 words at paragraph breaks.
- Within each level, questions are sorted by where their evidence sits in the text, earliest first. Questions whose evidence can't be found go last.
- A level now appears only once all its questions are written, so the order doesn't shift while you're answering.

## Files changed
- `src/App.jsx`: sections, hint ladder, ordering, results line
- `src/llm.js`: the question format now includes `keyword`, `keyword_meaning` and `guide`

Sessions saved before this update still open. Their questions simply have fewer hint steps.

# Update — 15 Oct 2026, afternoon

## Fixed: a new passage started with all hints already open
The hint level was stored by question number only, so question 1 of a new passage reused question 1's hints from the last passage. It's now stored per passage as well, and every passage starts with no hints.

## New: your explanation of the key word is graded
At hint 3, write what the word means, then press **Check my explanation**. The AI gives one of six bands, plus one line on what you got right or wrong and one on how to improve:

| Band | Means |
|---|---|
| Excellent | Accurate meaning in this context, your own words, shows how the word works in the sentence |
| Good | Accurate in context and in your own words, but little link to the sentence |
| Satisfactory | Broadly right but vague, or the general dictionary sense rather than the meaning here |
| Weak | Partly right, with a clear gap or error |
| Poor | Mostly wrong |
| Unacceptable | Blank, irrelevant, or just copies the sentence |

- The meaning in this text is shown after grading, so you can compare.
- If most of your explanation is copied from the sentence, the band can't go above Satisfactory.
- The grader is told never to reveal the answer to the question you're on.
- Your text and band are saved with your answer (`wordGrade`), and the band is shown after you answer.

# Update — 15 Oct 2026, ⚑ Flag this question

After you answer, click **⚑ Flag this question — I think it's flawed**.
1. Tick what's wrong: wrong key · my answer is also defensible · evidence doesn't support it · wrong PIRLS level · unclear · needs outside knowledge · other.
2. Write your argument and point to the passage (at least 8 words).
3. The AI judges it using only the passage: **Upheld**, **Partly upheld** or **Not upheld**. You get its reasoning, whether your chosen option can be defended, and a suggested fix. The judge is told not to agree just because you disagree.

Your score doesn't change when a flag is upheld. The verdict is recorded separately, which keeps the data clean.

## The evaluation data
- Every flag is saved in this browser and on the answer inside its session.
- The home screen and the results screen show "⚑ N flagged questions" with **Download report (CSV)** and **JSON**.
- The CSV has one row per flag: the question, all 4 options, the keyed answer, your choice, the evidence, your flaw types and argument, and the AI's verdict, confirmed flaws, reasoning and fix.
- The `human_verdict` and `human_notes` columns are left blank for you to fill in. Compare them with `ai_verdict` to report how often the AI judge agrees with a human.

New files: `src/flags.js` (prompt, storage, export) and `src/Flag.jsx` (the panel).

# Update — your verdict, entered in the app

Under the AI's verdict on a flagged question there is now **YOUR VERDICT (HUMAN RATER)**:
- Click **upheld**, **partly upheld** or **not upheld**. It saves immediately and shows whether you agree with the AI.
- Type notes in the box. They save when you click away.
- You can change your verdict later; the latest one is what's exported.

The CSV fills `human_verdict` and `human_notes` from what you entered, and adds `ai_human_agree` (yes/no).
The home and results screens show "you rated N · AI agreed with you on M", which is the agreement figure for your paper.

# Update — go back and review

- **← Previous** (top right of each question, next to the counter) takes you back to earlier questions.
- An answered question now shows **what you used**: the hints you opened, your own explanation of the key word, its band and feedback, and the meaning in this text. It's read-only, so nothing changes your recorded answer.
- Hints you opened on an unanswered question stay open if you go back and return.
- The flag link now sits on its own line above the Next button.

# Update — scaffolding for the written question

Click **Break this question into parts for me**. You get one part per criterion, and each part has:
- **Help me with this part**: the same coarse-to-fine ladder as the MCQs (section → paragraph, if the section has more than one → the sentence marked → key word and its meaning → a smaller question → a sentence starter).
- **Put this starter in my notes**: adds the starter to your notes box so you can finish the sentence.
- **Your notes for this part**: a few words is enough.

Then **Put my notes into my answer** copies every part's notes into the answer box, one sentence per part, for you to tidy up before **Get feedback**.
- The passage highlights only what the part you're working on has reached. Click a part to switch.
- The AI breaks the question down and gives frames, but never writes the answer. The starters are only openers.
- The parts, your notes and your draft are saved with the session.
- Also fixed: the written-question screen no longer shows the last MCQ's evidence highlighted.

New file: `src/Scaffold.jsx`.

# Update — Clean up PDF text

A **Clean up PDF text** button sits under the paste box. When the pasted text looks like it came from a PDF, the button turns green and says so. It:
- re-joins words split across lines ("pedagog-" + "ical" → "pedagogical")
- joins broken lines and stray blank lines back into whole sentences and paragraphs
- puts headings such as "I. INTRODUCTION" and numbered items such as "1) …" on their own lines; headings become sections
- keeps "User:" / "Claude:" lines intact in whole-transcript mode

Click **Undo** to get the original back. This is for text-based PDFs; scanned PDFs need OCR, which this doesn't do.

New file: `src/cleanText.js`.

# Update — blind rating, and better level-3 questions

## Blind rating (on by default)
When you flag a question, the AI's verdict stays **hidden until you click your own**, so it can't sway you. The checkbox under your verdict turns this off.
- CSV columns: `human_first_verdict` (your first, blind verdict; use this for Kappa), `human_rated_blind`, and `human_final_verdict` (if you changed it after seeing the AI's).
- `ai_human_agree` and the home-screen count use your **first** verdict.

## Level 3 ("Read across") questions
They kept stapling two unrelated facts together ("What are the two conditions…", with options that were just the four combinations). Fixed in three places:
1. **Prompt**: the answer must be a new idea that only exists when two parts in different paragraphs are connected (cause/effect, contrast, how one explains or limits the other). Bad patterns are named and banned, and a good example is given.
2. **Two pieces of evidence**: level-3 questions must give `anchor2` (from a different paragraph) and `link` (how they connect). The hint ladder gains a step: "Now connect it with Section Y, paragraph Z."
3. **Quality check in code**: before you see a question, it is rejected and regenerated if:
   - a level 2–4 answer is copied from one sentence (it's really retrieval)
   - a level-3 question's options are an A-and-B combination grid
   - a level-3 question has no findable second piece of evidence, or both pieces are in the same paragraph

   On a retry, the model is told why its last items were rejected.

The results screen shows "Quality check rejected N generated questions (reasons…)", and the rejections are saved with the session. Report this number in the paper.

# v10 — reproducible technical evaluation (Steps 1–3)

No learning features were added and the interface was not redesigned. Changes, all aimed at a reproducible Gemma 12B evaluation:

## 1. Research log and export (`src/research.js`)
- **Append-only.** Every generation run, model call and candidate item (accepted **and** rejected) is recorded. Nothing is edited or deleted; generating the same passage again creates a new run.
- **Stable IDs:**
  - `passage_id` is a hash of the text, so the same text always gets the same ID
  - `run_id` is per generation
  - `call_id` = run + call number
  - `candidate_id` = run + process + number
- **Each run records:** prompt version, validator version, app version, provider, model, model digest (the exact Ollama build), temperature, items per request, thinking, context size, learner profile, text type, level-3 strict mode, and available exemplars.
- **Each call records:** the exact prompt (the passage is replaced by `<<PASSAGE>>` and stored once), a prompt hash, the pass mode (schema/json/none), the rejection feedback given, exemplar IDs, latency, token counts, the raw reply and any error.
- **Each candidate records:** the full item, the result of every check, rejection reasons, repairs, and evidence locations (section/paragraph).
- **Shortfalls** (fewer accepted than requested) are recorded with the model's reason, if it gave one.
- **Home screen:** "Research log: N runs · M candidates…" with **Candidates (CSV)** and **Full log (JSON)**.
- Flags now carry `candidate_id`, `run_id` and `passage_id`.

## 2. Quality-check corrections (see `VALIDATOR.md`)
- An evidence span must be found in the passage at **every** process; v9 never checked the first one.
- More than one option marked correct is **rejected**; v9 kept the first.
- The model must give exactly 4 options, all distinct.
- A stem repeated within a run is rejected.
- Level-3 different-paragraph rule: **configurable**, strict by default, labelled as a design constraint rather than a PIRLS rule.
- If the model says the text can't support a process, that process stops: it's recorded as a shortfall, not retried into inventing one.
- Retries are bounded per process.

## 3. Prompt v10 (`src/prompts.js`, `items-v10.0`)
- **Generic text framing.** It no longer says "the passage is the AI's answer to her question". The reader's question and goal analysis are no longer fed into the item prompt.
- **Configurable learner profile** (primary / secondary / adult, or a custom description) and **text type** (auto / story / information text).
- **Four PIRLS-informed processes**, with story skills (from your earlier prompt) and information-text equivalents.
- A **"skill" label** per item.
- "Must need this text" rule.
- An explicit option to return a **shortfall** instead of a weaker item.
- **Research set** button: 2 per process = 8.
- **Exemplar library** (Model settings): import a JSON file. Only entries with `permission_confirmed: true` are used, at most 1 per process. Template: `research/exemplars.template.json`.

## Also
- `VALIDATOR.md`: every check, its threshold and its known limits.
- `research/GEMMA_TEST_PROTOCOL.md`: how to run the Gemma batch and what to send back.

# v10.1: PIRLS 2026 prompt, exemplars, shadow meaning check (15 Oct 2026)

No learner-facing features were added. The only visible changes are the renamed question-set buttons and two new settings.

## Prompt `items-v10.1` (full text: `research/PROMPT_v10.1.md`)
- **PIRLS 2026 is the primary process framework.** Each process has five parts: *what it is · typical tasks · classification test · distractors · item form*.
- **PISA 2018 is supplementary**, used only for the adult informational task lists.
- Agreed corrections:
  - **P2:** rewording a stated sentence is not inference. If the item can be answered by matching words, even with synonyms, it is process 1.
  - **P3:** meaningful synthesis across parts of the text. Words from the text may appear in the answer; the relationship or conclusion itself must not be stated anywhere. Invented causes or conclusions are banned.
  - **P4:** a justified judgment from the text. Evaluative words in the stem are not enough. A "what is it for" question is process 1 when the text says so. "Best-supported judgment" option format.
- The P3 different-paragraph rule is labelled as an **AARC experimental constraint** (configurable, on by default).
- **Exemplars:** at most one GOOD and one BAD per process, with the reason each belongs (or doesn't) to the process. Only `permission_confirmed` items are used.
- **Quotation rule:** no double quotes inside text values. This prevents the cut-off question seen in the C&A run.
- Default text type is now **Information text**, for the initial adult experiment.

## Validator `validator-v10.1` (see `VALIDATOR.md`)
- New format check `stem_complete`: the question must end with a question mark (or colon) and have at least 4 words. Otherwise it's rejected as cut off.

## Shadow process-3 meaning check `l3check-v1` (non-blocking)
- After generation, the model judges every parsed process-3 candidate, **accepted and rejected**, on four points:
  - does it require integration?
  - do the two spans support a coherent relationship?
  - can it be answered from a single sentence (with a quote)?
  - does it add an unsupported inference?
- **It never accepts or rejects anything.** It runs after the learner already has the questions.
- Uses temperature 0 and the **same model as the generator**. That's a documented limitation, and the check is kept separate from the independent AI evaluator for the Kappa study.
- Stored as separate append-only `diagnostics` records, linked to the candidate. Shown as `l3m_*` columns in the candidates CSV.
- Setting: Model → Research settings → "Process 3 meaning check (shadow mode)", on by default.

## Question sets
- The buttons are renamed **Quick practice** (1·2·2·1), **Full practice** (2·3·3·2) and **Research set** (2·3·3·2, the PIRLS 20/30/30/20 mix, for formal runs).
- Runs before this change asked for 2/2/2/2; the log's `requested` field tells them apart.

## Exemplars (`research/`)
- `exemplar_passage_spacing.md`: original adult informational passage, CC BY 4.0, with provenance and facts to verify.
- `exemplars_v10.1.json`: importable set (P1–P4 GOOD, plus a BAD P3).
- `EXEMPLARS_v10.1.md`: review copy.
- OpenStax was considered and rejected: its licence is CC BY-NC-SA and it forbids use in generative AI without permission.

## What this changes for Section IV
- Cite **items-v10.1 / validator-v10.1 / l3check-v1** for any data generated from now on. Earlier runs are v10.0 and stay distinguishable in the log.
- The meaning check may be described as a *diagnostic recorded alongside rule-based screening*, not as part of the screening, and with the same-model limitation stated.

# v10.2: ready for Qwen 3.5 27B, fuller run records (15 Oct 2026)

The prompt and validator are **unchanged** (`items-v10.1`, `validator-v10.1`, `l3check-v1`), so v10.1 and v10.2 runs are directly comparable. Only the app version changes, to `aarc-reading-lab-v10.2`.

## Model identity, recorded with every run
At the start of each run the app asks Ollama for the model's:
- name and exact build (digest) and size
- family, parameter count and **quantisation**
- the Modelfile's own sampling defaults, verbatim (for example top_p, top_k, presence_penalty). These apply to every call unless the app overrides them, so they are part of the generation settings.
- native context length
- Ollama version

These are stored under `settings.model_info` in the JSON log and as CSV columns: `model_quantisation`, `model_parameter_size`, `model_family`, `modelfile_parameters`, `ollama_version`, `think`, `num_ctx`. **Test connection** now shows the same model line, so you can check it before a run.

## Passage source
Under the passage box, **Passage details for the research log** takes a title, source and licence. These are saved with the passage and the run, and exported as `passage_title`, `passage_source`, `passage_licence` and `passage_words`.

## Timing
The candidates CSV now includes `call_latency_ms`, `call_output_tokens` and `call_done_reason`, taken from the model call that produced each candidate.

## Larger local models
- The request time limit is now 7 minutes instead of 4, for 27B-class models. The error message tells you to check `ollama ps`.
- Any empty `<think></think>` block that Qwen 3.x leaves before its JSON is now stripped before parsing.

# v10.3: failure diagnosis, inspector, process-4 tightening (15 Oct 2026)

Versions:
- prompt `items-v10.2`: the process-4 wording changes; processes 1–3 are unchanged
- validator `validator-v10.1`: unchanged
- shadow checks `l3check-v1` (unchanged) and `l4check-v1` (new)
- app `aarc-reading-lab-v10.3`

All of these are logged per run and per call.

## Why
Two real Qwen 3.5 27B failures (`research/FAILURE_CASES.md`).

## Fixed: misleading failure messages
- **Thinking vs truncation.** "Thinking exhaustion" is now reported only when the reasoning is longer than the answer. Otherwise it's **Output truncated**, with "used N of M output tokens".
- **The error box shows the failed call's own output.** Before, a failed call could show the *previous* call's reply, cut to 900 characters. Now it shows this call's full answer and any reasoning, plus a metadata line: call id, done_reason, output tokens and num_predict, thinking sent on or off, and the length of the answer and reasoning in characters.
- **Content rejection is no longer called a format problem.** When every candidate fails the quality checks, the box says so and names the checks. "The model returned something, but not the shape the app needs" is gone.
- Each failed call is logged with its `error_kind`: `output_truncated`, `thinking_exhaustion` or `call_or_parse_error`, plus its raw answer and reasoning.

## Token budget
v10.1 gave two full items 1,600 output tokens (2,000 for process 3), and 2,000 on the retry passes. The new budget is 300 + 950 per item (1,100 for process 3), plus 400 on the retry passes. For two items that is 2,200 (process 3: 2,500), and 2,600 / 2,900 on retries. Every call records `num_predict`, so you can compare it against `eval_count`.

## Process 4 (items-v10.2)
- The reader must **apply an evaluative criterion**: sufficiency or relevance of evidence, soundness of reasoning, what is missing, what a limitation does to the conclusion, or the effect of language or structure.
- Identifying or restating the author's **stated** position, purpose or recommendation is explicitly not process 4.
- The correct option's reason must come from that weighing, never from "the text states…".
- Evaluative wording ("best supported", "judgment", "perspective") does not make an item process 4.

## Shadow process-4 meaning check, `l4check-v1` (non-blocking)
Runs after generation on every process-4 candidate, accepted and rejected. It records:
- whether a criterion is applied, and which one
- whether the answer is stated in the text, with the quote
- whether the evaluative wording is superficial

It never accepts or rejects anything, and uses the same model as the generator, the same limitation as l3check. The "Process 3 meaning check" setting now turns on both checks. The results are exported as `l4m_*` CSV columns.

## New: Inspect candidates (home screen)
A developer view of any run. For each candidate, accepted or rejected, it shows:
- the full item
- evidence (`anchor`, `anchor2`, `link`) with the section and paragraph where each was found
- **three separate boxes:**
  - the rule-based decision, split into structural and surface-content checks
  - the shadow meaning verdict
  - the model call's token metadata
- the failed model calls for that run, with their stored output

**Researcher annotations** (append-only): Real failure case · Suspected process misalignment · Looks valid but was rejected · Include in blind human review, each with a note. They are exported as `researcher_tags` and `researcher_notes`, and in the JSON as `annotations`. **These are developer labels, not ratings, and must never reach blind raters.**

## Exports
- **Candidates CSV** gains:
  - `failed_structural_checks` and `failed_surface_content_checks`
  - `researcher_tags` and `researcher_notes`
  - `call_num_predict`, `call_think_sent` and `call_thinking_chars`
  - the `l4m_*` columns
- New **Model calls (CSV)** (in the inspector): one row per call, failed calls included, with `error_kind`, `done_reason`, `eval_count`, `num_predict`, the thinking setting sent, answer and reasoning lengths, and the raw reply.
- Rejected candidates stay in the log and every export, so they remain available for blind human review.

## New test passage
`research/test_passage_free_buses.md` (TP-01): original, CC BY 4.0, explicitly fictional data, about 650 words. It has an argument, evidence spread across sections, a source with a stake, a confounding factor, a counter-argument that is only partly answered, and stated limitations.
