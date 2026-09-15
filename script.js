const EVENTS_FILE = 'events.json';
const CATEGORIES = ['party', 'kultúra', 'sport', 'családi', 'gasztro', 'romantika'];
const CATEGORY_EMOJIS = { party: '🎉', kultúra: '🎭', sport: '🏀', családi: '👪', gasztro: '🦐', romantika: '🌹' };
const EVENT_GROUP_EMOJIS = { 'Ingyenes események': '✨', 'Fizetős események': '🏷️' };
const CITIES = [
  { name: 'Budapest', latitude: 47.4979, longitude: 19.0402 },
  { name: 'Debrecen', latitude: 47.5316, longitude: 21.6273 },
  { name: 'Győr', latitude: 47.6875, longitude: 17.6504 },
  { name: 'Pécs', latitude: 46.0727, longitude: 18.2323 },
  { name: 'Székesfehérvár', latitude: 47.1860, longitude: 18.4221 }
];
const FAVORITES_STORAGE_KEY = 'bee-there-favorites';
const FAVORITE_NOTES_STORAGE_KEY = 'bee-there-favorite-notes';
const TRANSPORT_STORAGE_KEY = 'bee-there-transport';
const PROFILE_STORAGE_KEY = 'bee-there-profile-preferences';
const MAX_FAVORITES = 100;
const MAX_EVENT_RESPONSE_BYTES = 3 * 1024 * 1024;
const weatherCache = new Map();
// The compressed header clips are loaded one at a time by initHeroVideo().
// Keep these names in sync with the files in /assets.
const HERO_VIDEOS = ['assets/csokk01.mp4', 'assets/csokk02.mp4', 'assets/csokk03.mp4', 'assets/csokk04.mp4', 'assets/csokk05.mp4'];

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
const eventDetailsDialog = find('#event-details-dialog');
const eventDetailsClose = find('#event-details-close');
const eventDetailsDate = find('#event-details-date');
const eventDetailsLocation = find('#event-details-location');
const eventDetailsTitle = find('#event-details-title');
const eventDetailsTime = find('#event-details-time');
const eventDetailsWeather = find('#event-details-weather');
const eventDetailsDescription = find('#event-details-description');
const eventDetailsTicket = find('#event-details-ticket');
const eventDetailsImage = find('#event-details-image');
const eventDetailsImageWrap = find('#event-details-image-wrap');
const eventDetailsShare = find('#event-details-share');
const outroWeather = find('#outro-weather');
const outroWeatherIcon = find('#outro-weather-icon');
const outroMessage = find('#outro-title');
const navMenu = find('#nav-menu');
const navMenuToggle = find('#nav-menu-toggle');
const tomorrowShortcut = find('#tomorrow-shortcut');
const tomorrowShortcutDate = find('#tomorrow-shortcut-date');
const calendarSection = find('#calendar-section');
const calendarFilters = find('#calendar-filters');
const calendarGrid = find('#calendar-grid');
const calendarMonthLabel = find('#calendar-month-label');
const calendarPrevious = find('#calendar-prev');
const calendarNext = find('#calendar-next');
const calendarEvents = find('#calendar-events');
const favoritesView = find('#favorites-view');
const searchView = find('#search-view');
const permanentView = find('#permanent-view');
const permanentGrid = find('#permanent-grid');
let permanentEvents = [];
const profileView = find('#profile-view');
const searchInput = find('#event-search');
const searchResults = find('#search-results');
const profileCity = find('#profile-city');
const profileCityButton = find('#profile-city-button');
const bottomNavigation = find('#bottom-navigation');
const homeContent = findAll('[data-home-content]');

let events = [];
let selectedCategory = '';
let activeFilterButton = null;
let position = null;
let selectedCity = '';
let favoriteIds = loadFavorites();
let favoriteNotes = loadFavoriteNotes();
let calendarCategory = '';
let calendarSelectedDate = '';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let currentAppView = 'home';
let selectedTransport = 'car';
let profilePreferences = { categories: [], moods: [], companions: [], budget: 20000, times: [], spontaneity: '' };
let tomorrowFeedbackTimer = 0;
let tomorrowFeedbackCleanupTimer = 0;

// A meglévő Google Sheets CSV-parser.
function csv(text) { let rows = [], row = [], cell = '', quoted = false; for (let i = 0; i < text.length; i += 1) { const char = text[i], next = text[i + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += char; } row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); const [headers, ...data] = rows; return data.map(values => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, '').trim(), values[index] || '']))); }

function safeUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 2048) return '';
  try {
    const valueUrl = new URL(candidate);
    return valueUrl.protocol === 'https:' ? valueUrl.href : '';
  } catch { return ''; }
}

function safeText(value, maximumLength) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maximumLength);
}

function safeCoordinate(value, minimum, maximum) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : undefined;
}

function sanitizeEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  return {
    Permanent: ['allando', 'permanent'].includes(normalizedText(rawEvent['Típus'] || rawEvent.Type || '').trim()),
    Title: safeText(rawEvent.Title, 180),
    Location: safeText(rawEvent.Location, 240),
    Latitude: safeCoordinate(rawEvent.Latitude, -90, 90),
    Longitude: safeCoordinate(rawEvent.Longitude, -180, 180),
    Date: safeText(rawEvent.Date, 64),
    Time: safeText(rawEvent.Time, 64),
    'Date and Time': safeText(rawEvent['Date and Time'], 128),
    Description: safeText(rawEvent.Description, 1_200),
    Price: safeText(rawEvent.Price, 80),
    'Age Requirement': safeText(rawEvent['Age Requirement'], 80),
    'Long description': safeText(rawEvent['Long description'] || rawEvent['Long Description'], 8_000),
    'Header Image': safeUrl(rawEvent['Header Image']),
    'Ticket Link': safeUrl(rawEvent['Ticket Link']),
    Category: safeText(rawEvent.Category || rawEvent.Kategória, 160),
    Featured: safeText(rawEvent.Featured || rawEvent.Kiemelt, 16),
  };
}

