# Google & Apple sign-in — setup

The client half is wired in [`auth-firebase.js`](../auth-firebase.js), shared by
the two sign-in surfaces: [`auth.html`](../auth.html) (the page gate) and the
in-app auth shell in [`index.html`](../index.html) (drawer → Sign Out). What
remains is one-time configuration in the Firebase console (project
**qloo-api-1**) and, for Apple, in the Apple Developer portal.

```
auth-firebase.js
  └─ Firebase Auth (web SDK 10.14.1, lazy-loaded)
       ├─ GoogleAuthProvider          → popup on desktop
       └─ OAuthProvider('apple.com')  → popup on desktop
     iOS / installed PWA → signInWithRedirect, resolved on return by
     getRedirectResult() before the page decides whether a session exists.
```

On success the app mints its usual local `roomtone.session` from the Firebase
user (`name`, `email`), so the rest of the app is unchanged.

## 0. Authorized domains

Authentication → Settings → **Authorized domains**.

`localhost` and `qloo-api-1.firebaseapp.com` / `qloo-api-1.web.app` are
authorized by default. Add any other host the app is served from (a custom
domain or a Cloudflare Pages host) — otherwise the buttons fail with
`auth/unauthorized-domain`.

## 1. Google

Authentication → Sign-in method → **Google**:

1. Enable.
2. Set the public-facing project name and a support email.
3. Save.

Firebase creates the OAuth web client in Google Cloud automatically; the web
config already in `auth.html` needs no changes.

Optional: under the Google provider's **Web SDK configuration**, keep the
auto-generated client as-is. Add `http://localhost:3000` to the OAuth client's
authorized JavaScript origins only if you configure a client by hand.

## 2. Apple

Requires an active **Apple Developer Program** membership (the free tier cannot
create a Services ID or a signing key).

### Apple Developer portal — developer.apple.com

1. **Certificates, Identifiers & Profiles → Identifiers → Services IDs → +**
   - Description: `Attune Web`
   - Identifier: e.g. `os.attune.web` (must differ from the bundle ID)
2. Open the new Services ID → enable **Sign in with Apple** → **Configure**:
   - Primary domain: `qloo-api-1.firebaseapp.com`
   - Return URL: `https://qloo-api-1.firebaseapp.com/__/auth/handler`
   - Save, then **Continue → Save** on the Services ID.
3. **Keys → +**
   - Name: `Attune Sign in with Apple`
   - Enable **Sign in with Apple**, configure it against the same primary app ID
   - Register, then **download the `.p8`** (Apple offers it once only)
   - Note the **Key ID** shown next to the key.
4. **Membership details** → copy the **Team ID**.

### Firebase console

Authentication → Sign-in method → **Apple** → Enable, then paste:

| Field | Value |
| --- | --- |
| Services ID | `os.attune.web` (the identifier from step 1) |
| Apple team ID | your 10-character Team ID |
| Key ID | the Key ID from step 3 |
| Private key | full contents of the downloaded `.p8` |

Save.

### Same email, both providers

One operator should never end up with two profiles because they tapped Google
one day and Apple the next.

1. **Keep the console on one account per email.** Authentication → Settings →
   **User actions** → account linking: keep **Link accounts that use the same
   email** (the default). Do *not* choose **Create multiple accounts for each
   identity provider** — that silently gives one person two Firebase users, and
   with them two operator profiles.
2. **The app links them.** Under that setting Firebase refuses the second
   provider with `auth/account-exists-with-different-credential` (it does not
   merge on its own). `auth.html` keeps that provider's credential in memory
   (never in storage), names the provider the email already uses, and calls
   `linkWithCredential` the moment the operator taps that provider — one
   Firebase user, one operator profile, both methods. It refuses to merge when
   the two emails differ.

The credential only lives for the current page, so the automatic link covers
the popup flow. On the iOS/PWA redirect hand-off the banner instead points the
operator at the provider they already use, which still keeps a single profile.

### What Apple does *not* give you after the first sign-in

Apple returns name and email only on the user's **first** authorization; every
later response carries just the stable user id. `auth.html` therefore caches the
resolved profile under `roomtone.ssoProfiles` (keyed by Firebase uid) so a
returning operator is still greeted by name. Clear that key with the session if
you ever need to re-collect a profile.

## 3. Verify

```bash
npm run dev                      # http://localhost:3000
open http://localhost:3000/auth.html#force
```

- **Google** → account chooser, then back in the app as an operator.
- **Apple** → Apple ID prompt, then back in the app.
- The same two buttons sit in the in-app auth shell (drawer → **Sign Out**);
  signing in there stores the session and reloads so the drawer, feed identity
  and API token all pick up the new operator.
- On an iPhone, the buttons hand off to the provider and return via
  `getRedirectResult()`; the app resumes on `index.html`. Testing with `#force`
  keeps you on the sign-in screen and confirms with a *Session saved* toast —
  reload without the hash to enter the app.
- Existing sessions skip all of this and go straight to `index.html`.

An unconfigured provider reports itself by name, e.g. *"Apple sign-in is not
switched on in Firebase yet…"* or *"…is not allowed from this domain yet…"*.

### Troubleshooting

| Banner code | Cause |
| --- | --- |
| `auth/operation-not-allowed` | Provider still disabled in Firebase |
| `auth/unauthorized-domain` | Page host not in Authorized domains |
| `auth/account-exists-with-different-credential` | Same email already used with the other provider — the banner prompts you to tap that provider, which links them |
| `auth/invalid-credential` | Apple Services ID / key / return URL mismatch |
| `auth/popup-blocked` | Browser blocked the popup (the app falls back to redirect automatically) |

## 4. Server side: `/api/**` runs as the operator

A Google/Apple session carries a Firebase ID token; the Worker verifies it and
attaches the operator to every request.

```
index.html    session.provider === google|apple
                → lazy load firebase-auth → user.getIdToken()
                → Authorization: Bearer <idToken> on /api/**

worker/src/auth.js  RS256 over Google's securetoken JWKS (WebCrypto)
                    checks alg/kid, signature, aud, iss, exp, iat, sub
                    → { uid, email, name, provider }
worker/src/index.js 401 on an invalid token; REQUIRE_AUTH=1 rejects anonymous
```

- Invalid or expired tokens always get `401 {error:"Unauthorized"}`, never a
  silent downgrade to anonymous.
- Email/passkey and demo-room sessions send no token and keep working, because
  `REQUIRE_AUTH` is unset by default. Set it to `1` in `wrangler.toml` when every
  call must come from a signed-in operator.
- The verified identity appears in the playbook response (`operator`) and as an
  `auth` step in `agentTrace`, never the raw token.

```bash
# optional: require a token for every /api/** call
#   worker/wrangler.toml → [vars] REQUIRE_AUTH = "1"
npx wrangler deploy --config worker/wrangler.toml
```

Local Caddy dev (`scripts/serve.sh`) proxies `/api/qloo/**` straight to Qloo and
never runs the Worker, so token checks only apply to the Worker deployment.

## Not covered here

This proves identity to the API; it does not yet partition Qloo data per
operator, because every request already scopes results by venue. `operator.uid`
is the hook if per-operator storage is added later.
