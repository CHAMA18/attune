# Authentication setup

Attune uses Firebase Authentication for email/password, Google and Apple sign-in. The frontend uses a Firebase ID token when calling the Worker, and the Worker verifies it before serving Qloo routes when `REQUIRE_AUTH=1`.

Before deployment, enable Email/Password in Firebase Authentication, add the exact frontend domains under Authentication → Settings → Authorized domains, and configure Google and Apple providers only if required. Apple also needs its developer account configuration. Verify password-reset email delivery and provider settings in staging.

The former browser-only email accounts are not Firebase accounts and cannot be migrated automatically: users must register with Firebase or use a configured provider. Their local notes and settings remain on their device; they are not synchronized or account-isolated. Do not delete existing local data without consent.

The production Worker requires authentication and a configured rate limit in `worker/wrangler.toml`. Check `docs/release-and-operations.md` before deploying both frontend and Worker together.
