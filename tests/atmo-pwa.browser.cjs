const { chromium } = require('playwright');
const sharp = require('sharp');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Atmo');
  assert.equal(manifest.short_name, 'Atmo');
  assert.equal(manifest.id, './'); // Preserve the existing app's identity.
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.screenshots, undefined);
  for (const icon of manifest.icons) {
    const metadata = await sharp(path.join(root, icon.src)).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
  }
  assert(manifest.icons.some(icon => icon.purpose === 'maskable'));
  const apple = await sharp(path.join(root, 'assets/icons/atmo-180.png')).metadata();
  assert.equal(apple.width, 180); assert.equal(apple.height, 180);
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/beethere/')) return res.writeHead(404).end();
    const relative = decodeURIComponent(pathname.slice('/beethere/'.length)) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel:'msedge'});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage();
    await page.route('https://**/*', route => route.abort());
    const base = `http://127.0.0.1:${server.address().port}/beethere/`;
    await page.goto(base, {waitUntil:'domcontentloaded'});
    assert.equal(await page.title(), 'Atmo — Események');
    assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'), 'assets/icons/atmo-180.png');
    const cdp = await context.newCDPSession(page);
    const parsed = await cdp.send('Page.getAppManifest');
    assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
    assert.equal(JSON.parse(parsed.data).name, 'Atmo');
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active && navigator.serviceWorker.controller;
    });
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope), base);
    await context.setOffline(true);
    await page.goto(base + '?offline-test=1', {waitUntil:'domcontentloaded'});
    assert.equal(await page.title(), 'Atmo – Nincs internetkapcsolat');
    assert(await page.locator('h1').isVisible());
    assert(await page.locator('img').evaluate(img => img.complete && img.naturalWidth === 192));
    mkdirSync(path.join(root, 'outputs'), {recursive:true});
    await page.screenshot({path:path.join(root, 'outputs/atmo-offline.png')});
    await context.setOffline(false);
    await page.locator('a').click();
    await page.waitForFunction(() => document.title === 'Atmo — Események');
    await context.close();
    console.log('PASS Atmo PWA: icon sizes, maskable icon, Apple touch icon, manifest parsing, GitHub Pages subpath, service worker, offline screen and retry');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
