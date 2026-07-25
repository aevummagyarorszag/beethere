const SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pub?output=csv';
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

let events = [];
let selectedCategory = '';
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
function eventKey(event) { return event['Ticket Link'] || [event.Title, event['Date and Time'], event.Location].join('|'); }
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

function setupCarousel(carousel) {
  if (!carousel || carousel.dataset.carouselReady === 'true') return;
  carousel.dataset.carouselReady = 'true';
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  carousel.addEventListener('pointerdown', event => {
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

function renderCard(event, target, { compact = false } = {}) {
  if (!template || !template.content || !target) { console.warn('[Bee There] Az eseménykártya sablonja vagy célhelye hiányzik.'); return; }
  const fragment = template.content.cloneNode(true);
  const card = find('.event-card', fragment);
  const image = find('.event-image', fragment);
  const placeholder = find('.image-placeholder', fragment);
  const imageUrl = safeUrl(event['Header Image']);
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
    image.alt = event.Title || 'Esemény képe';
    if (placeholder) placeholder.hidden = true;
    image.addEventListener('error', () => { image.remove(); if (placeholder) placeholder.hidden = false; }, { once: true });
  } else if (image) image.remove();

  if (card) setCardDistance(card, latitude, longitude);
  setText('.event-date', eventDateOnly(event), fragment);
  setText('.event-location', event.Location || 'Helyszín hamarosan', fragment);
  setText('.event-title', event.Title || 'Névtelen esemény', fragment);
  setText('.event-description', event.Description || 'Részletek hamarosan.', fragment);
  setText('.category-badge', eventCategories(event)[0] || 'program', fragment);
  setText('.price-badge', event.Price || 'Ár nincs megadva', fragment);
  setText('.age-badge', event['Age Requirement'] || 'Korhatár nincs megadva', fragment);
  setText('.event-time', event.Time || event['Date and Time'] || 'Időpont nincs megadva', fragment);
  setText('.event-long-description', event['Long Description'] || event['Long description'] || 'További részletek hamarosan.', fragment);

  const ticket = find('.ticket-button', fragment);
  const ticketUrl = safeUrl(event['Ticket Link']);
  if (ticket) {
    if (ticketUrl && !isFree(event)) {
      ticket.href = ticketUrl;
      ticket.addEventListener('click', () => { triggerBounce(ticket); vibrate(12); });
    } else ticket.hidden = true;
  }

  const detailsPanel = find('.details-panel', fragment);
  const detailsButton = find('.details-button', fragment);
  const weather = find('.event-weather', fragment);
  if (detailsButton && card && detailsPanel) detailsButton.addEventListener('click', () => {
    const expanded = !card.classList.contains('expanded');
    card.classList.toggle('expanded', expanded);
    detailsPanel.hidden = !expanded;
    detailsButton.setAttribute('aria-expanded', String(expanded));
    detailsButton.textContent = expanded ? 'Kevesebb' : 'Részletek';
    triggerBounce(detailsButton);
    vibrate(12);
    if (expanded && weather && weather.dataset.loaded !== 'true') {
      weather.dataset.loaded = 'true';
      weather.textContent = 'Időjárás betöltése…';
      fetchWeatherForEvent(latitude, longitude, eventDateValue(event)).then(value => { weather.textContent = `Várható időjárás: ${value}`; });
    }
  });

  const favoriteButton = find('.favorite-button', fragment);
  if (favoriteButton) {
    favoriteButton.dataset.eventKey = key;
    syncFavoriteButton(favoriteButton, favoriteIds.has(key));
    favoriteButton.addEventListener('click', () => {
      favoriteIds.has(key) ? favoriteIds.delete(key) : favoriteIds.add(key);
      saveFavorites();
      triggerBounce(favoriteButton);
      vibrate(18);
      updateFavoriteButtons();
      renderFavorites();
    });
  }
  target.append(fragment);
}

function syncFavoriteButton(button, isFavorite) {
  button.classList.toggle('is-favorite', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute('aria-label', isFavorite ? 'Kedvelés törlése' : 'Esemény kedvelése');
}

function updateFavoriteButtons() {
  findAll('.favorite-button[data-event-key]').forEach(button => syncFavoriteButton(button, favoriteIds.has(button.dataset.eventKey)));
}

function createEventGroup(target, title, items, id) {
  if (!target) return;
  const group = document.createElement('section');
  group.className = 'event-group';
  group.innerHTML = `<div class="event-group-header"><h3>${title}</h3><div class="carousel-controls" aria-label="${title} lapozása"><button class="carousel-arrow" type="button" data-carousel-target="${id}" data-direction="prev" aria-label="Előző esemény">←</button><button class="carousel-arrow" type="button" data-carousel-target="${id}" data-direction="next" aria-label="Következő esemény">→</button></div></div><div id="${id}" class="events-grid event-carousel" tabindex="0" aria-label="${title}"></div>`;
  target.append(group);
  const carousel = find(`#${id}`, group);
  if (items.length) items.forEach(event => renderCard(event, carousel, { compact: true }));
  else if (carousel) carousel.innerHTML = '<div class="loading-card compact-empty">Ebben a kategóriában nincs ilyen esemény.</div>';
  setupCarousel(carousel);
  attachCarouselControls(group);
}

function renderFeatured() {
  if (!featuredGrid || !featuredSection) return;
  featuredGrid.replaceChildren();
  const featured = position
    ? sortByDistance(events.filter(isFeatured))
    : events.filter(isFeatured).sort((first, second) => (first['Date and Time'] || '').localeCompare(second['Date and Time'] || ''));
  featured.forEach(event => renderCard(event, featuredGrid));
  featuredSection.hidden = !featured.length;
  setupCarousel(featuredGrid);
}

function renderFavorites() {
  if (!favoritesGrid || !favoritesSection) return;
  const favorites = position
    ? sortByDistance(events.filter(event => favoriteIds.has(eventKey(event))))
    : events.filter(event => favoriteIds.has(eventKey(event)));
  favoritesGrid.replaceChildren();
  favoritesSection.hidden = !favorites.length;
  favorites.forEach(event => renderCard(event, favoritesGrid, { compact: true }));
  setupCarousel(favoritesGrid);
}

function renderToday() {
  if (!todayGrid || !todaySection) return;
  const todayEvents = events.filter(isToday);
  const visibleToday = position ? sortByDistance(todayEvents) : todayEvents;
  todayGrid.replaceChildren();
  todaySection.hidden = false;
  if (!visibleToday.length) todayGrid.innerHTML = '<div class="loading-card compact-empty">Ma nincs felvett esemény.</div>';
  else visibleToday.forEach(event => renderCard(event, todayGrid, { compact: true }));
  setupCarousel(todayGrid);
}

function renderEvents() {
  if (!grid || !allSection) return;
  grid.replaceChildren();
  renderFeatured();
  if (!position) {
    allSection.hidden = true;
    renderFavorites();
    renderToday();
    return;
  }

  allSection.hidden = false;
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
    button.innerHTML = `<span>${category}</span><span class="filter-emoji" aria-hidden="true">${CATEGORY_EMOJIS[category]}</span>`;
    button.className = 'filter-button';
    button.addEventListener('click', () => {
      selectedCategory = selectedCategory === category ? '' : category;
      findAll('.filter-button', filterBar).forEach(filter => filter.classList.toggle('active', filter.dataset.category === selectedCategory));
      filterBar.classList.toggle('has-selection', Boolean(selectedCategory));
      triggerBounce(button);
      vibrate(10);
      renderEvents();
    });
    button.dataset.category = category;
    filterBar.append(button);
  });
}

function setCity(city, isManual = false) {
  if (!city) return;
  position = { latitude: city.latitude, longitude: city.longitude };
  updateCityUI(city.name, isManual);
  updateDistanceValues();
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
    const size = 8;
    const columns = Math.ceil(width / size);
    const rows = Math.ceil(height / size);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const wave = Math.sin(x * 0.19 + y * 0.13 + time * 0.00035);
        const drift = Math.sin(x * 0.07 - y * 0.11 + time * 0.00022);
        const strength = (wave + drift + 2) / 4;
        if (strength < 0.61) continue;
        context.fillStyle = `rgba(3, 218, 198, ${(strength - 0.6) * 0.11})`;
        context.fillRect(x * size, y * size, 2, 2);
      }
    }
    if (!reducedMotion) requestAnimationFrame(draw);
  };
  resize();
  draw(0);
  window.addEventListener('resize', resize, { passive: true });
}

