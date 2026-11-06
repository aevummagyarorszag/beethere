const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const {readFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');mkdirSync(path.join(root,'outputs/calendar-today'),{recursive:true});
 const server=createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Europe/Budapest'});
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+01:00'));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const today=page.locator('#calendar-today');await today.scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#calendar-today-number').textContent(),'5');
  assert.equal(await page.getByText('Események beállítása',{exact:true}).count(),0);
  for(const theme of ['light','dark']) {
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    const style=await today.evaluate(el=>({background:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow,color:getComputedStyle(el).color,labelColor:getComputedStyle(document.querySelector('#calendar-month-label')).color,before:getComputedStyle(el,'::before').content}));
    assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.shadow,'none');assert.equal(style.color,style.labelColor);assert.equal(style.before,'none');
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  assert.match(await today.getAttribute('aria-label'),/2026.*november 5/);
  await page.locator('.calendar-shell').scrollIntoViewIfNeeded();
  const shell=await page.locator('.calendar-shell').boundingBox();
  await page.mouse.move(shell.x+shell.width*.8,shell.y+80);await page.mouse.down();await page.mouse.move(shell.x+shell.width*.2,shell.y+80,{steps:8});await page.mouse.up();
  assert.match(await page.locator('#calendar-month-label').textContent(),/december/);
  await today.click();
  assert(await page.locator('.calendar-shell').evaluate(el=>el.classList.contains('is-swiping-previous')));
  assert.match(await page.locator('#calendar-month-label').textContent(),/november/);
  await page.waitForTimeout(300);
  const day=page.locator('.calendar-day.today');assert.equal(await day.getAttribute('data-date-key'),'2026-11-05');
  assert(await day.evaluate(el=>el.getAnimations().some(a=>a.effect.getTiming().iterations===1)), 'today flashes once');
  await page.locator('.calendar-heading').screenshot({path:path.join(root,'outputs/calendar-today/header.png')});
  await page.clock.setFixedTime(new Date('2026-12-01T08:00:00+01:00'));
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  assert.equal(await page.locator('#calendar-today-number').textContent(),'1');
  await today.click();assert.match(await page.locator('#calendar-month-label').textContent(),/december/);
  assert(await page.locator('.calendar-shell').evaluate(el=>el.classList.contains('is-swiping-next')));
  assert.equal(await page.locator('.calendar-day.today').getAttribute('data-date-key'),'2026-12-01');
  await page.emulateMedia({reducedMotion:'reduce'});await today.click();
  assert.equal(await page.locator('.calendar-day.today').evaluate(el=>el.getAnimations().length),0);
  await page.setViewportSize({width:320,height:780});
  await page.locator('.calendar-heading').screenshot({path:path.join(root,'outputs/calendar-today/header-small.png')});
  console.log('PASS calendar: current day icon, month reset, single flash, resumed date rollover and reduced motion');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
