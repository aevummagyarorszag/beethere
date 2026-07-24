/* Bee There — statikus, GitHub Pages kompatibilis eseménykereső */
const PUBLISHED_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSPfSI82U3LFTE93Wj_ZaGSqNHyxpmAXnnt6ixl2XBgqNUfHkbXZeS4TV_WEY3DB1mESAsRZRtOY8HZ/pubhtml';
const CSV_URL = PUBLISHED_SHEET_URL.replace(/\/pubhtml(?:\?.*)?$/, '/pub?output=csv');

const grid = document.querySelector('#events-grid');
const template = document.querySelector('#event-template');
const locationText = document.querySelector('#location-text');
let currentPosition = null;
let events = [];

function parseCSV(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && inQuotes && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);

  const [headers, ...data] = rows;
  return data.map(values => Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, '').trim(), values[index] || ''])));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radians = value => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(distance) {
  if (!Number.isFinite(distance)) return 'Távolság ismeretlen';
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`;
}

function formatDate(value) {
  const normalized = value.replace(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?/, '$1-$2-$3');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    const translations = {
      Monday: 'hétfő', Tuesday: 'kedd', Wednesday: 'szerda', Thursday: 'csütörtök', Friday: 'péntek', Saturday: 'szombat', Sunday: 'vasárnap',
      January: 'január', February: 'február', March: 'március', April: 'április', May: 'május', June: 'június', July: 'július', August: 'augusztus', September: 'szeptember', October: 'október', November: 'november', December: 'december'
    };
    return value ? value.replace(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December/g, word => translations[word]) : 'Időpont hamarosan';
  }
  return new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date).replace('.', '');
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function setImage(image, value, fallbackText) {
  const url = safeUrl(value);
  image.alt = fallbackText;
  if (!url) { image.remove(); return; }
  image.src = url;
  image.addEventListener('error', () => image.remove(), { once: true });
}

function renderEvents() {
  grid.replaceChildren();
  if (!events.length) {
    grid.innerHTML = '<div class="empty-state"><p>Jelenleg nincs megjeleníthető esemény.</p></div>';
    return;
  }

  const sorted = events.map(event => {
    const latitude = Number.parseFloat(event.Latitude);
    const longitude = Number.parseFloat(event.Longitude);
    const distance = currentPosition && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? haversineKm(currentPosition.latitude, currentPosition.longitude, latitude, longitude)
      : Number.POSITIVE_INFINITY;
    return { ...event, distance };
  }).sort((first, second) => first.distance - second.distance);

  sorted.forEach(event => {
