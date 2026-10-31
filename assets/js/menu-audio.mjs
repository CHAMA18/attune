/* The preview player is local audio; this panel only describes the available context. */
const byId = id => document.getElementById(id);
const focus = byId('menu-context-focus');
const explanation = byId('menu-context-explanation');
const tags = byId('menu-context-tags');
const artists = byId('menu-context-artists');
const source = byId('menu-context-source');
function render() {
  const context = window.AttuneGrounding?.context() || {};
  const constraints = context.constraints || {};
  const item = typeof constraints.menuItem === 'string' ? constraints.menuItem.trim().slice(0, 80) : '';
  const category = ['coffee', 'wine', 'cocktails', 'food'].includes(constraints.menu) ? constraints.menu : '';
  focus.textContent = item || (category ? 'Your ' + category + ' selection' : 'Add a menu item to your shift plan');
  explanation.textContent = item || category ? 'From your shift preferences. Check stock and suitability before featuring it.' : 'Your menu choices come from your own venue settings, not the Qloo API.';
  tags.replaceChildren();
  const placeTags = context.feed === 'qloo_live' && Array.isArray(context.palate_signals) ? context.palate_signals.slice(0, 3) : [];
  if (placeTags.length) {
    const label = document.createElement('p'); label.className = 'w-full text-xs text-on-surface-variant'; label.textContent = 'Place types returned by Qloo:'; tags.appendChild(label);
    placeTags.forEach(name => { const chip = document.createElement('span'); chip.className = 'text-xs rounded-full bg-surface-container-high px-2.5 py-1 text-on-surface-variant'; chip.textContent = name; tags.appendChild(chip); });
  }
  artists.replaceChildren();
  const rows = context.feed === 'qloo_live' && Array.isArray(context.artist_affinities) ? context.artist_affinities.slice(0, 3) : [];
  if (!rows.length) { artists.textContent = context.venue ? 'No related artist signals are available for this venue yet.' : 'Select a venue to see related artists.'; }
  rows.forEach(row => {
    const line = document.createElement('div'); line.className = 'flex justify-between gap-3';
    const name = document.createElement('span'); name.className = 'text-on-surface'; name.textContent = row.name;
    const score = document.createElement('span'); score.className = 'text-tertiary whitespace-nowrap'; score.textContent = row.affinity != null && Number.isFinite(Number(row.affinity)) ? Math.round(Number(row.affinity) * 100) + '% affinity' : 'Affinity unavailable';
    line.append(name, score); artists.appendChild(line);
  });
  const freshness = context.freshness;
  const status = context.feed === 'qloo_live' ? freshness?.cached ? 'Qloo results include browser-cached data.' : 'Qloo results fetched for this session; the service may cache responses.' : 'Qloo data is unavailable.';
  source.textContent = status + ' Affinity does not measure customer listening or predict purchases.';
}
byId('menu-edit-plan')?.addEventListener('click', () => {
  document.querySelector('nav a[data-path="playbook"]')?.click();
  const settings = byId('shift-plan-settings');
  if (settings) { settings.open = true; settings.scrollIntoView({ behavior: 'smooth', block: 'start' }); settings.querySelector('summary')?.focus({ preventScroll: true }); }
});
['attune:plan-ready', 'attune:venue-resolved', 'attune:data-unavailable'].forEach(name => window.addEventListener(name, render));
window.addEventListener('attune:venue-changed', () => {
  artists.textContent = 'Updating venue signals…'; tags.replaceChildren();
  source.textContent = 'Updating Qloo data for your venue.';
});
render();
