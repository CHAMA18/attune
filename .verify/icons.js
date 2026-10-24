const fs = require('fs');
const { chromium } = require('playwright');

const html = fs.readFileSync(process.cwd() + '/index.html', 'utf8');
const names = [...new Set(
  Array.from(html.matchAll(/material-symbols-outlined[^>]*>([a-z0-9_]+)</g), (m) => m[1])
)].sort();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const report = await page.evaluate((icons) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '24px "Material Symbols Outlined"';
    const fontLoaded = document.fonts.check('24px "Material Symbols Outlined"');
    return icons.map((name) => {
      const w = ctx.measureText(name).width;
      // A formed ligature draws as one ~1em glyph; missing icons draw as raw text.
      return { name, width: Math.round(w), ok: w < 30 };
    });
  }, names);

  console.log(JSON.stringify({ count: report.length, broken: report.filter((r) => !r.ok) }, null, 2));
  await browser.close();
})();
