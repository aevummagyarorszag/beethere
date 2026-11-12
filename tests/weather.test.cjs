const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../weather.js'),'utf8');
function app({storage=new Map(),fetcher}={}) {
 let now=Date.parse('2026-11-09T12:00:00Z');const calls=[];
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const context={window:{},Date:Clock,Map,URL,URLSearchParams,AbortSignal,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:async(url,options)=>{calls.push({url:new URL(url),options});return fetcher?fetcher(url,options):{ok:true,json:async()=>({days:[{datetime:'2026-11-10',tempmax:12,icon:'rain'},{datetime:'2026-11-11',tempmax:14,icon:'clear-day'}]})};}};
 vm.runInNewContext(code,context);return {forecast:context.window.AtmoWeather.forecast,calls,storage,advance:ms=>now+=ms};
}
const city={city:'Székesfehérvár, Hungary',date:'2026-11-10',latitude:47.19,longitude:18.42};
test('one city request for simultaneous details and different event dates, reused after restart',async()=>{
 const a=app();const values=await Promise.all([a.forecast(city),a.forecast({...city,city:'Szekesfehervar, Hungary',date:'2026-11-11'})]);assert(values.every(x=>x.available));assert.equal(a.calls.length,1);assert(!a.calls[0].url.searchParams.has('key'));assert.equal(a.calls[0].url.searchParams.get('include'),'days');assert(!a.calls[0].url.pathname.includes('2026-11-10'));const b=app({storage:a.storage});assert((await b.forecast(city)).available);assert.equal(b.calls.length,0);a.advance(3*3600000+1);await a.forecast(city);assert.equal(a.calls.length,2);
});
test('planner opens always query exact venue and date without cache',async()=>{
 const a=app();await a.forecast(city);await a.forecast({...city,fresh:true});await a.forecast({...city,fresh:true});assert.equal(a.calls.length,3);for(const call of a.calls.slice(1)){assert(call.url.pathname.includes('47.19%2C18.42/2026-11-10'));assert.equal(call.options.cache,'no-store');}
});
test('no queries for past, out-of-range, missing city or invalid venue',async()=>{
 const a=app();for(const value of [{...city,date:'2026-11-08'},{...city,date:'2026-11-24'},{...city,date:''},{...city,city:''},{...city,fresh:true,latitude:NaN}])assert.equal((await a.forecast(value)).available,false);assert.equal(a.calls.length,0);
});
test('failed city request is not cached and can recover',async()=>{
 let n=0;const a=app({fetcher:async()=>{if(!n++)throw Error('offline');return {ok:true,json:async()=>({days:[{datetime:city.date,tempmax:10,icon:'cloudy'}]})};}});assert.equal((await a.forecast(city)).available,false);assert((await a.forecast(city)).available);assert.equal(a.calls.length,2);
});
test('429 Retry-After blocks further city and planner requests until backoff ends',async()=>{
 const a=app({fetcher:async()=>({ok:false,status:429,headers:{get:()=> '120'}})});await a.forecast(city);await a.forecast({...city,fresh:true});assert.equal(a.calls.length,1);a.advance(120001);await a.forecast({...city,fresh:true});assert.equal(a.calls.length,2);
});
test('malformed saved cache and missing forecast day produce no invented weather',async()=>{
 const a=app({storage:new Map([['bee-there-city-weather-v1','invalid']])});assert((await a.forecast(city)).available);const value=await a.forecast({...city,date:'2026-11-12'});assert.equal(value.available,false);assert.equal(value.text,'Időjárás: Előrejelzés később.');assert.equal(a.calls.length,1);
});
