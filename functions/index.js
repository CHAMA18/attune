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
 *                            -> LLM (OpenAI / Gemini / Anthropic, switchable)
 *                            -> { playbook: "<operator-facing copy>" }
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

async function playbook(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = llmKey.value();
  if (!key || key === "none") {
    return res.status(501).json({
      error: "LLM_API_KEY not configured — run: firebase functions:secrets:set LLM_API_KEY",
    });
  }
  const ctx = req.body && typeof req.body === "object" ? req.body : {};
  const text = await callLLM(key, SYSTEM_PROMPT, JSON.stringify(ctx));
  return res.json({ playbook: text, provider: PROVIDER, model: MODEL });
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
