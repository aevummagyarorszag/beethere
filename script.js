const EVENTS_FILE = 'events.json';
const CATEGORIES = ['party', 'kultúra', 'sport', 'családi', 'gasztro', 'romantika'];
const CATEGORY_EMOJIS = { party: '🎉', kultúra: '🎭', sport: '🏀', családi: '👪', gasztro: '🦐', romantika: '🌹' };
const CITIES = [
  { name: 'Budapest', latitude: 47.4979, longitude: 19.0402 },
  { name: 'Debrecen', latitude: 47.5316, longitude: 21.6273 },
  { name: 'Győr', latitude: 47.6875, longitude: 17.6504 },
  { name: 'Pécs', latitude: 46.0727, longitude: 18.2323 },
  { name: 'Székesfehérvár', latitude: 47.1860, longitude: 18.4221 }
];
const FAVORITES_STORAGE_KEY = 'bee-there-favorites';
const weatherCache = new Map();
const HERO_VIDEOS = ['assets/front_danc.mp4', 'assets/front_familiy.mp4', 'assets/front_gasztro.mp4', 'assets/front_muzeum.mp4', 'assets/front_sport.mp4'];

const find = (selector, scope = document) => {
  if (!scope || typeof scope.querySelector !== 'function') {
    console.warn(`[Bee There] Nem kereshető DOM-környezet: ${selector}`);
    return null;
  }
  const element = scope.querySelector(selector);
  if (!element) console.warn(`[Bee There] Hiányzó DOM-elem: ${selector}`);
  return element;
};

const findAll = (selector, scope = document) => {
  if (!scope || typeof scope.querySelectorAll !== 'function') {
    console.warn(`[Bee There] Nem kereshető DOM-környezet: ${selector}`);
    return [];
  }
  return [...scope.querySelectorAll(selector)];
};

const grid = find('#events-grid');
const featuredGrid = find('#featured-grid');
const favoritesGrid = find('#favorites-grid');
const todayGrid = find('#today-grid');
const template = find('#event-template');
const allSection = find('.all-events');
const featuredSection = find('#featured-section');
const favoritesSection = find('#favorites-section');
const todaySection = find('#today-section');
const filterBar = find('#category-filters');
const locationText = find('#location-text');
const citySelector = find('#city-selector');
const citySelectorLabel = find('#city-selector-label');
const cityDialog = find('#city-dialog');
const cityDialogClose = find('#city-dialog-close');
const heroVideo = find('#hero-video');
const pixelBlast = find('#pixel-blast');
const eventDetailsDialog = find('#event-details-dialog');
const eventDetailsClose = find('#event-details-close');
const eventDetailsMeta = find('#event-details-meta');
const eventDetailsTitle = find('#event-details-title');
const eventDetailsTime = find('#event-details-time');
const eventDetailsWeather = find('#event-details-weather');
const eventDetailsDescription = find('#event-details-description');
const eventDetailsTicket = find('#event-details-ticket');
const outroWeather = find('#outro-weather');
const outroWeatherIcon = find('#outro-weather-icon');
const outroMessage = find('#outro-title');

let events = [];
let selectedCategory = '';
let activeFilterButton = null;
let position = null;
let selectedCity = '';
let favoriteIds = loadFavorites();

// A meglévő Google Sheets CSV-parser.
function csv(text) { let rows = [], row = [], cell = '', quoted = false; for (let i = 0; i < text.length; i += 1) { const char = text[i], next = text[i + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += char; } row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); const [headers, ...data] = rows; return data.map(values => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, '').trim(), values[index] || '']))); }

