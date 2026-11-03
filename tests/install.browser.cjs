const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    for (const ua of ['Android', 'iPhone CriOS/120 Mobile Safari', 'iPhone Version/18 Mobile Safari', 'iPhone FxiOS/120']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: ua });
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
      const button = page.locator('#install-app');
      const box = await button.boundingBox();
      assert(box && box.y >= 0 && box.y + box.height < 844);
      await button.click({ timeout: 4000 });
      const steps = await page.locator('#install-steps').innerText();
      assert.equal(steps.includes('Open as Web App'), ua.includes('Version'));
      assert.equal(steps.includes('Chrome'), ua.includes('CriOS'));
      const active = page.locator('#install-steps [aria-current="step"]');
      await page.waitForFunction(() => document.querySelector('#install-steps li:nth-child(2)').matches('[aria-current="step"]'));
      await page.locator('#install-prev').click();
      assert.equal(await active.textContent(), await page.locator('#install-steps li').first().textContent());
      assert.equal(await page.locator('#install-play').textContent(), 'Lejátszás');
      await page.locator('#install-next').click();
      await page.locator('#install-guide form button').click();
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = () => window.promptCalls = (window.promptCalls || 0) + 1;
        event.userChoice = Promise.resolve({ outcome: 'dismissed' });
        dispatchEvent(event);
        if (!event.defaultPrevented) throw Error('Prompt was not deferred');
      });
      await button.click();
      assert.equal(await page.evaluate(() => window.promptCalls), 1);
      await button.click();
      assert(await page.locator('#install-guide').isVisible());
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
      assert(await button.isHidden());
      assert(await page.locator('#install-guide').isHidden());
      await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
      await page.reload();
      assert(await button.isHidden());
      console.log('PASS', ua, box);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
