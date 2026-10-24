const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const out = await page.evaluate((names) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '24px "Material Symbols Outlined"';
    return names.map((n) => ({ n, ok: ctx.measureText(n).width < 30 }));
  }, ['chair','armchair','dashboard','bed','meeting_room','weekend','grid_view','sofa']);
  console.log(JSON.stringify(out));
  await browser.close();
})();
