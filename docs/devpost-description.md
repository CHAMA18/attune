# Devpost Submission — Attune

**Tagline (≤60 chars):** Your block's taste graph, working tonight's shift.

**One-liner:** Attune is an agent for independent bar & restaurant owners: it reads the Qloo taste graph around your venue and turns it into tonight's operating plan — what to play, what to pour, how to light the room — citing the exact entities behind every line.

## Description

Every venue sits inside a taste signature — the places, artists, and audiences that set the block's rhythm. Qloo has that signature at street-level resolution. **Attune is the agent that turns it into action.** Type your venue and neighborhood; the agent resolves your real venue against Qloo's entity graph (`/v2/search`), sweeps your block (most popular venue = your block anchor), and produces a dayparted playbook where **every line names the entity that drove it**.

### The agent: ground → enrich → compose → show its receipts

1. **GROUND.** The app compiles grounding JSON from live Qloo calls — `/v2/insights` (places + artists, seeded by the block anchor via `signal.interests.entities`), `/v2/audiences` for leisure segments — plus the focus daypart and the operator's venue context.

2. **ENRICH (server-side, the agent's own move).** The agent re-queries Qloo beyond what the client sent: a **cross-domain artist hop** seeded by the block anchor (`urn:entity:place` → `urn:entity:artist`) with **`feature.explainability=true`**, so every candidate driver carries a real contribution score. This is the step that makes it an agent, not a fetch wrapper — the agent decides it needs more grounding and goes and gets it.

3. **COMPOSE.** An LLM (z-ai / OpenAI / Gemini / Anthropic — provider-switchable, one env var) writes the playbook under a hard contract: *cite only grounded entities; one concrete, physical action per daypart (07–11, 11–16, 16–20, 20–02); a playlist anchor with BPM band; a real menu callout; under 120 words.* If every LLM path fails, a deterministic composer writes from the same grounded data — **the route always answers 200; the app never dead-ends.**

4. **AUDIT.** The UI renders the agent's work as a first-class surface: an **agent-trace strip** ("N entities received · anchor <venue> → Qloo artist hop off <venue> · <artist> NN%, <artist> NN% · anchor pull NN% → LLM cited the grounded block"), **cited driver chips** (<place> · NN% MATCH), the persona quote, and a one-tap **grounding JSON export**. Judges can verify every claim in one tap — nothing is invented.

### Your venue, not a demo venue

The Amber Room demo block is only the fallback. Onboarding (or the drawer's *Your Venue → Retune the room*) accepts any venue name + neighborhood: Attune resolves it through Qloo, then re-runs the entire graph — anchor, affinities, audiences, artists, playbook — against **that** block via `filter.location.query=<locality>`, clearing caches automatically. Judges can point Attune at their own corner of the world in under ten seconds.

### Why this needs Qloo (and dies without it)

The product *is* the taste graph. Cross-domain is the point: a **place** anchor yields **artists** to book and **audiences** to program for — three domains fused through one Qloo ontology in a single agent loop. Strip Qloo out and there is nothing left to ground, nothing to cite, nothing to compose from. Generic LLM-only approaches hallucinate neighborhoods; Attune shows its receipts.

### Trust & engineering notes

- The browser never holds a Qloo key — server-side injection only (Caddy proxy locally, Firebase `defineSecret` in production), same-origin `/api/**`.
- 15-minute client cache; venue switches clear it. Graceful degradation with honest badges: `AI LIVE` → `LIVE DATA` → `DEMO DATA`.
- Two-hop + enrichment calls stay well inside the monthly hackathon quota.
- MIT-licensed, single-file frontend, zero client dependencies beyond Tailwind CDN.

**Why it matters:** dashboards tell operators what happened. Attune tells the barista what to queue at 7:45, the bartender what to feature at 17:30, and the floor lead when to drop the sconces to 2800K — then measures the lift in its 30-day pilot model and renews at $189/mo per door.

## Built with

qloo-taste-ai-api (insights · audiences · search · explainability) · vanilla-js agent orchestration · z-ai/openai/gemini/anthropic (switchable) · firebase-functions v2 · caddy · tailwindcss

## Links

- Demo: https://qloo-api-1.web.app (one-tap demo login; or retune to your own venue from the drawer)
- Repo: https://github.com/CHAMA18/roomtone-os (MIT — see README for architecture + judging-criteria mapping)
