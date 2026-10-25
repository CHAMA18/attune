#!/usr/bin/env node
/**
 * Attune — Playbook Agent sidecar (Qloo Agentic Hackathon)
 * =========================================================
 * Listens on 127.0.0.1:3789 (localhost-only). Caddy proxies
 * /api/llm/playbook here so the app stays single-origin on :3000.
 *
 * Agent loop (sense -> plan -> act):
 *   1. GROUND   receive the operator's block grounding JSON from the app
 *   2. ENRICH   server-side Qloo re-query: cross-domain artist hop seeded by
 *               the block anchor, with feature.explainability=true so every
 *               driver carries a contribution score
 *   3. COMPOSE  LLM writes the playbook; every line must cite grounded
 *               entities — no invented metrics, no generic copy
 *   4. FALLBACK deterministic composer (data -> copy) if the LLM path is
 *               unreachable. The app never dead-ends; 501 is gone.
 *
 * Engines, in order: z-ai CLI -> LLM_API_KEY provider (openai/gemini/anthropic)
 * -> deterministic local composer.
 *
 * Response contract (superset of the legacy shape the app already parses):
 *   { playbook, provider, model, engine, generatedAt, latencyMs,
 *     agentTrace: [{ step, detail }], drivers: [{ name, kind, score }] }
 *
 * Run: started idempotently by scripts/serve.sh (logs to llm-sidecar.log)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const PORT = 3789;
const HOST = "127.0.0.1";
const QLOO_BASE = "https://hackathon.api.qloo.com";
const ROOT = path.join(__dirname, "..");

/* ------------------------- env / secrets ------------------------- */
function loadEnvLocal() {
  try {
    const src = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    for (const line of src.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === "QLOO_API_KEY" && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      if (m && m[1] === "LLM_API_KEY" && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      if (m && m[1] === "LLM_PROVIDER" && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      if (m && m[1] === "LLM_MODEL" && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch (_) { /* no .env.local — fall back to real env */ }
}
loadEnvLocal();

const qlooKey = (process.env.QLOO_API_KEY || "").trim();
const llmKey = (process.env.LLM_API_KEY || "").trim();
const PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();
const MODEL =
  process.env.LLM_MODEL ||
  (PROVIDER === "gemini" ? "gemini-1.5-flash"
    : PROVIDER === "anthropic" ? "claude-3-5-haiku-latest"
    : "gpt-4o-mini");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SYSTEM_PROMPT =
  "You are Attune's playbook agent: a venue-operations planner for independent " +
  "bar and restaurant owners. You receive JSON grounding from Qloo's Taste AI " +
  "(the venue, its block anchor venue, nearby place affinities, artist " +
  "affinities, audience segments, palate tags — all real, all cited).\n" +
  "Rules:\n" +
  "- Use ONLY entities present in the data. Never invent metrics, names, or numbers.\n" +
  "- Every line you write must name at least one grounded entity (place, artist, audience, or palate tag).\n" +
  "- Write operator-facing copy: concrete, physical, zero marketing fluff, under 120 words total.\n" +
  "- Format exactly as these lines, no markdown, no extra lines:\n" +
  "PERSONA: <one line naming the dominant audience segment>\n" +
  "ROASTERS 07-11: <morning action>\n" +
  "LINGER 11-16: <midday action>\n" +
  "GOLDEN 16-20: <golden-hour action>\n" +
  "NIGHT 20-02: <late action>\n" +
  "PLAYLIST: <anchor artist> <BPM band like 105-120 BPM>\n" +
  "MENU: <one menu callout citing a palate tag>";

/* --------------------------- helpers ---------------------------- */
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(obj));
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function entityName(e) {
  return e.name || (e.attributes && e.attributes.name) || e.title || null;
}

function affinityOf(e) {
  const a = e && e.query && e.query.affinity !== undefined ? e.query.affinity
    : e.affinity !== undefined ? e.affinity
    : e.score !== undefined ? e.score : 0;
  return num(a);
}

/* ------------------- step 2: Qloo enrichment -------------------- */
/* The agent re-queries Qloo server-side, seeded by the block anchor, so it
   holds grounded data beyond what the app sent (cross-domain artists +
   explainability contributions). 7s cap — the app aborts at 25s. */
async function enrichWithQloo(ctx) {
  const trace = [];
  const out = { artists: [], anchorPull: null, ok: false };
  try {
    if (!qlooKey) { trace.push({ step: "enrich", detail: "skipped — no QLOO_API_KEY" }); return { ...out, trace }; }
    if (!ctx.anchor || !ctx.anchor.id) { trace.push({ step: "enrich", detail: "skipped — no block anchor id in grounding" }); return { ...out, trace }; }

    const params = new URLSearchParams({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": String(ctx.anchor.id),
      "take": "6",
      "feature.explainability": "true",
    });
    const r = await fetch(QLOO_BASE + "/v2/insights?" + params.toString(), {
      headers: { accept: "application/json", "X-Api-Key": qlooKey },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error("Qloo HTTP " + r.status);
    const j = await r.json();
    const ents = (j.results && Array.isArray(j.results.entities)) ? j.results.entities : [];
    out.artists = ents
      .map((e) => ({ name: entityName(e), affinity: affinityOf(e) }))
      .filter((a) => a.name && a.affinity > 0);

    /* Explainability: how strongly the anchor drove each result (0..1). */
    let sum = 0, n = 0;
    ents.forEach((e) => {
      const expl = e.query && e.query.explainability && e.query.explainability["signal.interests.entities"];
      if (Array.isArray(expl)) expl.forEach((c) => { sum += num(c.score); n += 1; });
    });
    if (n > 0) out.anchorPull = Number((sum / n).toFixed(2));
    out.ok = out.artists.length > 0;
    trace.push({
      step: "enrich",
      detail: out.ok
        ? "Qloo artist hop off " + (ctx.anchor.name || "anchor") + " · " +
          out.artists.slice(0, 3).map((a) => a.name + " " + Math.round(a.affinity * 100) + "%").join(", ") +
          (out.anchorPull !== null ? " · anchor pull " + Math.round(out.anchorPull * 100) + "%" : "")
        : "Qloo reachable, no artist rows",
    });
  } catch (err) {
    trace.push({ step: "enrich", detail: "unreachable (" + String(err.message || err).slice(0, 60) + ") — proceeding on app grounding" });
  }
  return { ...out, trace };
}

/* Merge client artists with the agent's own hop (dedupe by name, keep max). */
function mergedArtists(ctx, extra) {
  const byName = new Map();
  const client = (ctx.artist_affinities || []);
  const push = (name, affinity, source) => {
    if (!name) return;
    const k = String(name).trim().toLowerCase();
    const a = num(affinity);
    if (!k || a <= 0) return;
    const prev = byName.get(k);
    if (!prev || a > prev.affinity) byName.set(k, { name: String(name).trim(), affinity: a, source });
  };
  client.forEach((a) => push(a.name, a.affinity, "app"));
  (extra || []).forEach((a) => push(a.name, a.affinity, "agent-hop"));
  return Array.from(byName.values()).sort((x, y) => y.affinity - x.affinity);
}

/* Drivers: the entities the playbook must be able to cite. */
function computeDrivers(ctx, artists) {
  const d = [];
  (ctx.nearby_place_affinities || []).slice(0, 10).forEach((p) =>
    d.push({ name: p.name, kind: "place", score: num(p.affinity) }));
  artists.slice(0, 6).forEach((a) =>
    d.push({ name: a.name, kind: "artist", score: num(a.affinity) }));
  (ctx.micro_tribes || []).slice(0, 5).forEach((t) =>
    d.push({ name: t.name, kind: "audience", score: num(t.affinity) }));
  return d.sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ------------------- step 3: composition engines ----------------- */
function compactGrounding(ctx, artists) {
  return {
    venue: ctx.venue || null,
    focus_daypart: ctx.focus_daypart || null,
    block_anchor: ctx.anchor ? { name: ctx.anchor.name, radius_ft: ctx.block_radius_ft || 800 } : null,
    anchor_pull: ctx.anchor_pull || null,
    top_places: (ctx.nearby_place_affinities || []).slice(0, 6),
    top_artists: artists.slice(0, 5).map((a) => ({ name: a.name, affinity: Number(a.affinity.toFixed(2)) })),
    audiences: (ctx.micro_tribes || []).slice(0, 4),
    palate_tags: (ctx.palate_signals || []).slice(0, 4),
    live_feed: ctx.feed || "demo",
  };
}

/* Engine A — z-ai CLI (sandbox LLM; keyless in this environment). */
function composeViaZaiCLI(userPrompt) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), "attune-playbook-" + Date.now() + ".json");
    const child = spawn("z-ai", ["chat", "-s", SYSTEM_PROMPT, "-p", userPrompt, "-o", out], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("z-ai CLI timeout")); }, 18000);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(fs.readFileSync(out, "utf8"));
        const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        fs.unlink(out, () => {});
        if (!content || !String(content).trim()) throw new Error("empty content");
        resolve({ text: String(content).trim(), model: j.model || "glm", provider: "zai" });
      } catch (e) {
        reject(new Error("z-ai CLI unreadable: " + (e.message || e) + (stderr ? " | " + stderr.slice(0, 80) : "")));
      }
    });
  });
}

