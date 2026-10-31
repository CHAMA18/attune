/* Structured, bounded suggestions. Affinity does not prove customer behaviour. */
export function buildRecommendations(g) {
  const clean = value => String(value || '').replace(/[\r\n:]/g, ' ').trim().slice(0, 80);
  const pick = (items, kind) => (Array.isArray(items) ? items : []).filter(x => x && clean(x.name)).map(x => ({
    name: clean(x.name), kind, score: x.affinity != null && Number.isFinite(Number(x.affinity)) && Number(x.affinity) >= 0 && Number(x.affinity) <= 1 ? Number(x.affinity) : null
  }));
  const artists = pick(g.top_artists, 'artist');
  const places = pick(g.top_places, 'place');
  const audiences = pick(g.audiences, 'audience');
  const signals = [...artists, ...places, ...audiences];
  const c = g.constraints && typeof g.constraints === 'object' ? g.constraints : {};
  const allowed = (v, options, fallback) => options.includes(v) ? v : fallback;
  const type = allowed(c.type, ['bar', 'restaurant', 'cafe'], '');
  const mood = allowed(c.mood, ['relaxed', 'lively', 'balanced'], 'balanced');
  const budget = allowed(c.budget, ['existing', 'flexible'], 'existing');
  const menu = allowed(c.menu, ['coffee', 'wine', 'cocktails', 'food', 'none'], 'none');
  const menuItem = clean(c.menuItem);
  const goal = allowed(c.goal, ['atmosphere', 'early', 'discovery'], 'atmosphere');
  const direction = allowed(c.direction, ['listening', 'gathering'], 'listening');
  const feedback = c.feedback && typeof c.feedback === 'object' ? c.feedback : {};
  const featured = menuItem || (menu !== 'none' ? menu : '');
  const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0,2))*60 + Number(value.slice(3)) : null;
  const opens = time(c.opens), closes = time(c.closes);
  const isOpen = (start, end) => {
    if (opens === null || closes === null || opens === closes) return null;
    const endTime = closes < opens ? closes + 1440 : closes;
    return [0, 1440].some(offset => Math.max(start + offset, opens) < Math.min(end + offset, endTime));
  };
  const freshness = g.freshness || {};
  const timestamp = Number.isFinite(freshness.oldest) ? new Date(freshness.oldest).toLocaleString() : null;
  const source = g.live_feed === 'qloo_live'
    ? 'Qloo signals provided by the app; ' + (freshness.cached ? (freshness.fresh ? 'fetched and browser-cached results' : 'cached results') : freshness.fresh ? 'recently fetched results (the service may cache responses)' : 'freshness unavailable') + (timestamp ? ' · oldest retrieved ' + timestamp : '') + '. Not independently verified by the composer.'
    : 'Qloo signals unavailable or unverified.';
  const assumption = 'Affinity is not evidence of visits, purchases, timing, or outcomes. Check suitability and music licensing.';
  const moodText = { relaxed: 'a relaxed', lively: 'a lively', balanced: 'a balanced' }[mood];
  const artist = artists[0] || null;
  const location = places[0] || null;
  const context = type ? type + ' · ' + mood + ' atmosphere · ' + (budget === 'existing' ? 'use existing resources' : 'flexible budget') : mood + ' atmosphere · ' + (budget === 'existing' ? 'use existing resources' : 'flexible budget');
  const definitions = [
    ['ROASTERS 07-11', 420, 660, artist, artist ? 'Try ' + artist.name + ' in ' + moodText + ' opening playlist.' : 'Choose an opening playlist that fits your venue.'],
    ['LINGER 11-16', 660, 960, null, featured ? 'Consider featuring your existing ' + featured + (menuItem ? ' on the daytime menu.' : ' selection on the daytime menu.') : 'Review your daytime menu for one existing item to feature.'],
    ['GOLDEN 16-20', 960, 1200, artist, artist ? 'Try ' + artist.name + ' as an early-evening music anchor.' : 'Choose an early-evening music anchor that fits your venue.'],
    ['NIGHT 20-02', 1200, 1560, null, budget === 'existing' ? 'Use existing lighting to create ' + moodText + ' evening atmosphere.' : 'Consider adjusting lighting to create ' + moodText + ' evening atmosphere.']
  ];
  if (direction === 'gathering') {
    definitions[0][4] = artist ? 'Consider ' + artist.name + ' for a welcoming opening set.' : 'Prepare a welcoming opening set.';
    definitions[2][4] = artist ? 'Consider ' + artist.name + ' for a sociable early-evening set.' : 'Prepare a sociable early-evening set.';
  }
  if (goal === 'early' && featured) definitions[2][4] += ' Consider highlighting ' + featured + ' if available.';
  if (goal === 'discovery' && artists[1]) { definitions[2][3] = artists[1]; definitions[2][4] = 'Consider introducing ' + artists[1].name + ' in the early-evening set.'; }
  const alternatives = [
    'Review the opening sound level with your team.',
    'Ask the team which existing menu item is practical to feature.',
    'Ask the team to choose an early-evening music set that fits the room.',
    'Review the evening lighting with your team.'
  ];
  const actions = definitions.map(([section, start, end, signal, action], index) => {
    if (feedback[section] === 'not-useful') { action = alternatives[index]; signal = null; }
    const open = isOpen(start, end);
    const evidence = signal ? [signal] : [];
    return { section, action: open === false ? 'Outside your stated opening hours; no action suggested.' : action,
      evidence: open === false ? [] : evidence, source, assumption,
      rationale: open === false ? 'The stated hours do not overlap this period.' : signal ? 'This is an operator suggestion informed by an available taste signal, not a measured effect.' : 'No supporting taste entity is available; this is a general operator prompt.',
      context: context + ' · goal: ' + goal + ' · direction: ' + direction + (feedback[section] === 'not-useful' ? ' · adjusted after feedback' : ''), hours: opens === null || closes === null ? 'Opening hours not provided.' : clean(c.opens) + '–' + clean(c.closes) };
  });
  const primary = artist || location || audiences[0];
  const persona = primary ? 'Taste signal: ' + primary.name + '.' : 'No taste signal is available.';
  const playlist = artist ? 'Consider ' + artist.name + ' for a playlist.' : 'Choose music that fits your venue.';
  const menuLine = featured ? 'Review your existing ' + featured + (menuItem ? '.' : ' selection.') : 'Choose a menu feature using your own stock and customer knowledge.';
  const playbook = ['PERSONA: ' + persona, ...actions.map(a => a.section + ': ' + a.action), 'PLAYLIST: ' + playlist, 'MENU: ' + menuLine].join('\n');
  return { actions, playbook, signals, source, assumption };
}
