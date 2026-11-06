const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');const server=createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:700},hasTouch:true,isMobile:true});
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const sheet=page.locator('#event-filter-dialog');const cdp=await page.context().newCDPSession(page);
  const open=async(selector='#event-filter-button')=>{await page.locator(selector).click();await page.waitForTimeout(250);};
  const drag=async(distance,cancel=false)=>{
   const box=await page.locator('#event-filter-title').boundingBox();const x=box.x+10,y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+distance*i/6,id:1}]});await page.waitForTimeout(25);}
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
   await page.waitForTimeout(220);
  };
  await open();
  assert.equal(await page.locator('.event-filter-fieldset').first().evaluate(el=>getComputedStyle(el).marginTop),'6px');
  await drag(18);assert.equal(await sheet.evaluate(el=>el.open),true,'short drag snaps back');
  await drag(60,true);assert.equal(await sheet.evaluate(el=>el.open),true,'canceled touch must not close');
  await page.locator('input[name="event-price-filter"][value="paid"]').check();
  await drag(140);
  assert.equal(await sheet.evaluate(el=>el.open),false,'native finger drag closes the sheet');
  assert.equal(await sheet.evaluate(el=>el.returnValue),'cancel','same dismissal as X');
  assert.equal(await page.locator('#event-filter-button').getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('event-filter-open')),false);
  await open();assert.equal(await page.locator('input[name="event-price-filter"][value="all"]').isChecked(),true,'drag discards unsaved changes like X');
  await page.locator('#event-filter-close').click();
  await page.locator('.bottom-nav-button[data-app-view="search"]').click();await open('#search-filter-button');await drag(140);
  assert.equal(await sheet.evaluate(el=>el.open),false,'search filter also dismisses');
  assert.equal(await page.locator('#search-filter-button').getAttribute('aria-expanded'),'false');
  console.log('PASS filters: real touch drag dismisses like X; short/canceled drags stay open; draft state resets; compact header; search also works');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
