/* Qloo upstream helpers for the Cloudflare Worker.
 * Same contract as functions/index.js: the Qloo key is injected server-side. */

export const QLOO_BASE = "https://hackathon.api.qloo.com";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* Transparent GET proxy: /api/qloo/... -> hackathon.api.qloo.com/... */
export async function proxyQloo(request, env, qlooPath, search) {
  if (request.method !== "GET") {
    return json({ error: "GET only for Qloo proxy" }, 405);
  }
  try {
    const upstream = await fetch(QLOO_BASE + qlooPath + search, {
      headers: { accept: "application/json", "X-Api-Key": env.QLOO_API_KEY },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // gentle on the monthly quota
      },
    });
  } catch (err) {
    console.error("qloo proxy failed", err);
    return json({ error: "Qloo upstream unreachable", detail: String(err && err.message) }, 502);
  }
}

/* Server-side artist hop seeded by the block anchor (explainability on). */
export async function enrichWithQloo(ctx, env) {
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
      headers: { accept: "application/json", "X-Api-Key": env.QLOO_API_KEY },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error("Qloo HTTP " + r.status);
    const j = await r.json();
    const ents = j.results && Array.isArray(j.results.entities) ? j.results.entities : [];
    out.artists = ents
      .map((e) => ({ name: e.name, affinity: num(e.query && e.query.affinity) }))
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

export function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
