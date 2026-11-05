const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { mkdirSync } = require('node:fs');
(async () => {
  const root = path.resolve(__dirname, '..');
  mkdirSync(path.join(root, 'outputs/pwa-modal'), {recursive:true});
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    try {
      const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel:'msedge' });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const os of [18, 26]) {
      const page = await browser.newPage({ viewport:{width:390,height:844}, userAgent:`Mozilla/5.0 (iPhone; CPU iPhone OS ${os}_0 like Mac OS X) AppleWebKit/605.1.15 Version/${os}.0 Mobile/15E148 Safari/604.1`, hasTouch:true, locale:'hu-HU' });
      await page.addInitScript(() => {
        Object.defineProperty(navigator,'maxTouchPoints',{value:5});
        Object.defineProperty(window,'visualViewport',{value:{height:620,offsetTop:0,addEventListener(){}}});
      });
      await page.goto(base);
      await page.waitForFunction(() => document.querySelector('pwa-install').isAppleMobilePlatform);
      await page.locator('#install-app').click();
      await page.waitForFunction(() => document.querySelector('#pwa-install-modal').open);
      await page.waitForTimeout(600);
      const panel = page.locator('pwa-install .install-dialog.apple');
      const bounds = await panel.boundingBox();
      assert(bounds.y >= 0 && bounds.y + bounds.height <= 621, `iOS ${os}: panel must fit visual viewport`);
      assert(await page.locator('pwa-install pwa-gallery img').count() > 0, 'Apple gallery retains images');
      await page.screenshot({path:path.join(root, `outputs/pwa-modal/ios-${os}.png`)});
      await page.locator('pwa-install button.gallery').click();
      await page.waitForTimeout(600);
      const galleryBounds = await panel.boundingBox();
      assert(galleryBounds.y >= 0 && galleryBounds.y + galleryBounds.height <= 621, 'expanded Apple gallery must fit too');
      await page.evaluate(() => {
        window.backgroundClicks = 0;
        document.querySelector('#bottom-navigation').addEventListener('click', () => window.backgroundClicks++);
      });
      const navBounds = await page.locator('#bottom-navigation').boundingBox();
      await page.mouse.click(navBounds.x + navBounds.width / 2, navBounds.y + navBounds.height / 2);
      await page.waitForFunction(() => !document.querySelector('#pwa-install-modal').open);
      assert.equal(await page.evaluate(() => window.backgroundClicks), 0, 'outside click must never activate navigation');
      await page.locator('#install-app').click();
      await page.waitForFunction(() => document.querySelector('#pwa-install-modal').open);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pwa-install-modal').evaluate(node => node.open), false);
      console.log(`PASS iOS ${os}: viewport fit, gallery, blocked navigation, outside close, Escape`);
      await page.close();
    }
    const page = await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',hasTouch:true,locale:'hu-HU'});
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('pwa-install')._manifest['x-bee-there-screenshots']?.length);
    const manifest = await page.evaluate(() => fetch('manifest.webmanifest').then(r=>r.json()));
    assert.equal(manifest.screenshots, undefined, 'browser native prompt must not receive automatic screenshots');
    await page.locator('#install-gallery-preview').click();
    await page.waitForFunction(() => document.querySelector('#pwa-install-modal').open);
    const gallery = page.locator('pwa-install .chrome.mobile pwa-gallery');
    assert.equal(await gallery.isVisible(),true);
    await page.locator('pwa-install .bee-gallery-toggle').click();
    assert.equal(await gallery.isVisible(),false);
    await page.screenshot({path:path.join(root,'outputs/pwa-modal/android-collapsed.png')});
    await page.locator('pwa-install .bee-gallery-toggle').click();
    assert.equal(await gallery.isVisible(),true);
    await page.screenshot({path:path.join(root,'outputs/pwa-modal/android-gallery.png')});
    await page.locator('pwa-install .bee-gallery-toggle').click();
    assert.equal(await gallery.isVisible(),false);
    console.log('PASS Android: native screenshots omitted; gallery opens and closes only with toggle');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', {cancelable:true});
      event.platforms = ['web'];
      event.prompt = async () => { window.promptCalls = (window.promptCalls || 0) + 1; };
      event.userChoice = Promise.resolve({outcome:'dismissed'});
      window.dispatchEvent(event);
    });
    await page.locator('#install-app').click();
    assert.equal(await page.evaluate(() => window.promptCalls),1);
    assert.equal(await page.locator('#pwa-install-modal').evaluate(node=>node.open),false);
    console.log('PASS Android: own install button still invokes native prompt directly');
    await page.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
