const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const results = { errors };

  // 1) Radius chip group on TASTE HEAT
  await page.click('nav a[data-path="taste-heat"]');
  await page.click('[data-radius="200"]');
  results.radius = await page.evaluate(() => ({
    selected: Array.from(document.querySelectorAll('[data-radius]'))
      .filter((b) => b.classList.contains('bg-primary'))
      .map((b) => b.getAttribute('data-radius')),
  }));

  // 2) Zone chips on MENU & AUDIO + guardrail toggles + waveform bars
  await page.click('nav a[data-path="menu-sound"]');
  const zones = await page.$$('[data-chip-group]:not([data-toggle]) .chip');
  await zones[zones.length - 1].click(); // PATIO
  results.zones = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('[data-chip-group]:not([data-toggle])'));
    return groups.map((g) =>
      Array.from(g.querySelectorAll('.chip'))
        .filter((c) => c.classList.contains(g.getAttribute('data-active').split(' ')[0]))
        .map((c) => c.textContent.trim())
    );
  });

  const toggles = await page.$$('[data-toggle] .chip');
  const before = await toggles[2].textContent();
  await toggles[2].click();
  const after = await toggles[2].textContent();
  results.toggle = { before: before.trim(), after: after.trim() };

  results.waveformBars = await page.evaluate(
    () => document.querySelector('[data-waveform]').children.length
  );

  // 3) Daypart selector on PLAYBOOK still works
  await page.click('nav a[data-path="playbook"]');
  await page.click('[data-daypart="night"]');
  results.daypart = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.daypart-btn'))
      .filter((b) => b.classList.contains('bg-surface-container-highest'))
      .map((b) => b.getAttribute('data-daypart'))
  );

  // 4) Toggling a chip must not reveal hidden screens
  results.visibleScreens = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main [data-screen]'))
      .filter((s) => getComputedStyle(s).display !== 'none')
      .map((s) => s.getAttribute('data-screen'))
  );

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