async function parseJsonWithSizeLimit(response, maximumBytes) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error('Az eseményadatok mérete túl nagy.');
  }
  if (!response.body?.getReader) return response.json();

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error('Az eseményadatok mérete túl nagy.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function optimizedImageUrl(value) {
  const url = safeUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('images.unsplash.com')) {
      parsed.searchParams.set('auto', 'format');
      parsed.searchParams.set('w', '600');
      parsed.searchParams.set('q', '80');
    }
    return parsed.href;
  } catch { return url; }
}
function haversineKm(lat1, lon1, lat2, lon2) { const toRadians = value => value * Math.PI / 180; const lat = toRadians(lat2 - lat1), lon = toRadians(lon2 - lon1); const a = Math.sin(lat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function eventCategories(event) { return (event.Category || event.Kategória || '').split(/[,;|]/).map(value => value.trim().toLowerCase()).filter(Boolean); }
function isFeatured(event) { return (event.Featured || event.Kiemelt || '').trim() === 'Igen'; }
function isFree(event) { return /(^|\b)(ingyenes|0\s*(ft|huf))\b/i.test((event.Price || '').trim()); }
function eventKey(event) { return [event.Title, eventDateValue(event), event.Location, event['Ticket Link']].map(value => String(value || '').trim()).join('|'); }
function eventDateValue(event) { return event.Date || event['Date and Time'] || ''; }
function eventDateOnly(event) { if (event.Permanent) return 'Állandó program'; const value = eventDateValue(event).trim(); return value.split(/[T ]/)[0] || 'Dátum hamarosan'; }
function dateKey(value) { const match = String(value || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/); return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''; }
function isWithinNextDays(event, days = 3) { const key = dateKey(eventDateValue(event)); if (!key) return false; const today = new Date(); today.setHours(0, 0, 0, 0); const target = new Date(`${key}T00:00:00`); const difference = Math.round((target - today) / 86400000); return difference >= 0 && difference <= days; }
function eventSlug(event) { return `${dateKey(eventDateValue(event)) || 'esemeny'}-${String(event.Title || 'esemeny').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96)}`; }
function eventShareUrl(event) { const url = new URL(window.location.href); url.searchParams.set('event', eventSlug(event)); return url.toString(); }
function tomorrowKey() { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`; }
function todayKey() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; }
function isTomorrow(event) { return dateKey(eventDateValue(event)) === tomorrowKey(); }
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
  const message = 'A Bee there segít, hogy jól érezd magad bármikor, bárkivel.';
  outroMessage.replaceChildren();
  let letterIndex = 0;
  const parts = message.split(/(\s+)/);
  parts.forEach(part => {
    if (/^\s+$/.test(part)) {
      outroMessage.append(document.createTextNode(' '));
      return;
    }
    const word = document.createElement('span');
    word.className = 'outro-word';
    [...part].forEach(character => {
      const letter = document.createElement('span');
      letter.className = 'outro-letter';
      if (part === 'Bee' || part === 'there') letter.classList.add('brand-letter');
      letter.textContent = character;
      letter.style.animationDelay = `${letterIndex * 0.085}s`;
      letterIndex += 1;
      word.append(letter);
    });
    outroMessage.append(word);
  });
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return new Set();
    return new Set(saved.filter(value => typeof value === 'string' && value.length <= 800).slice(0, MAX_FAVORITES));
  }
  catch (error) { console.warn('[Bee There] A kedvencek nem olvashatók:', error); return new Set(); }
}

function saveFavorites() {
  try {
    const saved = [...favoriteIds].filter(value => typeof value === 'string' && value.length <= 800).slice(0, MAX_FAVORITES);
    favoriteIds = new Set(saved);
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(saved));
  }
  catch (error) { console.warn('[Bee There] A kedvencek nem menthetők:', error); }
}

function loadFavoriteNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_NOTES_STORAGE_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved)
      .filter(([key, value]) => typeof key === 'string' && key.length <= 800 && typeof value === 'string')
      .slice(0, MAX_FAVORITES)
      .map(([key, value]) => [key, value.slice(0, 5000)]));
  } catch (error) {
    console.warn('[Bee There] A kedvencek jegyzetei nem olvashatók:', error);
    return {};
  }
}

function saveFavoriteNotes() {
  try {
    localStorage.setItem(FAVORITE_NOTES_STORAGE_KEY, JSON.stringify(favoriteNotes));
  } catch (error) {
    console.warn('[Bee There] A kedvencek jegyzetei nem menthetők:', error);
  }
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

function moveGooeyFilter(button, bar = filterBar) {
  const gooey = find('.gooey-filter', bar);
  if (!gooey || !button || !bar) return;
  const barBounds = bar.getBoundingClientRect();
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

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function eventSearchableText(event) {
  return normalizedText([event.Title, event.Description, event['Long description'], event.Category, event.Location].join(' '));
}

function distancePreferencePoints(distance) {
  if (!Number.isFinite(distance)) return 0;
  const limits = selectedTransport === 'walk' ? [1.5, 3, 5] : selectedTransport === 'transit' ? [5, 15, 30] : [10, 30, 60];
  if (distance <= limits[0]) return 3;
  if (distance <= limits[1]) return 2;
  if (distance <= limits[2]) return 1;
  return 0;
}

function eventMoodMatches(event, selectedMoods) {
  if (!selectedMoods.length) return false;
  const text = eventSearchableText(event);
  const moodKeywords = {
    alkotos: ['alkot', 'kezmuves', 'workshop', 'fest', 'kultura'],
    onfeledt: ['buli', 'party', 'koncert', 'tanc', 'fesztival'],
    utos: ['techno', 'rock', 'koncert', 'meccs', 'sport', 'party'],
    vicces: ['humor', 'vicces', 'stand-up', 'stand up', 'comedy'],
    porgos: ['party', 'dj', 'tanc', 'sport', 'futas', 'verseny'],
    szabad: ['szabadter', 'open air', 'park', 'tura', 'kirandulas'],
    izes: ['gasztro', 'etel', 'kostolo', 'vacsora', 'bor', 'sor'],
    inspiralo: ['kultura', 'kiallitas', 'muzeum', 'eloadas', 'workshop'],
    energikus: ['sport', 'party', 'fitness', 'futas', 'tanc']
  };
  return selectedMoods.some(mood => (moodKeywords[normalizedText(mood)] || []).some(keyword => text.includes(keyword)));
}

function eventCompanionMatches(event, companions) {
  if (!companions.length) return false;
  const text = eventSearchableText(event);
  const categories = eventCategories(event);
  const matches = {
    egyedul: ['kultura', 'sport', 'muzeum', 'kiallitas', 'workshop'],
    parban: ['romantika', 'gasztro', 'kultura', 'vacsora'],
    baratokkal: ['party', 'sport', 'gasztro', 'koncert', 'fesztival'],
    csaladdal: ['csaladi', 'gyerek', 'csalad']
  };
  return companions.some(companion => (matches[normalizedText(companion)] || []).some(value => categories.includes(value) || text.includes(value)));
}

function eventPriceValue(event) {
  if (isFree(event)) return 0;
  const digits = String(event.Price || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

function eventTimeMatches(event, choices) {
  if (!choices.length) return false;
  const key = dateKey(eventDateValue(event));
  const eventDate = key ? new Date(`${key}T00:00:00`) : null;
  const day = eventDate?.getDay();
  const hour = Number.parseInt(String(event.Time || event['Date and Time'] || '').match(/(?:^|\s)(\d{1,2}):\d{2}/)?.[1] || '', 10);
  return choices.some(choice => (
    (choice === 'weekday' && Number.isInteger(day) && day >= 1 && day <= 5) ||
    (choice === 'weekend' && (day === 0 || day === 6)) ||
    (choice === 'afternoon' && Number.isFinite(hour) && hour >= 12 && hour < 18) ||
    (choice === 'evening' && Number.isFinite(hour) && hour >= 18)
  ));
}

function eventSpontaneityMatches(event, choice) {
  if (!choice) return false;
  const key = dateKey(eventDateValue(event));
  if (!key) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAway = Math.round((new Date(`${key}T00:00:00`) - today) / 86400000);
  if (choice === 'now') return daysAway >= 0 && daysAway <= 1;
  if (choice === 'week') return daysAway >= 0 && daysAway <= 7;
  return choice === 'plan' && daysAway > 7;
}

function eventPreferenceScore(event, distance, favoriteCategories = new Set()) {
  let score = distancePreferencePoints(distance);
  const categories = eventCategories(event);
  if (profilePreferences.categories.some(category => categories.includes(category))) score += 3;
  if (eventMoodMatches(event, profilePreferences.moods)) score += 2;
  if (eventCompanionMatches(event, profilePreferences.companions)) score += 1;
  const budget = Number(profilePreferences.budget);
  if (Number.isFinite(budget) && budget < 20000) {
    const price = eventPriceValue(event);
    if (Number.isFinite(price)) score += Math.max(0, 1 - Math.abs(price - budget) / Math.max(budget, 1000));
  }
  if (eventTimeMatches(event, profilePreferences.times)) score += 1;
  if (eventSpontaneityMatches(event, profilePreferences.spontaneity)) score += 1;
  if (categories.some(category => favoriteCategories.has(category))) score += 1;
  return score;
}

function sortByDistance(list) {
  const favoriteCategories = new Set(events.filter(item => favoriteIds.has(eventKey(item))).flatMap(eventCategories));
  return list.map(event => {
    const distance = eventDistance(event);
    return { ...event, distance, preferenceScore: eventPreferenceScore(event, distance, favoriteCategories) };
  }).sort((first, second) => second.preferenceScore - first.preferenceScore || first.distance - second.distance || dateKey(eventDateValue(first)).localeCompare(dateKey(eventDateValue(second))));
}

function closestCity(coords) {
  return CITIES.reduce((closest, city) => {
    const distance = haversineKm(coords.latitude, coords.longitude, city.latitude, city.longitude);
    return !closest || distance < closest.distance ? { ...city, distance } : closest;
  }, null);
}

function updateCityUI(name) {
  selectedCity = name || '';
  if (citySelectorLabel) citySelectorLabel.textContent = name || 'Engedélyezés';
  if (locationText) locationText.textContent = name ? `${name} - távolság szerint rendezve` : 'Helyzeted meghatározása…';
  findAll('.city-option').forEach(button => button.classList.toggle('active', button.dataset.city === name));
  updateProfileSummary();
}

function updateProfileSummary() {
  if (profileCity) profileCity.textContent = selectedCity || 'Válassz várost';
}

function moveFavoritesToOwnView() {
  if (favoritesView && favoritesSection && favoritesSection.parentElement !== favoritesView) favoritesView.append(favoritesSection);
}

function appViewFromUrl() {
  const value = new URLSearchParams(window.location.search).get('view');
  if (value === 'send') return 'permanent';
  return ['search', 'permanent', 'favorites', 'profile'].includes(value) ? value : 'home';
}

function applyAppView(view, { scroll = true } = {}) {
  currentAppView = ['search', 'permanent', 'favorites', 'profile'].includes(view) ? view : 'home';
  const isHome = currentAppView === 'home';
  homeContent.forEach(element => { element.hidden = !isHome; });
  const views = { search: searchView, permanent: permanentView, favorites: favoritesView, profile: profileView };
  Object.entries(views).forEach(([name, element]) => { if (element) element.hidden = name !== currentAppView; });
  findAll('.bottom-nav-button', bottomNavigation).forEach(button => {
    const active = button.dataset.appView === currentAppView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (currentAppView === 'permanent') renderPermanent();
  if (currentAppView === 'favorites') renderFavorites();
  if (currentAppView === 'search') renderSearchResults(searchInput?.value || '');
  updateProfileSummary();
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
}

function navigateToAppView(view) {
  const url = new URL(window.location.href);
  if (view === 'home') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  history.pushState({}, '', url);
  applyAppView(view);

}

function renderPermanent() {
  if (!permanentGrid) return;
  if (permanentEvents.length) renderCardsIncrementally(permanentGrid, position ? sortByDistance(permanentEvents) : permanentEvents);
  else permanentGrid.innerHTML = '<p class="app-view-empty">Hamarosan új állandó lehetőségekkel várunk.</p>';
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshteinDistance(first, second) {
  const source = String(first || '');
  const target = String(second || '');
  if (!source) return target.length;
  if (!target) return source.length;
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    const current = [sourceIndex];
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      current[targetIndex] = Math.min(
        current[targetIndex - 1] + 1,
        previous[targetIndex] + 1,
        previous[targetIndex - 1] + (source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[target.length];
}

function numericPrice(event) {
  if (isFree(event)) return 0;
  const digits = String(event.Price || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

function queryRelevance(event, normalizedQuery, queryWords) {
  const title = normalizeSearchText(event.Title);
  const titleWords = title.split(' ').filter(Boolean);
  const searchableDetails = normalizeSearchText([
    event.Description,
    event['Long description'],
    event.Location,
    event.Price,
    event['Age Requirement'],
    eventCategories(event).join(' ')
  ].join(' '));
  const wordScore = queryWords.reduce((score, queryWord) => {
    const closestWord = titleWords.reduce((closest, titleWord) => Math.min(closest, levenshteinDistance(queryWord, titleWord)), Infinity);
    const likeness = Math.max(0, 1 - closestWord / Math.max(queryWord.length, 1));
    return score + likeness;
  }, 0);
  const wholeTitleScore = normalizedQuery
    ? Math.max(0, 1 - levenshteinDistance(normalizedQuery, title) / Math.max(normalizedQuery.length, title.length, 1))
    : 0;
  const exactTitleBonus = title === normalizedQuery ? 500 : title.includes(normalizedQuery) ? 250 : 0;
  const detailMatches = queryWords.filter(word => searchableDetails.includes(word)).length;
  return exactTitleBonus + wordScore * 18 + wholeTitleScore * 12 + detailMatches * 3;
}

function eventRelatedness(event, anchor) {
  if (!anchor || event === anchor) return 0;
  const sharedCategories = eventCategories(event).filter(category => eventCategories(anchor).includes(category)).length;
  const eventPrice = numericPrice(event);
  const anchorPrice = numericPrice(anchor);
  let priceScore = 0;
  if (eventPrice !== null && anchorPrice !== null) {
    priceScore = eventPrice === anchorPrice ? 5 : Math.max(0, 4 - Math.abs(eventPrice - anchorPrice) / 5000);
  }
  const ageScore = event['Age Requirement'] && event['Age Requirement'] === anchor['Age Requirement'] ? 2 : 0;
  const locationScore = event.Location && event.Location === anchor.Location ? 2 : 0;
  return sharedCategories * 12 + priceScore + ageScore + locationScore;
}

function rankedSearchEvents(query) {
  const normalizedQuery = normalizeSearchText(query);
  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  const uniqueEvents = [...events, ...permanentEvents].filter((event, index, list) =>
    list.findIndex(candidate => eventKey(candidate) === eventKey(event)) === index
  );
  const scored = uniqueEvents.map((event, index) => ({ event, index, queryScore: queryRelevance(event, normalizedQuery, queryWords) }));
  scored.sort((first, second) => second.queryScore - first.queryScore || first.index - second.index);
  const anchor = scored[0]?.event;
  return scored
    .map(item => ({ ...item, finalScore: item.queryScore * 5 + eventRelatedness(item.event, anchor) }))
    .sort((first, second) => second.finalScore - first.finalScore || first.index - second.index)
    .map(item => item.event);
}

function renderSearchResults(query) {
  if (!searchResults) return;
  const term = normalizeSearchText(query);
  if (!term) {
    searchResults.innerHTML = '<p class="app-view-empty">Kezdd el beírni az esemény nevét.</p>';
    return;
  }
  const ranked = rankedSearchEvents(query);
  const directMatches = ranked.filter(event => normalizeSearchText(event.Title).includes(term));
  searchResults.replaceChildren();
  if (!directMatches.length) {
    const empty = document.createElement('p');
    empty.className = 'app-view-empty search-empty-message';
    empty.textContent = 'Nem találtunk ilyen nevű eseményt.';
    searchResults.append(empty);
  }
  const section = document.createElement('section');
  section.className = 'search-suggestions';
  section.setAttribute('aria-label', 'Eseményjavaslatok');
  const heading = document.createElement('p');
  heading.className = 'search-suggestions-title';
  heading.textContent = directMatches.length ? 'Legjobb találatok:' : 'Lehet, hogy ezekre gondoltál:';
  const list = document.createElement('div');
  list.className = 'search-suggestions-list';
  ranked.slice(0, Math.min(5, ranked.length)).forEach(event => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-suggestion';
    const title = document.createElement('strong');
    title.textContent = event.Title;
    const details = document.createElement('span');
    details.textContent = `${eventDateOnly(event)} · ${event.Location || 'Helyszín hamarosan'}`;
    button.append(title, details);
    button.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = event.Title;
      searchInput.focus();
      renderSearchResults(event.Title);
    });
    list.append(button);
  });
  section.append(heading, list);
  searchResults.append(section);
  const relatedHeading = document.createElement('p');
  relatedHeading.className = 'search-related-title';
  relatedHeading.textContent = 'Kapcsolódó események';
  const rail = document.createElement('div');
  rail.className = 'events-grid event-carousel search-related-events';
  rail.tabIndex = 0;
  rail.setAttribute('aria-label', 'Kapcsolódó események');
  searchResults.append(relatedHeading, rail);
  renderCardsIncrementally(rail, ranked.slice(0, 12));
}

function setupAppNavigation() {
  moveFavoritesToOwnView();
  findAll('.bottom-nav-button', bottomNavigation).forEach(button => button.addEventListener('click', () => {
    navigateToAppView(button.dataset.appView || 'home');
    vibrate(10);
  }));
  findAll('[data-app-view-link]').forEach(link => link.addEventListener('click', event => {
    const view = link.dataset.appViewLink || 'home';
    if (view !== 'home') {
      event.preventDefault();
      navigateToAppView(view);
    }
  }));
  if (searchInput) searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
  window.addEventListener('popstate', () => {
    const view = appViewFromUrl();
    applyAppView(view, { scroll: false });

  });
  const initialView = appViewFromUrl();
  applyAppView(initialView, { scroll: false });

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
  const isNearby = Number.isFinite(distance) && distance <= 10;
  card.classList.toggle('is-nearby', isNearby);
  find('.event-location', card)?.classList.toggle('is-nearby', isNearby);
  find('.distance-pill', card)?.classList.toggle('is-nearby', isNearby);
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
  carousel.addEventListener('pointermove', event => {
    if (!isDragging) return;
    event.preventDefault();
    carousel.scrollLeft = startScrollLeft - (event.clientX - startX);
  });
  const stopDragging = () => { isDragging = false; carousel.classList.remove('is-dragging'); };
  carousel.addEventListener('pointerup', stopDragging);
  carousel.addEventListener('pointercancel', stopDragging);

  const updateReturnButton = () => {
    const overflow = carousel.scrollWidth - carousel.clientWidth;
    const atEnd = carousel._hasMultipleCards && overflow > 36 && carousel.scrollLeft >= overflow - 28;
    returnButton.hidden = !atEnd;
  };
  carousel._updateReturnButton = updateReturnButton;
  carousel.addEventListener('scroll', updateReturnButton, { passive: true });
  window.requestAnimationFrame(updateReturnButton);
}

function scrollCarousel(carousel, direction) {
  if (!carousel) { console.warn('[Bee There] A lapozható eseménysáv nem található.'); return; }
  carousel.scrollBy({ left: direction * carousel.clientWidth * 0.82, behavior: 'smooth' });
}

function attachCarouselControls(scope = document) {
  findAll('.carousel-arrow', scope).forEach(button => {
    if (button.dataset.controlReady === 'true') return;
    button.dataset.controlReady = 'true';
    button.addEventListener('click', () => {
      const carousel = button.dataset.carouselTarget ? document.getElementById(button.dataset.carouselTarget) : null;
      triggerBounce(button);
      vibrate(10);
      scrollCarousel(carousel, button.dataset.direction === 'prev' ? -1 : 1);
    });
  });
}

function closeEventDetails() {
  if (!eventDetailsDialog) return;
  const detailsWindow = find('.event-details-window', eventDetailsDialog);
  eventDetailsDialog.hidden = true;
  if (detailsWindow) {
    detailsWindow.style.removeProperty('top');
    detailsWindow.style.removeProperty('left');
  }
  document.body.classList.remove('has-open-dialog');
  const url = new URL(window.location.href);
  if (url.searchParams.has('event')) {
    url.searchParams.delete('event');
    history.replaceState({}, '', url);
  }
}

function openEventDetails(event, triggerButton, { updateUrl = true } = {}) {
  if (!eventDetailsDialog) return;
  const detailsWindow = find('.event-details-window', eventDetailsDialog);
  if (!detailsWindow) return;
  setText('#event-details-date', eventDateOnly(event), document);
  setText('#event-details-location', event.Location || 'Helyszín hamarosan', document);
  setText('#event-details-title', event.Title || 'Esemény', document);
  setText('#event-details-time', event.Time || (event.Permanent ? 'Nyitvatartás és szabad időpontok a szolgáltatónál.' : event['Date and Time'] || 'Időpont nincs megadva'), document);
  setText('#event-details-description', event['Long Description'] || event['Long description'] || event.Description || 'További részletek hamarosan.', document);
  const imageUrl = optimizedImageUrl(event['Header Image']);
  if (eventDetailsImage && eventDetailsImageWrap) {
    eventDetailsImageWrap.hidden = !imageUrl;
    if (imageUrl) {
      eventDetailsImage.src = imageUrl;
      eventDetailsImage.alt = event.Title ? `${event.Title} eseményképe` : 'Esemény képe';
    } else {
      eventDetailsImage.removeAttribute('src');
    }
  }
  if (eventDetailsWeather) { eventDetailsWeather.hidden = Boolean(event.Permanent); eventDetailsWeather.textContent = 'Időjárás betöltése…'; }
  const ticketUrl = safeUrl(event['Ticket Link']);
  if (eventDetailsTicket) {
    const free = isFree(event) && !(event.Permanent && ticketUrl);
    eventDetailsTicket.hidden = !ticketUrl && !free;
    eventDetailsTicket.classList.toggle('is-free', free);
    if (free) {
      eventDetailsTicket.textContent = 'Ingyenes';
      eventDetailsTicket.removeAttribute('href');
      eventDetailsTicket.removeAttribute('target');
    } else if (ticketUrl) {
      eventDetailsTicket.textContent = event.Permanent ? 'Foglalás ↗' : 'Jegyvásárlás ↗';
      eventDetailsTicket.href = ticketUrl;
      eventDetailsTicket.target = '_blank';
    }
  }
  if (eventDetailsShare) eventDetailsShare.onclick = () => shareEvent(event);
  if (updateUrl) history.replaceState({}, '', eventShareUrl(event));
  eventDetailsDialog.hidden = false;
  document.body.classList.add('has-open-dialog');
  if (!event.Permanent) fetchWeatherForEvent(Number(event.Latitude), Number(event.Longitude), eventDateValue(event)).then(value => {
    if (eventDetailsWeather) eventDetailsWeather.textContent = `Várható időjárás: ${value}`;
  });
}

function setupEventDetailsDialog() {
  if (eventDetailsClose) eventDetailsClose.addEventListener('click', closeEventDetails);
  if (eventDetailsDialog) eventDetailsDialog.addEventListener('click', event => { if (event.target === eventDetailsDialog) closeEventDetails(); });
  if (eventDetailsTicket) eventDetailsTicket.addEventListener('click', () => triggerBounce(eventDetailsTicket));
}

function setupNavigationMenu() {
  if (!navMenu || !navMenuToggle) return;
  const closeMenu = () => {
    navMenu.hidden = true;
    navMenuToggle.setAttribute('aria-expanded', 'false');
  };
  navMenuToggle.addEventListener('click', event => {
    event.stopPropagation();
    const opening = navMenu.hidden;
    navMenu.hidden = !opening;
    navMenuToggle.setAttribute('aria-expanded', String(opening));
    if (opening) vibrate(10);
  });
  findAll('a', navMenu).forEach(link => link.addEventListener('click', closeMenu));
  window.addEventListener('click', event => {
    if (!navMenu.hidden && !navMenu.contains(event.target) && event.target !== navMenuToggle && !navMenuToggle.contains(event.target)) closeMenu();
  });
}

function closeInlineDetails(card) {
  const panel = find('.inline-details', card);
  const button = find('.details-button', card);
  if (panel) panel.hidden = true;
  if (button) {
    button.textContent = 'Részletek';
    button.setAttribute('aria-expanded', 'false');
  }
  card?.classList.remove('expanded');
}

function openInlineDetails(card, event, button) {
  const panel = find('.inline-details', card);
  if (!panel || !button) return;
  const opening = panel.hidden;
  findAll('.event-card.expanded').forEach(openCard => { if (openCard !== card) closeInlineDetails(openCard); });
  if (!opening) {
    closeInlineDetails(card);
    positionDetailsButton(card);
    return;
  }
  card.classList.add('expanded');
  panel.hidden = false;
  button.textContent = 'Bezárás';
  button.setAttribute('aria-expanded', 'true');
  const weather = find('.inline-details-weather', card);
  if (weather) weather.textContent = 'Időjárás betöltése…';
  fetchWeatherForEvent(Number(event.Latitude), Number(event.Longitude), eventDateValue(event)).then(value => {
    if (weather) weather.textContent = `Várható időjárás: ${value}`;
  });
  window.requestAnimationFrame(() => positionDetailsButton(card));
}

function renderCard(event, target, { compact = false } = {}) {
  if (!template || !template.content || !target) { console.warn('[Bee There] Az eseménykártya sablonja vagy célhelye hiányzik.'); return; }
  const fragment = template.content.cloneNode(true);
  const card = find('.event-card', fragment);
  const image = find('.event-image', fragment);
  const placeholder = find('.image-placeholder', fragment);
  const imageUrl = optimizedImageUrl(event['Header Image']);
  const key = eventKey(event);
  const latitude = Number(event.Latitude);
  const longitude = Number(event.Longitude);

  if (card) {
    if (compact) card.classList.add('compact');
    card.dataset.eventKey = key;
    card.dataset.latitude = String(latitude);
    card.dataset.longitude = String(longitude);
  }
  setText('.placeholder-title', event.Title || 'Esemény', fragment);
  if (imageUrl && image) {
    image.src = imageUrl;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = event.Title || 'Esemény képe';
    if (placeholder) placeholder.hidden = true;
    image.addEventListener('error', () => { image.remove(); if (placeholder) placeholder.hidden = false; }, { once: true });
  } else if (image) image.remove();

  if (card) setCardDistance(card, latitude, longitude);
  find('.event-date', fragment)?.classList.toggle('is-urgent', isWithinNextDays(event));
  setText('.event-date-value', eventDateOnly(event), fragment);
  setText('.event-location-value', event.Location || 'Helyszín hamarosan', fragment);
  setText('.event-title', event.Title || 'Névtelen esemény', fragment);
  setText('.event-description', event.Description || 'Részletek hamarosan.', fragment);
  setText('.category-badge', eventCategories(event)[0] || 'program', fragment);
  setText('.price-badge', event.Price || 'Ár nincs megadva', fragment);
  setText('.age-badge', event['Age Requirement'] || 'Korhatár nincs megadva', fragment);
  setText('.inline-date-value', eventDateOnly(event), fragment);
  setText('.inline-location-value', event.Location || 'Helyszín hamarosan', fragment);
  setText('.inline-details-title', event.Title || 'Esemény', fragment);
  setText('.inline-details-time', event.Time || event['Date and Time'] || 'Időpont nincs megadva', fragment);
  setText('.inline-details-description', event['Long Description'] || event['Long description'] || event.Description || 'További részletek hamarosan.', fragment);
  const inlineTicket = find('.inline-details-ticket', fragment);
  const inlineTicketUrl = safeUrl(event['Ticket Link']);
  if (inlineTicket) {
    inlineTicket.hidden = !inlineTicketUrl || (isFree(event) && !event.Permanent);
    inlineTicket.textContent = event.Permanent ? "Foglalás ↗" : "Jegyvásárlás ↗";
    if (inlineTicketUrl && (!isFree(event) || event.Permanent)) inlineTicket.href = inlineTicketUrl;
  }

  const detailsButton = find('.details-button', fragment);
  if (detailsButton) detailsButton.addEventListener('click', () => {
    triggerBounce(detailsButton);
    openEventDetails(event, detailsButton);
  });

  const favoriteButton = find('.favorite-button', fragment);
  if (favoriteButton) {
    favoriteButton.dataset.eventKey = key;
    syncFavoriteButton(favoriteButton, favoriteIds.has(key));
    favoriteButton.addEventListener('click', () => {
      if (favoriteIds.has(key)) {
        favoriteIds.delete(key);
        delete favoriteNotes[key];
        saveFavoriteNotes();
      } else favoriteIds.add(key);
      saveFavorites();
      triggerBounce(favoriteButton);
      vibrate(18);
      updateFavoriteButtons();
      renderFavorites();
    });
  }
  if (event.Permanent && card) {
    if (!event['Age Requirement']) find('.age-badge', card).hidden = true;
    const bookingUrl = safeUrl(event['Ticket Link']);
    if (bookingUrl) {
      const booking = document.createElement('a');
      booking.className = 'ticket-button'; booking.href = bookingUrl;
      booking.target = '_blank'; booking.rel = 'noopener noreferrer';
      booking.textContent = 'Foglalás ↗';
      find('.event-bottom', card).append(booking);
    }
  }
  target.append(fragment);
  window.requestAnimationFrame(() => positionDetailsButton(card));
}

function syncFavoriteButton(button, isFavorite) {
  button.classList.toggle('is-favorite', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute('aria-label', isFavorite ? 'Kedvelés törlése' : 'Esemény kedvelése');
}

function updateFavoriteButtons() {
  findAll('.favorite-button[data-event-key]').forEach(button => syncFavoriteButton(button, favoriteIds.has(button.dataset.eventKey)));
}

const progressiveRenderTokens = new WeakMap();

function renderCardsIncrementally(target, items, options = {}) {
  if (!target) return;
  const token = {};
  const batchSize = 4;
  let nextIndex = 0;
  progressiveRenderTokens.set(target, token);
  target.replaceChildren();

  const renderBatch = () => {
    if (progressiveRenderTokens.get(target) !== token || !target.isConnected) return;
    const endIndex = Math.min(nextIndex + batchSize, items.length);
    for (; nextIndex < endIndex; nextIndex += 1) renderCard(items[nextIndex], target, options);
    if (nextIndex < items.length) {
      window.requestAnimationFrame(renderBatch);
      return;
    }
    setupCarousel(target);
    syncCarouselControls(target);
  };

  window.requestAnimationFrame(renderBatch);
}

function createEventGroup(target, title, items, id) {
  if (!target) return;
  const group = document.createElement('section');
  group.className = 'event-group';
  const emoji = EVENT_GROUP_EMOJIS[title] || '';
  group.innerHTML = `<div class="event-group-header"><h3>${title}${emoji ? ` <span class="event-group-emoji" aria-hidden="true">${emoji}</span>` : ''}</h3><div class="carousel-controls" aria-label="${title} lapozása"><button class="carousel-arrow" type="button" data-carousel-target="${id}" data-direction="prev" aria-label="Előző esemény">←</button><button class="carousel-arrow" type="button" data-carousel-target="${id}" data-direction="next" aria-label="Következő esemény">→</button></div></div><div id="${id}" class="events-grid event-carousel" tabindex="0" aria-label="${title}"></div>`;
  target.append(group);
  const carousel = find(`#${id}`, group);
  if (items.length) renderCardsIncrementally(carousel, items, { compact: true });
  else if (carousel) {
    carousel.innerHTML = '<div class="loading-card compact-empty">Ebben a kategóriában nincs ilyen esemény.</div>';
    setupCarousel(carousel);
    syncCarouselControls(carousel);
  }
  attachCarouselControls(group);
}

function renderFeatured() {
  if (!featuredGrid || !featuredSection) return;
  const featured = position
    ? sortByDistance(events.filter(isFeatured))
    : events.filter(isFeatured).sort((first, second) => (first['Date and Time'] || '').localeCompare(second['Date and Time'] || ''));
  featuredSection.hidden = !featured.length;
  featuredSection.setAttribute('aria-busy', 'false');
  if (featured.length) renderCardsIncrementally(featuredGrid, featured);
  else featuredGrid.replaceChildren();
}

function createFavoriteNoteCard(event) {
  const key = eventKey(event);
  const noteCard = document.createElement('article');
  noteCard.className = 'favorite-note-card';
  noteCard.innerHTML = `
    <header class="favorite-note-header">
      <div class="event-meta">
        <time class="event-date"><span class="event-meta-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01"/></svg></span><span class="favorite-note-date"></span></time>
        <span class="event-location"><span class="event-meta-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s6-4.5 6-10a6 6 0 1 0-12 0c0 5.5 6 10 6 10Z"/><circle cx="12" cy="11" r="2"/></svg></span><span class="favorite-note-location"></span></span>
      </div>
      <h3>Jegyzetek</h3>
    </header>
    <textarea class="favorite-note-input" maxlength="5000" aria-label="Jegyzet az eseményhez" placeholder="Írj ide bármit az eseményről…"></textarea>
    <footer class="favorite-note-footer">
      <div class="badges"><span class="badge favorite-note-category"></span><span class="badge favorite-note-price"></span><span class="badge favorite-note-age"></span></div>
      <button class="favorite-note-copy" type="button" aria-label="Jegyzet másolása" title="Jegyzet másolása">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
      </button>
    </footer>`;
  setText('.favorite-note-date', eventDateOnly(event), noteCard);
  setText('.favorite-note-location', event.Location || 'Helyszín hamarosan', noteCard);
  setText('.favorite-note-category', eventCategories(event)[0] || 'program', noteCard);
  setText('.favorite-note-price', event.Price || 'Ár nincs megadva', noteCard);
  setText('.favorite-note-age', event['Age Requirement'] || 'Korhatár nincs megadva', noteCard);
  const input = find('.favorite-note-input', noteCard);
  const copyButton = find('.favorite-note-copy', noteCard);
  if (input) {
    input.value = favoriteNotes[key] || '';
    if (copyButton) copyButton.disabled = !input.value.trim();
    input.addEventListener('input', () => {
      favoriteNotes[key] = input.value.slice(0, 5000);
      saveFavoriteNotes();
      if (copyButton) copyButton.disabled = !input.value.trim();
    });
  }
  if (copyButton && input) copyButton.addEventListener('click', async () => {
    const note = input.value.trim();
    if (!note) return;
    try {
      await navigator.clipboard.writeText(note);
    } catch {
      input.select();
      document.execCommand('copy');
      input.setSelectionRange(input.value.length, input.value.length);
    }
    copyButton.classList.add('is-copied');
    copyButton.setAttribute('aria-label', 'Jegyzet kimásolva');
    window.setTimeout(() => {
      copyButton.classList.remove('is-copied');
      copyButton.setAttribute('aria-label', 'Jegyzet másolása');
    }, 1400);
  });
  return noteCard;
}

function renderFavoritePair(event) {
  const pair = document.createElement('div');
  pair.className = 'favorite-pair';
  pair.tabIndex = 0;
  pair.setAttribute('aria-label', `${event.Title || 'Esemény'} és jegyzetei`);
  renderCard(event, pair);
  pair.append(createFavoriteNoteCard(event));
  favoritesGrid.append(pair);
}

function renderFavorites() {
  if (!favoritesGrid || !favoritesSection) return;
  const favorites = position
    ? sortByDistance([...events, ...permanentEvents].filter(event => favoriteIds.has(eventKey(event))))
    : [...events, ...permanentEvents].filter(event => favoriteIds.has(eventKey(event)));
  favoritesSection.hidden = currentAppView === 'favorites' ? false : !favorites.length;
  favoritesGrid.replaceChildren();
  if (favorites.length) favorites.forEach(renderFavoritePair);
  else favoritesGrid.innerHTML = '<p class="app-view-empty">Még nincs kedvelt eseményed. A szív ikonra nyomva bármelyik programot elmentheted ide.</p>';
  updateProfileSummary();
}

function setupQuickNavigation() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrowShortcutDate) tomorrowShortcutDate.textContent = String(tomorrow.getDate());
  if (tomorrowShortcut) {
    tomorrowShortcut.setAttribute('aria-label', `Ugrás a holnapi eseményekhez: ${tomorrow.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' })}`);
    tomorrowShortcut.addEventListener('click', () => {
      applyAppView('home', { scroll: false });
      if (events.some(isTomorrow)) {
        window.setTimeout(() => todaySection?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
        return;
      }
      const navigation = tomorrowShortcut.closest('.quick-navigation');
      const menuButton = find('.nav-menu-toggle', navigation);
      if (!navigation || !menuButton) return;
      window.clearTimeout(tomorrowFeedbackTimer);
      window.clearTimeout(tomorrowFeedbackCleanupTimer);
      const navigationBounds = navigation.getBoundingClientRect();
      const shortcutBounds = tomorrowShortcut.getBoundingClientRect();
      const menuBounds = menuButton.getBoundingClientRect();
      const message = find('.tomorrow-shortcut-message', tomorrowShortcut);
      const shortcutLeft = shortcutBounds.left - navigationBounds.left;
      const messageWidth = Math.ceil(message?.scrollWidth || 0);
      const minimumMessageWidth = 52 + messageWidth + 28;
      const availableWidth = Math.max(52, navigationBounds.width - shortcutLeft);
      const coveredControlsWidth = menuBounds.right - shortcutBounds.left;
      const expandedWidth = Math.min(availableWidth, Math.max(coveredControlsWidth, minimumMessageWidth));
      tomorrowShortcut.style.setProperty('--tomorrow-left', `${shortcutLeft}px`);
      tomorrowShortcut.style.setProperty('--tomorrow-expanded-width', `${expandedWidth}px`);
      tomorrowShortcut.classList.remove('is-closing');
      tomorrowShortcut.classList.add('is-empty-feedback');
      tomorrowShortcut.setAttribute('aria-label', 'Nincs holnap esemény');
      vibrate(10);
      tomorrowFeedbackTimer = window.setTimeout(() => {
        tomorrowShortcut.classList.remove('is-empty-feedback');
        tomorrowShortcut.classList.add('is-closing');
        tomorrowShortcut.setAttribute('aria-label', `Ugrás a holnapi eseményekhez: ${tomorrow.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' })}`);
        tomorrowFeedbackCleanupTimer = window.setTimeout(() => {
          tomorrowShortcut.classList.remove('is-closing');
          tomorrowShortcut.style.removeProperty('--tomorrow-left');
          tomorrowShortcut.style.removeProperty('--tomorrow-expanded-width');
        }, 700);
      }, 2000);
    });
  }
}

function renderToday() {
  if (!todayGrid || !todaySection) return;
  const todayEvents = events.filter(isTomorrow);
  const visibleToday = position ? sortByDistance(todayEvents) : todayEvents;
  todaySection.hidden = !visibleToday.length;
  if (!visibleToday.length) { todayGrid.replaceChildren(); return; }
  renderCardsIncrementally(todayGrid, visibleToday, { compact: true });
}

function calendarEventsForSelection() {
  return events
    .filter(event => (!calendarCategory || eventCategories(event).includes(calendarCategory)))
    .filter(event => !calendarSelectedDate || dateKey(eventDateValue(event)) === calendarSelectedDate);
}

function renderCalendarEvents() {
  if (!calendarEvents) return;
  calendarEvents.replaceChildren();
  if (!calendarSelectedDate) {
    calendarEvents.innerHTML = '<p class="calendar-empty">Válassz egy lila jelölésű napot a programok megtekintéséhez.</p>';
    return;
  }
  const selectedEvents = position ? sortByDistance(calendarEventsForSelection()) : calendarEventsForSelection();
  if (!selectedEvents.length) {
    calendarEvents.innerHTML = '<p class="calendar-empty">Erre a napra nincs a kiválasztott kategóriába tartozó esemény.</p>';
    return;
  }
  const rail = document.createElement('div');
  rail.className = 'events-grid event-carousel';
  rail.tabIndex = 0;
  rail.setAttribute('aria-label', 'Kiválasztott napi események');
  calendarEvents.append(rail);
  renderCardsIncrementally(rail, selectedEvents, { compact: true });
}

function renderCalendar() {
  if (!calendarGrid || !calendarMonthLabel) return;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const categoryEvents = events.filter(event => !calendarCategory || eventCategories(event).includes(calendarCategory));
  const datesWithEvents = new Set(categoryEvents.map(event => dateKey(eventDateValue(event))).filter(Boolean));
  calendarMonthLabel.textContent = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(calendarMonth);
  calendarGrid.replaceChildren();
  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement('span');
    blank.className = 'calendar-day empty';
    calendarGrid.append(blank);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.textContent = String(day);
    button.setAttribute('role', 'gridcell');
    if (datesWithEvents.has(key)) {
      button.classList.add('has-events');
      button.setAttribute('aria-label', `${day}. nap, eseményekkel`);
      button.addEventListener('click', () => {
        calendarSelectedDate = key;
        renderCalendar();
        vibrate(12);
      });
    } else button.setAttribute('aria-disabled', 'true');
    if (key === todayKey()) button.classList.add('today');
    if (calendarSelectedDate === key) button.classList.add('selected');
    calendarGrid.append(button);
  }
  renderCalendarEvents();
}

