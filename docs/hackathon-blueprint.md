# Attune: Hackathon Winning Blueprint

## 1. The bet
Attune turns Qloo's taste graph around a venue into a dayparted operations playbook. The judges' brief asks for an agent whose output only works because it knows what people love. Attune's answer: every line of the night plan cites the real Qloo entity that produced it.

## 2. What must be true before submitting
These are the gates from the brief. Missing any one disqualifies the entry.

| Requirement | Status | Action |
|---|---|---|
| Live demo, hosted externally | Firebase hosting configured (`firebase.json`) | Deploy and confirm the public URL loads without a local server |
| Public repo with source and run instructions | Remote is `CHAMA18/roomtone-os` | Confirm the repo is public and README run steps work from a clean clone |
| Text description of features and Qloo use | `README.md` and `docs/devpost-description.md` exist | Keep both in sync with the final build |
| Open-source license visible in repo About | MIT `LICENSE` present | Set the GitHub About license field |
| Works end to end with real data | Partly. See section 3 | Fix the items in section 3 |

## 3. Must-fix before judging
Judges will test whether the data is real. Anything invented is a disqualifying risk.

1. **Live screen is simulated.** Footfall velocity, decibels, occupancy, arrivals, and dwell time come from a generated curve (`curveAt`, `noiseFor`, and `Math.random` near line 4520 in `index.html`). Qloo does not provide these. Either label them clearly as simulated sensor data, or remove them. Labeling is the honest fast fix.
2. **Discover radar** plots real Qloo places by affinity rank, not by distance. Keep it that way and say so on screen.
3. **Hero metrics** show a dash until Qloo responds. Verify each one traces to a Qloo response.
4. **Audio player** still plays four bundled local files. Decide whether the file's Pixabay origin needs a credit or license check, or remove the player.
5. **Empty and error states.** A failed Qloo fetch should show a plain error message, not a silent placeholder.

## 4. Demo path (3 minutes)
Judges watch one flow. Build the demo around it.
1. Onboarding: enter a real venue name and neighborhood. Show the Qloo entity resolution.
2. Discover: the radar and hero metrics fill from live Qloo data.
3. Home: the playbook shows the agent trace and cited drivers (for example, a real artist name with its affinity).
4. Grounding export: download the exact JSON sent to the LLM, to prove nothing was invented.
5. Close on the one-line pitch: a dayplan where every action names the entity behind it.

## 5. Differentiator to emphasize
- The agent's ENRICH step makes a second Qloo call the client never sent (a cross-domain artist hop from the block anchor, with explainability scores). Show that call in the trace.
- The deterministic fallback means the app never dead-ends. Mention it, because it proves the output is grounded even without an LLM.
- Avoid claiming capabilities the demo can't show live.

## 6. Pre-submission checklist
- [ ] Run the app in a clean browser profile and confirm no invented names or numbers appear
- [ ] Confirm each Qloo endpoint returns data for the demo venue
- [ ] Deploy to Firebase and test the public URL on a phone-sized screen
- [ ] Confirm `LICENSE` is visible in the GitHub About section
- [ ] Rewrite README examples that name artists, so they match real output
- [ ] Record a short written walkthrough or screenshots in the README (demo video not required)

## 7. Open decisions for the team
- Keep the Live screen as labeled simulation, or remove it?
- Keep the audio player, or remove it to shorten the demo?
- Which venue will the demo use, and will its Qloo results be stable on demo day?
