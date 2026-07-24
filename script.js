const SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pub?output=csv';
const CATEGORIES = ['party', 'kultúra', 'sport', 'családi', 'gasztro', 'romantika'];
const FAVORITES_STORAGE_KEY = 'bee-there-favorites';

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
const template = find('#event-template');
const allSection = find('.all-events');
const featuredSection = find('#featured-section');
const favoritesSection = find('#favorites-section');
const filterBar = find('#category-filters');
const locationText = find('#location-text');

let events = [];
let selectedCategory = '';
let position = null;
let favoriteIds = loadFavorites();

// A meglévő Google Sheets CSV-parser.
function csv(text) { let rows = [], row = [], cell = '', quoted = false; for (let i = 0; i < text.length; i += 1) { const char = text[i], next = text[i + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += char; } row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); const [headers, ...data] = rows; return data.map(values => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, '').trim(), values[index] || '']))); }

function safeUrl(value) { try { const valueUrl = new URL(value); return /^https?:$/.test(valueUrl.protocol) ? valueUrl.href : ''; } catch { return ''; } }
function haversineKm(lat1, lon1, lat2, lon2) { const toRadians = value => value * Math.PI / 180; const lat = toRadians(lat2 - lat1), lon = toRadians(lon2 - lon1); const a = Math.sin(lat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function eventCategories(event) { return (event.Category || event.Kategória || '').split(/[,;|]/).map(value => value.trim().toLowerCase()).filter(Boolean); }
function isFeatured(event) { return (event.Featured || event.Kiemelt || '').trim() === 'Igen'; }
function isFree(event) { return /(^|\b)(ingyenes|0\s*(ft|huf))\b/i.test((event.Price || '').trim()); }
function eventKey(event) { return event['Ticket Link'] || [event.Title, event['Date and Time'], event.Location].join('|'); }
function setText(selector, value, fragment) { const element = find(selector, fragment); if (element) element.textContent = value; return element; }

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
  element.classList.remove('bouncy');
  requestAnimationFrame(() => element.classList.add('bouncy'));
}

function sortByDistance(list) {
  return list.map(event => {
    const latitude = Number(event.Latitude);
    const longitude = Number(event.Longitude);
    const distance = position && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? haversineKm(position.latitude, position.longitude, latitude, longitude)
      : Number.POSITIVE_INFINITY;
    return { ...event, distance };
  }).sort((first, second) => first.distance - second.distance);
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
      const targetId = button.dataset.carouselTarget;
      const carousel = targetId ? document.getElementById(targetId) : null;
      triggerBounce(button);
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

  if (card && compact) card.classList.add('compact');
  setText('.placeholder-title', event.Title || 'Esemény', fragment);
  if (imageUrl && image) {
    image.src = imageUrl;
    image.alt = event.Title || 'Esemény képe';
    if (placeholder) placeholder.hidden = true;
    image.addEventListener('error', () => { image.remove(); if (placeholder) placeholder.hidden = false; }, { once: true });
  } else if (image) image.remove();

  const distance = position && Number.isFinite(Number(event.Latitude)) && Number.isFinite(Number(event.Longitude))
    ? haversineKm(position.latitude, position.longitude, Number(event.Latitude), Number(event.Longitude))
    : NaN;
  setText('.distance-pill', Number.isFinite(distance) ? (distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`) : '', fragment);
  setText('.event-date', event['Date and Time'] || 'Időpont hamarosan', fragment);
  setText('.event-location', event.Location || 'Helyszín hamarosan', fragment);
  setText('.event-title', event.Title || 'Névtelen esemény', fragment);
  setText('.event-description', event.Description || 'Részletek hamarosan.', fragment);
  setText('.category-badge', eventCategories(event)[0] || 'program', fragment);
  setText('.price-badge', event.Price || 'Ár nincs megadva', fragment);
  setText('.age-badge', event['Age Requirement'] || 'Korhatár nincs megadva', fragment);

  const ticket = find('.ticket-button', fragment);
  const ticketUrl = safeUrl(event['Ticket Link']);
  if (ticket) { if (ticketUrl) ticket.href = ticketUrl; else ticket.hidden = true; }

  const favoriteButton = find('.favorite-button', fragment);
  if (favoriteButton) {
    favoriteButton.dataset.eventKey = key;
    const isFavorite = favoriteIds.has(key);
    favoriteButton.classList.toggle('is-favorite', isFavorite);
    favoriteButton.setAttribute('aria-pressed', String(isFavorite));
    favoriteButton.setAttribute('aria-label', isFavorite ? 'Kedvelés törlése' : 'Esemény kedvelése');
    const favoriteIcon = find('span', favoriteButton);
    if (favoriteIcon) favoriteIcon.textContent = isFavorite ? '♥' : '♡';
    favoriteButton.addEventListener('click', () => {
      favoriteIds.has(key) ? favoriteIds.delete(key) : favoriteIds.add(key);
      saveFavorites();
      triggerBounce(favoriteButton);
      updateFavoriteButtons();
      renderFavorites();
    });
  }
  target.append(fragment);
}

function updateFavoriteButtons() {
  findAll('.favorite-button[data-event-key]').forEach(button => {
    const isFavorite = favoriteIds.has(button.dataset.eventKey);
    button.classList.toggle('is-favorite', isFavorite);
    button.setAttribute('aria-pressed', String(isFavorite));
    button.setAttribute('aria-label', isFavorite ? 'Kedvelés törlése' : 'Esemény kedvelése');
    const icon = find('span', button);
    if (icon) icon.textContent = isFavorite ? '♥' : '♡';
  });
}

function createEventGroup(target, title, items, id) {
  if (!target || !items.length) return;
  const group = document.createElement('section');
  group.className = 'event-group';
  group.innerHTML = `<div class="event-group-header"><h3>${title}</h3><div class="carousel-controls" aria-label="${title} lapozása"><button class="carousel-arrow" type="button" data-carousel-target="${id}" data-direction="prev" aria-label="Előző esemény">←</button><button class="carousel-arrow" type="button" data-carousel-target="${id}" data-direction="next" aria-label="Következő esemény">→</button></div></div><div id="${id}" class="events-grid event-carousel" tabindex="0" aria-label="${title}"></div>`;
  target.append(group);
  const carousel = find(`#${id}`, group);
  items.forEach(event => renderCard(event, carousel, { compact: true }));
  setupCarousel(carousel);
  attachCarouselControls(group);
}

function renderFavorites() {
  if (!favoritesGrid || !favoritesSection) return;
  const favorites = sortByDistance(events.filter(event => favoriteIds.has(eventKey(event))));
  favoritesGrid.replaceChildren();
  favoritesSection.hidden = !favorites.length;
  favorites.forEach(event => renderCard(event, favoritesGrid, { compact: true }));
  setupCarousel(favoritesGrid);
}

function renderEvents() {
  if (!grid || !featuredGrid || !allSection || !featuredSection) return;
  grid.replaceChildren();
  featuredGrid.replaceChildren();

  const featured = events.filter(isFeatured).sort((first, second) => (first['Date and Time'] || '').localeCompare(second['Date and Time'] || ''));
  featured.forEach(event => renderCard(event, featuredGrid));
  featuredSection.hidden = !featured.length;
  setupCarousel(featuredGrid);

  if (!position) {
    allSection.hidden = true;
    renderFavorites();
    return;
  }

  allSection.hidden = false;
  const sorted = sortByDistance(events);
  const visible = selectedCategory ? sorted.filter(event => eventCategories(event).includes(selectedCategory)) : sorted;
  if (!visible.length) {
    grid.innerHTML = '<div class="loading-card">Nincs a kiválasztott kategóriához illő esemény.</div>';
  } else if (selectedCategory) {
    createEventGroup(grid, `${selectedCategory} események`, visible, 'filtered-events');
  } else {
    createEventGroup(grid, 'Ingyenes események', visible.filter(isFree), 'free-events');
    createEventGroup(grid, 'Fizetős események', visible.filter(event => !isFree(event)), 'paid-events');
  }
  renderFavorites();
}

function createFilters() {
  if (!filterBar) return;
  filterBar.replaceChildren();
  CATEGORIES.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category;
    button.className = 'filter-button';
    button.addEventListener('click', () => {
      selectedCategory = selectedCategory === category ? '' : category;
      findAll('.filter-button', filterBar).forEach(filter => filter.classList.toggle('active', filter.textContent === selectedCategory));
      filterBar.classList.toggle('has-selection', Boolean(selectedCategory));
      triggerBounce(button);
      renderEvents();
    });
    filterBar.append(button);
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
  let animationFrame = 0;

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
    const rays = 7;
    for (let index = 0; index < rays; index += 1) {
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
    if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
  };
  resize();
  draw(0);
  window.addEventListener('resize', resize, { passive: true });
  if (reducedMotion && animationFrame) cancelAnimationFrame(animationFrame);
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
  initSideRays();
  loadEvents();
  if (!navigator.geolocation) {
    if (locationText) locationText.textContent = 'Helymeghatározás nem támogatott — kiemelt események';
    return;
  }
  navigator.geolocation.getCurrentPosition(result => {
    position = result.coords;
    if (locationText) locationText.textContent = 'Távolság szerint rendezve';
    renderEvents();
  }, error => {
    console.warn('[Bee There] Helymeghatározás nem elérhető:', error.message);
    if (locationText) locationText.textContent = 'Helyzet nélkül — kiemelt események';
  }, { maximumAge: 300000, timeout: 10000 });
}

init();
