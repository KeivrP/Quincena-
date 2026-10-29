// Deterministic frame renderer: loads index.html, calls seek(t) per frame, screenshots.
// usage: node render.js <fmt v|h> <outdir> [fps] [stills: t1,t2,...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const fmt = process.argv[2] || 'v';
  const out = process.argv[3] || 'frames_' + fmt;
  const fps = parseInt(process.argv[4] || '30', 10);
  const stills = process.argv[5] ? process.argv[5].split(',').map(Number) : null;
  fs.mkdirSync(out, { recursive: true });
  const W = fmt === 'v' ? 1080 : 1920, H = fmt === 'v' ? 1920 : 1080;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html') + '?fmt=' + fmt);
  await page.waitForFunction(() => window.READY === true);
  // make sure all screenshots are decoded
  await page.evaluate(async () => {
    const files = ['11-inicio-sin-creditos','12-simular-credito','13-enviando-dinero','14-dinero-enviado','15-detalle-credito','17-abono-validado','19-mis-creditos'];
    await Promise.all(files.map(f => new Promise(r => { const i = new Image(); i.onload = r; i.onerror = r; i.src = 'caps/' + f + '.png'; })));
  });
  const dur = await page.evaluate(() => window.DUR);
  const times = stills || Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
  let n = 0;
  for (const t of times) {
    await page.evaluate(t => window.seek(t), t);
    const name = stills ? `still_${t.toFixed(2)}.png` : `f${String(n).padStart(5, '0')}.png`;
    await page.screenshot({ path: path.join(out, name), type: 'png', animations: 'disabled' });
    n++;
    if (n % 100 === 0) console.log('frames', n, '/', times.length);
  }
  await browser.close();
  console.log('done', n, 'frames ->', out);
})();
