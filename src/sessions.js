/* ------------------------------------------------------------------ *
 * sessions.js — save where you got to, come back later.
 *
 * A session snapshot holds everything needed to resume: the passage, the
 * generated items, which ones you answered, and what you chose. Saved to
 * sessions.json on disk when vocab_server.py is running.
 * ------------------------------------------------------------------ */

const LOCAL_KEY = "ql:sessions";
const MAX_KEPT = 20;
let backend = null;

async function detect() {
  if (backend) return backend;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("/api/sessions", { signal: ctl.signal });
    clearTimeout(t);
    backend = r.ok ? "server" : "local";
  } catch (e) {
    backend = "local";
  }
  return backend;
}

export async function whereSaved() {
  return (await detect()) === "server" ? "sessions.json on disk" : "this browser only";
}

export async function listSessions() {
  if ((await detect()) === "server") {
    try {
      const r = await fetch("/api/sessions");
      const d = await r.json();
      return d.items || [];
    } catch (e) {
      /* fall through */
    }
  }
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

async function persist(items) {
  const trimmed = items.slice(0, MAX_KEPT);
  if ((await detect()) === "server") {
    try {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: trimmed }),
      });
      if (r.ok) return true;
    } catch (e) {
      backend = "local"; /* server went away mid-session — keep going locally */
    }
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
    return true;
  } catch (e) {
    return false;
  }
}

export async function saveSession(snapshot) {
  const items = await listSessions();
  const now = new Date().toISOString();
  const idx = items.findIndex((s) => s.id === snapshot.id);
  const record = { ...snapshot, savedAt: now, startedAt: idx > -1 ? items[idx].startedAt : now };
  if (idx > -1) items.splice(idx, 1);
  items.unshift(record);
  await persist(items);
  return record;
}

export async function removeSession(id) {
  const items = (await listSessions()).filter((s) => s.id !== id);
  await persist(items);
  return items;
}

/* ---------------------------- display ----------------------------- */

export function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return date + " · " + time;
}

export function relativeWhen(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? "1 hour ago" : hrs + " hours ago";
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : months + " months ago";
}
