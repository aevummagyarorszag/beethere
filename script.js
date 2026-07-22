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
    const card = template.content.cloneNode(true);
    const select = selector => card.querySelector(selector);
    const headerImage = select('.event-image');
    const imagePlaceholder = select('.image-placeholder');
    const headerImageUrl = safeUrl(event['Header Image']);
    imagePlaceholder.querySelector('.placeholder-title').textContent = event.Title || 'Esemény hamarosan';
    if (headerImageUrl) {
      headerImage.src = headerImageUrl;
      headerImage.alt = event.Title || 'Esemény képe';
      imagePlaceholder.hidden = true;
      headerImage.addEventListener('error', () => { headerImage.remove(); imagePlaceholder.hidden = false; }, { once: true });
    } else headerImage.remove();
    select('.distance-value').textContent = distanceLabel(event.distance);
    select('.event-date').textContent = formatDate(event['Date and Time']);
    select('.event-location').textContent = event.Location || 'Helyszín hamarosan';
    select('.event-title').textContent = event.Title || 'Névtelen esemény';
    select('.event-description').textContent = event.Description || 'Részletek hamarosan.';
    select('.price-badge').textContent = event.Price || 'Ár hamarosan';
    select('.age-badge').textContent = event['Age Requirement'] || 'Korhatár nélkül';

    const gallery = select('.extra-images');
    event['Extra Images'].split(',').map(url => url.trim()).filter(Boolean).forEach((url, index) => {
      const image = document.createElement('img');
      setImage(image, url, `${event.Title || 'Esemény'} — további kép ${index + 1}`);
      if (image.isConnected || image.src) gallery.append(image);
    });

    const ticketUrl = safeUrl(event['Ticket Link']);
    const button = select('.ticket-button');
    const freeBadge = select('.free-badge');
    if (ticketUrl) button.href = ticketUrl;
    else {
      button.hidden = true;
      freeBadge.textContent = event['Ticket Link'].trim() ? 'Jegylink hamarosan' : 'Ingyenes';
      freeBadge.hidden = false;
    }
    grid.append(card);
  });
}

async function loadEvents() {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('A táblázat nem érhető el.');
    events = parseCSV(await response.text()).filter(event => event.Title);
    renderEvents();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><p>Az események betöltése most nem sikerült.</p><p>${error.message}</p></div>`;
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    locationText.textContent = 'A böngésződ nem támogatja a helymeghatározást';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    position => {
      currentPosition = position.coords;
      locationText.textContent = 'Távolság szerint rendezve';
      renderEvents();
    },
    () => { locationText.textContent = 'Helyzet nélkül — alapértelmezett sorrend'; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function animateSideRays() {
  const canvas = document.querySelector('#side-rays');
  const context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let startedAt = performance.now();

  function draw(now) {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * scale || canvas.height !== height * scale) { canvas.width = width * scale; canvas.height = height * scale; }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    const pulse = reducedMotion ? 0 : Math.sin((now - startedAt) / 2300) * .035;
    const sourceX = width * 1.08;
    const sourceY = -height * .12;
    const length = Math.hypot(width, height) * 1.45;
    const rays = [
      { angle: 2.04 + pulse, width: .10, alpha: .17 },
      { angle: 2.25 - pulse, width: .16, alpha: .12 },
      { angle: 2.46 + pulse, width: .075, alpha: .15 },
      { angle: 2.72 - pulse, width: .13, alpha: .09 }
    ];
    rays.forEach(ray => {
      context.save();
      context.translate(sourceX, sourceY);
      context.rotate(ray.angle);
      const gradient = context.createLinearGradient(0, 0, length, 0);
      gradient.addColorStop(0, `rgba(3, 218, 198, ${ray.alpha})`);
      gradient.addColorStop(.35, `rgba(3, 218, 198, ${ray.alpha * .55})`);
      gradient.addColorStop(1, 'rgba(3, 218, 198, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(length, -length * ray.width);
      context.lineTo(length, length * ray.width);
      context.closePath();
      context.fill();
      context.restore();
    });
    if (!reducedMotion) requestAnimationFrame(draw);
  }
  draw(startedAt);
}

animateSideRays();
requestLocation();
loadEvents();