function safeUrl(value) { try { const valueUrl = new URL(value); return /^https?:$/.test(valueUrl.protocol) ? valueUrl.href : ''; } catch { return ''; } }
function haversineKm(lat1, lon1, lat2, lon2) { const toRadians = value => value * Math.PI / 180; const lat = toRadians(lat2 - lat1), lon = toRadians(lon2 - lon1); const a = Math.sin(lat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function eventCategories(event) { return (event.Category || event.Kategória || '').split(/[,;|]/).map(value => value.trim().toLowerCase()).filter(Boolean); }
function isFeatured(event) { return (event.Featured || event.Kiemelt || '').trim() === 'Igen'; }
function isFree(event) { return /(^|\b)(ingyenes|0\s*(ft|huf))\b/i.test((event.Price || '').trim()); }
function eventKey(event) { return [event.Title, eventDateValue(event), event.Location, event['Ticket Link']].map(value => String(value || '').trim()).join('|'); }
function eventDateValue(event) { return event.Date || event['Date and Time'] || ''; }
function eventDateOnly(event) { const value = eventDateValue(event).trim(); return value.split(/[T ]/)[0] || 'Dátum hamarosan'; }
function dateKey(value) { const match = String(value || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/); return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''; }
function todayKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function isToday(event) { return dateKey(eventDateValue(event)) === todayKey(); }
function setText(selector, value, scope) { const element = find(selector, scope); if (element) element.textContent = value; return element; }
function vibrate(milliseconds = 16) { if ('vibrate' in navigator) navigator.vibrate(milliseconds); }

function getWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '⛅';
  if (code === 3) return '☁️';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧';
  if (code >= 95 && code <= 99) return '🌩';
  return '🌡️';
}

async function fetchWeatherForEvent(latitude, longitude, eventDate) {
  const date = dateKey(eventDate);
  if (!date || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return '🌡️ --°C';
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${date}`;
  if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  const diffDays = Math.round((target - today) / 86400000);
  let result = '🌡️ --°C';
  try {
    if (diffDays >= 0 && diffDays <= 14) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max&timezone=auto&start_date=${date}&end_date=${date}`;
      const data = await (await fetch(url)).json();
      const temperature = data.daily?.temperature_2m_max?.[0];
      const code = data.daily?.weather_code?.[0];
      if (Number.isFinite(temperature)) result = `${getWeatherEmoji(code)} ${Math.round(temperature)}°C`;
    } else if (diffDays > 14) {
      const pastDate = new Date(`${date}T00:00:00`);
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      const past = pastDate.toISOString().slice(0, 10);
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max&timezone=auto&start_date=${past}&end_date=${past}`;
      const data = await (await fetch(url)).json();
      const temperature = data.daily?.temperature_2m_max?.[0];
      const code = data.daily?.weather_code?.[0];
      if (Number.isFinite(temperature)) result = `${getWeatherEmoji(code)} ~${Math.round(temperature)}°C`;
    }
  } catch (error) { console.warn('[Bee There] Időjárás hiba:', error); }
  weatherCache.set(cacheKey, result);
  return result;
}

async function updateOutroWeather() {
  if (!outroWeather || !outroWeatherIcon) return;
  if (!position) {
    outroWeatherIcon.textContent = '🌡️';
    outroWeather.textContent = 'Időjárás a helyzeted alapján';
    return;
  }
  outroWeather.textContent = 'Időjárás betöltése…';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${position.latitude}&longitude=${position.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Az időjárás nem elérhető.');
    const data = await response.json();
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) throw new Error('Hiányos időjárásadat.');
    outroWeatherIcon.textContent = current.is_day === 0 ? '🌙' : getWeatherEmoji(current.weather_code);
    outroWeather.textContent = `${Math.round(current.temperature_2m)}°C${selectedCity ? ` · ${selectedCity}` : ''}`;
  } catch (error) {
    console.warn('[Bee There] Alsó időjárás betöltési hiba:', error);
    outroWeatherIcon.textContent = '🌡️';
    outroWeather.textContent = 'Időjárás jelenleg nem elérhető';
  }
}

function initOutroMessage() {
  if (!outroMessage) return;
  const message = 'A Bee There segít, hogy jól érezd magad bármikor, bárkivel.';
  outroMessage.replaceChildren();
  let letterIndex = 0;
  message.split(/(\s+)/).forEach(part => {
    if (/^\s+$/.test(part)) {
      outroMessage.append(document.createTextNode(' '));
      return;
    }
    const word = document.createElement('span');
    word.className = 'outro-word';
    [...part].forEach(character => {
      const letter = document.createElement('span');
      letter.className = 'outro-letter';
      if (part === 'Bee' || part === 'There') letter.classList.add('brand-letter');
      letter.textContent = character;
      letter.style.animationDelay = `${letterIndex * 0.085}s`;
      letterIndex += 1;
      word.append(letter);
    });
    outroMessage.append(word);
  });
}

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]')); }
  catch (error) { console.warn('[Bee There] A kedvencek nem olvashatók:', error); return new Set(); }
}

function saveFavorites() {
  try { localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteIds])); }
  catch (error) { console.warn('[Bee There] A kedvencek nem menthetők:', error); }
}

function triggerBounce(element) {
  if (!element) return;
  findAll('.gooey-particle', element).forEach(particle => particle.remove());
  for (let index = 0; index < 10; index += 1) {
    const particle = document.createElement('span');
    const angle = (Math.PI * 2 * index) / 10 + (Math.random() - 0.5) * 0.45;
    const distance = 18 + Math.random() * 22;
    particle.className = 'gooey-particle';
    particle.style.setProperty('--gooey-x', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--gooey-y', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--gooey-size', `${4 + Math.random() * 5}px`);
    element.append(particle);
    window.setTimeout(() => particle.remove(), 760);
  }
}

function moveGooeyFilter(button) {
  const gooey = find('.gooey-filter', filterBar);
  if (!gooey || !button || !filterBar) return;
  const barBounds = filterBar.getBoundingClientRect();
  const buttonBounds = button.getBoundingClientRect();
  gooey.style.left = `${buttonBounds.left - barBounds.left}px`;
  gooey.style.top = `${buttonBounds.top - barBounds.top}px`;
  gooey.style.width = `${buttonBounds.width}px`;
  gooey.style.height = `${buttonBounds.height}px`;
  gooey.hidden = false;
  triggerBounce(gooey);
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) return '---';
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`;
}

function eventDistance(event) {
  const latitude = Number(event.Latitude);
  const longitude = Number(event.Longitude);
  return position && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? haversineKm(position.latitude, position.longitude, latitude, longitude)
    : Number.POSITIVE_INFINITY;
}

function sortByDistance(list) {
  return list.map(event => ({ ...event, distance: eventDistance(event) })).sort((first, second) => first.distance - second.distance);
}

function closestCity(coords) {
  return CITIES.reduce((closest, city) => {
    const distance = haversineKm(coords.latitude, coords.longitude, city.latitude, city.longitude);
    return !closest || distance < closest.distance ? { ...city, distance } : closest;
  }, null);
}

function updateCityUI(name) {
  selectedCity = name || '';
  if (citySelectorLabel) citySelectorLabel.textContent = name || 'Helyzeted…';
  if (locationText) locationText.textContent = name ? `${name} - távolság szerint rendezve` : 'Helyzeted meghatározása…';
  findAll('.city-option').forEach(button => button.classList.toggle('active', button.dataset.city === name));
}

function setCardDistance(card, latitude, longitude) {
  if (!card) return;
  const value = find('.distance-value', card);
  if (!value) return;
  const distance = position && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? haversineKm(position.latitude, position.longitude, latitude, longitude)
    : NaN;
  value.textContent = formatDistance(distance);
  card.classList.toggle('distance-unavailable', !Number.isFinite(distance));
}

function updateDistanceValues() {
  findAll('.event-card[data-latitude][data-longitude]').forEach(card => {
    setCardDistance(card, Number(card.dataset.latitude), Number(card.dataset.longitude));
  });
}

function positionDetailsButton(card) {
  if (!card) return;
  const button = find('.details-button', card);
  const imageWrap = find('.image-wrap', card);
  if (!button || !imageWrap) return;
  button.style.top = `${Math.round(imageWrap.offsetTop + imageWrap.offsetHeight + 10)}px`;
}

function positionAllDetailsButtons() {
  findAll('.event-card').forEach(positionDetailsButton);
}

function syncCarouselControls(carousel) {
  if (!carousel) return;
  const hasMultipleCards = findAll('.event-card', carousel).length > 1;
  carousel._hasMultipleCards = hasMultipleCards;
  const controls = findAll(`[data-carousel-target="${carousel.id}"]`);
  controls.forEach(control => {
    control.hidden = !hasMultipleCards;
    const group = control.closest('.carousel-controls');
    if (group) group.hidden = !hasMultipleCards;
  });
  if (!hasMultipleCards && carousel._returnButton) carousel._returnButton.hidden = true;
}

function setupCarousel(carousel) {
  if (!carousel) return;
  let returnButton = carousel._returnButton;
  if (!returnButton) {
    returnButton = document.createElement('button');
    returnButton.type = 'button';
    returnButton.className = 'carousel-return';
    returnButton.hidden = true;
    returnButton.setAttribute('aria-label', 'Vissza az események elejére');
    returnButton.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 53C7 28 19 14 43 11V3l16 15-16 15v-9C28 25 16 35 11 53Z"/></svg>';
    returnButton.addEventListener('click', () => {
      triggerBounce(returnButton);
      vibrate(10);
      carousel.scrollTo({ left: 0, behavior: 'smooth' });
    });
    carousel._returnButton = returnButton;
  }
  const carouselShell = carousel.parentElement;
  if (carouselShell) {
    carouselShell.classList.add('carousel-shell');
    if (!carouselShell.contains(returnButton)) carouselShell.append(returnButton);
  }
  syncCarouselControls(carousel);
  if (carousel.dataset.carouselReady === 'true') {
    carousel._updateReturnButton?.();
    return;
  }
  carousel.dataset.carouselReady = 'true';
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  carousel.addEventListener('pointerdown', event => {
    if (event.target.closest('button, a')) return;
    if (event.pointerType !== 'mouse') return;
    isDragging = true;
    startX = event.clientX;
    startScrollLeft = carousel.scrollLeft;
    carousel.classList.add('is-dragging');
    carousel.setPointerCapture?.(event.pointerId);
  });
  carousel.addEventListener('pointermove',
