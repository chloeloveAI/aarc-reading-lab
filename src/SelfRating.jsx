/* ------------------------------------------------------------------ *
 * SelfRating.jsx — "How much of the text do you understand?" 0–10.
 * Asked twice (AARC calibration):
 *   after focus reading   → compared with questions answered without help
 *   after all questions   → compared with that and with the first rating
 * ------------------------------------------------------------------ */

import React from "react";

const C = { ink: "#16202B", slate: "#5A6B7B", line: "#D3DBE0", card: "#FFFFFF", teal: "#1F6F6A" };
const F = { ui: "'Public Sans', system-ui, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace" };

export const RATING_VERSION = "self-rating-v1";

export default function SelfRating({ value, onChange, question, id = "self-rating" }) {
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} style={{ fontFamily: F.ui, fontSize: 15, color: C.ink, lineHeight: 1.5, fontWeight: 600 }}>
        {question}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => {
          const on = value === n;
          return (
            <button
              key={n}
              role="radio"
              aria-checked={on}
              aria-label={`${n} out of 10`}
              onClick={() => onChange(n)}
              className="ql-focus"
              style={{
                width: 38,
                height: 38,
                borderRadius: 2,
                border: `1.5px solid ${on ? C.teal : C.line}`,
                background: on ? C.teal : C.card,
                color: on ? C.card : C.ink,
                fontFamily: F.mono,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between" style={{ fontFamily: F.ui, fontSize: 11, color: C.slate, maxWidth: 11 * 44 }}>
        <span>0 = nothing</span>
        <span>10 = all of it</span>
      </div>
    </div>
  );
}
