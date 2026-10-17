/* ------------------------------------------------------------------ *
 * speech.js — pronunciation via the browser's own voices.
 *
 * No model, no API, no download. Edge ships neural English voices that
 * are markedly better than the old robotic ones, and they are free.
 * ------------------------------------------------------------------ */

const PREF_KEY = "ql:speech";

export function loadSpeechPrefs() {
  try {
    return { accent: "en-GB", rate: 0.9, auto: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
  } catch (e) {
    return { accent: "en-GB", rate: 0.9, auto: true };
  }
}

export function saveSpeechPrefs(p) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch (e) {
    /* not important enough to fail over */
  }
}

export function speechAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* Voices arrive asynchronously and the first call often returns []. */
let voiceCache = [];
export function getVoices() {
  if (!speechAvailable()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voiceCache = v;
  return voiceCache;
}

if (speechAvailable()) {
  window.speechSynthesis.onvoiceschanged = () => {
    voiceCache = window.speechSynthesis.getVoices();
  };
}

function pickVoice(lang) {
  const voices = getVoices();
  if (!voices.length) return null;
  const exact = voices.filter((v) => v.lang && v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  const family = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  const pool = exact.length ? exact : family;
  if (!pool.length) return null;
  /* Edge's neural voices carry "Natural" in the name and sound far better */
  return pool.find((v) => /natural|neural/i.test(v.name)) || pool[0];
}

export function speak(text, { lang, rate } = {}) {
  if (!speechAvailable() || !text) return false;
  const prefs = loadSpeechPrefs();
  const useLang = lang || prefs.accent;
  window.speechSynthesis.cancel(); // stop whatever is mid-sentence
  const u = new SpeechSynthesisUtterance(String(text));
  const v = pickVoice(useLang);
  if (v) u.voice = v;
  u.lang = useLang;
  u.rate = rate ?? prefs.rate;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

export const ACCENTS = [
  ["en-GB", "British"],
  ["en-US", "American"],
  ["en-AU", "Australian"],
];
