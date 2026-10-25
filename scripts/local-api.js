#!/usr/bin/env node
/**
 * Attune — local dev server (mirrors functions/index.js contract)
 * ----------------------------------------------------------------
 * One port (:3000), same shape as production:
 *   static files ............ index.html, auth.html, assets
 *   GET  /api/qloo/v2/...  -> transparent proxy to https://hackathon.api.qloo.com
 *                             (X-Api-Key injected server-side, never sent to browser)
 *   POST /api/llm/playbook -> LLM provider call; 501 with setup hint if no key
 *
 * Keys are read from .env.local (gitignored) or the environment:
 *   QLOO_API_KEY=hack_...
 *   LLM_API_KEY=...        # optional — enables live playbook
 *   LLM_PROVIDER=openai|gemini|anthropic
 *
 * Run:  node scripts/local-api.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;
const QLOO_BASE = "https://hackathon.api.qloo.com";

/* ------------------------- env / secrets ------------------------- */
function loadEnvLocal() {
  try {
    const src = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    for (const line of src.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  } catch (_) { /* no .env.local — fall back to real env */ }
}
loadEnvLocal();

const qlooKey = process.env.QLOO_API_KEY || "";
const llmKey = (process.env.LLM_API_KEY || "").trim();
const PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();
const MODEL =
  process.env.LLM_MODEL ||
  (PROVIDER === "gemini" ? "gemini-1.5-flash"
    : PROVIDER === "anthropic" ? "claude-3-5-haiku-latest"
    : "gpt-4o-mini");

const SYSTEM_PROMPT =
  "You write venue operations playbooks for Attune, a dashboard for " +
  "independent restaurant/bar operators. You are given JSON containing Qloo " +
  "taste data for the venue's surrounding block (place/artist affinities, " +
  "micro-tribes, palate signals). Use ONLY this data — never invent metrics. " +
  "Write operator-facing copy, concrete and physical, no marketing fluff, " +
  "under 120 words. Format exactly as:\n" +
  "PERSONA: <one line>\n" +
  "ROASTERS 07-11: <action>\n" +
  "LINGER 11-16: <action>\n" +
  "GOLDEN 16-20: <action>\n" +
  "NIGHT 20-02: <action>\n" +
  "PLAYLIST: <anchor artist> <BPM band>\n" +
  "MENU: <one callout>";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* --------------------------- static files ------------------------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(abs).pipe(res);
  });
}

/* ---------------------------- Qloo proxy -------------------------- */
async function proxyQloo(req, res, targetPath, qs) {
  if (!qlooKey) {
    return json(res, 500, { error: "QLOO_API_KEY missing — put it in .env.local" });
  }
  const target = QLOO_BASE + targetPath + (qs || "");
  try {
    const upstream = await fetch(target, {
      headers: { accept: "application/json", "X-Api-Key": qlooKey },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300", // gentle on the monthly quota
      ...CORS_HEADERS,
    });
    res.end(body);
  } catch (err) {
    console.error("[qloo proxy] failed:", err.message);
    json(res, 502, { error: "Qloo upstream unreachable", detail: String(err.message) });
  }
}

/* --------------------------- LLM playbook ------------------------- */
async function playbook(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!llmKey || llmKey === "none") {
    return json(res, 501, {
      error: "LLM_API_KEY not configured — add it to .env.local (or run: firebase functions:secrets:set LLM_API_KEY)",
    });
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    let ctx = {};
    try { ctx = JSON.parse(raw || "{}"); } catch (_) { /* keep {} */ }
    try {
      const text = await callLLM(llmKey, SYSTEM_PROMPT, JSON.stringify(ctx));
      json(res, 200, { playbook: text, provider: PROVIDER, model: MODEL });
    } catch (err) {
      console.error("[playbook] failed:", err.message);
      json(res, 500, { error: String(err.message) });
    }
  });
}

async function callLLM(key, system, user) {
  if (PROVIDER === "gemini") {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + key,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!r.ok) throw new Error("Gemini HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || "").join("").trim() || "(empty response)";
  }

  if (PROVIDER === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("Anthropic HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    return (j.content || []).map((b) => b.text || "").join("").trim() || "(empty response)";
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: MODEL, max_tokens: 400, temperature: 0.7,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error("OpenAI HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "(empty response)").trim();
}

/* ----------------------------- helpers ---------------------------- */
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(obj));
}

/* ----------------------------- server ----------------------------- */
const server = http.createServer((req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;

  if (p.startsWith("/api/llm/playbook")) return playbook(req, res);

  const idx = p.indexOf("/api/qloo/");
  if (idx !== -1) return proxyQloo(req, res, p.slice(idx + "/api/qloo".length), u.search);

  if (p.startsWith("/api/")) return json(res, 404, { error: "Unknown route", path: p });

  serveStatic(req, res, p);
});

server.listen(PORT, () => {
  console.log(`Attune local server  ->  http://localhost:${PORT}`);
  console.log(`  Qloo proxy         ->  ${QLOO_BASE}  [key ${qlooKey ? "loaded" : "MISSING"}]`);
  console.log(`  LLM playbook       ->  ${llmKey ? PROVIDER + " / " + MODEL : "not configured (501 — add LLM_API_KEY to .env.local)"}`);
});