function createCalendarFilters() {
  if (!calendarFilters) return;
  calendarFilters.replaceChildren();
  CATEGORIES.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.innerHTML = `<span>${category}</span><span class="filter-emoji" aria-hidden="true">${CATEGORY_EMOJIS[category]}</span>`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const isSecondClick = calendarCategory === category;
      calendarCategory = isSecondClick ? '' : category;
      calendarSelectedDate = '';
      findAll('.filter-button', calendarFilters).forEach(filter => {
        const active = filter === button && Boolean(calendarCategory);
        filter.classList.toggle('active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      calendarFilters.classList.toggle('has-selection', Boolean(calendarCategory));
      const gooey = find('.gooey-filter', calendarFilters);
      if (isSecondClick && gooey) {
        gooey.hidden = true;
        gooey.style.removeProperty('left');
        gooey.style.removeProperty('top');
        gooey.style.removeProperty('width');
        gooey.style.removeProperty('height');
      } else if (calendarCategory) moveGooeyFilter(button, calendarFilters);
      renderCalendar();
      vibrate(10);
    });
    calendarFilters.append(button);
  });
  const gooey = document.createElement('span');
  gooey.className = 'gooey-filter';
  gooey.hidden = true;
  calendarFilters.append(gooey);
}

async function shareEvent(event) {
  const url = eventShareUrl(event);
  const data = { title: event.Title || 'Bee there esemény', text: `${event.Title || 'Esemény'} – ${eventDateOnly(event)}`, url };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      if (eventDetailsShare) {
        eventDetailsShare.classList.add('is-copied');
        eventDetailsShare.setAttribute('aria-label', 'Link kimásolva');
        window.setTimeout(() => { eventDetailsShare?.classList.remove('is-copied'); eventDetailsShare?.setAttribute('aria-label', 'Esemény megosztása'); }, 1800);
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') console.warn('[Bee There] A megosztás nem sikerült:', error);
  }
}

