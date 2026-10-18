/* ------------------------------------------------------------------ *
 * fileText.js — read a text out of an uploaded file, in the browser.
 * Nothing is uploaded anywhere: the file is read on the reader's device.
 *
 *   .pdf   → pdf.js (text layer only; a scanned PDF has none)
 *   .docx  → mammoth (headings kept as "## ", list items as "- ")
 *   .txt / .md → as is
 *
 * Both libraries are loaded only when a file is chosen, so the app stays
 * small for everyone who pastes text.
 * ------------------------------------------------------------------ */

export class FileTextError extends Error {}

const ext = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
const words = (t) => (String(t).match(/\S+/g) || []).length;

export async function readTextFile(file) {
  const kind = ext(file.name);
  let text = "";
  if (kind === "pdf") text = await readPdf(file);
  else if (kind === "docx") text = await readDocx(file);
  else if (kind === "txt" || kind === "md") text = await file.text();
  else if (kind === "doc") throw new FileTextError("Old Word files (.doc) can't be read here. In Word, choose File → Save As → .docx, then upload that.");
  else throw new FileTextError("This file type can't be read. Upload a .pdf, .docx or .txt file, or paste the text.");
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (words(text) < 30)
    throw new FileTextError(
      kind === "pdf"
        ? "No text could be read from this PDF. It is probably a scan (pictures of pages). Copy the text from the original source, or use a .docx."
        : "This file has almost no text in it."
    );
  return { text, words: words(text), kind, title: file.name.replace(/\.[^.]+$/, "") };
}

async function readPdf(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;

  /* 1. rebuild lines from positions: { text, size, y, page } */
  const lines = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    let cur = null;
    for (const it of items) {
      if (!("str" in it)) continue;
      const y = it.transform[5];
      const size = Math.abs(it.transform[3]) || it.height || 10;
      if (!cur || Math.abs(y - cur.y) > size * 0.4) {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = { text: "", size, y, page: n };
      }
      cur.text += it.str;
      cur.size = Math.max(cur.size, size);
    }
    if (cur && cur.text.trim()) lines.push(cur);
  }
  if (!lines.length) return "";

  /* 2. body size = the most common size; clearly larger short lines are headings */
  const counts = {};
  lines.forEach((l) => (counts[Math.round(l.size)] = (counts[Math.round(l.size)] || 0) + l.text.length));
  const body = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const isHead = (l) => l.size > body * 1.15 && (l.text.match(/\S+/g) || []).length <= 15;

  /* 3. lines → paragraphs: a heading, a page change or a large gap ends a paragraph */
  const out = [];
  let para = "";
  let prev = null;
  const flush = () => {
    if (para.trim()) out.push(para.trim());
    para = "";
  };
  for (const l of lines) {
    const t = l.text.replace(/\s+/g, " ").trim();
    if (isHead(l)) {
      flush();
      out.push("## " + t);
      prev = null;
      continue;
    }
    const gap = prev && prev.page === l.page ? Math.abs(prev.y - l.y) : 0;
    if (prev && (prev.page !== l.page ? /[.!?:]["”’)]?$/.test(para) : gap > Math.max(prev.size, l.size) * 1.6)) flush();
    if (/[A-Za-z]-$/.test(para) && /^[a-z]/.test(t)) para = para.slice(0, -1) + t;
    else para += (para ? " " : "") + t;
    prev = l;
  }
  flush();
  return out.join("\n\n");
}

async function readDocx(file) {
  const mammoth = (await import("mammoth/mammoth.browser.js")).default;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const box = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstChild;
  const parts = [];
  const walk = (el) => {
    for (const n of el.children) {
      const tag = n.tagName.toLowerCase();
      const t = n.textContent.replace(/\s+/g, " ").trim();
      if (/^h[1-6]$/.test(tag)) t && parts.push("## " + t);
      else if (tag === "ul" || tag === "ol") parts.push([...n.children].map((li) => "- " + li.textContent.replace(/\s+/g, " ").trim()).join("\n"));
      else if (tag === "table") parts.push([...n.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.textContent.trim()).join(" | ")).join("\n"));
      else if (t) parts.push(t);
    }
  };
  walk(box);
  return parts.join("\n\n");
}
