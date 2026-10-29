/* Attune — Google + Apple sign-in, shared by the two auth surfaces:
 *
 *   auth.html      the standalone sign-in / sign-up page (page gate)
 *   index.html     the in-app auth shell (drawer -> Sign Out)
 *
 * Loads the Firebase web SDK lazily and fails closed: when the CDN is
 * unreachable `ready` resolves to null, password sign-in keeps working, and the
 * provider buttons report that they are unavailable.
 *
 *   import { ready, errorMessage } from './auth-firebase.js';
 *   const api = await ready;            // null when Firebase never loaded
 *   api.signIn('google')                // profile, or { redirect: true }
 *   api.resolveRedirect()               // { user, error, provider }
 *   api.headers()                       // { Authorization: 'Bearer …' } | {}
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA_5jutEQbIfmc8S3BFKZKeLRNw6Y5AsYc",
  authDomain: "qloo-api-1.firebaseapp.com",
  projectId: "qloo-api-1",
  storageBucket: "qloo-api-1.firebasestorage.app",
  messagingSenderId: "128364649920",
  appId: "1:128364649920:web:3e131dc7493dc2de89bc25",
  measurementId: "G-2W56KTZ42L"
};

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const PENDING_KEY = 'roomtone.sso.pending';
const PROFILE_KEY = 'roomtone.ssoProfiles';

function readProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch (e) { return {}; }
}

/* Apple releases name/email only on the first authorization. Cache the profile
   per uid so later sign-ins still greet the operator by name. */
function describe(user) {
  const pd = (user.providerData && user.providerData[0]) || {};
  const cached = readProfiles()[user.uid] || {};
  const email = user.email || pd.email || cached.email || '';
  const name = user.displayName || pd.displayName || cached.name ||
    (email ? email.split('@')[0] : 'Operator');
  try {
    const all = readProfiles();
    all[user.uid] = { name: name, email: email };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
  } catch (e) { /* private mode — greet from this response only */ }
  return {
    uid: user.uid,
    name: name,
    email: email,
    photo: user.photoURL || pd.photoURL || '',
    provider: /apple/.test(pd.providerId || '') ? 'apple' : 'google'
  };
}

function providerName(id) {
  if (/apple/.test(id || '')) return 'Apple';
  if (/google/.test(id || '')) return 'Google';
  return '';
}

/* Safari and installed PWAs cannot open the OAuth popup reliably, so there the
   redirect flow is the only one that completes. */
const prefersRedirect = (function () {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true ||
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return iOS || standalone;
})();

function rememberHandoff(kind) { try { sessionStorage.setItem(PENDING_KEY, kind); } catch (e) {} }
function forgetHandoff() { try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {} }
function readHandoff() { try { return sessionStorage.getItem(PENDING_KEY); } catch (e) { return null; } }

/* One operator, both providers: when Apple or Google answers with an email that
   already belongs to an account, keep that credential and attach it the moment
   the operator signs in with the provider they already use. It lives for this
   page only — never persisted. */
let pendingLink = null;

/* Console-side setup states are the likeliest failure, so name them plainly
   instead of showing the raw Firebase code. */
const PROVIDER_PROBLEMS = {
  'auth/operation-not-allowed': 'is not switched on in Firebase yet. Enable it under Authentication \u2192 Sign-in method, then reload.',
  'auth/unauthorized-domain': 'is not allowed from this domain yet. Add it under Authentication \u2192 Settings \u2192 Authorized domains.',
  'auth/popup-blocked': 'needs a popup. Allow popups for this site and try again.',
  'auth/popup-closed-by-user': 'was cancelled.',
  'auth/cancelled-popup-request': 'was cancelled.',
  'auth/network-request-failed': 'could not reach the network. Check your connection and retry.',
  'auth/internal-error': 'hit an internal error. Try again in a moment.'
};

export function errorMessage(label, err) {
  const code = err && err.code;
  const subject = label ? label + ' sign-in' : 'Sign-in';
  if (code === 'attune/link-required') {
    if (err.existing && err.canLink) {
      return 'That email already signs in with ' + err.existing + '. Tap ' + err.existing +
        ' now and it will link ' + label + ' to the same operator profile.';
    }
    if (err.existing) {
      return 'That email already signs in with ' + err.existing + '. Use ' + err.existing +
        ' to reach the same operator profile.';
    }
    return 'That email already has an operator profile. Sign in with your first provider and it will link ' + label + ' to it.';
  }
  const problem = PROVIDER_PROBLEMS[code];
  if (problem) return subject + ' ' + problem;
  return subject + ' failed. Try again' + (code ? ' (' + code + ')' : '') + '.';
}

