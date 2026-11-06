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
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>events.length>0);
  assert.equal(await page.locator('#events-refresh').count(),0);
  await page.evaluate(()=>{const original=renderEvents;window.renderEvents=(...args)=>{window.endRefreshCalls++;return original(...args);};});
  for(const view of ['home','permanent','favorites','search','profile']){
   await page.locator(`.bottom-nav-button[data-app-view="${view}"]`).click();
   await page.waitForTimeout(150);
   const before=await page.evaluate(()=>{
    window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
    window.endRefreshCalls=0;
    const fire=(type,touches)=>{const event=new Event(type,{bubbles:true});Object.defineProperty(event,'touches',{value:touches});document.dispatchEvent(event);};
    fire('touchstart',[{clientY:650}]);fire('touchmove',[{clientY:450}]);fire('touchend',[]);
    return window.scrollY;
   });
   await page.waitForTimeout(450);
   assert.equal(await page.evaluate(()=>window.endRefreshCalls),0,`${view}: no feed refresh`);
   assert.equal(await page.evaluate(()=>currentAppView),view,`${view}: stay in view`);
   assert(Math.abs(await page.evaluate(()=>window.scrollY)-before)<2,`${view}: no jump to top`);
   console.log(`PASS ${view}: bottom pull does not refresh, change view or jump to top`);
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
