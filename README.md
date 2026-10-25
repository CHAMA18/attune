# Attune — ambience intelligence for hospitality venues

**Attune** turns Qloo's Taste AI™ into an operating system for independent bar & restaurant operators. Instead of another analytics dashboard, it converts the taste graph of the block around your door — 250M+ entities across music, dining, film, fashion and more — into a **dayparted operations playbook**: what to pour, what to play, how to light the room, hour by hour.

Built for the **Qloo LLM Hackathon**. Mobile-first, single-file frontend, Firebase backend.

---

## The 30-second pitch

> Every block has a taste signature. The Amber Room sits in Greenpoint, Brooklyn, 800 feet from Pioneer Works and a cluster of natural-wine bars. Attune reads that signature through Qloo, grounds an LLM in it, and hands the operator a Friday playbook: *queue kankyō ongaku side-B for the 16–20 swell, run the hi-ball tray to garden tables from 17:30, sconces to 2800K at 35%.* Not a report — a shift plan.

## How Qloo grounds the LLM

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
| Qloo reachable + LLM configured | `LIVE · GROUNDED BY QLOO` | Full pipeline: live metrics → LLM playbook |
| Qloo reachable, LLM down | `LIVE · GROUNDED BY QLOO` | Live metrics + curated playbook, error noted in strip |
| No backend reachable | `DEMO FEED · 800FT RADAR` | Curated demo data, clearly badged — the app never dead-ends |

Responses are cached client-side for 15 minutes (sessionStorage) to stay gentle on the monthly Qloo quota.

## Run it

```bash
# option A — quickest: static demo feed
npm run dev          # serves on http://localhost:3000

# option B — production-shaped local stack (recommended)
#   single-origin Caddy: static files + key-injecting Qloo proxy + LLM stub
echo 'QLOO_API_KEY=your_key' > .env.local   # gitignored
./scripts/serve.sh   # → http://localhost:3000  (LIVE badge)

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
index.html          single-file app (UI + Tailwind CDN + live-feed integration)
auth.html           hash-routed auth (sign in / create / reset) + one-tap demo login
functions/index.js  Firebase fn: Qloo proxy + /api/llm/playbook (3 providers)
firebase.json       Hosting rewrites /api/** → api function; cache headers
Caddyfile           single-origin local stack: file_server + Qloo proxy + LLM stub
scripts/serve.sh    Caddy launcher (loads .env.local, injects X-Api-Key server-side)
scripts/local-api.js  zero-dependency Node fallback server (static + proxy + LLM)
logo/               Attune mark + lockups (SVG)
audio/              venue soundtrack asset (Pixabay, credited in-app)
.verify/            dev verification scripts (not part of the app)
```

## Mapping to judging criteria

| Criterion | Where |
|---|---|
| Intelligent & thoughtful use of LLMs | Strict grounded prompt, fixed output contract, provider-agnostic backend, visible persona + per-daypart actions |
| Integration with Qloo's API | `/v2/insights` (places + artists) and `/v2/audiences` fused into one taste profile; entity-level traceability UI |
| Technical implementation | Server-side key vault (`defineSecret`), same-origin rewrites, CORS, client cache, timeout + graceful degradation, zero-dependency frontend |
| Originality & creativity | Taste graph → *physical operations* (sound, light, pour, staff notes); daypart cadence model; Sonos/Lutron framing |
| Real-world application | 30-day pilot model with renewal pricing; exportable ops PDF; shift notes broadcast; measurable lift metrics |
