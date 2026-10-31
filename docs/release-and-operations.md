# Release and operations

## Before deploying

1. Verify Firebase Authentication has Email/Password enabled and that each frontend origin is authorized. Configure Google and Apple only if those providers are intended to work. Existing device-only accounts cannot be migrated automatically; users must create a Firebase account or use an existing provider. Do not delete their device data without consent.
2. Configure `QLOO_API_KEY` as a Cloudflare Worker secret. Verify the `ALLOWED_ORIGINS`, `REQUIRE_AUTH`, and `QLOO_RATE_LIMITER` binding in `worker/wrangler.toml`. Choose a namespace ID unique within the account. Cloudflare's rate limit is approximate per location; it is not a strict global spending cap. Set a separate provider-side quota or budget alert.
3. Run `npm ci`, `node --test tests/qloo-audit.test.cjs`, `npm test --prefix worker`, `npx playwright install chromium`, and `npm run test:e2e`.
4. Deploy compatible Worker and frontend versions in a staging environment, then verify authentication, venue confirmation, place and artist results, rate limits, empty results, failures, and sign-out. The browser tests use fixtures; they do not prove live provider configuration.
5. Inspect the generated Pages artifact; it is assembled from an explicit allowlist. Do not add local screenshots, credentials, environment files, or test artifacts to the published bundle. Rotate any exposed tokens or passwords through their issuer.
6. After deployment, verify `build.json` and the in-app build label against the intended commit. Test the public URL in a new desktop and mobile session and check provider configuration and Qloo quota.

## Persistence and sharing

Venue choice, notes, settings and feedback are stored on the device. They are not synchronized between devices or isolated by Firebase account. Avoid entering sensitive information in local shift notes. Copy, share, and print require an explicit operator action. A cross-device store requires a separately designed account-scoped backend, access rules, retention policy, and migration; it is not implemented in this version.

## Operational limitations

Cloudflare Rate Limiting is approximate, distributed per location, and does not replace a global Qloo budget. The proxy permits only the Qloo routes and query fields used by the current interface. On missing rate-limit binding, the configured Worker returns 503 rather than silently removing the limit. Firebase Auth and Qloo may be unavailable, and the interface should report that without fabricating results.

Operator interviews and live outcome measurement are not completed. Follow `docs/operator-evaluation.md` and record real observations; do not imply customer or revenue impact without evidence.
