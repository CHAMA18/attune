# Attune — Demo Video Script (target: 2:20, under the 3:00 limit)

> Recording setup: 390×844 viewport (mobile), `npm run dev` on :3000, dark theme.
> Music: keep the in-app lofi bed low, or mute and narrate clean.
> upload to YouTube (public/unlisted) — link goes on the Devpost form.

---

## SHOT 1 — Hook (0:00 – 0:15)
**Screen:** THE PLAN (playbook) screen, fully loaded.

**VO:**
> "It's 4 PM Friday at The Amber Room in Greenpoint. By 7, three hundred people
> will walk past this door — and Attune already knows what they want to hear,
> drink, and eat tonight. Not from a hunch. From Qloo."

**Action:** slow scroll from the WEEK 42 PLAYBOOK header down to the metrics triad.

## SHOT 2 — The taste radar (0:15 – 0:45)
**Screen:** DISCOVER (THE BLOCK) tab.

**VO:**
> "Attune sweeps an 800-foot radius around the venue through Qloo's Taste AI.
> Insights on places and artists build the block-heat score, the palate signals,
> and the streaming affinities. Audiences gives us the micro-tribes —
> 'Analog Minimalists' at ninety-four percent. That's the room tonight."

**Action:** tap a radar blip → signal detail opens (name, affinity bar). Then scroll
through Micro-Tribe Index and Affinity Signals.

**On screen:** `QLOO LIVE · JUST NOW` badge on the sweep pill (or `DEMO FEED` if
recording without keys — say: "and when the feed's offline, it degrades to a
clearly-badged demo — an operator never stares at a spinner").

## SHOT 3 — The LLM writes the playbook (0:45 – 1:25)
**Screen:** back to THE PLAN.

**VO:**
> "Those signals become grounding JSON — and the JSON is honest: every entity
> carries its affinity and the surfaces it influenced. We POST it to our
> Firebase function, which grounds the LLM with one hard rule: use ONLY this
> data, never invent a metric. What comes back is not a report. It's a shift plan."

**Action:** open the grounding-export button first (`{}` icon) — flash the JSON —
then point at the "Grounded by Qloo" strip: persona line + entity chips
("Ryuichi Sakamoto · 0.96").

## SHOT 4 — Daypart cadence (1:25 – 1:55)
**Screen:** THE PLAN, daypart selector.

**VO:**
> "The playbook lands per daypart. Morning: slow-filter feature, pastry warm-out
> at 7:45. Golden hour — that's now — kankyō ongaku side-B, hi-ball tray to the
> garden tables, sconces down to 2800K. Night: candlelight, skin-contact by the
> glass. The playlist anchor and the menu callout come from the same grounding."

**Action:** tap 07-11 → 16-20 → 20-02; card title, window, and action swap live.

## SHOT 5 — Ops & close (1:55 – 2:20)
**Screen:** THE PLAN bottom suite + pilot banner.

**VO:**
> "Broadcast the shift notes to staff, push the playlist to Sonos, export the ops
> PDF. A 30-day pilot measured an 18-percent gross-margin lift — renewing at a
> hundred eighty-nine a month per door. Qloo's taste graph, grounded into an LLM,
> running a real room. Attune. Tune your block."

**Action:** tap "Broadcast Shift Notes to Staff" → "Export Ops PDF" → end on the
telemetry footer bar.

---

### Recording checklist
- [ ] Session logged in via demo room (auth gate on)
- [ ] Decide feed mode BEFORE recording: live (secrets set) or demo (badge on)
- [ ] Console clean (`agent-browser errors` empty)
- [ ] Do one full dry run for timing before the real take
- [ ] Captions: burn in the entity names during SHOT 3
