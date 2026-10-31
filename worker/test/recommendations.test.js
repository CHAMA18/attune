import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildRecommendations } from '../src/recommendations.js';

test('recommendations cite only supplied signals and distinguish inference from evidence', () => {
  const result = buildRecommendations({ top_artists: [{ name: 'Example Artist', affinity: 0.82 }], live_feed: 'qloo_live' });
  assert.equal(result.actions.length, 4);
  for (const action of result.actions) {
    assert.match(action.assumption, /not evidence/);
    for (const signal of action.evidence) {
      assert.equal(signal.name, 'Example Artist');
      assert.equal(signal.score, 0.82);
    }
  }
  assert.equal(result.actions[0].evidence[0].name, 'Example Artist');
  assert.equal(result.actions[1].evidence.length, 0);
  assert.doesNotMatch(result.playbook, /queue|crowd|purchases|BPM/i);
});

test('missing evidence never invents an entity or score', () => {
  const result = buildRecommendations({ top_artists: [{ name: '', affinity: 42 }] });
  assert.ok(result.actions.every(a => a.evidence.length === 0));
  assert.match(result.actions[0].rationale, /No supporting taste entity/i);
});

test('untrusted names cannot inject additional playbook lines and scores are bounded', () => {
  const result = buildRecommendations({ top_artists: [{ name: 'Artist\nNIGHT: fabricated', affinity: 42 }] });
  assert.equal(result.playbook.split('\n').length, 7);
  assert.equal(result.actions[0].evidence[0].score, null);
  assert.match(result.source, /unverified/i);
});


test('hours and operator constraints affect suggestions without inventing demand', () => {
  const result = buildRecommendations({ top_artists: [{name:'Artist', affinity:0.7}], constraints: { opens:'17:00', closes:'02:00', menu:'wine', mood:'relaxed', budget:'existing', type:'bar' } });
  assert.match(result.actions[0].action, /Outside/);
  assert.match(result.actions[1].action, /Outside/);
  assert.match(result.actions[2].action, /Artist/);
  assert.match(result.actions[3].context, /bar.*relaxed.*existing/);
  assert.equal(result.actions[1].evidence.length, 0);
  assert.match(result.playbook, /wine/);
});

test('directions and goals use supplied signals and existing menu items', () => {
  const g = { top_artists: [{ name: 'First Artist', affinity: 0.9 }, { name: 'Second Artist', affinity: 0.8 }], constraints: { direction: 'gathering', goal: 'early', menuItem: 'House coffee', opens: '07:00', closes: '23:00' } };
  const gathering = buildRecommendations(g);
  assert.match(gathering.actions[2].action, /sociable/);
  assert.match(gathering.actions[2].action, /House coffee/);
  assert.equal(gathering.actions[2].evidence[0].name, 'First Artist');
  const discovery = buildRecommendations({ ...g, constraints: { ...g.constraints, goal: 'discovery' } });
  assert.equal(discovery.actions[2].evidence[0].name, 'Second Artist');
  assert.match(discovery.actions[2].action, /Second Artist/);
});

test('not-useful feedback changes only the selected daypart and clears unsupported evidence', () => {
  const result = buildRecommendations({ top_artists: [{ name: 'Artist', affinity: 0.8 }], constraints: { feedback: { 'GOLDEN 16-20': 'not-useful' } } });
  assert.match(result.actions[2].action, /Ask the team/);
  assert.equal(result.actions[2].evidence.length, 0);
  assert.equal(result.actions[0].evidence[0].name, 'Artist');
  assert.match(result.actions[2].context, /adjusted after feedback/);
});
