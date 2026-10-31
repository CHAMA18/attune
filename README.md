# Attune

Attune explores how Qloo taste affinities could help independent hospitality operators plan a shift. It resolves venue context, retrieves place and artist signals, and offers suggestions. Affinity is not evidence of customer visits, purchases, timing, or business outcomes; operators should assess every suggestion.

## Run locally

The frontend is a static site. From the repository root run `npm run dev` and open http://localhost:3000. New visitors see the landing page; choose “Explore your room” to sign in or create an account. The browser defaults to the configured hosted Worker; the static server alone does not provide Qloo credentials or an API. To use another Worker, set `localStorage.setItem('roomtone.apiBase', 'http://localhost:8787/api')` in the browser and reload.

The API is in `worker/` (Cloudflare Workers, ES modules). Set `QLOO_API_KEY` as a Worker secret; never put it in the browser or commit it. Configure optional Firebase authentication using `worker/wrangler.toml`. The current interface generates structured recommendations on-device from Qloo results and operator inputs, using the shared conservative composer; the UI marks this as on-device. The Worker also exposes a playbook endpoint that can make a separate server-side artist query, but the current interface does not call that endpoint to build its plan. Deploy the updated frontend to make this fallback available.

Qloo responses are cached in the browser for up to 15 minutes. A demo or unavailable state is not a live measurement. Evidence sent by the browser is not independently verified by the Worker; the server-side artist hop is fetched separately. The enrichment request enables explainability, but the Worker currently retains artist affinity, not contribution fields. No contribution score should be inferred from an affinity.

Run focused checks with `npm test --prefix worker`. The static site is assembled by `.github/workflows/deploy-pages.yml`; the tracked `dist/` snapshot is not the source of truth. `scripts/` and `Caddyfile` contain an older local stack and do not implement the current Worker contract.

## Evaluation and limitations

Structured templates prevent free-form invented claims in the current Worker, but do not verify upstream entities or establish whether a suggestion is suitable. Test the hosted venue flow, fallback states, and mobile layout before relying on it. No operator study or business outcome has been established in this repository. See [the evaluation plan](docs/operator-evaluation.md).

Licensed under the MIT license; see [LICENSE](LICENSE).

## Shift workspace

Select a venue, set optional constraints and choose a direction to generate a structured shift plan. Each daypart shows available evidence and limitations. Edit the team brief before copying, sharing, or printing. Feedback is stored on the device per venue; marking a daypart not useful replaces its next suggestion with a general alternative. Optional notes are stored locally and are not interpreted automatically. The place comparison searches Qloo independently and returns related artists, subject to coverage and caching. Confirm the resolved places before relying on the comparison. No operator study or business outcome is implied.

## Release

See [release and operations](docs/release-and-operations.md) for identity setup, migration, rate limits, release checks, and device-local persistence. Run `npm run test:e2e` after installing Playwright Chromium. Browser tests use fixture responses; run the live smoke test separately against a configured deployment.
