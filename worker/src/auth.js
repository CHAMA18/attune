/* Firebase ID token verification for the Attune Worker.
 *
 * RS256 over Google's securetoken JWKS, checked with WebCrypto so the Worker
 * stays dependency-free and edge-native. The verified identity is what every
 * handler sees, so /api/** runs as the signed-in operator.
 *
 * Env:
 *   FIREBASE_PROJECT_ID   defaults to qloo-api-1
 *   FIREBASE_JWKS_URL     override for tests / emulators
 *   REQUIRE_AUTH          "1" rejects requests without a token (off by default
 *                         so the demo room keeps working)
 */

const DEFAULT_PROJECT_ID = "qloo-api-1";
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let keyCache = { keys: [], fetchedAt: 0 };

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function base64UrlBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeSegment(segment) {
  return JSON.parse(decoder.decode(base64UrlBytes(segment)));
}

async function signingKeys(env, force) {
  const fresh = keyCache.keys.length && Date.now() - keyCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return keyCache.keys;

  const url = (env && env.FIREBASE_JWKS_URL) || JWKS_URL;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new AuthError("signing keys unavailable (" + res.status + ")", 503);

  const body = await res.json();
  const keys = body && Array.isArray(body.keys) ? body.keys : [];
  if (!keys.length) throw new AuthError("signing keys empty", 503);

  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/* Google rotates keys; an unknown kid is the signal to refetch once. */
async function findKey(env, kid) {
  let keys = await signingKeys(env, false);
  let key = keys.find((k) => k.kid === kid);
  if (!key) {
    keys = await signingKeys(env, true);
    key = keys.find((k) => k.kid === kid);
  }
  if (!key) throw new AuthError("unknown signing key");
  return key;
}

export async function verifyFirebaseIdToken(token, env) {
  const projectId = (env && env.FIREBASE_PROJECT_ID) || DEFAULT_PROJECT_ID;
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new AuthError("malformed token");

  let header;
  let payload;
  try {
    header = decodeSegment(parts[0]);
    payload = decodeSegment(parts[1]);
  } catch (e) {
    throw new AuthError("malformed token");
  }
  if (!header || header.alg !== "RS256" || !header.kid) {
    throw new AuthError("unsupported token");
  }

  const jwk = await findKey(env, header.kid);
  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch (e) {
    throw new AuthError("unusable signing key", 503);
  }

  const signatureOK = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlBytes(parts[2]),
    encoder.encode(parts[0] + "." + parts[1])
  );
  if (!signatureOK) throw new AuthError("bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new AuthError("wrong audience");
  if (payload.iss !== "https://securetoken.google.com/" + projectId) {
    throw new AuthError("wrong issuer");
  }
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SEC < now) {
    throw new AuthError("expired token");
  }
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SEC > now) {
    throw new AuthError("token issued in the future");
  }
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
    throw new AuthError("missing subject");
  }

  const firebase = payload.firebase || {};
  return {
    uid: payload.sub,
    email: payload.email || "",
    name: payload.name || "",
    emailVerified: payload.email_verified === true,
    provider: firebase.sign_in_provider || null,
  };
}

/* Resolve the caller. No header is anonymous, a bad header is an error. */
export async function operatorFromRequest(request, env) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { operator: null, error: null };

  try {
    return { operator: await verifyFirebaseIdToken(match[1].trim(), env), error: null };
  } catch (err) {
    const authErr = err instanceof AuthError ? err : new AuthError("could not verify token");
    console.warn("[auth] rejected token:", authErr.message);
    return { operator: null, error: authErr };
  }
}
