# Attune — ambience intelligence for hospitality venues

**Attune** turns Qloo's Taste AI™ into an operating system for independent bar & restaurant operators. Instead of another analytics dashboard, it converts the taste graph of the block around your door — 250M+ entities across music, dining, film, fashion and more — into a **dayparted operations playbook**: what to pour, what to play, how to light the room, hour by hour.

Built for the **Qloo Agentic Hackathon** ("Agents, but with taste"). Mobile-first, single-file frontend, agent sidecar + Firebase backend.

---

## The 30-second pitch

> Every block has a taste signature. Your venue sits 800 feet from the places and people that set the block's rhythm. Attune's **playbook agent** reads that signature through Qloo, grounds itself deeper server-side (a cross-domain artist hop off your block anchor, with explainability), and hands the operator a night plan: *anchor to the dive bar two doors down, spin Ersen into the golden-hour set, run the natural-wine flight through the 16–20 swell.* Not a report — a shift plan where every line cites the entity that drove it.

## Your venue, not a demo venue

Onboarding asks for the venue name and neighborhood. Attune resolves it against Qloo's entity graph (`/v2/search`), then runs the entire taste graph — anchor, affinities, audiences, artists, agent — against **that** block (`filter.location.query=<locality>`). Change the venue anytime in the drawer (**Your Venue → Retune the room**) and every metric, playbook line, and cited driver recomputes. The Amber Room demo block is only the fallback, clearly badged.

## The playbook agent (ground → enrich → compose)

The agent is not a chat box bolted onto a dashboard — it is the composition engine, and its work is auditable in the UI (the agent-trace strip on the Home card):

```
1. GROUND   the app ships its grounding JSON: venue, block anchor, place/
            artist affinities, audience segments, palate tags, focus daypart
2. ENRICH   the agent re-queries Qloo server-side — a cross-domain artist hop
            seeded by the block anchor (urn:entity:place → urn:entity:artist)
            with feature.explainability=true, so every driver carries a real
            contribution score. The agent now holds entities the client never sent.
3. COMPOSE  an LLM (z-ai / OpenAI / Gemini / Anthropic — provider-switchable)
            writes the playbook under a strict contract: cite only grounded
            entities, one concrete action per daypart, <120 words.
4. FALLBACK deterministic composer (data → copy) if every LLM path fails —
            the route always answers 200. The app never dead-ends.
```

Response contract: `{ playbook, engine: llm|local, provider, model, generatedAt, latencyMs, agentTrace[], drivers[] }`. `drivers` re-renders as the cited MATCH chips; `agentTrace` renders verbatim as the trace strip.

## The grounding pipeline (app side)

The entire pipeline is **retrieval-augmented with Qloo as the retriever**:

```
┌────────────────────────── BROWSER (single-file app) ──────────────────────────┐
│                                                                               │
│  venue geo (40.7226, -73.9519) ──►  GET /api/qloo/v2/insights                 │
│                                     • urn:entity:place  → block heat, palate  │
│                                     • urn:entity:artist → streaming affinity  │
│                                     GET /api/qloo/v2/audiences                │
│                                     • micro-tribes      → tribe index, hero   │
│                                                │                              │
│  ┌─────────────────────────────────────────────▼───────────────────────────┐  │
│  │  GROUNDING JSON — compact, traceable context:                           │  │
│  │  { venue, radius, taste_metrics, micro_tribes,                          │  │
│  │    nearby_place_affinities, artist_affinities, palate_signals,          │  │
│  │    trace: [ {entity, kind, affinity, surfaces[]}, ... ] }               │  │
│  └─────────────────────────────────────────────┬───────────────────────────┘  │
└────────────────────────────────────────────────┼──────────────────────────────┘
                                                 │ POST /api/llm/playbook
┌────────────────────────────────────────────────▼──────────────────────────────┐
│  FIREBASE FUNCTION (us-central1)                                              │
│  • transparent Qloo proxy — injects X-Api-Key from defineSecret vault         │
│    (the browser never holds a Qloo key)                                       │
│  • LLM call (OpenAI / Gemini / Anthropic — provider-switchable) with a        │
│    strict grounded system prompt: "Use ONLY this data — never invent metrics" │
│  • returns fixed-format playbook:                                             │
│    PERSONA / ROASTERS / LINGER / GOLDEN / NIGHT / PLAYLIST / MENU             │
└────────────────────────────────────────────────┬──────────────────────────────┘
                                                 │
┌────────────────────────────────────────────────▼──────────────────────────────┐
│  UI RENDER — every LLM line lands where the operator acts:                    │
│  • persona            → "Grounded by Qloo" strip (with source-entity chips)   │
│  • daypart actions    → Daypart Play card (Golden Hour deep-dive)             │
│  • playlist anchor    → Acoustic Architecture (artist + BPM zone)             │
│  • menu callout       → Recommended Pairing card                              │
│  Traceability: the driver sentence and chips name the REAL entities          │
│  (e.g. "Ryuichi Sakamoto 0.96") that produced each recommendation.            │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Why judges can trust the output:** the grounding JSON ships with a `trace` array mapping every entity to the UI surface it influenced, and the `grounding-export` button (the `{}` icon in the Hyperlocal Driver card) downloads the exact context sent to the LLM. Nothing is invented; when a signal isn't in the data, the LLM is forbidden from fabricating one.

## Graceful degradation (by design)

| State | Badge | Behavior |
|---|---|---|
| Qloo reachable + LLM path up | `AI LIVE` | Full agent: grounding → enrichment → LLM compose, trace visible |
| Qloo reachable, LLM down | `LIVE DATA` | Deterministic composer writes from the same grounded data |
| No backend reachable | `DEMO DATA` | Curated demo block, clearly badged — the app never dead-ends |

Responses are cached client-side for 15 minutes (sessionStorage) to stay gentle on the monthly Qloo quota; switching venues clears the cache automatically.

## Run it

```bash
# option A — quickest: static demo feed
npm run dev          # serves on http://localhost:3000

