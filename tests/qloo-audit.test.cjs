const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
function extract(start, end, context) {
  const code = html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  vm.runInNewContext(code, context);
}
test('place type counts retain actual counts and only normalize the bar width', () => {
  const scope = {};
  extract('  function dominance(weights, n)', "  /* 'urn:tag:genre:place:", scope);
  const rows = scope.dominance({ cafe: 2, park: 1 }, 5);
  assert.equal(rows[0].score, 2);
  assert.equal(rows[1].score, 1);
  assert.equal(rows[1].relative, 50);
});
test('location filters use coordinates and radius, or explicitly use locality', () => {
  const scope = { VENUE: { lat: 1, lng: 2, locality: 'Example' }, RADIUS_FT: 800, FT_TO_M: 0.3048 };
  extract('  function wkt()', '  /* Read the operator', scope);
  let result = scope.venueFilter();
  assert.equal(result['filter.location'], 'POINT(2 1)');
  assert.equal(result['filter.location.radius'], '244');
  scope.VENUE = { lat: null, lng: null, locality: 'Example' };
  result = scope.venueFilter();
  assert.equal(result['filter.location.query'], 'Example');
  assert.equal(result['filter.location.radius'], undefined);
  scope.VENUE = null;
  assert.throws(() => scope.venueFilter(), /VENUE_REQUIRED/);
});
test('no fabricated crowd rows or weekend forecast are rendered', () => {
  assert.doesNotMatch(html, /Koji &amp; Ferment Curious|Late-Night Criterion Jazz|People should stay about 22% longer/);
  assert.match(html, /These are not audience measurements/);
});

test('an anchor with no related places retains returned tags without fabricating affinity', async () => {
  const nodes = {};
  const responses = [
    { results: { entities: [{ entity_id: 'anchor-id', name: 'Anchor', tags: [{ id: 'urn:tag:genre:place:park', name: 'Park' }] }] } },
    { results: { entities: [] } }
  ];
  const state = { places: [], anchor: null, anchorPull: null };
  const scope = {
    dataGeneration: 0, Date, Number, Math, Object, Error, state,
    qlooFetch: () => Promise.resolve(responses.shift()),
    venueFilter: () => ({}),
    entitiesOf: result => result.results.entities,
    nameOf: entity => entity.name,
    affinityOf: entity => entity.query?.affinity || 0,
    agentStep() {}, setMetric(name, value) { nodes[name] = value; },
    setText(name, value) { nodes[name] = value; },
    renderEngine() {}, renderBlockFeed() {}, VENUE: { name: 'Anchor' }, window: {}
  };
  extract('  function loadRadar()', '  /* Around the Block', scope);
  const returned = await scope.loadRadar();
  assert.equal(returned[0].name, 'Anchor');
  assert.equal(returned[0].tags[0].name, 'Park');
  assert.equal(state.places.length, 0);
  assert.equal(nodes['block-heat'], '—');
  assert.match(nodes.blockFeed, /no related places/i);
});

test('on-device fallback creates evidence from current Qloo results and operator settings', async () => {
  const { buildRecommendations } = await import('../assets/js/recommendations.mjs');
  const scope = {
    Promise,
    groundingContext: () => ({
      venue: { name: 'Example' }, focus_daypart: 'golden', feed: 'qloo_live',
      artist_affinities: [{ name: 'Test Artist', affinity: 0.82 }],
      nearby_place_affinities: [], micro_tribes: [], constraints: { mood: 'relaxed' }
    }),
    moduleLoader: () => Promise.resolve({ buildRecommendations })
  };
  const start = html.indexOf('  function localPlaybook()');
  const end = html.indexOf('  function loadPlaybook()', start);
  const code = html.slice(start, end).replace("import('./assets/js/recommendations.mjs')", 'moduleLoader()');
  vm.runInNewContext(code, scope);
  const result = await scope.localPlaybook();
  assert.equal(result.engine, 'browser');
  assert.equal(result.recommendations.length, 4);
  assert.equal(result.recommendations[0].evidence[0].name, 'Test Artist');
  assert.equal(result.recommendations[0].evidence[0].score, 0.82);
  assert.match(result.recommendations[0].context, /relaxed/);
});

test('place comparison uses the resolved Qloo entity to fetch related artists', async () => {
  const calls = [];
  const scope = {
    qlooFetch: async (path, params) => {
      calls.push({ path, params });
      if (path === '/v2/search') return { results: [{ entity_id: 'place-1', name: 'Example venue', disambiguation: 'Example City' }] };
      return { results: { entities: [{ name: 'Example artist', query: { affinity: 0.7 } }] } };
    },
    entitiesOf: r => r.results.entities,
    affinityOf: e => e.query.affinity,
    Error
  };
  const start = html.indexOf('    comparePlace: function (query) {');
  const end = html.indexOf('    get venue()', start);
  const method = html.slice(start, end).trim().replace(/^comparePlace:\s*/, '').replace(/,\s*$/, '');
  scope.compare = vm.runInNewContext('(' + method + ')', scope);
  const result = await scope.compare('Example venue Example City');
  assert.equal(result.name, 'Example venue');
  assert.equal(result.artists[0].name, 'Example artist');
  assert.equal(calls[1].params['signal.interests.entities'], 'place-1');
});