/* Engine B — direct provider call (OpenAI / Gemini / Anthropic). */
async function composeViaProvider(userPrompt) {
  let r;
  if (PROVIDER === "gemini") {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + llmKey, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("Gemini HTTP " + r.status);
    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    return { text: parts.map((p) => p.text || "").join("").trim(), model: MODEL, provider: "gemini" };
  }
  if (PROVIDER === "anthropic") {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": llmKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userPrompt }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("Anthropic HTTP " + r.status);
    const j = await r.json();
    return { text: (j.content || []).map((b) => b.text || "").join("").trim(), model: MODEL, provider: "anthropic" };
  }
  r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + llmKey },
    body: JSON.stringify({
      model: MODEL, max_tokens: 400, temperature: 0.7,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error("OpenAI HTTP " + r.status);
  const j = await r.json();
  return { text: ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").trim(), model: MODEL, provider: "openai" };
}

/* Engine C — deterministic composer. Data in, copy out; cites real entities. */
function composeLocal(g) {
  const place = (g.top_places && g.top_places[0] && g.top_places[0].name) || "the anchor venue down the block";
  const place2 = (g.top_places && g.top_places[1] && g.top_places[1].name) || null;
  const artist = (g.top_artists && g.top_artists[0] && g.top_artists[0].name) || null;
  const artist2 = (g.top_artists && g.top_artists[1] && g.top_artists[1].name) || null;
  const tribe = (g.audiences && g.audiences[0] && g.audiences[0].name) || "regulars";
  const palate = (g.palate_tags && g.palate_tags[0]) || null;
  const palate2 = (g.palate_tags && g.palate_tags[1]) || null;

  const persona = tribe + " who " + (palate ? "order the " + palate + " and " : "") +
    (artist ? "stream " + artist : "lean on the block's favourites") + ".";
  const roasters = "Early doors: fast coffee rotation and window seats to catch the " + place + " brunch queue spillover.";
  const linger = "Lunch linger: keep " + (palate || "the day's feature") + " on the specials board; hold the room bright and unhurried.";
  const golden = "Golden hour: build the set around " + (artist || place) +
    (artist2 ? " into " + artist2 : "") + (place2 ? " as the " + place2 + " crowd drifts over" : "") + ".";
  const night = "After dark: dim to candlelight and ride the " + place + " after-party energy" +
    (palate2 ? " — keep the " + palate2 + " pours coming" : "") + ".";
  const playlist = (artist || "Block favourites") + " 100-120 BPM";
  const menu = (palate ? palate.charAt(0).toUpperCase() + palate.slice(1) : "Seasonal feature") +
    " plate + by-the-glass pour.";

  const text = [
    "PERSONA: " + persona,
    "ROASTERS 07-11: " + roasters,
    "LINGER 11-16: " + linger,
    "GOLDEN 16-20: " + golden,
    "NIGHT 20-02: " + night,
    "PLAYLIST: " + playlist,
    "MENU: " + menu,
  ].join("\n");
  return { text, model: "attune-composer", provider: "local" };
}

/* Validation: the app's parser needs PERSONA + daypart lines. */
function validPlaybook(text) {
  if (!text) return false;
  const t = String(text);
  return /PERSONA:/i.test(t) &&
    /ROASTERS/i.test(t) && /LINGER/i.test(t) &&
    /GOLDEN/i.test(t) && /NIGHT/i.test(t) &&
    t.length < 2000;
}

/* --------------------------- the route -------------------------- */
async function playbookHandler(req, res) {
  const t0 = Date.now();
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });

  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 256 * 1024) req.destroy(); });
  req.on("end", async () => {
    let ctx = {};
    try { ctx = JSON.parse(raw || "{}"); } catch (_) { /* keep {} */ }

    const trace = [];
    const nGround = (ctx.nearby_place_affinities || []).length + (ctx.artist_affinities || []).length + (ctx.micro_tribes || []).length;
    trace.push({ step: "ground", detail: nGround + " entities received from the app" + (ctx.anchor && ctx.anchor.name ? " · anchor " + ctx.anchor.name : "") });

    /* Step 2 — the agent grounds itself further in Qloo. */
    const enr = await enrichWithQloo(ctx);
    trace.push(...(enr.trace || []));
    const artists = mergedArtists(ctx, enr.artists);

    /* Step 3 — compose. */
    const g = compactGrounding(ctx, artists);
    const userPrompt = "Write today's playbook for this venue. Grounding JSON:\n" + JSON.stringify(g);

    let composed = null, engine = null;
    try {
      composed = await composeViaZaiCLI(userPrompt);
      engine = "llm";
      trace.push({ step: "compose", detail: "z-ai LLM (" + composed.model + ") cited the grounded block" });
    } catch (eA) {
      if (llmKey && llmKey !== "none") {
        try {
          composed = await composeViaProvider(userPrompt);
          engine = "llm";
          trace.push({ step: "compose", detail: PROVIDER + " LLM (" + composed.model + ")" });
        } catch (eB) {
          console.error("[playbook] provider failed:", eB.message);
        }
      } else {
        console.error("[playbook] z-ai CLI failed:", eA.message);
      }
    }
    if (!composed || !validPlaybook(composed.text)) {
      composed = composeLocal(g);
      engine = "local";
      trace.push({ step: "compose", detail: "deterministic composer — every line cites grounded entities" });
    }

    /* Cited drivers — shown next to the composed play. */
    const drivers = computeDrivers(ctx, artists);

    return json(res, 200, {
      playbook: composed.text,
      provider: composed.provider,
      model: composed.model,
      engine,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
      agentTrace: trace,
      drivers,
    });
  });
}

/* --------------------------- server ----------------------------- */
const server = http.createServer((req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      engines: {
        zai_cli: true,
        provider: llmKey && llmKey !== "none" ? PROVIDER + "/" + MODEL : null,
        local: true,
      },
      qloo_enrichment: !!qlooKey,
    });
  }
  if (u.pathname.startsWith("/api/llm/playbook")) return playbookHandler(req, res);
  return json(res, 404, { error: "Unknown route", path: u.pathname });
});

server.listen(PORT, HOST, () => {
  console.log("Attune playbook agent -> http://" + HOST + ":" + PORT);
  console.log("  engines   : z-ai CLI" + (llmKey && llmKey !== "none" ? " -> " + PROVIDER + "/" + MODEL : "") + " -> local composer");
  console.log("  grounding : Qloo enrichment " + (qlooKey ? "ON (key loaded)" : "OFF (no QLOO_API_KEY)"));
});
