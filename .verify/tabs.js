const { chromium } = require('playwright');

const TABS = [
  { path: 'playbook', label: 'PLAYBOOK', shot: 'preview-top.png' },
  { path: 'taste-heat', label: 'TASTE HEAT', shot: 'preview-taste-heat.png' },
  { path: 'menu-sound', label: 'MENU & AUDIO', shot: 'preview-menu-audio.png' },
  { path: 'live-pulse', label: 'LIVE PULSE', shot: 'preview-live-pulse.png' },
];

(async () => {
  const browser = await chromium.launch();
  const results = { errors: [], failedRequests: [], tabs: {} };

  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await mob.newPage();
  page.on('pageerror', (err) => results.errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') results.errors.push(msg.text()); });
  page.on('requestfailed', (req) => results.failedRequests.push(req.url()));

  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (const tab of TABS) {
    await page.click(`nav a[data-path="${tab.path}"]`);
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('main [data-screen]'))
        .filter((s) => s.offsetParent !== null || getComputedStyle(s).display !== 'none')
        .map((s) => s.getAttribute('data-screen'));
      const activeLink = document.querySelector('nav a[aria-current="page"]');
      const activeStyle = activeLink ? getComputedStyle(activeLink).color : null;
      const doc = document.documentElement;
      return {
        visible,
        activePath: activeLink ? activeLink.getAttribute('data-path') : null,
        activeColor: activeStyle,
        horizontalOverflow: doc.scrollWidth - doc.clientWidth,
        scrollY: Math.round(window.scrollY),
      };
    });

    await page.screenshot({ path: process.cwd() + '/' + tab.shot, fullPage: true });

    const ok = state.visible.length === 1 && state.visible[0] === tab.path && state.activePath === tab.path;
    results.tabs[tab.path] = { ok, ...state, shot: tab.shot };
  }

  // Desktop centered-column regression check
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const d = await desk.newPage();
  await d.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' });
  await d.waitForTimeout(1000);
  results.desktop = await d.evaluate(() => {
    const b = document.body.getBoundingClientRect();
    const h = document.querySelector('header').getBoundingClientRect();
    const n = document.querySelector('nav').getBoundingClientRect();
    return {
      bodyLeft: Math.round(b.left), bodyWidth: Math.round(b.width),
      headerLeft: Math.round(h.left), headerWidth: Math.round(h.width),
      navLeft: Math.round(n.left), navWidth: Math.round(n.width),
    };
  });
  await d.screenshot({ path: process.cwd() + '/preview-desktop.png' });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
