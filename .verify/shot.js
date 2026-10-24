const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();

  // 1) Desktop window: app should sit in a centered 390px phone column
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const d = await desk.newPage();
  await d.goto('file:///Users/chunguchama/Qloo/index.html', { waitUntil: 'networkidle' });
  await d.waitForTimeout(2000);
  const desktop = await d.evaluate(() => {
    const b = document.body.getBoundingClientRect();
    const h = document.querySelector('header').getBoundingClientRect();
    const n = document.querySelector('nav').getBoundingClientRect();
    return {
      bodyLeft: Math.round(b.left), bodyWidth: Math.round(b.width),
      headerLeft: Math.round(h.left), headerWidth: Math.round(h.width),
      navLeft: Math.round(n.left), navWidth: Math.round(n.width),
    };
  });
  await d.screenshot({ path: '/Users/chunguchama/Qloo/preview-desktop.png' });

  // 2) True phone viewport: must stay full-bleed
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mob.newPage();
  await m.goto('file:///Users/chunguchama/Qloo/index.html', { waitUntil: 'networkidle' });
  await m.waitForTimeout(2000);
  const mobile = await m.evaluate(() => {
    const b = document.body.getBoundingClientRect();
    const h = document.querySelector('header').getBoundingClientRect();
    return {
      bodyLeft: Math.round(b.left), bodyWidth: Math.round(b.width),
      headerLeft: Math.round(h.left), headerWidth: Math.round(h.width),
    };
  });
  await m.screenshot({ path: '/Users/chunguchama/Qloo/preview-top.png' });

  console.log(JSON.stringify({ desktop, mobile }, null, 2));
  await browser.close();
})();
