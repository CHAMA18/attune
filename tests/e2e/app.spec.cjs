const { test, expect } = require('@playwright/test');
const authModule = `
const account = {uid:'operator-1',email:'operator@example.test',displayName:'Test Operator',providerData:[{providerId:'password'}],getIdToken:async()=> 'fixture-token'};
const auth = { get currentUser(){return localStorage.getItem('fixture.auth') ? account : null}, authStateReady:async()=>{} };
export function getAuth(){return auth} export const browserLocalPersistence={}, browserSessionPersistence={};
export async function setPersistence(){} export async function signInWithEmailAndPassword(){localStorage.setItem('fixture.auth','1');return {user:account}}
export async function createUserWithEmailAndPassword(){localStorage.setItem('fixture.auth','1');return {user:account}}
export async function updateProfile(){} export async function sendPasswordResetEmail(){} export async function signOut(){localStorage.removeItem('fixture.auth')}
export async function getRedirectResult(){return null} export class GoogleAuthProvider{} export class OAuthProvider{addScope(){}}
`;
async function fixtures(page) {
  await page.route('https://www.gstatic.com/firebasejs/10.14.1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('firebase-app.js') ? 'export function initializeApp(){return {}}' : path.endsWith('firebase-analytics.js') ? 'export async function isSupported(){return false} export function getAnalytics(){}' : authModule;
    await route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  await page.route('**/api/qloo/**', async route => {
    const url = new URL(route.request().url());
    const venue = { entity_id: 'place-1', name: 'Fixture Venue', location: { lat: 40.72, lon: -73.95 }, properties: { address: 'Fixture City' }, query: { affinity: 0.81 }, tags: [{ id: 'urn:tag:genre:place:cafe', name: 'Cafe' }] };
    const body = url.pathname.endsWith('/search') ? { results: [venue] } : url.searchParams.get('filter.type') === 'urn:entity:artist' ? { results: { entities: [{ name: 'Fixture Artist', query: { affinity: 0.83 }, tags: [] }] } } : { results: { entities: [venue] } };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
}
test('a visitor can enter, choose a venue and get recommendations without an account', async ({ page }) => {
  await fixtures(page);
  await page.goto('/landing.html');
  await page.getByRole('link', { name: /explore your room/i }).click();
  await page.waitForURL('**/index.html');
  await expect(page.locator('#venue-required-prompt')).toBeVisible();
  await page.locator('#open-venue-setup').click();
  await page.locator('[data-venue-input]').fill('Fixture Venue');
  await page.locator('[data-venue-area]').fill('Fixture City');
  await page.locator('[data-venue-apply]').click();
  await page.locator('[data-venue-results] button').first().click();
  await expect(page.locator('#recommendation-evidence details')).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('roomtone.session'))).toBeNull();
});

test('sign in, confirm venue, inspect evidence, change radius and sign out', async ({ page }, info) => {
  await fixtures(page);
  await page.goto('/auth.html');
  await page.locator('#si-email').fill('operator@example.test');
  await page.locator('#si-password').fill('fixture-password');
  await page.locator('#signInSubmit').click();
  await page.waitForURL('**/index.html');
  await expect(page.locator('#venue-required-prompt')).toBeVisible();
  await page.locator('#open-venue-setup').click();
  await page.locator('[data-venue-input]').fill('Fixture Venue');
  await page.locator('[data-venue-area]').fill('Fixture City');
  await page.locator('[data-venue-apply]').click();
  await page.locator('[data-venue-results] button').first().click();
  await expect(page.locator('#recommendation-evidence details')).toHaveCount(4);
  await page.locator('[data-profile-close]').click();
  await page.locator('[data-direction="gathering"]').click();
  await expect(page.locator('[data-direction="gathering"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#brief-generate').click();
  await expect(page.locator('#shift-brief')).toHaveValue(/Fixture Artist/);
  await page.locator('#recommendation-evidence summary').first().click();
  await expect(page.locator('#recommendation-evidence details').first()).toContainText('Fixture Artist');
  const radar = info.project.name === 'mobile' ? '.nav-tab[data-path="taste-heat"]' : '#app-drawer [data-path="taste-heat"]';
  await page.locator(radar).click();
  await page.locator('[data-radius="400"]').click();
  await expect(page.locator('#qlooSignalList')).toContainText('Fixture Artist');
  if (info.project.name === 'mobile') await page.locator('#drawer-trigger').click();
  await page.locator('#drawer-signout').click();
  await page.waitForURL('**/landing.html');
});

test('shows a clear error when Qloo is unavailable', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/qloo/**', route => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"unavailable"}' }));
  await page.addInitScript(() => {
    localStorage.setItem('fixture.auth', '1');
    localStorage.setItem('roomtone.session', JSON.stringify({ name: 'Test Operator', email: 'operator@example.test', provider: 'email' }));
    localStorage.setItem('attune.roomProfile', JSON.stringify({ venue: 'Fixture Venue', area: 'Fixture City', selectedVenue: { name: 'Fixture Venue', lat: 40.72, lng: -73.95, locality: 'Fixture City' } }));
  });
  await page.goto('/index.html');
  await expect(page.locator('#daypart-action')).toContainText('HTTP 503');
  await expect(page.locator('#recommendation-evidence')).toContainText('unavailable');
});

test('creates an account through the identity service', async ({ page }) => {
  await fixtures(page);
  await page.goto('/auth.html#sign-up');
  await page.locator('#su-name').fill('Test Operator');
  await page.locator('#su-email').fill('operator@example.test');
  await page.locator('#su-venue').fill('Fixture Venue');
  await page.locator('#su-password').fill('fixture-password');
  await page.locator('#su-confirm').fill('fixture-password');
  await page.locator('#su-terms').check({ force: true });
  await page.locator('#signUpSubmit').click();
  await page.waitForURL('**/index.html');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('roomtone.session') || '{}').provider)).toBe('email');
});

test('empty Qloo results ask the operator to widen the search', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/qloo/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ results: { entities: [] } }) }));
  await page.addInitScript(() => {
    localStorage.setItem('fixture.auth', '1');
    localStorage.setItem('roomtone.session', JSON.stringify({ name: 'Test', provider: 'email' }));
    localStorage.setItem('attune.roomProfile', JSON.stringify({ venue: 'Fixture', selectedVenue: { name: 'Fixture', lat: 40.72, lng: -73.95 } }));
  });
  await page.goto('/index.html');
  await expect(page.locator('#daypart-action')).toContainText('no places');
});
