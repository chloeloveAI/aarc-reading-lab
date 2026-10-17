"""
vocab_server.py — serves the app AND stores your vocabulary on disk.

    python vocab_server.py

Then open http://localhost:8000/question-ladder.html

Replaces `python -m http.server`. Standard library only, no pip install.
Your words land in vocabulary.json next to this file — a plain file you can
open, back up, or feed to Anki.
"""

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
HERE = os.path.dirname(os.path.abspath(__file__))
STORES = {
    "/api/vocab": os.path.join(HERE, "vocabulary.json"),
    "/api/notes": os.path.join(HERE, "notes.json"),
    "/api/sessions": os.path.join(HERE, "sessions.json"),
}


def store_for(path):
    for prefix, filename in STORES.items():
        if path.startswith(prefix):
            return filename
    return None


def read_store(STORE):
    if not os.path.exists(STORE):
        return []
    try:
        with open(STORE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def write_store(STORE, items):
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STORE)          # atomic — a crash mid-write can't corrupt it


class Handler(SimpleHTTPRequestHandler):
    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._json({"ok": True})

    def do_GET(self):
        store = store_for(self.path)
        if store:
            return self._json({"items": read_store(store)})
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        store = store_for(self.path)
        if not store:
            return self._json({"error": "unknown endpoint"}, 404)
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            items = data.get("items", [])
            if not isinstance(items, list):
                raise ValueError("items must be a list")
            write_store(store, items)
            return self._json({"ok": True, "count": len(items)})
        except (ValueError, json.JSONDecodeError) as e:
            return self._json({"error": str(e)}, 400)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            SimpleHTTPRequestHandler.log_message(self, fmt, *args)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print("Question Ladder → http://localhost:%d/question-ladder.html" % PORT)
    print("Saved to         → vocabulary.json, notes.json, sessions.json")
    print("Stop with Ctrl+C\n")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
