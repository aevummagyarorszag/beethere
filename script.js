const SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pub?output=csv';
const CATEGORIES = ['party', 'kultúra', 'barátokkal', 'sport', 'családi', 'gasztro', 'romantika'];

const find = (selector, scope = document) => {
  if (!scope || typeof scope.querySelector !== 'function') {
    console.warn(`[Bee There] Nem kereshető DOM-környezet: ${selector}`);
    return null;
  }
  const element = scope.querySelector(selector);
  if (!element) console.warn(`[Bee There] Hiányzó DOM-elem: ${selector}`);
  return element;
};

const grid = find('#events-grid');
const featuredGrid = find('#featured-grid');
const template = find('#event-template');
const allSection = find('.all-events');
const featuredSection = find('#featured-section');
const filterBar = find('#category-filters');
const locationText = find('#location-text');
let events = [];
let selected = new Set();
let position = null;

// A meglévő Google Sheets CSV-parser.
function csv(text) { let rows = [], row = [], cell = '', quoted = false; for (let i = 0; i < text.length; i += 1) { const char = text[i], next = text[i + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += char; } row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); const [headers, ...data] = rows; return data.map(values => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, '').trim(), values[index] || '']))); }

function safeUrl(value) { try { const valueUrl = new URL(value); return /^https?:$/.test(valueUrl.protocol) ? valueUrl.href : ''; } catch { return ''; } }
function haversineKm(lat1, lon1, lat2, lon2) { const toRadians = value => value * Math.PI / 180; const lat = toRadians(lat2 - lat1), lon = toRadians(lon2 - lon1); const a = Math.sin(lat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function eventCategories(event) { return (event.Category || event.Kategória || '').split(/[,;|]/).map(value => value.trim().toLowerCase()).filter(Boolean); }
function isFeatured(event) { return (event.Featured || event.Kiemelt || '').trim() === 'Igen'; }
function setText(selector, value, fragment) { const element = find(selector, fragment); if (element) element.textContent = value; return element; }

function renderCard(event, target) {
  if (!template || !target) return;
  const fragment = template.content.cloneNode(true);
  const image = find('.event-image', fragment);
  const placeholder = find('.image-placeholder', fragment);
  const imageUrl = safeUrl(event['Header Image']);
  setText('.placeholder-title', event.Title || 'Esemény', fragment);
  if (imageUrl && image) { image.src = imageUrl; image.alt = event.Title || 'Esemény képe'; if (placeholder) placeholder.hidden = true; image.addEventListener('error', () => { image.remove(); if (placeholder) placeholder.hidden = false; }, { once: true }); } else if (image) image.remove();
  const distance = position ? haversineKm(position.latitude, position.longitude, Number(event.Latitude), Number(event.Longitude)) : NaN;
  setText('.distance-pill', Number.isFinite(distance) ? (distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`) : '', fragment);
  setText('.event-date', event['Date and Time'] || 'Időpont hamarosan', fragment); setText('.event-location', event.Location || 'Helyszín hamarosan', fragment); setText('.event-title', event.Title || 'Névtelen esemény', fragment); setText('.event-description', event.Description || 'Részletek hamarosan.', fragment); setText('.category-badge', eventCategories(event)[0] || 'program', fragment); setText('.price-badge', event.Price || 'Ár nincs megadva', fragment); setText('.age-badge', event['Age Requirement'] || 'Korhatár nincs megadva', fragment);
  const ticket = find('.ticket-button', fragment); const ticketUrl = safeUrl(event['Ticket Link']); if (ticket) { if (ticketUrl) ticket.href = ticketUrl; else ticket.hidden = true; }
  target.append(fragment);
}

function renderEvents() {
  if (!grid || !featuredGrid || !allSection || !featuredSection) return;
  grid.replaceChildren(); featuredGrid.replaceChildren();
  const featured = events.filter(isFeatured).sort((first, second) => (first['Date and Time'] || '').localeCompare(second['Date and Time'] || ''));
  featured.forEach(event => renderCard(event, featuredGrid)); featuredSection.hidden = !featured.length;
  if (!position) { allSection.hidden = true; return; }
  allSection.hidden = false;
  const visible = events.map(event => ({ ...event, distance: haversineKm(position.latitude, position.longitude, Number(event.Latitude), Number(event.Longitude)) })).sort((first, second) => first.distance - second.distance).filter(event => !selected.size || [...selected].every(category => eventCategories(event).includes(category)));
  if (!visible.length) grid.innerHTML = '<div class="loading-card">Nincs a kiválasztott kategóriákhoz illő esemény.</div>'; else visible.forEach(event => renderCard(event, grid));
}

function createFilters() { if (!filterBar) return; CATEGORIES.forEach(category => { const button = document.createElement('button'); button.type = 'button'; button.textContent = category; button.className = 'filter-button'; button.addEventListener('click', () => { selected.has(category) ? selected.delete(category) : selected.add(category); button.classList.toggle('active', selected.has(category)); renderEvents(); }); filterBar.append(button); }); }
async function loadEvents() { try { const response = await fetch(SHEET); if (!response.ok) throw new Error('A táblázat nem elérhető.'); events = csv(await response.text()).filter(event => event.Title); renderEvents(); } catch (error) { console.error('[Bee There] Eseménybetöltési hiba:', error); if (grid) grid.innerHTML = '<div class="loading-card">Az események betöltése nem sikerült.</div>'; } }
function init() { createFilters(); loadEvents(); if (!navigator.geolocation) { if (locationText) locationText.textContent = 'Helymeghatározás nem támogatott — kiemelt események'; return; } navigator.geolocation.getCurrentPosition(result => { position = result.coords; if (locationText) locationText.textContent = 'Távolság szerint rendezve'; renderEvents(); }, error => { console.warn('[Bee There] Helymeghatározás nem elérhető:', error.message); if (locationText) locationText.textContent = 'Helyzet nélkül — kiemelt események'; }, { maximumAge: 300000, timeout: 10000 }); }

init();
