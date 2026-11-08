const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge'});
 try{
  const context=await browser.newContext();await context.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});navigator.geolocation.getCurrentPosition=()=>{throw Error('Unexpected location request');};});
  let page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url=`http://127.0.0.1:${server.address().port}/index.html`;
  await page.goto(url);assert.equal(await page.locator('#city-selector-label').textContent(),'Székesfehérvár');
  await page.evaluate(()=>setCity(CITIES.find(c=>c.name==='Győr'),true));await page.reload();assert.equal(await page.locator('#city-selector-label').textContent(),'Győr');
  await page.close();page=await context.newPage();await page.goto(url);assert.equal(await page.locator('#city-selector-label').textContent(),'Győr');
  await page.evaluate(()=>localStorage.setItem('bee-there-selected-city','{"name":"Invalid","latitude":999,"longitude":0}'));await page.reload();assert.equal(await page.locator('#city-selector-label').textContent(),'Székesfehérvár');
  await page.evaluate(()=>localStorage.setItem('bee-there-selected-city','invalid json'));await page.reload();assert.equal(await page.locator('#city-selector-label').textContent(),'Székesfehérvár');
  assert.deepEqual(errors,[]);console.log('PASS city persistence: default city, reload, reopened app, invalid coordinates and malformed storage');await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
