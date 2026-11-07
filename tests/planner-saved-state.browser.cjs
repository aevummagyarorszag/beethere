const {chromium}=require('playwright');const assert=require('node:assert/strict');const {createServer}=require('node:http');const {readFileSync,mkdirSync}=require('node:fs');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');mkdirSync(path.join(root,'outputs/planner-calendar'),{recursive:true});const server=createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',timezoneId:'Europe/Budapest'});
 await page.clock.setFixedTime(new Date('2026-11-07T12:00:00+01:00'));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.waitForFunction(()=>events.length>0);
 await page.evaluate(()=>{
  events=[{Title:'Vállalt program',Date:'2026.11.09'},{Title:'Csak kedvelt program',Date:'2026.11.10'},{Title:'Régi kedvelt',Date:'2026.11.01'},{Title:'Régi új program',Date:'2026.11.02'}].map(e=>({...e,Type:'egyszeri',Time:'18:00',Category:'party',Location:'Győr',Description:'Teszt'}));
  permanentEvents=[];favoriteIds=new Set(events.slice(0,3).map(eventKey));pinnedEventKeys.clear();pinnedEventKeys.add(eventKey(events[0]));renderFavorites();
 });
 await page.locator('.bottom-nav-button[data-app-view="favorites"]').click();
 const order=()=>page.evaluate(()=>[...document.querySelectorAll('#favorites-grid > .favorite-pair')].map(el=>({key:el.dataset.eventKey,pinned:pinnedEventKeys.has(el.dataset.eventKey)})));
 let rows=await order();assert.equal(rows.at(-1).pinned,true);assert(rows.slice(0,-1).every(row=>!row.pinned));
 const onlyLiked=page.locator('#favorites-grid > .favorite-pair').filter({has:page.locator('.event-title',{hasText:'Csak kedvelt program'})});
 await onlyLiked.locator('.planner-card-pin').click();
 rows=await order();let seenPinned=false;rows.forEach(row=>{if(row.pinned)seenPinned=true;else assert.equal(seenPinned,false,'liked-only events precede attending events');});
 await page.evaluate(()=>renderFavoritePair(events[3],3,favoritesGrid));
 const past=page.locator('#favorites-grid > .favorite-pair').filter({has:page.locator('.event-title',{hasText:'Régi új program'})});
 assert(await past.locator('.favorite-button').isDisabled());assert(await past.locator('.planner-card-pin').isDisabled());
 const blocked=await page.evaluate(()=>{const event=events[3];toggleFavoriteForEvent(event,null);const result=setPinnedPlannerEvent(eventKey(event));return {liked:favoriteIds.has(eventKey(event)),pinned:pinnedEventKeys.has(eventKey(event)),result};});
 assert.deepEqual(blocked,{liked:false,pinned:false,result:false});
 await page.evaluate(()=>showPlannerEvent(events[3]));assert(await page.locator('#planner-pin').isDisabled());
 assert.equal(await page.evaluate(()=>favoriteIds.has(eventKey(events[3]))),false,'opening an expired event never auto-likes it');
 const oldLiked=await page.evaluate(()=>{toggleFavoriteForEvent(events[2],null);return favoriteIds.has(eventKey(events[2]));});assert.equal(oldLiked,false,'existing expired favorite can be removed');
 const coral=await page.locator('#home-topic-filters .topic-button[data-category=""]').evaluate(el=>getComputedStyle(el).borderColor);assert.equal(coral,'rgb(255, 107, 94)');
 console.log('PASS saved events: liked-only first, attendance last, expired add actions blocked on cards and detail, expired removal allowed, brand-coral All border');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
