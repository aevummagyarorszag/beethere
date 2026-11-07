const {chromium}=require('playwright');
const assert=require('node:assert/strict');const {createServer}=require('node:http');const {readFileSync}=require('node:fs');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');const server=createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.waitForFunction(()=>events.length>0);
 for(const width of [390,760]){
  await page.setViewportSize({width,height:844});
  for(const view of ['home','permanent','favorites'])for(const count of [1,3,4,7]){
   await page.locator(`.bottom-nav-button[data-app-view="${view}"]`).click();
   const id=await page.evaluate(({view,count})=>{
    const fixture=Array.from({length:count},(_,i)=>({Title:`Program ${i+1}`,Date:'2030.11.07',Time:'18:00',Category:'party',Type:view==='permanent'?'allando':'egyszeri',Location:'Győr',Description:'Tesztprogram'}));
    if(view==='favorites'){
      events=fixture;permanentEvents=[];favoriteIds=new Set(fixture.map(eventKey));pinnedEventKeys.clear();fixture.forEach(event=>pinnedEventKeys.add(eventKey(event)));renderFavorites();return 'pinned-events-grid';
    }
    renderCompactPagedRail(nearbyGrid,fixture);nearbySection.hidden=false;return 'nearby-grid';
   },{view,count});
   const rail=page.locator('#'+id);await rail.scrollIntoViewIfNeeded();await rail.focus();await rail.press('End');await page.waitForTimeout(80);
   const geometry=await rail.evaluate(el=>{
    const pages=[...el.querySelectorAll(':scope > .compact-event-page')],last=pages.at(-1),previous=pages.at(-2),bounds=el.getBoundingClientRect();
    return {offset:last.getBoundingClientRect().left-bounds.left,previousRight:previous?previous.getBoundingClientRect().right-bounds.left:null,scroll:el.scrollLeft,max:el.scrollWidth-el.clientWidth,pages:pages.length};
   });
   assert(Math.abs(geometry.offset)<=1.5,JSON.stringify({width,view,count,...geometry}));
   if(geometry.previousRight!==null)assert(geometry.previousRight<=0,JSON.stringify({width,view,count,...geometry}));
   await rail.press('Home');await page.waitForTimeout(40);
   for(let i=1;i<geometry.pages;i++){await rail.press('ArrowRight');await page.waitForTimeout(40);}
   const finalOffset=await rail.evaluate(el=>el.querySelector(':scope > .compact-event-page:last-of-type').getBoundingClientRect().left-el.getBoundingClientRect().left);
   assert(Math.abs(finalOffset)<=1.5,`step paging: ${width}/${view}/${count}: ${finalOffset}`);
  }
 }
 console.log('PASS compact paging: full final-column alignment and no previous-column peek in Home, Permanent and Planning at 390/760px with 1, 3, 4 and 7 events');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