function setupCalendar() {
  createCalendarFilters();
  if (calendarPrevious) calendarPrevious.addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    calendarSelectedDate = '';
    renderCalendar();
  });
  if (calendarNext) calendarNext.addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    calendarSelectedDate = '';
    renderCalendar();
  });
  renderCalendar();
}

function renderEvents() {
  if (!grid || !allSection) return;
  grid.replaceChildren();
  renderFeatured();
  renderCalendar();
  renderPermanent();
  if (!position) {
    allSection.hidden = false;
    if (filterBar) filterBar.hidden = true;
    grid.innerHTML = '<div class="location-empty">Válassz várost az események megtekintéséhez.</div>';
    renderFavorites();
    renderToday();
    return;
  }

  allSection.hidden = false;
  if (filterBar) filterBar.hidden = false;
  const visible = sortByDistance(events).filter(event => !selectedCategory || eventCategories(event).includes(selectedCategory));
  if (!visible.length) {
    grid.innerHTML = '<div class="loading-card">Nincs a kiválasztott kategóriához illő esemény.</div>';
  } else {
    createEventGroup(grid, 'Ingyenes események', visible.filter(isFree), 'free-events');
    createEventGroup(grid, 'Fizetős események', visible.filter(event => !isFree(event)), 'paid-events');
  }
  renderFavorites();
  renderToday();
}

