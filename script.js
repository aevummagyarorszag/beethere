
function dist(a,b,c,d){const r=x=>x*Math.PI/180,A=r(c-a),B=r(d-b);return 6371*2*Math.atan2(Math.sqrt(Math.sin(A/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(B/2)**2),Math.sqrt(1-(Math.sin(A/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(B/2)**2)))}
function categories(e){return (e.Category||e.Kategória||'').split(/[,;|]/).map(x=>x.trim().toLowerCase()).filter(Boolean)}
function renderCard(e,target){let f=template.content.cloneNode(true),s=x=>f.querySelector(x),img=url(e['Header Image']),d=position?dist(position.latitude,position.longitude,+e.Latitude,+e.Longitude):NaN;s('.placeholder-title').textContent=e.Title||'Esemény';if(img){s('.event-image').src=img;s('.event-image').alt=e.Title;s('.image-placeholder').hidden=true;s('.event-image').onerror=()=>{s('.event-image').remove();s('.image-placeholder').hidden=false}}else s('.event-image').remove();s('.distance-pill').textContent=Number.isFinite(d)?(d<1?`${Math.round(d*1000)} m`:`${d.toFixed(1).replace('.',',')} km`):'';s('.event-date').textContent=e['Date and Time']||'Időpont hamarosan';s('.event-location').textContent=e.Location||'Helyszín hamarosan';s('.event-title').textContent=e.Title;s('.event-description').textContent=e.Description||'Részletek hamarosan.';s('.category-badge').textContent=categories(e)[0]||'program';s('.price-badge').textContent=e.Price||'Ár nincs megadva';s('.age-badge').textContent=e['Age Requirement']||'Korhatár nincs megadva';let link=url(e['Ticket Link']);if(link)s('.ticket-button').href=link;else s('.ticket-button').hidden=true;target.append(f)}
function draw(){grid.replaceChildren();featuredGrid.replaceChildren();let list=events.map(e=>({...e,d:position?dist(position.latitude,position.longitude,+e.Latitude,+e.Longitude):Infinity})).sort((a,b)=>a.d-b.d),matches=e=>!selected.size||[...selected].every(c=>categories(e).includes(c));let featured=list.filter(e=>/^igen|yes|true$/i.test(e.Featured||e.Kiemelt||''));featured.forEach(e=>renderCard(e,featuredGrid));document.querySelector('#featured-section').hidden=!featured.length;let normal=list.filter(matches);if(!normal.length)grid.innerHTML='<div class="loading-card">Nincs a kiválasztott kategóriákhoz illő esemény.</div>';else normal.forEach(e=>renderCard(e,grid))}
function filters(){let box=document.querySelector('#category-filters');CATEGORIES.forEach(c=>{let b=document.createElement('button');b.type='button';b.textContent=c;b.className='filter-button';b.onclick=()=>{selected.has(c)?selected.delete(c):selected.add(c);b.classList.toggle('active',selected.has(c));draw()};box.append(b)})}
async function load(){try{let r=await fetch(SHEET);if(!r.ok)throw Error();events=csv(await r.text()).filter(e=>e.Title);draw()}catch{grid.innerHTML='<div class="loading-card">Az események betöltése nem sikerült.</div>'}}
filters();navigator.geolocation?.getCurrentPosition(p=>{position=p.coords;document.querySelector('#location-text').textContent='Távolság szerint rendezve';draw()},()=>document.querySelector('#location-text').textContent='Helyzet nélkül rendezve',{maximumAge:300000,timeout:10000});load();
function isFeatured(event){return (event.Featured||event.Kiemelt||'').trim()==='Igen'}
function renderEvents(){
  grid.replaceChildren();featuredGrid.replaceChildren();
  const allSection=document.querySelector('.all-events');
  const featuredSection=document.querySelector('#featured-section');
  const featured=events.filter(isFeatured).sort((a,b)=>(a['Date and Time']||'').localeCompare(b['Date and Time']||''));
  featured.forEach(event=>renderCard(event,featuredGrid));
  featuredSection.hidden=!featured.length;

  // Első állapot: csak a kiemeltek látszanak, amíg nincs engedélyezett helyzet.
  if(!position){allSection.hidden=true;return}

  allSection.hidden=false;
  const sorted=events.map(event=>({...event,d:dist(position.latitude,position.longitude,+event.Latitude,+event.Longitude)})).sort((a,b)=>a.d-b.d);
  const matches=event=>!selected.size||[...selected].every(category=>categories(event).includes(category));
  const visible=sorted.filter(matches);
  if(!visible.length)grid.innerHTML='<div class="loading-card">Nincs a kiválasztott kategóriákhoz illő esemény.</div>';
  else visible.forEach(event=>renderCard(event,grid));
}
function filters(){let box=document.querySelector('#category-filters');CATEGORIES.forEach(c=>{let b=document.createElement('button');b.type='button';b.textContent=c;b.className='filter-button';b.onclick=()=>{selected.has(c)?selected.delete(c):selected.add(c);b.classList.toggle('active',selected.has(c));renderEvents()};box.append(b)})}
async function load(){try{let r=await fetch(SHEET);if(!r.ok)throw Error();events=csv(await r.text()).filter(e=>e.Title);renderEvents()}catch{grid.innerHTML='<div class="loading-card">Az események betöltése nem sikerült.</div>'}}
function init(){
  filters();
  load();
  if(!navigator.geolocation){document.querySelector('#location-text').textContent='Helymeghatározás nem támogatott — kiemelt események';return}
  navigator.geolocation.getCurrentPosition(
    p=>{position=p.coords;document.querySelector('#location-text').textContent='Távolság szerint rendezve';renderEvents()},
    ()=>{document.querySelector('#location-text').textContent='Helyzet nélkül — kiemelt események'},
    {maximumAge:300000,timeout:10000}
  );
}
init();
