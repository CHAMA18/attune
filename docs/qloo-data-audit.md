# Qloo data audit

This records a source-code audit of the current working tree. It is not evidence that the deployed site or the live API was tested. The frontend defaults to a hosted Worker; deploy compatible frontend and Worker versions together before evaluating the changes.

## Sources and transformations

- **Venue:** entered by the operator. Qloo search can resolve it to a place and coordinates; a supplied locality is used as a broader fallback. There is no fixed venue fallback. A locality search does not imply a radius.
- **Taste Radar:** the frontend queries Qloo place insights, selects an anchor from returned results, and requests related places and artist affinities. The displayed affinity values are read from Qloo responses; the average of up to ten returned place affinities and the count at or above 0.8 are calculated by Attune. Results may be cached for 15 minutes.
- **Place types:** Attune counts Qloo place genre tags among the returned places and scales bar widths relative to the largest count. Counts are not Qloo audience scores or population measurements. No unseeded audience fallback is presented as local data.
- **Artist signals:** names, genre tags, and affinities come from Qloo's related-artist response. They are relationships to the selected anchor, not evidence of actual listening or attendance.
- **Shift plan:** the browser combines Qloo-derived inputs and operator constraints with bounded application templates. Actions are suggestions, not Qloo API outputs or verified forecasts. Inputs are not independently verified by the composer. The Worker has a separate artist enrichment endpoint, but the current shift workspace composes on-device.
- **Audio:** bundled, local audio previews, not Qloo-generated recordings, recommendations, or licensed venue playlists. The UI labels them as previews.
- **Interface and settings:** labels, daypart windows, icons, explanatory copy, selected distance, budget, opening hours and preferences are app configuration or operator input, not API data. Static imagery is decorative.
- **Other code:** `scripts/local-api.js`, `scripts/llm-sidecar.js`, and `Caddyfile` are legacy local paths, not the documented Worker implementation. The tracked `dist/` is an old build snapshot; Pages assembles a new artifact from source, while deployments serving `dist/` directly must rebuild it. Archived or legacy code has not been certified as equivalent to the current Worker.

## Audit corrections

Removed invented crowd names, synthetic dominance scores, unseeded audience fallback, a hardcoded forecast with invented business outcomes, a fixed default venue, and a simulated Sonos action. Corrected map-radius selection to refresh Qloo when coordinates are available, and describe locality searches without claiming a radius. The place-type card now shows actual counts derived from returned tags rather than asserting who is present.

## Remaining verification

Test with authorized live Qloo credentials and multiple real venues, including no results, missing coordinates, missing tags, failed endpoints, cached responses, and rapid venue changes. Check API semantics, location coverage and returned schemas against the current Qloo documentation and actual responses. Confirm all screens and mobile states visually. Local audio previews and template suggestions are intentionally not Qloo data. No implementation can truthfully make static UI copy, user settings, or venue audio files originate from Qloo unless Qloo actually supplies them.
