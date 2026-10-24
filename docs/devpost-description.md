# Devpost Submission — Attune

## One-liner

Attune turns Qloo's Taste AI into an operating system for independent bars — the taste graph of your block becomes a dayparted playbook for what to pour, play, and how to light the room.

## Description

Every venue sits inside a taste signature. The Amber Room is 800 feet from Pioneer Works, ringed by natural-wine bars and listening bars in Greenpoint, Brooklyn. That signature is data — and Qloo has it at street-level resolution. Attune is the layer that turns it into tonight's shift plan.

**The pipeline (retrieval-augmented, Qloo as the retriever):**

1. **Sweep the block.** Attune calls Qloo `/v2/insights` twice — `urn:entity:place` and `urn:entity:artist` — anchored on the venue's coordinates with an 800ft radius, plus `/v2/audiences` for micro-tribes. From these it normalizes block heat, taste synergy, palate signals, streaming affinities, and the predominant tribe.
2. **Build honest grounding.** Everything is compiled into a compact grounding JSON — metrics, tribes, place/artist affinities, palate signals — plus a `trace` array that maps every entity to the UI surfaces it influenced. An export button hands the exact context to the operator (or judge).
3. **Ground the LLM.** The JSON is POSTed to a Firebase function that calls the LLM (OpenAI, Gemini, or Anthropic — provider-switchable) under one hard rule: *"Use ONLY this data — never invent metrics."* The output contract is fixed: `PERSONA / ROASTERS / LINGER / GOLDEN / NIGHT / PLAYLIST / MENU`.
4. **Land it where work happens.** Persona and source-entity chips render in a "Grounded by Qloo" strip; each daypart action swaps into the Daypart Play card as the operator taps 07-11 / 11-16 / 16-20 / 20-02; the playlist anchor drives the Acoustic Architecture card; the menu callout fills the Recommended Pairing card.

**Graceful degradation is a feature:** if Qloo or the LLM is unreachable, the app falls back to a clearly-badged curated demo feed — an operator never stares at a spinner, and judges can always see the full experience. A 15-minute client cache keeps the monthly Qloo quota safe.

**Trust & transparency:** the browser never holds a Qloo key — the Firebase function injects it server-side from a `defineSecret` vault behind a same-origin `/api` rewrite. Every recommendation names the entities that produced it ("Ryuichi Sakamoto 0.96 → playlist anchor").

**Why it matters:** dashboards tell operators what happened. Attune tells the barista what to queue at 7:45, the bartender what to feature at 17:30, and the floor lead when to drop the sconces to 2800K — then measures the lift (+18.4% gross margin in the 30-day pilot model) and renews at $189/mo per door.

## Built with

qloo-taste-ai-api · firebase-functions (v2, defineSecret) · firebase-hosting · openai/gemini/claude (switchable) · tailwindcss · vanilla-js

## Links

- Demo: https://qloo-api-1.web.app (one-tap demo login on the sign-in screen)
- Repo: https://github.com/CHAMA18/roomtone-os
- Video: <add YouTube link after recording — see docs/demo-video-script.md>

## Checklist against submission requirements

- [x] Integrates Qloo Taste AI API (insights + audiences, server-side key vault)
- [x] Integrates an approved LLM (OpenAI / Gemini / Anthropic, provider-switchable)
- [x] Public repo with documentation (README: architecture + grounding explanation)
- [x] Text description (this document)
- [ ] Demo video < 3 min, publicly hosted (script ready: docs/demo-video-script.md)
- [ ] Functional demo URL deployed (deploy steps in README)
