/**
 * Attune — Cloudflare Worker (port of functions/index.js)
 *
 *   /api/qloo/v2/...   -> transparent GET proxy to hackathon.api.qloo.com
 *   /api/llm/playbook  -> POST grounding -> Qloo artist hop -> LLM (or
 *                         deterministic composer fallback) -> playbook JSON
 *
 * Secrets (never in source): QLOO_API_KEY, LLM_API_KEY
 * Plain vars (wrangler.toml): LLM_PROVIDER, LLM_MODEL (optional)
 *   REQUIRE_AUTH=1 requires a Firebase ID token on every /api/** route;
 *   without it the demo room stays anonymous.
 */
import { CORS_HEADERS, enrichWithQloo, json, proxyQloo } from "./qloo.js";
import { SYSTEM_PROMPT, compactGrounding, computeDrivers, composeLocal, mergedArtists, validPlaybook, auditGrounding } from "./compose.js";
import { callLLM } from "./llm.js";
import { operatorFromRequest } from "./auth.js";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    /* /api/** runs as the signed-in operator when a token is present. */
    const auth = await operatorFromRequest(request, env);
    if (auth.error) {
      return json({ error: "Unauthorized", detail: auth.error.message }, auth.error.status || 401);
    }
    if (!auth.operator && env.REQUIRE_AUTH === "1") {
      return json({ error: "Unauthorized", detail: "Sign in with Google or Apple to use this API." }, 401);
    }
    const operator = auth.operator;

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith("/llm/playbook")) {
      try {
        return await playbook(request, env, operator);
      } catch (err) {
        console.error("playbook failed", err);
        return json({ error: String(err && err.message ? err.message : err) }, 500);
      }
    }

    /* Qloo proxy. Accepts /api/qloo/... or /qloo/... */
    const idx = path.indexOf("/qloo/");
    if (idx === -1) return json({ error: "Unknown route", path }, 404);
    return proxyQloo(request, env, path.slice(idx + "/qloo".length), url.search);
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
  const ctx = await request.json().catch(() => ({}));
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
  const userPrompt = "Write today's playbook for this venue. Grounding JSON:\n" + JSON.stringify(g);

  let composed = null;
  let engine = null;
  if (env.LLM_API_KEY && env.LLM_API_KEY !== "none") {
    try {
      const out = await callLLM(env, SYSTEM_PROMPT, userPrompt);
      if (validPlaybook(out.text)) {
        composed = out;
        engine = "llm";
        trace.push({ step: "compose", detail: out.provider + " LLM (" + out.model + ") cited the grounded block" });
      }
    } catch (err) {
      console.error("playbook LLM failed", err);
    }
  }
  if (!composed) {
    composed = composeLocal(g);
    engine = "local";
    trace.push({ step: "compose", detail: "deterministic composer — every line cites grounded entities" });
  }

  /* Verify-and-correct loop: the agent audits its own draft against the
     grounding JSON. Below the bar it re-asks the composer ONCE, quoting the
     failed sections — a bounded self-correction, not a single shot. */
  let audit = auditGrounding(composed.text, g);
  trace.push({
    step: "audit",
    detail: audit.verified + "/" + audit.lines + " lines cite grounded entities" + (audit.ok ? " · pass" : " · below bar"),
  });
  if (!audit.ok && engine === "llm") {
    const failed = audit.bad.join(", ");
    try {
      const retryPrompt = userPrompt +
        "\n\nYour previous draft failed the grounding audit on: " + failed +
        ". Rewrite those sections naming ONLY entities present in the grounding JSON. Return the full playbook again, same format.";
      const out2 = await callLLM(env, SYSTEM_PROMPT, retryPrompt);
      if (validPlaybook(out2.text)) {
        const audit2 = auditGrounding(out2.text, g);
        if (audit2.verified > audit.verified) {
          composed = out2;
          audit = audit2;
          audit.retried = true;
          trace.push({ step: "retry", detail: "re-grounded " + failed + " · " + audit2.verified + "/" + audit2.lines + " lines now cite entities" });
        } else {
          trace.push({ step: "retry", detail: "retry did not improve grounding — keeping the first draft" });
        }
      }
    } catch (err) {
      console.error("playbook audit retry failed", err);
      trace.push({ step: "retry", detail: "retry unreachable — keeping the first draft" });
    }
  }

  return json({
    operator: operator
      ? { uid: operator.uid, email: operator.email, provider: operator.provider }
      : null,
    playbook: composed.text,
    provider: composed.provider,
    model: composed.model,
    engine,
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    agentTrace: trace,
    audit: { lines: audit.lines, verified: audit.verified, ok: audit.ok, retried: Boolean(audit.retried), failed_sections: audit.bad },
    drivers: computeDrivers(ctx, artists),
  });
}
