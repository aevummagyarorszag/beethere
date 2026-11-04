const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createReadStream, existsSync } = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !existsSync(file)) return res.writeHead(404).end();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    const android = await browser.newPage({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'
    });
    await android.goto(`http://127.0.0.1:${server.address().port}/`);
    await android.waitForFunction(() => document.querySelector('pwa-install')?.isAndroid);
    await android.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = () => { window.promptCalls = (window.promptCalls || 0) + 1; };
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });
    await android.locator('#install-app').click();
    assert.equal(await android.evaluate(() => window.promptCalls), 1);
    await android.evaluate(() => dispatchEvent(new Event('appinstalled')));
    assert(await android.locator('#install-app').isHidden());
    console.log('PASS Android native install prompt');
    await android.close();

    const iphone = await browser.newPage({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1'
    });
    await iphone.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { configurable: true, value: 'iPhone' });
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
      Object.defineProperty(navigator, 'language', { configurable: true, value: 'hu-HU' });
    });
    await iphone.goto(`http://127.0.0.1:${server.address().port}/`);
    await iphone.waitForFunction(() => document.querySelector('pwa-install')?.isAppleMobilePlatform);
    await iphone.locator('#install-app').click();
    const dialog = await iphone.locator('pwa-install').evaluate(element => {
      const article = element.shadowRoot.querySelector('.install-dialog.apple');
      return article && { text: article.innerText, visible: getComputedStyle(article).display !== 'none' };
    });
    assert(dialog?.visible);
    assert.match(dialog.text, /Bee There/);
    assert.equal(await iphone.locator('#install-guide').count(), 0);
    console.log('PASS iPhone pwa-install dialog');
    await iphone.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
