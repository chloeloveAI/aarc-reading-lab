/* ------------------------------------------------------------------ *
 * ags.js — Adaptive Guided Summarisation: rule core (Phase 1).
 *
 * PURE LOGIC ONLY. No model calls, no storage, no React, no imports from
 * the Full Climb code. Everything here is deterministic and unit-tested
 * (tests/ags.test.mjs).
 *
 * Division of labour (approved design):
 *   - the model RETURNS a structured verdict about one learner answer
 *     (per-element presence, contradiction, relation, alternative judgement);
 *   - THIS module derives the classification from those fields and picks
 *     the next move from a fixed table. The model never chooses the path.
 *
 * Status: proposed feature, not validated with learners. No claim of
 * learning benefit is made or implied by this code.
 * ------------------------------------------------------------------ */

export const AGS_VERSIONS = {
  module: "ags-v0.2",
  rules: "agsrules-v0.2" /* v0.2: genre-sensitive maps (16 Oct 2026) */,
};

export const DEFAULT_AGS_CONFIG = {
  maxAttemptsPerIdea: 3,
  maxTurns: 18,
  /* The two-different-paragraph rule for relationship evidence.
     OFF by default for AGS (researcher decision, 16 Oct 2026). It stays ON
     for the Full Climb process-3 experiment, which this module never touches. */
  relationCrossParagraph: false,
  /* answer counts as copied when ≥ this share of its word trigrams occur
     verbatim in the passage (and it has at least copyMinWords words) */
  copyThreshold: 0.8,
  copyMinWords: 6,
  /* a pre-written question fails when it contains ≥ this share of its own
     idea statement's content words */
  leakThreshold: 0.5,
  /* a supporting quote must have at least this many words to count */
  minQuoteWords: 4,
  /* summary length guidance only, never a scoring threshold */
  summaryWordTarget: [100, 150],
  /* topic-label support during summary writing: optional, hidden by default */
  topicLabelsVisibleByDefault: false,
};

/* ------------------------- genre sensitivity (v0.2) -------------------------
 * The map's passage_type decides which idea roles are allowed, the fixed
 * main-idea question, and what may and may not be asked. Nothing assumes
 * that a text argues, concludes or teaches a moral.                        */
export const PASSAGE_TYPES = ["informational_explanatory", "informational_argumentative", "narrative"];

export const ROLES_BY_TYPE = {
  informational_explanatory: ["main", "detail", "explanation", "relationship", "limitation", "conclusion"],
  informational_argumentative: ["main", "support", "relationship", "limitation", "conclusion"],
  narrative: ["main", "character", "setting", "conflict", "event", "motivation", "resolution", "theme"],
};
export const IDEA_ROLES = [...new Set(Object.values(ROLES_BY_TYPE).flat())];

/* the main-idea questions are fixed by code, not written by the model */
export const OPENING_QUESTIONS = {
  informational_explanatory: "What is the passage mainly explaining?",
  informational_argumentative: "What is the author's main argument or claim?",
  narrative: "What is this story mainly about?",
};
export const FINAL_REASK_QUESTIONS = {
  informational_explanatory: "Now, in a sentence, what is the passage mainly explaining?",
  informational_argumentative: "Now, in a sentence, what is the author's main argument or claim?",
  narrative: "Now, in a sentence, what is this story mainly about?",
};

/* an idea is a RELATIONSHIP when it carries a relation, whatever its role:
   a narrative 'motivation' or 'resolution' can link two things too */
export const RELATION_TYPES = ["cause", "contrast", "evidence_for", "limits", "concession", "motivation", "resolves"];
export const isRelational = (idea) => !!idea?.relation && RELATION_TYPES.includes(idea.relation.type);

/* reading order for argumentative maps (other types keep text order) */
const ROLE_RANK = { main: 0, detail: 1, support: 1, explanation: 2, relationship: 3, limitation: 4, conclusion: 5 };

/* words a follow-up question may use without being about THIS passage */
const GENERIC = new Set(
  "text passage story author writer part idea ideas mean means meaning happen happens happened say says said think thinks reader readers paragraph section explain explains main important information detail details line lines word words point points question answer thing things way ways something someone kind reason reasons else next first last end ending start beginning middle later earlier now then time times here there today people person most best main whole overall part parts piece".split(" ")
);

/* outcome of one idea, with the most help shown before success */
export const OUTCOMES = {
  secured_independent: 0,
  secured_after_focus: 1,
  secured_after_pointer: 2,
  supported: 3 /* restated after the evidence sentence, meeting the minimum */,
  not_demonstrated_after_support: 3 /* evidence shown, minimum still not met */,
  alternative_accepted: null /* support level recorded separately */,
  not_reached: null,
};

/* ---------------------------- text helpers ---------------------------- */

const STOP = new Set(
  "the a an and or but of to in on at for by with from as is are was were be been being it its this that these those there their they them he she his her we our you your i me my not no so than then too very can could would should may might will shall do does did done have has had about into over under after before more most some any each other what which who whom whose when where why how also just only per one two all".split(
    " "
  )
);

export function normaliseText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9'\- \n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function words(s) {
  return normaliseText(s)
    .replace(/\n/g, " ")
    .split(" ")
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
}

