import { buildRecommendations } from './recommendations.mjs';

const $ = id => document.getElementById(id);
const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (_) { return fallback; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
const venueKey = () => { const venue = window.AttuneGrounding?.venue; return encodeURIComponent(venue ? [venue.name || '', venue.address || '', venue.locality || ''].join('|') : 'none'); };
const briefKey = () => 'attune.brief.' + venueKey();
const feedbackKey = () => 'attune.feedback.' + venueKey();
const context = () => window.AttuneGrounding?.context() || {};
const brief = $('shift-brief');
const venuePrompt = $('venue-required-prompt');
function paintVenuePrompt() { if (venuePrompt) venuePrompt.hidden = !!window.AttuneGrounding?.venue; }
$('open-venue-setup')?.addEventListener('click', () => $('profile-open')?.click());

function generateBrief() {
  const c = context(), actions = window.AttuneGrounding?.recommendations || [];
  if (!actions.length) { $('brief-status').textContent = 'Create a shift plan first.'; return; }
  if (brief.value.trim() && !window.confirm('Replace your current team notes with the latest plan?')) return;
  brief.value = [(c.venue?.name || 'Your venue') + ' — shift brief', '', ...actions.map(a => a.section + ': ' + a.action), '', 'Review with your team. Taste affinity does not predict customer outcomes.'].join('\n');
  safeWrite(briefKey(), brief.value);
  $('brief-status').textContent = 'Plan added. Edit your notes before sharing.';
}
function paintDirections() {
  const c = context(), controls = safeRead('attune.shiftConstraints', {});
  const selected = controls.direction || 'listening';
  document.querySelectorAll('[data-direction]').forEach(button => {
    const direction = button.dataset.direction;
    button.setAttribute('aria-pressed', String(direction === selected));
    button.style.outline = direction === selected ? '2px solid rgb(var(--c-primary))' : '';
    const result = buildRecommendations({ top_places: c.nearby_place_affinities || [], top_artists: c.artist_affinities || [], audiences: [], live_feed: c.feed, constraints: { ...c.constraints, direction } });
    button.querySelector('[data-direction-preview]').textContent = c.feed === 'qloo_live' ? result.actions[2].action : 'Choose a venue to see a suggested direction.';
  });
  $('direction-status').textContent = 'Selected: ' + (selected === 'gathering' ? 'Neighborhood gathering' : 'Quiet listening');
}
document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', async () => {
  const settings = safeRead('attune.shiftConstraints', {});
  settings.direction = button.dataset.direction;
  if (!safeWrite('attune.shiftConstraints', settings)) { $('direction-status').textContent = 'Could not save your selection on this device.'; return; }
  paintDirections();
  if (window.AttuneGrounding?.venue) await window.AttuneGrounding.replay();
}));
$('brief-generate').addEventListener('click', generateBrief);
brief.addEventListener('input', () => { if (!safeWrite(briefKey(), brief.value)) $('brief-status').textContent = 'Notes could not be saved on this device.'; });
$('brief-copy').addEventListener('click', async () => {
  if (!brief.value.trim()) { $('brief-status').textContent = 'Add some notes first.'; return; }
  try { await navigator.clipboard.writeText(brief.value); $('brief-status').textContent = 'Brief copied.'; } catch (_) { $('brief-status').textContent = 'Copy unavailable. Select and copy the notes above.'; }
});
$('brief-share').addEventListener('click', async () => {
  if (!brief.value.trim()) { $('brief-status').textContent = 'Add some notes first.'; return; }
  if (!navigator.share) { $('brief-status').textContent = 'Sharing is unavailable here. Use Copy brief instead.'; return; }
  try { await navigator.share({ title: 'Attune shift brief', text: brief.value }); $('brief-status').textContent = 'Share sheet opened.'; } catch (error) { if (error.name !== 'AbortError') $('brief-status').textContent = 'Could not open sharing. Use Copy brief instead.'; }
});
$('brief-print').addEventListener('click', () => {
  if (!brief.value.trim()) { $('brief-status').textContent = 'Add some notes first.'; return; }
  document.body.classList.add('printing-shift-brief');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-shift-brief'), { once: true });
  window.print();
});
$('shift-feedback').addEventListener('submit', async event => {
  event.preventDefault();
  if (!window.AttuneGrounding?.venue) { $('feedback-status').textContent = 'Select a venue before saving feedback.'; return; }
  const form = event.currentTarget, values = safeRead(feedbackKey(), {});
  values[form.elements.section.value] = form.elements.rating.value;
  const notes = safeRead(feedbackKey() + '.notes', {});
  notes[form.elements.section.value] = form.elements.note.value.slice(0, 240);
  if (!safeWrite(feedbackKey(), values) || !safeWrite(feedbackKey() + '.notes', notes)) { $('feedback-status').textContent = 'Could not save feedback on this device.'; return; }
  $('feedback-status').textContent = 'Feedback saved for this venue. Updating the plan…';
  const ok = await window.AttuneGrounding.replay();
  $('feedback-status').textContent = ok ? 'Saved. Your next plan reflects this feedback.' : 'Saved locally; the plan could not be updated.';
});
$('venue-compare').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, output = $('compare-results'), status = $('compare-status'), button = form.querySelector('button');
  const inputs = [form.elements.first.value.trim(), form.elements.second.value.trim()];
  if (inputs.some(x => !x)) return;
  button.disabled = true; output.replaceChildren(); status.textContent = 'Searching Qloo…';
  const results = await Promise.allSettled(inputs.map(x => window.AttuneGrounding.comparePlace(x)));
  results.forEach((result, index) => {
    const card = document.createElement('article'); card.className = 'rounded-xl bg-surface-container-high p-4';
    const title = document.createElement('h3'); title.className = 'font-semibold';
    title.textContent = result.status === 'fulfilled' ? result.value.name : inputs[index]; card.appendChild(title);
    const detail = document.createElement('p'); detail.className = 'text-sm text-on-surface-variant mt-1';
    detail.textContent = result.status === 'fulfilled' ? (result.value.description || 'Qloo place result — confirm this is the place you intended.') : (result.reason?.message || 'Search unavailable.'); card.appendChild(detail);
    if (result.status === 'fulfilled') {
      const list = document.createElement('ul'); list.className = 'mt-3 space-y-1 text-sm';
      const artists = result.value.artists;
      if (!artists.length) { const item = document.createElement('li'); item.textContent = 'No related artists returned.'; list.appendChild(item); }
      artists.forEach(artist => { const item = document.createElement('li'); item.textContent = artist.name + ' · affinity ' + Math.round(artist.affinity * 100) + '%'; list.appendChild(item); });
      card.appendChild(list);
    }
    output.appendChild(card);
  });
  status.textContent = 'Results may be cached for up to 15 minutes. Confirm the matched places before comparing.';
  button.disabled = false;
});
window.addEventListener('attune:plan-ready', paintDirections);
window.addEventListener('attune:venue-changed', () => { brief.value = ''; $('feedback-status').textContent = ''; });
window.addEventListener('attune:venue-resolved', () => { brief.value = safeRead(briefKey(), ''); paintVenuePrompt(); paintDirections(); });
brief.value = safeRead(briefKey(), '');
paintVenuePrompt();
paintDirections();
