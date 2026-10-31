# Attune — draft project description

**Tagline:** Your block's taste signals, working on your shift.

Attune helps independent hospitality operators explore Qloo taste signals and turn them into a shift plan. An operator selects a venue, adds optional opening hours, atmosphere, budget, and an existing menu category, then reviews daypart suggestions and the signals behind them.

Attune uses Qloo place, artist, and audience data. Its Worker can query Qloo for artists related to a place anchor. For each daypart, “Why this?” shows the available entity and affinity, the operator's settings, and the limitations. Some suggestions are general prompts and are labeled as having no supporting taste entity. Qloo affinity does not establish that customers will visit or purchase, or that a recommendation will improve results.

The current playbook uses bounded templates rather than free-form LLM output. The browser caches Qloo responses for up to 15 minutes; source labels distinguish Qloo data from demo or unverified input. The Worker does not independently verify browser-provided grounding. Operator feedback and business impact have not yet been established.

See the README for the current architecture and setup, and the demo walkthrough for a proposed presentation. Confirm organizer rules before altering any submitted materials.