export const ready = Promise.all([
  import(SDK + 'firebase-app.js'),
  import(SDK + 'firebase-analytics.js'),
  import(SDK + 'firebase-auth.js')
]).then(function (mods) {
  const app = mods[0].initializeApp(FIREBASE_CONFIG);
  const auth = mods[2].getAuth(app);

  function beginLink(kind, err) {
    pendingLink = { credential: err.credential, email: err.email || '', provider: kind };
    const methods = err.email && mods[2].fetchSignInMethodsForEmail
      ? mods[2].fetchSignInMethodsForEmail(auth, err.email).catch(function () { return []; })
      : Promise.resolve([]);
    return methods.then(function (list) {
      const e = new Error('This email already has an operator profile.');
      e.code = 'attune/link-required';
      e.provider = kind;
      e.email = err.email || '';
      e.existing = providerName((list || [])[0]);
      /* The redirect hand-off cannot carry the credential back to the page. */
      e.canLink = !prefersRedirect;
      throw e;
    });
  }

  function completeSignIn(user) {
    const pending = pendingLink;
    pendingLink = null;
    if (!pending) return describe(user);
    /* Never merge two different people just because they clicked twice. */
    const sameEmail = !pending.email || !user.email ||
      pending.email.toLowerCase() === user.email.toLowerCase();
    if (!sameEmail) return describe(user);
    return mods[2].linkWithCredential(user, pending.credential).then(function (cred) {
      const profile = describe(cred && cred.user ? cred.user : user);
      profile.linked = pending.provider;
      return profile;
    }).catch(function (err) {
      if (err && (err.code === 'auth/provider-already-linked' ||
                  err.code === 'auth/credential-already-in-use')) {
        return describe(user);
      }
      /* A refused link must not cost the operator their sign-in. */
      console.warn('[firebase] link skipped:', err && err.code);
      const profile = describe(user);
      profile.linkFailed = (err && err.code) || 'unknown';
      return profile;
    });
  }

  const api = {
    app: app,
    auth: auth,

    signIn: function (kind) {
      const provider = kind === 'google'
        ? new mods[2].GoogleAuthProvider()
        : new mods[2].OAuthProvider('apple.com');
      if (kind === 'apple') {
        provider.addScope('email');
        provider.addScope('name');
      }
      if (prefersRedirect) {
        rememberHandoff(kind);
        return mods[2].signInWithRedirect(auth, provider).then(function () {
          return { redirect: true, provider: kind };
        });
      }
      return mods[2].signInWithPopup(auth, provider).then(function (cred) {
        forgetHandoff();
        return completeSignIn(cred.user);
      }).catch(function (err) {
        /* Some in-app browsers block the popup — hand off instead of failing. */
        if (err && (err.code === 'auth/popup-blocked' ||
                    err.code === 'auth/operation-not-supported-in-this-environment' ||
                    err.code === 'auth/web-storage-unsupported')) {
          rememberHandoff(kind);
          return mods[2].signInWithRedirect(auth, provider).then(function () {
            return { redirect: true, provider: kind };
          });
        }
        if (err && err.code === 'auth/account-exists-with-different-credential') {
          return beginLink(kind, err);
        }
        throw err;
      });
    },

    resolveRedirect: function () {
      const handoff = readHandoff();
      return mods[2].getRedirectResult(auth).then(function (cred) {
        forgetHandoff();
        if (!cred || !cred.user) return { user: null, error: null, provider: null };
        return Promise.resolve(completeSignIn(cred.user)).then(function (profile) {
          /* Report the provider just used, not whichever was linked first. */
          if (handoff === 'apple' || handoff === 'google') profile.provider = handoff;
          return { user: profile, error: null, provider: profile.provider };
        });
      }).catch(function (err) {
        forgetHandoff();
        if (err && err.code === 'auth/account-exists-with-different-credential') {
          /* Keep the credential so the next tap on the original provider, in
             this same page load, links them. */
          return beginLink(handoff, err).then(function () {
            return { user: null, error: null, provider: handoff };
          }, function (linkErr) {
            return { user: null, error: linkErr, provider: handoff };
          });
        }
        return { user: null, error: err, provider: handoff };
      });
    },

    /* Firebase ID token for /api/**; {} when there is no signed-in user. */
    headers: function () {
      const user = auth.currentUser;
      if (!user) return Promise.resolve({});
      return user.getIdToken().then(function (token) {
        return { Authorization: 'Bearer ' + token };
      }).catch(function () { return {}; });
    },

    signOut: function () {
      return mods[2].signOut(auth).catch(function () {});
    }
  };

  mods[1].isSupported().then(function (ok) {
    if (ok) mods[1].getAnalytics(app);
  }).catch(function () { /* analytics is optional */ });

  return api;
}).catch(function (e) {
  console.warn('[firebase] init skipped:', e && e.message);
  return null;
});
