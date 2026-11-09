/* Visual Crossing public no-key API: commercial use with visible attribution.
 * Terms and usage notes: docs/weather.md. Never put a private API key here. */
(() => {
  const ENDPOINT = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/';
  const STORAGE = 'bee-there-city-weather-v1';
  const TTL = 3 * 60 * 60 * 1000;
  const pending = new Map();
  const cities = new Map();
  let blockedUntil = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    for (const [key, value] of Object.entries(saved)) {
      if (value && Number.isFinite(value.fetchedAt) && value.fetchedAt <= Date.now() && Date.now() - value.fetchedAt < TTL && Array.isArray(value.days)) cities.set(key, value);
    }
  } catch { /* Storage is optional. */ }
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const dayNumber = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + 'T00:00:00Z') / 86400000 : NaN;
  const localToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  };
  const unavailable = () => ({ text: 'Az időjárás most nem elérhető.', available: false });
  const emoji = icon => ({'clear-day':'☀️','clear-night':'🌙','partly-cloudy-day':'⛅','partly-cloudy-night':'☁️',cloudy:'☁️',rain:'🌧️',snow:'❄️',fog:'🌫️',wind:'💨','snow-showers-day':'🌨️','snow-showers-night':'🌨️','showers-day':'🌦️','showers-night':'🌧️',thunder:'⛈️','thunder-rain':'⛈️','thunder-showers-day':'⛈️','thunder-showers-night':'⛈️'})[icon] || '🌡️';
  function resultFor(data, date) {
    const day = data.days.find(day => day.datetime === date);
    if (!day || !Number.isFinite(day.tempmax)) return {text:'Előrejelzés később',available:false};
    return {text:`${emoji(day.icon)} ${Math.round(day.tempmax)}°C`,available:true,fetchedAt:data.fetchedAt};
  }
  function save() {
    const valid = [...cities].filter(([,value])=>Date.now()-value.fetchedAt<TTL).slice(-50);
    try { localStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(valid))); } catch { /* Memory cache still works. */ }
  }
  async function request(location, date = '') {
    if (Date.now() < blockedUntil) throw new Error('Weather rate limit');
    const url = new URL(ENDPOINT + encodeURIComponent(location) + (date ? '/' + date : ''));
    url.search = new URLSearchParams({unitGroup:'metric',include:'days',elements:'datetime,tempmax,icon',contentType:'json'});
    const response = await fetch(url, {cache:date ? 'no-store' : 'default',signal:AbortSignal.timeout(12000)});
    if (!response.ok) {
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        const seconds = Number(retry);
        const delay = retry && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
        blockedUntil = Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000);
      }
      throw new Error(`Weather HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data.days) || !data.days.length) throw new Error('Invalid weather response');
    return {fetchedAt:Date.now(),days:data.days.map(({datetime,tempmax,icon})=>({datetime,tempmax,icon}))};
  }
  async function forecast({city, latitude, longitude, date, fresh = false}) {
    const difference = dayNumber(date) - dayNumber(localToday());
    if (!Number.isFinite(difference) || difference < 0) return unavailable();
    if (difference > 14) return {text:'Előrejelzés később',available:false};
    try {
      if (fresh) {
        if (!Number.isFinite(latitude) || Math.abs(latitude)>90 || !Number.isFinite(longitude) || Math.abs(longitude)>180) return unavailable();
        return resultFor(await request(`${latitude},${longitude}`, date), date);
      }
      const key = normalize(city);
      if (!key) return unavailable();
      const saved = cities.get(key);
      if (saved && Date.now()-saved.fetchedAt<TTL) return resultFor(saved,date);
      if (!pending.has(key)) pending.set(key, request(city).then(data=>{cities.set(key,data);save();return data;}).finally(()=>pending.delete(key)));
      return resultFor(await pending.get(key),date);
    } catch { return unavailable(); }
  }
  window.AtmoWeather = {forecast};
})();
