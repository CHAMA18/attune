/**
 * Attune — Firebase backend (Qloo LLM Hackathon)
 * =====================================================
 * One function, two routes (wired via Hosting rewrite /api/** -> fn "api"):
 *
 *   /api/qloo/v2/...      -> transparent proxy to https://hackathon.api.qloo.com
 *                            Injects X-Api-Key server-side, so the browser
 *                            never holds the Qloo key (hackathon rule-friendly:
 *                            private server-side caching is allowed).
 *
 *   /api/llm/playbook     -> POST { grounding context JSON from Attune }
 *                            -> Qloo artist-hop enrichment (explainability on)
 *                            -> LLM (OpenAI / Gemini / Anthropic, switchable);
 *                               deterministic composer fallback — always 200
 *                            -> { playbook, engine, agentTrace, drivers, ... }
 *
 * Setup (once):
 *   npm i -g firebase-tools
 *   firebase login
 *   firebase use qloo-api-1
 *   firebase functions:secrets:set QLOO_API_KEY     # your hackathon key
 *   firebase functions:secrets:set LLM_API_KEY      # OpenAI / Gemini / Anthropic key
 *   # optional, in functions/.env:  LLM_PROVIDER=gemini  LLM_MODEL=gemini-1.5-flash
 *
 * Deploy:
 *   firebase deploy --only functions,hosting
 */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const qlooKey = defineSecret("QLOO_API_KEY");
const llmKey = defineSecret("LLM_API_KEY");

const QLOO_BASE = "https://hackathon.api.qloo.com";
const PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();
const MODEL =
  process.env.LLM_MODEL ||
  (PROVIDER === "gemini"
    ? "gemini-1.5-flash"
    : PROVIDER === "anthropic"
      ? "claude-3-5-haiku-latest"
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
  "PERSONA: <one full sentence, under 16 words, naming the dominant audience segment and what they crave>\n" +
  "ROASTERS 07-11: <morning action>\n" +
  "LINGER 11-16: <midday action>\n" +
  "GOLDEN 16-20: <golden-hour action>\n" +
  "NIGHT 20-02: <late action>\n" +
  "PLAYLIST: <anchor artist> <BPM band like 105-120 BPM>\n" +
  "MENU: <one concrete dish or drink callout inspired by a palate tag — never an abstract label>";

/* ------------------------------- routes ------------------------------- */

exports.api = onRequest(
  { region: "us-central1", secrets: [qlooKey, llmKey], timeoutSeconds: 60, memory: "256MiB" },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === "OPTIONS") return res.status(204).end();

    const pathOnly = req.url.split("?")[0];

    if (pathOnly.endsWith("/llm/playbook")) {
      return playbook(req, res).catch((err) => {
        logger.error("playbook failed", err);
        return res.status(500).json({ error: String(err && err.message ? err.message : err) });
      });
    }

    /* Default route: Qloo proxy. Accepts /api/qloo/... or /qloo/... */
    const idx = pathOnly.indexOf("/qloo/");
    if (idx === -1) return res.status(404).json({ error: "Unknown route", path: pathOnly });
    return proxyQloo(req, res, pathOnly.slice(idx + "/qloo".length));
  }
);

/* --------------------------- Qloo proxy ------------------------------ */