function createFilters() {
  if (!filterBar) return;
  filterBar.replaceChildren();
  CATEGORIES.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span>${category}</span><span class="filter-emoji" aria-hidden="true">${CATEGORY_EMOJIS[category]}</span>`;
    button.className = 'filter-button';
    button.addEventListener('click', () => {
      const isSecondClick = activeFilterButton === button;
      selectedCategory = isSecondClick ? '' : category;
      activeFilterButton = isSecondClick ? null : button;
      findAll('.filter-button', filterBar).forEach(filter => {
        const isActive = filter === activeFilterButton;
        filter.classList.toggle('active', isActive);
        filter.setAttribute('aria-pressed', String(isActive));
      });
      filterBar.classList.toggle('has-selection', Boolean(selectedCategory));
      const gooey = find('.gooey-filter', filterBar);
      if (isSecondClick && gooey) {
        gooey.hidden = true;
        gooey.style.removeProperty('left');
        gooey.style.removeProperty('top');
        gooey.style.removeProperty('width');
        gooey.style.removeProperty('height');
      } else if (selectedCategory) moveGooeyFilter(button);
      vibrate(10);
      renderEvents();
    });
    button.dataset.category = category;
    filterBar.append(button);
  });
  const gooey = document.createElement('span');
  gooey.className = 'gooey-filter';
  gooey.hidden = true;
  filterBar.append(gooey);
}

function setCity(city, isManual = false) {
  if (!city) return;
  position = { latitude: city.latitude, longitude: city.longitude };
  updateCityUI(city.name, isManual);
  updateDistanceValues();
  updateOutroWeather();
  renderEvents();
}

function openCityDialog() {
  if (!cityDialog) return;
  if (typeof cityDialog.showModal === 'function') cityDialog.showModal();
  else cityDialog.setAttribute('open', '');
}

function closeCityDialog() {
  if (!cityDialog) return;
  if (typeof cityDialog.close === 'function') cityDialog.close();
  else cityDialog.removeAttribute('open');
}

function setupCityChooser() {
  if (citySelector) citySelector.addEventListener('click', () => { triggerBounce(citySelector); vibrate(10); openCityDialog(); });
  if (profileCityButton) profileCityButton.addEventListener('click', () => { vibrate(10); openCityDialog(); });
  if (cityDialogClose) cityDialogClose.addEventListener('click', closeCityDialog);
  if (cityDialog) cityDialog.addEventListener('click', event => { if (event.target === cityDialog) closeCityDialog(); });
  findAll('.city-option').forEach(button => button.addEventListener('click', () => {
    const city = CITIES.find(item => item.name === button.dataset.city);
    triggerBounce(button);
    vibrate(14);
    setCity(city, true);
    closeCityDialog();
  }));
}

function initPixelBlast() {
  if (!pixelBlast) return;
  const context = pixelBlast.getContext('2d');
  if (!context) { console.warn('[Bee There] A PixelBlast háttér nem indítható.'); return; }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  const ripples = [];
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    pixelBlast.width = Math.round(width * dpr);
    pixelBlast.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = time => {
    context.clearRect(0, 0, width, height);
    const spacing = 16;
    const pixelSize = 7;
    const columns = Math.ceil(width / spacing);
    const rows = Math.ceil(height / spacing);
    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      if (time - ripples[index].started > 2300) ripples.splice(index, 1);
    }
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const pixelX = x * spacing + spacing / 2;
        const pixelY = y * spacing + spacing / 2;
        const nx = x / columns;
        const ny = y / rows;
        const topRightGlow = Math.exp(-(((nx - 0.88) ** 2) / 0.2 + ((ny - 0.16) ** 2) / 0.16));
        const transitionBand = Math.exp(-(((ny - 0.64) ** 2) / 0.012));
        const waveA = (Math.sin(x * 0.32 - y * 0.19 + time * 0.00028) + 1) / 2;
        const waveB = (Math.sin(x * 0.12 + y * 0.46 - time * 0.00019) + 1) / 2;
        const sparkle = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const blink = (Math.sin(time * 0.0016 + x * 1.71 + y * 2.33) + 1) / 2;
        const rippleStrength = ripples.reduce((sum, ripple) => {
          const age = (time - ripple.started) / 1000;
          const distance = Math.hypot(pixelX - ripple.x, pixelY - ripple.y);
          const radius = age * 290;
          const ringWidth = 16 + age * 17;
          return sum + Math.exp(-(((distance - radius) / ringWidth) ** 2)) * Math.max(0, 1 - age / 2.3);
        }, 0);
        const bandStrength = transitionBand * (0.08 + waveA * waveB * 0.18);
        const sparseStrength = sparkle > 0.82 ? (sparkle - 0.81) * (0.25 + blink * 0.75) : 0;
        const strength = Math.max(topRightGlow * (0.08 + waveA * 0.18), bandStrength, sparseStrength, rippleStrength * (0.48 + waveA * 0.52));
        if (strength < 0.045) continue;
        const alpha = Math.min(0.82, strength * 0.92);
        context.fillStyle = `rgba(167, 139, 250, ${alpha})`;
        const shape = (x * 3 + y * 5 + Math.floor(time / 1400)) % 3;
        if (shape === 0) {
          context.fillRect(pixelX - pixelSize / 2, pixelY - pixelSize / 2, pixelSize, pixelSize);
        } else if (shape === 1) {
          context.beginPath();
          context.arc(pixelX, pixelY, pixelSize * 0.44, 0, Math.PI * 2);
          context.fill();
        } else {
          context.beginPath();
          context.moveTo(pixelX, pixelY - pixelSize * 0.58);
          context.lineTo(pixelX + pixelSize * 0.58, pixelY);
          context.lineTo(pixelX, pixelY + pixelSize * 0.58);
          context.lineTo(pixelX - pixelSize * 0.58, pixelY);
          context.closePath();
          context.fill();
        }
      }
    }
    if (!reducedMotion) requestAnimationFrame(draw);
  };
  resize();
  draw(0);
  window.addEventListener('pointerdown', event => {
    ripples.push({ x: event.clientX, y: event.clientY, started: performance.now() });
    if (ripples.length > 5) ripples.shift();
  }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
}

function initHeroVideo() {
  if (!heroVideo || !HERO_VIDEOS.length) return;
  const layer = heroVideo.parentElement;
  if (!layer) return;

  // Every source gets its own persistent video element. We assign each src at
  // most once, so returning to csokk01 after csokk05 reuses the already loaded
  // media instead of issuing another fetch for the same file.
  const clips = HERO_VIDEOS.map((source, index) => {
    const clip = index === 0 ? heroVideo : document.createElement('video');
    clip.classList.add('hero-clip');
    clip.dataset.source = source;
    clip.muted = true;
    clip.defaultMuted = true;
    clip.playsInline = true;
    clip.autoplay = true;
    // Set the attributes as well as the DOM properties: iOS Safari bases its
    // autoplay decision on the attributes for dynamically created videos.
    clip.setAttribute('muted', '');
    clip.setAttribute('playsinline', '');
    clip.setAttribute('autoplay', '');
    clip.preload = 'metadata';
    clip.setAttribute('aria-hidden', 'true');
    if (index > 0) layer.append(clip);
    return clip;
  });

  let videoIndex = 0;
  let rotationTimer = 0;
  let preloadTimer = 0;

  const loadClipOnce = index => {
    const clip = clips[index];
    if (!clip || clip.dataset.loaded === 'true') return clip;
    clip.src = clip.dataset.source || '';
    clip.dataset.loaded = 'true';
    clip.load();
    return clip;
  };

  const preloadUpcomingClip = () => {
    const nextIndex = (videoIndex + 1) % clips.length;
    loadClipOnce(nextIndex);
  };

  const showClip = index => {
    window.clearTimeout(rotationTimer);
    window.clearTimeout(preloadTimer);
    videoIndex = index;
    const activeClip = loadClipOnce(videoIndex);
    if (!activeClip) return;

    clips.forEach((clip, clipIndex) => {
      const isActive = clipIndex === videoIndex;
      clip.classList.toggle('is-active', isActive);
      if (!isActive) clip.pause();
    });

    const startPlayback = () => {
      if (!activeClip.classList.contains('is-active')) return;
      activeClip.currentTime = 0;
      activeClip.play().catch(error => console.warn('[Bee There] A fejlécvideó nem indítható:', error));
    };
    // Calling play before a dynamically assigned source has video data is
    // unreliable in Safari. Wait for a playable frame when necessary.
    if (activeClip.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startPlayback();
    else activeClip.addEventListener('canplay', startPlayback, { once: true });

    // Metadata for just the next clip arrives while the current clip is on
    // screen. We intentionally do not download all five videos at page load.
    preloadTimer = window.setTimeout(preloadUpcomingClip, 2000);
    rotationTimer = window.setTimeout(() => {
      showClip((videoIndex + 1) % clips.length);
    }, 4000);
  };

  showClip(0);
}

function setupProfileSettings() {
  const buttons = findAll('.transport-button');
  try {
    const savedTransport = localStorage.getItem(TRANSPORT_STORAGE_KEY);
    if (['car', 'walk', 'transit'].includes(savedTransport)) selectedTransport = savedTransport;
  } catch (error) {
    console.warn('[Bee There] A közlekedési mód nem olvasható:', error);
  }
  const selectTransport = value => {
    buttons.forEach(button => button.setAttribute('aria-checked', String(button.dataset.transport === value)));
  };
  selectTransport(selectedTransport);
  buttons.forEach(button => button.addEventListener('click', () => {
    const nextTransport = button.dataset.transport || 'car';
    const isNewSelection = nextTransport !== selectedTransport;
    selectedTransport = nextTransport;
    selectTransport(selectedTransport);
    if (isNewSelection) triggerBounce(button);
    vibrate(10);
    try {
      localStorage.setItem(TRANSPORT_STORAGE_KEY, selectedTransport);
    } catch (error) {
      console.warn('[Bee There] A közlekedési mód nem menthető:', error);
    }
    renderEvents();
  }));

  const allowedValues = {
    categories: CATEGORIES,
    moods: ['alkotós', 'önfeledt', 'ütős', 'vicces', 'pörgős', 'szabad', 'ízes', 'inspiráló', 'energikus'],
    companions: ['egyedül', 'párban', 'barátokkal', 'családdal'],
    times: ['weekday', 'weekend', 'afternoon', 'evening'],
    spontaneity: ['now', 'week', 'plan']
  };
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
    Object.entries(allowedValues).forEach(([group, allowed]) => {
      if (Array.isArray(profilePreferences[group])) {
        profilePreferences[group] = Array.isArray(saved[group]) ? saved[group].filter(value => allowed.includes(value)) : [];
      } else {
        profilePreferences[group] = allowed.includes(saved[group]) ? saved[group] : '';
      }
    });
    const savedBudget = saved.budget === 'free' ? 1000 : saved.budget === 'any' ? 20000 : Number(saved.budget);
    profilePreferences.budget = Number.isFinite(savedBudget) && savedBudget >= 1000 && savedBudget <= 20000 ? savedBudget : 20000;
  } catch (error) {
    console.warn('[Bee There] A személyes beállítások nem olvashatók:', error);
  }

  const preferenceGroups = findAll('.preference-group');
  const updatePreferenceButtons = () => {
    preferenceGroups.forEach(groupElement => {
      const group = groupElement.dataset.preferenceGroup;
      findAll('[data-preference-value]', groupElement).forEach(button => {
        const selected = Array.isArray(profilePreferences[group])
          ? profilePreferences[group].includes(button.dataset.preferenceValue)
          : profilePreferences[group] === button.dataset.preferenceValue;
        button.setAttribute('aria-pressed', String(selected));
      });
    });
  };
  updatePreferenceButtons();
  const budgetSlider = find('#budget-slider');
  const budgetSliderValue = find('#budget-slider-value');
  const updateBudgetSlider = value => {
    const budget = Number(value);
    if (!budgetSlider || !Number.isFinite(budget)) return;
    budgetSlider.value = String(budget);
    const progress = ((budget - Number(budgetSlider.min)) / (Number(budgetSlider.max) - Number(budgetSlider.min))) * 100;
    budgetSlider.closest('.budget-slider-wrap')?.style.setProperty('--budget-progress', `${progress}%`);
    if (budgetSliderValue) budgetSliderValue.textContent = budget >= Number(budgetSlider.max) ? 'Mindegy' : `${budget.toLocaleString('hu-HU')} Ft`;
  };
  updateBudgetSlider(profilePreferences.budget);
  if (budgetSlider) budgetSlider.addEventListener('input', () => {
    profilePreferences.budget = Number(budgetSlider.value);
    updateBudgetSlider(profilePreferences.budget);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profilePreferences));
    } catch (error) {
      console.warn('[Bee There] A személyes beállítások nem menthetők:', error);
    }
    renderEvents();
  });
  preferenceGroups.forEach(groupElement => {
    const group = groupElement.dataset.preferenceGroup;
    const multiple = groupElement.dataset.selection === 'multiple';
    findAll('[data-preference-value]', groupElement).forEach(button => button.addEventListener('click', () => {
      const value = button.dataset.preferenceValue;
      if (!allowedValues[group]?.includes(value)) return;
      const wasSelected = button.getAttribute('aria-pressed') === 'true';
      if (multiple) {
        const values = new Set(profilePreferences[group]);
        if (values.has(value)) values.delete(value); else values.add(value);
        profilePreferences[group] = [...values];
      } else {
        profilePreferences[group] = profilePreferences[group] === value ? '' : value;
      }
      updatePreferenceButtons();
      if (!wasSelected) triggerBounce(button);
      vibrate(8);
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profilePreferences));
      } catch (error) {
        console.warn('[Bee There] A személyes beállítások nem menthetők:', error);
      }
      renderEvents();
    }));
  });
}

function initSideRays() {
  const canvas = find('#side-rays');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) { console.warn('[Bee There] A Side Rays effekt nem indítható ezen a böngészőn.'); return; }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = time => {
    context.clearRect(0, 0, width, height);
    const originX = width + 36;
    const originY = -38;
    for (let index = 0; index < 7; index += 1) {
      const wave = Math.sin(time * 0.00038 + index * 1.71) * width * 0.06;
      const start = height * (0.11 + index * 0.092) + wave;
      const end = start + height * (0.16 + (index % 3) * 0.055);
      const gradient = context.createLinearGradient(originX, originY, width * 0.28, end);
      gradient.addColorStop(0, index % 2 ? 'rgba(3, 218, 198, 0.42)' : 'rgba(187, 134, 252, 0.34)');
      gradient.addColorStop(0.46, index % 2 ? 'rgba(3, 218, 198, 0.13)' : 'rgba(187, 134, 252, 0.1)');
      gradient.addColorStop(1, 'rgba(18, 18, 18, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(originX, originY);
      context.lineTo(width * 0.18, start);
      context.lineTo(width * 0.22, end);
      context.closePath();
      context.fill();
    }
    const glow = context.createRadialGradient(originX, originY, 0, originX, originY, Math.max(width, height) * 0.56);
    glow.addColorStop(0, 'rgba(3, 218, 198, 0.22)');
    glow.addColorStop(1, 'rgba(3, 218, 198, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    if (!reducedMotion) requestAnimationFrame(draw);
  };
  resize();
  draw(0);
  window.addEventListener('resize', resize, { passive: true });
}

async function loadEvents() {
  try {
    const response = await fetch(EVENTS_FILE, { cache: 'default' });
    if (!response.ok) throw new Error('Az events.json fájl nem elérhető.');
    const payload = await parseJsonWithSizeLimit(response, MAX_EVENT_RESPONSE_BYTES);
    if (!Array.isArray(payload)) throw new Error('Az events.json formátuma hibás.');
    const allPrograms = payload.map(sanitizeEvent).filter(event => event?.Title);
    events = allPrograms.filter(event => !event.Permanent);
    permanentEvents = allPrograms.filter(event => event.Permanent);
    renderPermanent();
    if (currentAppView === 'search') renderSearchResults(searchInput?.value || '');
    renderEvents();
    const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
    const requestedEvent = navigationEntry?.type === 'reload' ? null : new URLSearchParams(window.location.search).get('event');
    const sharedEvent = requestedEvent ? [...events, ...permanentEvents].find(event => eventSlug(event) === requestedEvent) : null;
    if (sharedEvent) window.setTimeout(() => openEventDetails(sharedEvent, null, { updateUrl: false }), 0);
  } catch (error) {
    console.error('[Bee There] Eseménybetöltési hiba:', error);
    if (permanentGrid) permanentGrid.textContent = 'A programok most nem tölthetők be. Kérjük, frissítsd az oldalt.';
    if (grid) grid.innerHTML = '<div class="location-empty">Az események betöltéséhez engedélyezd a lokációd vagy válassz várost!</div>';
  }
}

function init() {
  setupAppNavigation();
  createFilters();
  attachCarouselControls();
  setupNavigationMenu();
  setupQuickNavigation();
  setupCityChooser();
  setupProfileSettings();
  setupEventDetailsDialog();
  setupCalendar();
  initOutroMessage();
  updateOutroWeather();
  initHeroVideo();
  window.addEventListener('resize', positionAllDetailsButtons, { passive: true });
  loadEvents();
  if (locationText) locationText.textContent = 'Válassz várost az események megtekintéséhez';
  if (!navigator.geolocation) {
    if (locationText) locationText.textContent = 'Helymeghatározás nem támogatott — válassz várost';
    return;
  }
  window.setTimeout(() => {
    if (position) return;
    navigator.geolocation.getCurrentPosition(coordsResult => {
      const nearest = closestCity(coordsResult.coords);
      setCity({ latitude: coordsResult.coords.latitude, longitude: coordsResult.coords.longitude, name: nearest?.name || 'GPS-helyzet' });
    }, error => {
      console.warn('[Bee There] Helymeghatározás nem elérhető:', error.message);
      if (locationText) locationText.textContent = 'Válassz várost az események megtekintéséhez';
      if (citySelectorLabel) citySelectorLabel.textContent = 'Engedélyezés';
    }, { maximumAge: 300000, timeout: 10000 });
  }, 7000);
}

init();