export function contentWords(s) {
  return words(s)
    .map((w) => w.replace(/'s$/, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/* paragraphs = blocks separated by blank lines (headings count as their own block) */
export function paragraphs(passage) {
  return String(passage || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/* Find an exact quotation (after normalising case, quotes, dashes and
   spacing). Returns the paragraph index, so evidence is traceable. */
export function findQuote(passage, quote, minWords = DEFAULT_AGS_CONFIG.minQuoteWords) {
  const q = words(quote).join(" ");
  if (!q || q.split(" ").length < minWords) return { found: false, paragraph: null, reason: "too_short" };
  const paras = paragraphs(passage);
  for (let i = 0; i < paras.length; i++) {
    if ((" " + words(paras[i]).join(" ") + " ").includes(" " + q + " ")) return { found: true, paragraph: i };
  }
  return { found: false, paragraph: null, reason: "not_in_passage" };
}

/* share of the answer's word trigrams that occur verbatim in the passage */
export function copyRate(answer, passage) {
  const a = words(answer);
  if (a.length < 3) return 0;
  const p = words(passage);
  const set = new Set();
  for (let i = 0; i + 2 < p.length; i++) set.add(p[i] + " " + p[i + 1] + " " + p[i + 2]);
  let hit = 0;
  const n = a.length - 2;
  for (let i = 0; i < n; i++) if (set.has(a[i] + " " + a[i + 1] + " " + a[i + 2])) hit++;
  return hit / n;
}

/* share of the statement's content words that appear in the text */
export function leakageScore(text, statement) {
  const s = [...new Set(contentWords(statement))];
  if (!s.length) return 0;
  const t = new Set(contentWords(text));
  return s.filter((w) => t.has(w)).length / s.length;
}

function jaccard(a, b) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (!A.size && !B.size) return 0;
  let i = 0;
  A.forEach((w) => B.has(w) && i++);
  return i / (A.size + B.size - i);
}

const NO_ATTEMPT = /^\s*(i\s*(do\s*not|don'?t|dont)\s*know|idk|not\s*sure|no\s*idea|dunno|\?+|-+|不知道|唔知|唔知道|不清楚|唔清楚|不懂|唔識|唔明|不明白)\s*[.!?。！？]*\s*$/i;

/* Loose normalisation for checking that a span the model quotes really is
   in the learner's answer: keeps every script (Latin, Chinese…), drops
   punctuation (incl. full-width), unifies case, width and spacing. */
export function looseNorm(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function spanInText(span, text) {
  const a = looseNorm(span);
  return !!a && looseNorm(text).includes(a);
}
const isBlank = (answer) => !looseNorm(answer);

/* ----------------------------- map checks ----------------------------- */

export function orderIdeas(map) {
  /* stories and explanations keep the order the text gives; argument maps
     follow claim → support → relationship → limitation → conclusion */
  const textOrder = map?.passage_type !== "informational_argumentative";
  return [...(map.ideas || [])]
    .map((idea, i) => ({ idea, i }))
    .sort((x, y) => {
      const mx = x.idea.role === "main" ? 0 : 1;
      const my = y.idea.role === "main" ? 0 : 1;
      if (mx !== my) return mx - my;
      if (textOrder) return x.i - y.i;
      return (ROLE_RANK[x.idea.role] ?? 9) - (ROLE_RANK[y.idea.role] ?? 9) || x.i - y.i;
    })
    .map((x) => x.idea);
}

const stem = (w) => w.replace(/(ies)$/, "y").replace(/([^s])s$/, "$1");

/* true when a question names something specific to this passage */
export function isContentSpecific(question, passage) {
  const p = new Set(contentWords(passage).map(stem));
  return contentWords(question).some((w) => !GENERIC.has(w) && !GENERIC.has(stem(w)) && p.has(stem(w)));
}

/* the actual words to show for a pending move (the UI calls this) */
export function questionText(map, pending) {
  if (!pending || !pending.idea) return null;
  const idea = (map.ideas || []).find((i) => i.id === pending.idea);
  if (!idea) return null;
  const q = idea.questions || {};
  switch (pending.move) {
    case "opening":
    case "pointer":
      return q.opening;
    case "focused_question":
      return q.focus?.[pending.element];
    case "link_question":
      return q.link;
    case "clarify":
      return q.clarify;
    case "own_words":
      return "Can you put that in your own words, instead of the text's?";
    case "cap_show_evidence":
      return "Read the highlighted sentence, then say this part in your own words.";
    case "final_main_reask":
      return FINAL_REASK_QUESTIONS[map.passage_type] || q.opening;
    default:
      return null;
  }
}

/**
 * validateMap(map, passage, cfg) → { ok, problems, settings_used }
 * Runs before a map may be used. settings_used is logged with the map so
 * the relationship-evidence setting in force is always on record.
 */
export function validateMap(map, passage, cfg = {}) {
  const c = { ...DEFAULT_AGS_CONFIG, ...cfg };
  const problems = [];
  const ideas = map?.ideas || [];
  const warnings = [];
  const type = map?.passage_type;
  const settings_used = {
    rules_version: AGS_VERSIONS.rules,
    passage_type: type || null,
    relationCrossParagraph: !!c.relationCrossParagraph,
    leakThreshold: c.leakThreshold,
    minQuoteWords: c.minQuoteWords,
  };
  if (!PASSAGE_TYPES.includes(type)) problems.push(`passage_type '${type}' must be one of ${PASSAGE_TYPES.join(", ")}`);
  const allowedRoles = ROLES_BY_TYPE[type] || IDEA_ROLES;
  if (ideas.length < 3 || ideas.length > 6) problems.push(`map has ${ideas.length} ideas; 3–6 required`);
  const mains = ideas.filter((x) => x.role === "main");
  if (mains.length !== 1) problems.push(`exactly one main idea required; found ${mains.length}`);
  else if (OPENING_QUESTIONS[type] && mains[0].questions?.opening !== OPENING_QUESTIONS[type])
    problems.push(`${mains[0].id}: main-idea question must be the ${type} template: '${OPENING_QUESTIONS[type]}'`);

  /* structure each genre needs, without forcing what the text lacks */
  const roles = ideas.map((x) => x.role);
  const nRel = ideas.filter(isRelational).length;
  if (type === "narrative") {
    if (!roles.some((r) => r === "conflict" || r === "event")) problems.push("a story map needs at least one conflict or event idea");
    if (!roles.includes("character")) warnings.push("no character idea: check the characters are covered in the main idea");
    if (!nRel) warnings.push("no relational idea (e.g. a motivation or what resolves the conflict)");
    if (roles.filter((r) => r === "theme").length > 1) problems.push("at most one theme idea");
  } else if (type) {
    if (!nRel) problems.push("an informational map needs at least one relationship (cause, explanation, contrast, evidence or limit)");
  }
  const hasTheme = roles.includes("theme");
  const hasConclusion = roles.includes("conclusion");
  const ids = ideas.map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push("idea ids are not unique");

  const order = orderIdeas(map).map((x) => x.id);
  ideas.forEach((idea) => {
    const tag = idea.id || "?";
    if (!allowedRoles.includes(idea.role)) problems.push(`${tag}: role '${idea.role}' is not used for ${type || "this"} texts`);
    if (!String(idea.statement || "").trim()) problems.push(`${tag}: empty statement`);
    const tl = words(idea.topic_label || "").length;
    if (!tl || tl > 5) problems.push(`${tag}: topic_label must be 1–5 words`);
    else if (leakageScore(idea.topic_label, idea.statement) >= 0.6 && contentWords(idea.topic_label).length >= 3)
      problems.push(`${tag}: topic_label states the idea instead of naming its topic`);
    const els = idea.elements || [];
    if (els.length < 2 || els.length > 3) problems.push(`${tag}: ${els.length} elements; 2–3 required`);
    const ev = idea.evidence || [];
    if (!ev.length) problems.push(`${tag}: no evidence`);
    const locs = ev.map((e) => findQuote(passage, e.quote, c.minQuoteWords));
    locs.forEach((l, k) => {
      if (!l.found) problems.push(`${tag}: evidence ${k + 1} not found in the passage (${l.reason})`);
    });

    if (idea.role === "relationship" && !isRelational(idea)) problems.push(`${tag}: a relationship idea needs a relation`);
    if (isRelational(idea)) {
      const r = idea.relation || {};
      if (!RELATION_TYPES.includes(r.type)) problems.push(`${tag}: relation type '${r.type}' not allowed`);
      const elIds = els.map((e) => e.id);
      if (!elIds.includes(r.from) || !elIds.includes(r.to) || r.from === r.to)
        problems.push(`${tag}: relation must link two different elements of this idea`);
      if (ev.length < 2) problems.push(`${tag}: a relationship needs at least two evidence quotes`);
      if (!idea.questions?.link) problems.push(`${tag}: a relationship needs a link_question`);
      if (c.relationCrossParagraph && locs.length >= 2 && locs.every((l) => l.found)) {
        const paras = new Set(locs.map((l) => l.paragraph));
        if (paras.size < 2) problems.push(`${tag}: relationship evidence is in one paragraph (cross-paragraph rule is ON)`);
      }
    }

    const qs = idea.questions || {};
    if (!qs.opening) problems.push(`${tag}: no opening question`);
    els.forEach((e) => {
      if (!qs.focus?.[e.id]) problems.push(`${tag}: no focused question for ${e.id}`);
    });
    const allQ = [
      ["opening", qs.opening],
      ...Object.entries(qs.focus || {}).map(([k, v]) => ["focus " + k, v]),
      ["link", qs.link],
      ["clarify", qs.clarify],
    ].filter(([, v]) => v);
    allQ.forEach(([name, text]) => {
      const isMainOpening = idea.role === "main" && name === "opening";
      const score = leakageScore(text, idea.statement);
      if (!isMainOpening && score >= c.leakThreshold) problems.push(`${tag}: ${name} question gives the idea away (leakage ${score.toFixed(2)})`);
      /* do not ask about what the text does not have */
      if (type && type !== "informational_argumentative" && /\b(argu\w*|claims?|persuad\w*)\b/i.test(text))
        problems.push(`${tag}: ${name} question asks about an argument, but this is a ${type} text`);
      if (!hasTheme && /\b(moral|lesson|theme|message)s?\b/i.test(text)) problems.push(`${tag}: ${name} question asks for a moral or theme the map does not support`);
      if (!hasConclusion && /\bconclu\w*/i.test(text)) problems.push(`${tag}: ${name} question asks for a conclusion the map does not include`);
      /* follow-ups must be about THIS passage, not a generic list */
      if (!isMainOpening && name !== "clarify" && !isContentSpecific(text, passage))
        problems.push(`${tag}: ${name} question is generic (names nothing specific from the passage)`);
    });
    if (idea.role === "theme" && (idea.evidence || []).length < 2)
      problems.push(`${tag}: a theme needs at least two supporting quotes, or should be left out`);

    (idea.depends_on || []).forEach((d) => {
      if (!ids.includes(d)) problems.push(`${tag}: depends on unknown idea ${d}`);
      else if (order.indexOf(d) > order.indexOf(idea.id)) problems.push(`${tag}: depends on ${d}, which comes later`);
    });
  });

  for (let i = 0; i < ideas.length; i++)
    for (let j = i + 1; j < ideas.length; j++)
      if (jaccard(ideas[i].statement, ideas[j].statement) >= 0.8) problems.push(`${ideas[i].id} and ${ideas[j].id} are not distinct`);

  return { ok: problems.length === 0, problems, warnings, settings_used };
}

/* ---------------------------- classification --------------------------- */

/**
 * classifyAnswer({ idea, verdict, answer, passage, cfg })
 *
 * verdict (from the model; every field optional, unknown values ignored):
 *   no_attempt: bool
 *   elements: { E1: "present" | "absent" | "contradicted", … }
 *   contradicts_text, misreading: bool
 *   relation_expressed: "correct" | "missing" | "reversed" | "wrong_type"
 *   alternative: { judgement: "none" | "supported" | "uncertain" | "unsupported",
 *                  quote, states_relation: bool, explanation }
 *   expression: { unclear: bool }
 *
 * Precedence (the first rule that applies decides):
 *   1 no attempt
 *   2 contradiction / misreading / reversed relation / wrong relation type
 *     (unless that type is judged a supported alternative) → incorrect
 *   3 every element present: relation ok → correct; relation missing → partial (link)
 *   4 alternative judged SUPPORTED, quote verified in code (and, for a
 *     relationship idea, a relationship stated) → alternative_supported
 *       (unverified quote or no relationship → downgraded to uncertain)
 *   5 some elements present → partial
 *   6 alternative judged UNCERTAIN → alternative_uncertain
 *   7 otherwise → incorrect (incl. alternative judged UNSUPPORTED)
 * A real passage quotation in the answer never earns credit by itself.
 */
export function classifyAnswer({ idea, verdict = {}, answer = "", passage = "", cfg = {} }) {
  const c = { ...DEFAULT_AGS_CONFIG, ...cfg };
  const path = [];
  const errors = [];
  const flags = [];
  const els = (idea.elements || []).map((e) => e.id);
  const st = (id) => verdict.elements?.[id] || "absent";
  const present = els.filter((id) => st(id) === "present");
  const missing = els.filter((id) => st(id) !== "present");
  const contradicted = els.filter((id) => st(id) === "contradicted");
  const isRel = isRelational(idea);
  const rel = isRel ? verdict.relation_expressed || "missing" : null;
  const alt = verdict.alternative || {};
  const judgement = ["supported", "uncertain", "unsupported"].includes(alt.judgement) ? alt.judgement : "none";
  /* optional thematic interpretation (stories): recorded separately from
     the plot; never required, never penalised, never a substitute */
  const interp = verdict.interpretation || {};
  const interpretation = ["defensible", "uncertain", "unsupported"].includes(interp.judgement)
    ? { judgement: interp.judgement, learner_span: String(interp.learner_span || "") }
    : { judgement: "none", learner_span: "" };
  const cr = copyRate(answer, passage);
  const copied = words(answer).length >= c.copyMinWords && cr >= c.copyThreshold;
  if (copied) flags.push("copied");
  if (verdict.expression?.unclear) flags.push("unclear");

  let quote_check = null;
  if (judgement !== "none" && alt.quote) quote_check = { claimed: alt.quote, ...findQuote(passage, alt.quote, c.minQuoteWords) };

  let classification;
  let alternative_outcome = judgement === "none" ? "none" : "alternative_" + judgement;
  let needs_review = false;

  if (isBlank(answer) || NO_ATTEMPT.test(answer) || verdict.no_attempt === true) {
    classification = "no_attempt";
    path.push("1:no_attempt");
  } else if (
    contradicted.length ||
    verdict.contradicts_text === true ||
    verdict.misreading === true ||
    rel === "reversed" ||
    /* a wrong TYPE of relationship is a misreading too, unless the model
       judged it a supported alternative (then rule 4 checks the evidence) */
    (rel === "wrong_type" && judgement !== "supported")
  ) {
    classification = "incorrect";
    if (contradicted.length || verdict.contradicts_text) errors.push("contradiction");
    if (verdict.misreading) errors.push("misreading");
    if (rel === "reversed" || rel === "wrong_type") errors.push("misread_relationship");
    path.push("2:contradiction_or_reversed");
    if (judgement === "supported") {
      /* the model contradicted itself: never credit, send to review */
      needs_review = true;
      flags.push("inconsistent_verdict");
      alternative_outcome = "alternative_unsupported";
    }
  } else if (missing.length === 0 && (!isRel || rel === "correct")) {
    classification = "correct";
    path.push("3:all_elements" + (isRel ? "+relation_correct" : ""));
  } else if (missing.length === 0 && isRel && rel === "missing") {
    classification = "partial";
    path.push("3:all_elements_relation_missing");
  } else if (judgement === "supported") {
    const quoteOk = !!quote_check?.found;
    const relOk = !isRel || alt.states_relation === true;
    if (quoteOk && relOk) {
      classification = "alternative_supported";
      needs_review = true;
      path.push("4:alternative_supported_verified");
    } else {
      /* evidence or relationship not established: not credited, not marked wrong */
      classification = present.length ? "partial" : "alternative_uncertain";
      alternative_outcome = "alternative_uncertain";
      needs_review = true;
      if (!quoteOk) flags.push("alternative_quote_not_verified");
      if (!relOk) flags.push("alternative_relation_not_stated");
      path.push("4:alternative_downgraded_to_uncertain");
    }
  } else if (present.length) {
    classification = "partial";
    path.push("5:some_elements");
  } else if (interpretation.judgement === "defensible") {
    /* a defensible reading of the story, but none of the events: not wrong,
       not enough; the next question asks about what happens */
    classification = "partial";
    flags.push("interpretation_only");
    needs_review = true;
    path.push("5b:defensible_interpretation_without_plot");
  } else if (judgement === "uncertain") {
    classification = "alternative_uncertain";
    needs_review = true;
    path.push("6:alternative_uncertain");
  } else {
    classification = "incorrect";
    if (judgement === "unsupported") errors.push("unsupported_interpretation");
    if (!errors.length) errors.push("key_elements_missing");
    path.push("7:incorrect");
  }

  if (interpretation.judgement === "defensible" || interpretation.judgement === "uncertain") needs_review = true;
  return {
    classification,
    alternative_outcome,
    interpretation,
    present_elements: present,
    missing_elements: missing,
    relation_status: rel,
    comprehension_errors: errors,
    expression_flags: flags,
    copy_rate: Math.round(cr * 1000) / 1000,
    copied,
    quote_check,
    needs_review,
    rule_path: path,
  };
}

/* ------------------- minimum after the evidence cap -------------------- *
 * After three unsuccessful attempts the learner sees the evidence sentence
 * and restates the idea. 'supported' is recorded ONLY when the restatement
 * meets this minimum; otherwise 'not_demonstrated_after_support'.
 *   - correct, or a code-verified supported alternative → met
 *   - non-relationship idea: partial with at least half of the elements
 *     present (rounded up) and no comprehension error → met
 *   - relationship idea: the relationship itself must be right; elements
 *     without the relation are not enough
 *   - blank / no attempt / incorrect / uncertain → not met               */
export function meetsRestateMinimum(idea, cls) {
  if (cls.classification === "correct" || cls.classification === "alternative_supported") return true;
  if (cls.classification !== "partial") return false;
  if (isRelational(idea)) return false;
  if (cls.comprehension_errors.length) return false;
  const n = (idea.elements || []).length;
  return cls.present_elements.length >= Math.ceil(n / 2);
}

/* ------------------------------ session ------------------------------- */

const clone = (x) => JSON.parse(JSON.stringify(x));

export function createSession(map, cfg = {}) {
  const c = { ...DEFAULT_AGS_CONFIG, ...cfg };
  const order = orderIdeas(map).map((x) => x.id);
  const ideas = {};
  order.forEach((id) => {
    ideas[id] = {
      attempts: 0,
      support: 0,
      pointer_step: 0,
      focus_asked: [],
      link_asked: false,
      clarify_asked: false,
      own_words_asked: false,
      expression_flags: [],
      status: "pending",
      outcome: null,
      needs_review: false,
    };
  });
  return {
    versions: { ...AGS_VERSIONS },
    map_id: map.map_id || null,
    map_version: map.map_version || null,
    map_review_status: map.review_status || "unreviewed",
    cfg: c,
    order,
    index: 0,
    turns: 0,
    phase: "guided" /* guided | cap_restate | final_reask | done */,
    pending: { idea: order[0], move: "opening", question_ref: order[0] + ".opening" },
    ideas,
    final_main_reask: null,
    exit_reason: null,
  };
}

function outcomeFor(support) {
  return support >= 2 ? "secured_after_pointer" : support === 1 ? "secured_after_focus" : "secured_independent";
}

/* move to the next idea, or finish (with the one final main-idea re-ask
   when K0 needed the evidence cap and turns remain) */
function advance(s, map) {
  s.index += 1;
  while (s.index < s.order.length && s.ideas[s.order[s.index]].status !== "pending") s.index += 1;
  if (s.index < s.order.length) {
    const id = s.order[s.index];
    s.ideas[id].status = "active";
    s.pending = { idea: id, move: "opening", question_ref: id + ".opening" };
    return;
  }
  const main = orderIdeas(map).find((x) => x.role === "main")?.id;
  const mainOutcome = main && s.ideas[main].outcome;
  if ((mainOutcome === "supported" || mainOutcome === "not_demonstrated_after_support") && !s.final_main_reask && s.turns < s.cfg.maxTurns) {
    s.phase = "final_reask";
    s.pending = { idea: main, move: "final_main_reask", question_ref: main + ".final" };
    return;
  }
  finish(s, "complete");
}

function finish(s, reason) {
  s.phase = "done";
  s.exit_reason = s.exit_reason || reason;
  s.order.forEach((id) => {
    if (!s.ideas[id].outcome) {
      s.ideas[id].outcome = "not_reached";
      s.ideas[id].status = "done";
    }
  });
  s.pending = { idea: null, move: "to_summary", question_ref: null };
}

/**
 * applyAnswer(session, map, { answer, verdict, passage })
 * → { session, record }   (input session is not modified)
 * One learner answer = one turn. The record is what gets logged.
 */
export function applyAnswer(session, map, { answer = "", verdict = {}, passage = "" }) {
  const s = clone(session);
  if (s.phase === "done") throw new Error("Session is finished; no more answers are accepted.");
  const ideaId = s.pending.idea;
  const idea = map.ideas.find((x) => x.id === ideaId);
  const st = s.ideas[ideaId];
  if (st.status === "pending") st.status = "active";
  s.turns += 1;
  const asked = { ...s.pending };
  const record = {
    rules_version: AGS_VERSIONS.rules,
    module_version: AGS_VERSIONS.module,
    map_id: s.map_id,
    map_version: s.map_version,
    map_review_status: s.map_review_status,
    settings: { relationCrossParagraph: s.cfg.relationCrossParagraph, maxAttemptsPerIdea: s.cfg.maxAttemptsPerIdea, maxTurns: s.cfg.maxTurns },
    turn: s.turns,
    idea_id: ideaId,
    question_asked: asked,
    answer,
    verdict,
  };

  /* --- the learner restates after the cap: 'supported' only if the
         restatement meets the minimum (meetsRestateMinimum) --- */
  if (s.phase === "cap_restate") {
    const cls = classifyAnswer({ idea, verdict, answer, passage, cfg: s.cfg });
    record.classification = cls;
    record.restatement = true;
    const met = meetsRestateMinimum(idea, cls);
    record.restate_minimum_met = met;
    cls.expression_flags.forEach((f) => !st.expression_flags.includes(f) && st.expression_flags.push(f));
    if (cls.needs_review) st.needs_review = true;
    st.outcome = met ? "supported" : "not_demonstrated_after_support";
    st.restate_classification = cls.classification;
    st.support = 3;
    st.status = "done";
    record.outcome = st.outcome;
    s.phase = "guided";
    advance(s, map);
    record.next = s.pending;
    record.support_level = 3;
    return { session: s, record };
  }

  /* --- the single final re-ask of the main idea: recorded separately --- */
  if (s.phase === "final_reask") {
    const cls = classifyAnswer({ idea, verdict, answer, passage, cfg: s.cfg });
    record.classification = cls;
    s.final_main_reask = { classification: cls.classification, turn: s.turns };
    record.final_main_reask = s.final_main_reask;
    finish(s, "complete");
    record.next = s.pending;
    return { session: s, record };
  }

  st.attempts += 1;
  record.attempt = st.attempts;
  const cls = classifyAnswer({ idea, verdict, answer, passage, cfg: s.cfg });
  record.classification = cls;
  cls.expression_flags.forEach((f) => !st.expression_flags.includes(f) && st.expression_flags.push(f));
  if (cls.needs_review) st.needs_review = true;
  const attemptsLeft = st.attempts < s.cfg.maxAttemptsPerIdea;
  let next;

  if (cls.classification === "correct" || cls.classification === "alternative_supported") {
    if (cls.copied && !st.own_words_asked && attemptsLeft) {
      st.own_words_asked = true;
      next = { idea: ideaId, move: "own_words", question_ref: ideaId + ".own_words" };
    } else {
      st.outcome = cls.classification === "alternative_supported" ? "alternative_accepted" : outcomeFor(st.support);
      st.status = "done";
      record.outcome = st.outcome;
    }
  } else if (!attemptsLeft) {
    st.support = 3;
    s.phase = "cap_restate";
    next = { idea: ideaId, move: "cap_show_evidence", question_ref: ideaId + ".evidence_sentence" };
  } else if (cls.classification === "partial") {
    const firstMissing = cls.missing_elements.find((e) => !st.focus_asked.includes(e));
    if (cls.relation_status === "missing" && cls.missing_elements.length === 0 && !st.link_asked) {
      st.link_asked = true;
      st.support = Math.max(st.support, 1);
      next = { idea: ideaId, move: "link_question", question_ref: ideaId + ".link" };
    } else if (firstMissing) {
      st.focus_asked.push(firstMissing);
      st.support = Math.max(st.support, 1);
      next = { idea: ideaId, move: "focused_question", element: firstMissing, question_ref: `${ideaId}.focus.${firstMissing}` };
    } else {
      next = pointerMove(st, ideaId);
    }
  } else if (cls.classification === "alternative_uncertain" && !st.clarify_asked) {
    /* neutral clarification: no answer content, support level unchanged */
    st.clarify_asked = true;
    next = { idea: ideaId, move: "clarify", question_ref: ideaId + ".clarify" };
  } else {
    next = pointerMove(st, ideaId);
  }

  if (st.status === "done") advance(s, map);
  else s.pending = next;

  /* the turn cap: if another learner turn would be needed, stop here */
  if (s.phase !== "done" && s.turns >= s.cfg.maxTurns) {
    record.turn_cap_reached = true;
    finish(s, "turn_cap");
  }
  record.support_level = st.support;
  record.next = s.pending;
  return { session: s, record };
}

function pointerMove(st, ideaId) {
  st.pointer_step = Math.min(st.pointer_step + 1, 2);
  st.support = Math.max(st.support, 2);
  return { idea: ideaId, move: "pointer", pointer: st.pointer_step === 1 ? "section" : "paragraph", question_ref: ideaId + ".opening" };
}

/* learner chooses "go to my summary" */
export function learnerExit(session) {
  const s = clone(session);
  if (s.phase !== "done") {
    s.exit_reason = "learner_exit";
    finish(s, "learner_exit");
  }
  return { session: s, record: { rules_version: AGS_VERSIONS.rules, event: "learner_exit", turn: s.turns } };
}

/* per-idea summary of a finished session (for the log and the summary stage) */
export function sessionOutcomes(session) {
  return session.order.map((id) => {
    const x = session.ideas[id];
    return {
      idea_id: id,
      outcome: x.outcome,
      support_level: x.outcome === "not_reached" ? null : x.support,
      attempts: x.attempts,
      restate_classification: x.restate_classification || null,
      needs_review: x.needs_review,
      expression_flags: x.expression_flags,
    };
  });
}

/* ====================================================================== *
 * Phase 2: normalising MODEL OUTPUT before the rules see it.
 * The model's JSON is never trusted as-is: unknown values fall back to
 * safe defaults, and every "present" / "covered" judgement must quote
 * words that really are in the learner's text, or it is downgraded.
 * Each change is listed in `audit`, which is logged with the record.
 * ====================================================================== */

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/* model verdict (agsverdict-v0.2) → the verdict shape classifyAnswer reads */
export function normaliseVerdict(raw, idea, answer) {
  const audit = { invalid_fields: [], downgrades: [] };
  const r = raw && typeof raw === "object" ? raw : {};
  if (!raw || typeof raw !== "object") audit.invalid_fields.push("whole_reply");
  const elements = {};
  const spans = {};
  (idea.elements || []).forEach((e) => {
    const x = r.elements?.[e.id] || {};
    let status = pick(x.status, ["present", "absent", "contradicted"], "absent");
    if (x.status !== undefined && x.status !== status) audit.invalid_fields.push(`elements.${e.id}.status`);
    if (r.elements?.[e.id] === undefined) audit.invalid_fields.push(`elements.${e.id}`);
    const span = String(x.learner_span || "");
    if (status !== "absent" && !spanInText(span, answer)) {
      audit.downgrades.push(`${e.id}: ${status} → absent (learner_span not found in the answer)`);
      status = "absent";
    }
    elements[e.id] = status;
    spans[e.id] = status === "absent" ? "" : span;
  });
  const isRel = isRelational(idea);
  let rel = null;
  if (isRel) {
    rel = pick(r.relation_expressed, ["correct", "missing", "reversed", "wrong_type"], "missing");
    if (r.relation_expressed !== rel) audit.invalid_fields.push("relation_expressed");
  }
  const a = r.alternative || {};
  const judgement = pick(a.judgement, ["none", "supported", "uncertain", "unsupported"], "none");
  if (a.judgement !== undefined && a.judgement !== judgement) audit.invalid_fields.push("alternative.judgement");
  const bool = (k) => {
    if (r[k] !== undefined && typeof r[k] !== "boolean") audit.invalid_fields.push(k);
    return r[k] === true;
  };
  const it = r.interpretation || {};
  let ij = pick(it.judgement, ["none", "defensible", "uncertain", "unsupported"], "none");
  if (it.judgement !== undefined && it.judgement !== ij) audit.invalid_fields.push("interpretation.judgement");
  const ispan = String(it.learner_span || "");
  if (ij !== "none" && !spanInText(ispan, answer)) {
    audit.downgrades.push(`interpretation: ${ij} → none (learner_span not found in the answer)`);
    ij = "none";
  }
  const verdict = {
    interpretation: { judgement: ij, learner_span: ij === "none" ? "" : ispan },
    no_attempt: bool("no_attempt"),
    elements,
    contradicts_text: bool("contradicts_text"),
    misreading: bool("misreading"),
    relation_expressed: rel,
    alternative: { judgement, quote: String(a.passage_quote || ""), states_relation: a.states_relation === true },
    expression: { unclear: bool("expression_unclear") },
  };
  return {
    verdict,
    learner_spans: spans,
    answer_language: pick(r.answer_language, ["en", "zh", "mixed", "other"], "other"),
    reason: String(r.reason || "").slice(0, 600),
    audit,
  };
}

/* model map (agsmap-v0.2) → map shape validateMap reads.
   review_status is ALWAYS 'unreviewed' here, whatever the model wrote. */
export function normaliseMap(raw, { passage_id = null, map_id = null, map_version = null } = {}) {
  const audit = { changes: [] };
  const ideas = (raw?.ideas || []).map((x, i) => {
    const idea = {
      id: String(x.id || "K" + i),
      role: String(x.role || ""),
      topic_label: String(x.topic_label || ""),
      statement: String(x.statement || ""),
      elements: (x.elements || []).map((e, k) => ({ id: String(e.id || "E" + (k + 1)), label: String(e.label || "") })),
      evidence: (x.evidence || []).map((e) => ({ quote: String(e.quote || "") })),
      depends_on: (x.depends_on || []).map(String),
      misreadings: (x.misreadings || []).map(String),
      accepted_alternatives: [],
      questions: { opening: String(x.questions?.opening || ""), focus: {} },
    };
    const f = x.questions?.focus;
    if (Array.isArray(f)) f.forEach((q) => q && q.element && (idea.questions.focus[String(q.element)] = String(q.question || "")));
    else if (f && typeof f === "object") Object.entries(f).forEach(([k, v]) => (idea.questions.focus[k] = String(v || "")));
    if (x.questions?.clarify) idea.questions.clarify = String(x.questions.clarify);
    const rel = {
      type: String(x.relation?.type || ""),
      from: String(x.relation?.from || ""),
      to: String(x.relation?.to || ""),
      direction: String(x.relation?.direction || ""),
    };
    const elIds = idea.elements.map((e) => e.id);
    const usable = RELATION_TYPES.includes(rel.type) && elIds.includes(rel.from) && elIds.includes(rel.to) && rel.from !== rel.to;
    if (idea.role === "relationship" || usable) {
      /* kept (a 'relationship' idea is kept even when broken, so validateMap reports it) */
      idea.relation = rel;
      if (x.questions?.link) idea.questions.link = String(x.questions.link);
    } else if (rel.type && rel.type !== "none") {
      audit.changes.push(`${idea.id}: relation removed (type '${rel.type}' does not link two of this idea's elements)`);
    }
    return idea;
  });
  if (raw?.review_status && raw.review_status !== "unreviewed") audit.changes.push(`review_status '${raw.review_status}' from the model ignored`);
  const passage_type = PASSAGE_TYPES.includes(raw?.passage_type) ? raw.passage_type : null;
  if (!passage_type) audit.changes.push(`passage_type '${raw?.passage_type}' not recognised`);
  /* the main-idea question is fixed by code for each passage type */
  const main = ideas.find((i) => i.role === "main");
  if (main && passage_type && main.questions.opening !== OPENING_QUESTIONS[passage_type]) {
    audit.changes.push(`${main.id}: main-idea question replaced by the ${passage_type} template (model wrote '${main.questions.opening}')`);
    main.questions.opening = OPENING_QUESTIONS[passage_type];
  }
  return {
    map: {
      map_id,
      passage_id,
      map_version,
      review_status: "unreviewed",
      passage_type,
      passage_type_reason: String(raw?.passage_type_reason || "").slice(0, 400),
      ideas,
    },
    audit,
  };
}

/* model summary assessment (agssum-v0.2) → checked record */
export function normaliseSummary(raw, map, summary) {
  const audit = { invalid_fields: [], downgrades: [] };
  const r = raw && typeof raw === "object" ? raw : {};
  const ideas = {};
  (map.ideas || []).forEach((i) => {
    const x = r.ideas?.[i.id] || {};
    let status = pick(x.status, ["covered", "missing", "distorted"], "missing");
    if (x.status !== undefined && x.status !== status) audit.invalid_fields.push(`ideas.${i.id}.status`);
    const span = String(x.learner_span || "");
    if (status !== "missing" && !spanInText(span, summary)) {
      audit.downgrades.push(`${i.id}: ${status} → missing (learner_span not found in the summary)`);
      status = "missing";
    }
    ideas[i.id] = { status, learner_span: status === "missing" ? "" : span };
  });
  const relations = {};
  (map.ideas || [])
    .filter(isRelational)
    .forEach((i) => {
      const x = r.relations?.[i.id] || {};
      let status = pick(x.status, ["correct", "missing", "reversed", "wrong_type"], "missing");
      const span = String(x.learner_span || "");
      if (status !== "missing" && !spanInText(span, summary)) {
        audit.downgrades.push(`relation ${i.id}: ${status} → missing (learner_span not found)`);
        status = "missing";
      }
      if (ideas[i.id].status === "missing" && status === "correct") {
        audit.downgrades.push(`relation ${i.id}: correct → missing (idea itself not covered)`);
        status = "missing";
      }
      relations[i.id] = { status, learner_span: status === "missing" ? "" : span };
    });
  const unsupported = (r.unsupported_claims || [])
    .map((c) => String(c?.learner_span || ""))
    .filter((t) => {
      const ok = spanInText(t, summary);
      if (!ok && t) audit.downgrades.push("unsupported claim dropped (not found in the summary)");
      return ok;
    });
  const it = r.interpretation || {};
  let ij = pick(it.judgement, ["none", "defensible", "uncertain", "unsupported"], "none");
  const ispan = String(it.learner_span || "");
  if (ij !== "none" && !spanInText(ispan, summary)) {
    audit.downgrades.push(`interpretation: ${ij} → none (learner_span not found in the summary)`);
    ij = "none";
  }
  return {
    ideas,
    relations,
    interpretation: { judgement: ij, learner_span: ij === "none" ? "" : ispan },
    unsupported_claims: unsupported,
    too_much_detail: r.too_much_detail === true,
    expression_unclear: r.expression_unclear === true,
    reason: String(r.reason || "").slice(0, 800),
    audit,
  };
}

/* ====================================================================== *
 * Summary feedback (built by CODE from the checked assessment; the model
 * never writes feedback). At most 3 points, in priority order:
 *   1 distortions and unsupported claims   2 missing ideas, main idea first
 *   3 missing relationships                4 expression (copying, detail)
 * Each point names a TOPIC and WHERE to look, never the missing content.
 * Length is guidance only and never counts as a point. An interpretation
 * of a story is never asked for and never criticised for being absent.
 * ====================================================================== */
export function buildSummaryFeedback(map, assessment, { summary = "", passage = "", cfg = {} } = {}) {
  const c = { ...DEFAULT_AGS_CONFIG, ...cfg };
  const ordered = orderIdeas(map);
  const where = (idea) => {
    const q = (idea.evidence || []).map((e) => findQuote(passage, e.quote, c.minQuoteWords)).find((l) => l.found);
    return q ? q.paragraph : null;
  };
  const pts = [];
  ordered.forEach((i) => {
    if (assessment.ideas?.[i.id]?.status === "distorted")
      pts.push({ type: "distortion", idea: i.id, block: where(i), text: `Check what you wrote about ${i.topic_label}. Does it match what the text says?` });
  });
  (assessment.unsupported_claims || []).forEach((span) =>
    pts.push({ type: "unsupported_claim", idea: null, block: null, text: `The text doesn't seem to support this part of your summary: '${span}'. Check it against the passage.` })
  );
  ordered.forEach((i) => {
    if (assessment.ideas?.[i.id]?.status === "missing")
      pts.push({
        type: i.role === "main" ? "missing_main_idea" : "missing_idea",
        idea: i.id,
        block: where(i),
        text: i.role === "main" ? `Your summary doesn't yet make clear ${map.passage_type === "narrative" ? "what the story is mainly about" : map.passage_type === "informational_argumentative" ? "the author's main claim" : "what the passage mainly explains"}.` : `Your summary doesn't yet say anything about ${i.topic_label}.`,
      });
  });
  ordered.filter(isRelational).forEach((i) => {
    const r = assessment.relations?.[i.id]?.status;
    if (assessment.ideas?.[i.id]?.status === "covered" && r && r !== "correct")
      pts.push({ type: "missing_relationship", idea: i.id, block: where(i), text: `You mention ${i.topic_label}, but not how it connects to the rest. Look again at how the text links them.` });
  });
  const cr = copyRate(summary, passage);
  if (words(summary).length >= c.copyMinWords && cr >= 0.5)
    pts.push({ type: "copying", idea: null, block: null, text: "Much of your summary repeats the text word for word. Try saying it in your own words." });
  if (assessment.too_much_detail) pts.push({ type: "too_much_detail", idea: null, block: null, text: "Some small details take up room that the main ideas need." });
  /* guard: no point may give away a hidden idea statement */
  const statements = (map.ideas || []).map((i) => i.statement);
  const safe = pts.map((p) =>
    statements.some((st) => leakageScore(p.text, st) >= c.leakThreshold)
      ? { ...p, text: "Look again at the highlighted part of the text.", replaced_by_guard: true }
      : p
  );
  const n = words(summary).length;
  const [lo, hi] = c.summaryWordTarget;
  return {
    points: safe.slice(0, 3),
    all_points: safe,
    length_note: n < lo ? `${n} words: a little short of the ${lo}–${hi} guide.` : n > hi ? `${n} words: a little over the ${lo}–${hi} guide.` : `${n} words: within the ${lo}–${hi} guide.`,
    copy_rate: Math.round(cr * 1000) / 1000,
    words: n,
  };
}
