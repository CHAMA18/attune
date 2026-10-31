import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import worker from '../src/index.js';

test('playbook returns structured conservative suggestions when enrichment is unavailable', async () => {
  const request = new Request('https://example.test/api/llm/playbook', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ artist_affinities: [{ name: 'Example Artist', affinity: 0.8 }], feed: 'demo' })
  });
  const response = await worker.fetch(request, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.engine, 'local');
  assert.equal(body.recommendations.length, 4);
  assert.equal(body.recommendations[0].evidence[0].name, 'Example Artist');
  assert.match(body.evidenceSource, /unverified/i);
  assert.ok(body.agentTrace.some(x => x.step === 'enrich' && /skipped/.test(x.detail)));
});

test('rejects a non-object grounding payload', async () => {
  const request = new Request('https://example.test/api/llm/playbook', { method: 'POST', body: 'null' });
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 400);
});

test('proxy rejects unapproved paths and query parameters', async () => {
  const a = await worker.fetch(new Request('https://example.test/api/qloo/v2/private'), {});
  assert.equal(a.status, 404);
  const b = await worker.fetch(new Request('https://example.test/api/qloo/v2/search?unexpected=value'), {});
  assert.equal(b.status, 400);
  const c = await worker.fetch(new Request('https://example.test/api/qloo/v2/insights?take=999'), {});
  assert.equal(c.status, 400);
});

test('authentication and configured quota are enforced', async () => {
  const req = () => new Request('https://example.test/api/qloo/v2/search?query=test');
  assert.equal((await worker.fetch(req(), { REQUIRE_AUTH: '1' })).status, 401);
  assert.equal((await worker.fetch(req(), { ENFORCE_RATE_LIMIT: '1' })).status, 503);
  assert.equal((await worker.fetch(req(), { QLOO_RATE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
});

test('anonymous requests use the client IP for rate limiting', async () => {
  let key;
  const request = new Request('https://example.test/api/llm/playbook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: '{}'
  });
  const response = await worker.fetch(request, {
    REQUIRE_AUTH: '0', ENFORCE_RATE_LIMIT: '1',
    QLOO_RATE_LIMITER: { limit: async input => { key = input.key; return { success: true }; } }
  });
  assert.equal(response.status, 200);
  assert.equal(key, 'ip:192.0.2.1');
});

test('configured origin policy rejects unapproved browser origins', async () => {
  const request = new Request('https://example.test/api/qloo/v2/search', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
  assert.equal((await worker.fetch(request, { ALLOWED_ORIGINS: 'https://approved.example' })).status, 403);
  const allowed = new Request('https://example.test/api/qloo/v2/search', { method: 'OPTIONS', headers: { Origin: 'https://approved.example' } });
  assert.equal((await worker.fetch(allowed, { ALLOWED_ORIGINS: 'https://approved.example' })).status, 204);
});