async function proxyQloo(req, res, qlooPath) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only for Qloo proxy" });
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = QLOO_BASE + qlooPath + qs;
  try {
    const upstream = await fetch(target, {
      headers: { accept: "application/json", "X-Api-Key": qlooKey.value() },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    res.set("Cache-Control", "public, max-age=300"); // gentle on the monthly quota
    res.status(upstream.status).type("application/json").send(body);
  } catch (err) {
    logger.error("qloo proxy failed", err);
    res.status(502).json({ error: "Qloo upstream unreachable", detail: String(err && err.message) });
  }
}

/* ------------------------- LLM playbook ------------------------------ */
/*
 * Playbook agent (same contract as scripts/llm-sidecar.js):
 *   1. GROUND  receive the app's block grounding JSON
 *   2. ENRICH  server-side Qloo artist hop seeded by the block anchor,
 *              feature.explainability=true (the agent holds more than the app sent)
 *   3. COMPOSE LLM (OpenAI/Gemini/Anthropic via LLM_API_KEY secret)
 *   4. FALLBACK deterministic composer — cites grounded entities, never dead-ends
 * Response: { playbook, provider, model, engine, generatedAt, latencyMs,
 *             agentTrace, drivers }
 */
function _num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

async function enrichWithQloo(ctx) {
  const trace = [];
  const out = { artists: [], ok: false };
  try {
    if (!ctx.anchor || !ctx.anchor.id) {
      trace.push({ step: "enrich", detail: "skipped — no block anchor id in grounding" });
      return { ...out, trace };
    }
    const params = new URLSearchParams({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": String(ctx.anchor.id),
      take: "6",
      "feature.explainability": "true",
    });
    const r = await fetch(QLOO_BASE + "/v2/insights?" + params.toString(), {
      headers: { accept: "application/json", "X-Api-Key": qlooKey.value() },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error("Qloo HTTP " + r.status);
    const j = await r.json();
    const ents = (j.results && Array.isArray(j.results.entities)) ? j.results.entities : [];
    out.artists = ents
      .map((e) => ({ name: e.name, affinity: _num(e.query && e.query.affinity) }))
      .filter((a) => a.name && a.affinity > 0);
    out.ok = out.artists.length > 0;
    trace.push({
      step: "enrich",
      detail: out.ok
        ? "Qloo artist hop off " + (ctx.anchor.name || "anchor") + " · " +
          out.artists.slice(0, 3).map((a) => a.name + " " + Math.round(a.affinity * 100) + "%").join(", ")
        : "Qloo reachable, no artist rows",
    });
  } catch (err) {
    trace.push({ step: "enrich", detail: "unreachable (" + String(err.message || err).slice(0, 60) + ") — proceeding on app grounding" });
  }
  return { ...out, trace };
}

function mergedArtists(ctx, extra) {
  const byName = new Map();
  const push = (name, affinity) => {
    if (!name) return;
    const k = String(name).trim().toLowerCase();
    const a = _num(affinity);
    if (!k || a <= 0) return;
    const prev = byName.get(k);
    if (!prev || a > prev.affinity) byName.set(k, { name: String(name).trim(), affinity: a });
  };
  (ctx.artist_affinities || []).forEach((a) => push(a.name, a.affinity));
  (extra || []).forEach((a) => push(a.name, a.affinity));
  return Array.from(byName.values()).sort((x, y) => y.affinity - x.affinity);
}

function computeDrivers(ctx, artists) {
  const d = [];
  (ctx.nearby_place_affinities || []).slice(0, 10).forEach((p) =>
    d.push({ name: p.name, kind: "place", score: _num(p.affinity) }));
  artists.slice(0, 6).forEach((a) =>
    d.push({ name: a.name, kind: "artist", score: _num(a.affinity) }));
  (ctx.micro_tribes || []).slice(0, 5).forEach((t) =>
    d.push({ name: t.name, kind: "audience", score: _num(t.affinity) }));
  return d.sort((a, b) => b.score - a.score).slice(0, 5);
}

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

function validPlaybook(text) {
  if (!text) return false;
  const t = String(text);
  return /PERSONA:/i.test(t) && /ROASTERS/i.test(t) && /LINGER/i.test(t) &&
    /GOLDEN/i.test(t) && /NIGHT/i.test(t) && t.length < 2000;
}

/* Deterministic composer — data in, copy out; cites real entities only. */
function composeLocal(g) {
  const place = (g.top_places && g.top_places[0] && g.top_places[0].name) || "the anchor venue down the block";
  const place2 = (g.top_places && g.top_places[1] && g.top_places[1].name) || null;
  const artist = (g.top_artists && g.top_artists[0] && g.top_artists[0].name) || null;
  const artist2 = (g.top_artists && g.top_artists[1] && g.top_artists[1].name) || null;
  const tribe = (g.audiences && g.audiences[0] && g.audiences[0].name) || "regulars";
  const palate = (g.palate_tags && g.palate_tags[0]) || null;
  const palate2 = (g.palate_tags && g.palate_tags[1]) || null;
  const text = [
    "PERSONA: " + tribe + " who " + (palate ? "order the " + palate + " and " : "") +
      (artist ? "stream " + artist : "lean on the block's favourites") + ".",
    "ROASTERS 07-11: Early doors — fast coffee rotation and window seats to catch the " + place + " brunch queue spillover.",
    "LINGER 11-16: Lunch linger — keep " + (palate || "the day's feature") + " on the specials board; hold the room bright and unhurried.",
    "GOLDEN 16-20: Golden hour — build the set around " + (artist || place) +
      (artist2 ? " into " + artist2 : "") + (place2 ? " as the " + place2 + " crowd drifts over" : "") + ".",
    "NIGHT 20-02: After dark — dim to candlelight and ride the " + place + " after-party energy" +
      (palate2 ? " — keep the " + palate2 + " pours coming" : "") + ".",
    "PLAYLIST: " + (artist || "Block favourites") + " 100-120 BPM",
    "MENU: " + (palate ? palate.charAt(0).toUpperCase() + palate.slice(1) : "Seasonal feature") + " plate + by-the-glass pour.",
  ].join("\n");
  return { text, model: "attune-composer", provider: "local" };
}

async function playbook(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const t0 = Date.now();
  const ctx = req.body && typeof req.body === "object" ? req.body : {};
  const trace = [{
    step: "ground",
    detail: ((ctx.nearby_place_affinities || []).length + (ctx.artist_affinities || []).length + (ctx.micro_tribes || []).length) +
      " entities received from the app" + (ctx.anchor && ctx.anchor.name ? " · anchor " + ctx.anchor.name : ""),
  }];

  const enr = await enrichWithQloo(ctx);
  trace.push(...(enr.trace || []));
  const artists = mergedArtists(ctx, enr.artists);
  const g = compactGrounding(ctx, artists);
  const userPrompt = "Write today's playbook for this venue. Grounding JSON:\n" + JSON.stringify(g);

  let composed = null, engine = null;
  const key = llmKey.value();
  if (key && key !== "none") {
    try {
      composed = { text: await callLLM(key, SYSTEM_PROMPT, userPrompt), model: MODEL, provider: PROVIDER };
      if (validPlaybook(composed.text)) {
        engine = "llm";
        trace.push({ step: "compose", detail: PROVIDER + " LLM (" + composed.model + ") cited the grounded block" });
      } else composed = null;
    } catch (err) {
      logger.error("playbook LLM failed", err);
    }
  }
  if (!composed) {
    composed = composeLocal(g);
    engine = "local";
    trace.push({ step: "compose", detail: "deterministic composer — every line cites grounded entities" });
  }

  return res.json({
    playbook: composed.text,
    provider: composed.provider,
    model: composed.model,
    engine,
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    agentTrace: trace,
    drivers: computeDrivers(ctx, artists),
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
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    return (parts || []).map((p) => p.text || "").join("").trim() || "(empty response)";
  }

  if (PROVIDER === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("Anthropic HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    return (j.content || []).map((b) => b.text || "").join("").trim() || "(empty response)";
  }

  /* default: OpenAI-compatible chat completions */
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error("OpenAI HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "(empty response)").trim();
}
