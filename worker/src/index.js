/**
 * Attune — Cloudflare Worker (port of functions/index.js)
 *
 *   /api/qloo/v2/{search,insights} -> restricted Qloo GET proxy
 *   /api/llm/playbook -> grounded, deterministic recommendations
 *
 * Secret (never in source): QLOO_API_KEY
 * REQUIRE_AUTH=1 requires a Firebase ID token on every /api/** route.
 */
import { CORS_HEADERS, enrichWithQloo, json, proxyQloo } from "./qloo.js";
import { compactGrounding, computeDrivers, mergedArtists } from "./compose.js";
import { buildRecommendations } from "./recommendations.js";
import { operatorFromRequest } from "./auth.js";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) return json({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    /* /api/** runs as the signed-in operator when a token is present. */
    const auth = await operatorFromRequest(request, env);
    if (auth.error) {
      return json({ error: "Unauthorized", detail: auth.error.message }, auth.error.status || 401);
    }
    if (!auth.operator && env.REQUIRE_AUTH === "1") {
      return json({ error: "Unauthorized", detail: "Sign in to use this API." }, 401);
    }
    const operator = auth.operator;
    if (env.QLOO_RATE_LIMITER) {
      const key = operator ? 'user:' + operator.uid : 'ip:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
      try {
        const result = await env.QLOO_RATE_LIMITER.limit({ key });
        if (!result.success) return json({ error: "Too many requests. Please try again shortly." }, 429);
      } catch (_) { return json({ error: "Rate limiter unavailable" }, 503); }
    } else if (env.ENFORCE_RATE_LIMIT === "1") {
      return json({ error: "Rate limiter unavailable" }, 503);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/llm/playbook" || path === "/llm/playbook") {
      try {
        return await playbook(request, env, operator);
      } catch (err) {
        console.error("playbook failed", err);
        return json({ error: String(err && err.message ? err.message : err) }, 500);
      }
    }

    const prefix = path.startsWith("/api/qloo/") ? "/api/qloo" : path.startsWith("/qloo/") ? "/qloo" : null;
    const upstreamPath = prefix ? path.slice(prefix.length) : null;
    if (!upstreamPath || !["/v2/search", "/v2/insights"].includes(upstreamPath)) return json({ error: "Unknown route" }, 404);
    const allowed = new Set(["query", "filter.type", "filter.location", "filter.location.radius", "filter.location.query", "signal.interests.entities", "feature.explainability", "take"]);
    for (const [key, value] of url.searchParams) {
      if (!allowed.has(key) || value.length > 300 || url.searchParams.getAll(key).length !== 1) return json({ error: "Invalid query parameter" }, 400);
    }
    if (url.search.length > 2048 || (url.searchParams.has("take") && (!/^\d+$/.test(url.searchParams.get("take")) || Number(url.searchParams.get("take")) > 30))) return json({ error: "Invalid query" }, 400);
    return proxyQloo(request, env, upstreamPath, url.search);
  },
};

function providerLabel(provider) {
  if (provider === "google.com") return "Google";
  if (provider === "apple.com") return "Apple";
  return provider ? String(provider).replace(/\.com$/, "") : "";
}

async function playbook(request, env, operator) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const t0 = Date.now();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Expected a grounding object" }, 400);
  const ctx = body;
  const trace = [{
    step: "ground",
    detail: ((ctx.nearby_place_affinities || []).length + (ctx.artist_affinities || []).length + (ctx.micro_tribes || []).length) +
      " entities received from the app" + (ctx.anchor && ctx.anchor.name ? " · anchor " + ctx.anchor.name : ""),
  }];
  /* Verified identity (token checked above) — never the raw token. */
  if (operator) {
    trace.push({
      step: "auth",
      detail: "verified operator " + (operator.email || operator.uid) +
        (providerLabel(operator.provider) ? " · " + providerLabel(operator.provider) : ""),
    });
  }

  const enr = await enrichWithQloo(ctx, env);
  trace.push(...(enr.trace || []));
  const artists = mergedArtists(ctx, enr.artists);
  const g = compactGrounding(ctx, artists);
  const result = buildRecommendations(g);
  trace.push({ step: "compose", detail: "conservative suggestions generated from available signals; customer outcomes are unverified" });
  return json({
    operator: operator ? { uid: operator.uid, email: operator.email, provider: operator.provider } : null,
    playbook: result.playbook,
    recommendations: result.actions,
    evidenceSource: result.source,
    assumption: result.assumption,
    provider: "local", model: "attune-conservative-composer", engine: "local",
    generatedAt: new Date().toISOString(), latencyMs: Date.now() - t0,
    agentTrace: trace, drivers: computeDrivers(ctx, artists),
    audit: { method: "structured templates", note: "Entity references are drawn from supplied data; factual accuracy and provenance are not independently verified." }
  });
}