function initHeroVideo() {
  if (!heroVideo || !HERO_VIDEOS.length) return;
  let videoIndex = 0;
  let rotationTimer = 0;
  const playNext = () => {
    window.clearTimeout(rotationTimer);
    heroVideo.src = HERO_VIDEOS[videoIndex];
    heroVideo.load();
    heroVideo.play().catch(error => console.warn('[Bee There] A fejlécvideó nem indítható:', error));
    videoIndex = (videoIndex + 1) % HERO_VIDEOS.length;
    rotationTimer = window.setTimeout(playNext, 4000);
  };
  playNext();
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
    const response = await fetch(SHEET);
    if (!response.ok) throw new Error('A táblázat nem elérhető.');
    events = csv(await response.text()).filter(event => event.Title);
    renderEvents();
  } catch (error) {
    console.error('[Bee There] Eseménybetöltési hiba:', error);
    if (grid) grid.innerHTML = '<div class="loading-card">Az események betöltése nem sikerült.</div>';
  }
}

function init() {
  createFilters();
  attachCarouselControls();
  setupCityChooser();
  initHeroVideo();
  initSideRays();
  initPixelBlast();
  loadEvents();
  if (!navigator.geolocation) {
    if (locationText) locationText.textContent = 'Helymeghatározás nem támogatott — válassz várost';
    return;
  }
  navigator.geolocation.getCurrentPosition(coordsResult => {
    const nearest = closestCity(coordsResult.coords);
    setCity({ latitude: coordsResult.coords.latitude, longitude: coordsResult.coords.longitude, name: nearest?.name || 'GPS-helyzet' });
  }, error => {
    console.warn('[Bee There] Helymeghatározás nem elérhető:', error.message);
    if (locationText) locationText.textContent = 'Válassz várost a távolságokhoz';
    if (citySelectorLabel) citySelectorLabel.textContent = 'Város választása';
  }, { maximumAge: 300000, timeout: 10000 });
}

init();
