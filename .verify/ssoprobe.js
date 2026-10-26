const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const ready = await p.evaluate(() => ({ sso: typeof window.RoomtoneSSO, fb: !!window.RoomtoneFirebase }));
  console.log(JSON.stringify(ready));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('probe failed:', e.message); process.exit(1); });
