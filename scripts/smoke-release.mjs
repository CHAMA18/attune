const site = process.env.ATTUNE_SITE_URL;
const api = process.env.ATTUNE_API_URL;
if (!site || !api) { console.error('Set ATTUNE_SITE_URL and ATTUNE_API_URL.'); process.exit(2); }
async function check(label, url, expected) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!expected.includes(response.status)) throw new Error(label + ': HTTP ' + response.status);
  console.log(label + ': HTTP ' + response.status);
  return response;
}
try {
  await check('Landing', new URL('landing.html', site), [200]);
  await check('Authentication', new URL('auth.html', site), [200]);
  const build = await check('Build metadata', new URL('build.json', site), [200]);
  const metadata = await build.json();
  if (!metadata.revision) throw new Error('Build metadata is missing revision');
  console.log('Revision: ' + String(metadata.revision).slice(0, 12));
  await check('Anonymous API access', new URL('qloo/v2/search?query=example', api), [401]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