# option B — production-shaped local stack (recommended)
#   single-origin Caddy: static files + key-injecting Qloo proxy + playbook agent
cp .env.example .env.local                 # then add your QLOO_API_KEY
./scripts/serve.sh   # → http://localhost:3000  (agent + Qloo proxy live)
#   serve.sh idempotently starts scripts/llm-sidecar.js (localhost:3789),
#   which Caddy proxies /api/llm/playbook to. Logs: server.log, llm-sidecar.log

# sign in: tap "EXPLORE THE DEMO ROOM • NO ACCOUNT" (one-tap demo login)
```

### Full stack (live Qloo + LLM)

The repo is deploy-ready: `firebase.json` rewrites `/api/**` to the `api`
function, and `functions/` ships with `node_modules` installed.

```bash
npm i -g firebase-tools      # v15 tested
firebase login               # interactive Google OAuth (deployer only)
firebase use qloo-api-1

# secrets never touch the repo or the browser
firebase functions:secrets:set QLOO_API_KEY   # your hackathon Qloo key
firebase functions:secrets:set LLM_API_KEY    # OpenAI / Gemini / Anthropic key

# optional provider switch (functions/.env):  LLM_PROVIDER=gemini  LLM_MODEL=gemini-1.5-flash
# providers: openai (default) | gemini | anthropic

firebase deploy --only functions,hosting
# → https://qloo-api-1.web.app  (same-origin /api/** rewrite keeps keys server-side)
```

CI-style deploy from a headless box: run `firebase login:ci` where you have a
browser, then export the printed token as `FIREBASE_TOKEN` in the deploy
environment — `firebase deploy` picks it up automatically.

### Local development against the live backend

```js
// in the browser console, then reload:
localStorage.setItem('roomtone.apiBase', 'https://us-central1-qloo-api-1.cloudfunctions.net/api');
```

## Project layout

```
index.html          single-file app (UI + Tailwind CDN + live-feed + venue resolution)
auth.html           hash-routed auth (sign in / create / reset) + one-tap demo login
functions/index.js  Firebase fn: Qloo proxy + playbook agent (enrich + compose + fallback)
firebase.json       Hosting rewrites /api/** → api function; cache headers
Caddyfile           single-origin local stack: file_server + Qloo proxy + agent proxy
scripts/serve.sh    Caddy launcher (loads .env.local; idempotent sidecar spawn)
scripts/llm-sidecar.js  playbook agent on 127.0.0.1:3789 (ground→enrich→compose→fallback)
scripts/local-api.js  zero-dependency Node fallback server (static + proxy + agent)
.env.example        environment template (QLOO_API_KEY, optional LLM_*)
logo/               Attune mark + lockups (SVG)
audio/              venue soundtrack asset (Pixabay, credited in-app)
.verify/            dev verification scripts (not part of the app)
```

## Mapping to judging criteria (Qloo Agentic Hackathon)

| Criterion | Where |
|---|---|
| Technological implementation | Two-hop anchor flow + cross-domain artist enrichment + explainability contributions + `/v2/audiences` + `/v2/search` venue resolution; server-side key vault; agent trace + cited drivers in the UI |
| Design | Editorial glass system, mobile-first, real-words copy discipline, auditable agent trace rendered as part of the product |
| Potential impact | Independent operators type their venue and get tonight's plan — cited, physical, shift-ready; pricing + export surfaces built in |
| Quality of the idea | The taste graph as an *operating* surface: the agent turns cultural affinity into pour/play/light decisions, and shows its receipts. Remove Qloo and there is nothing left — the block's taste is the product |
