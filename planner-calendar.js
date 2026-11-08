(() => {
  const section = document.getElementById('planner-calendar-section');
  if (!section) return;
  const grid = section.querySelector('#planner-calendar-grid');
  const label = section.querySelector('#planner-calendar-month');
  const todayButton = section.querySelector('#planner-calendar-today');
  const filters = section.querySelector('#planner-calendar-filters');
  const results = section.querySelector('#planner-calendar-events');
  const shell = section.querySelector('.calendar-shell');
  let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selected = '';
  let category = '';
  let flash;
  let flashTimer;
  let monthTimer;
  let midnightTimer;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const source = () => [...events, ...permanentEvents].filter(event => pinnedEventKeys.has(eventKey(event)) || favoriteIds.has(eventKey(event)));
  const matchesDate = (event, key) => {
    if (!event.Permanent) return eventOccursOnDate(event, key);
    const [year, month, day] = key.split('-').map(Number);
    return permanentEventMatchesWeekday(event, (new Date(year, month - 1, day).getDay() + 6) % 7);
  };
  const cancelFlash = () => { clearTimeout(flashTimer); flash?.cancel(); flash = null; };
  const animateMonth = direction => {
    clearTimeout(monthTimer);
    shell.classList.remove('is-swiping-previous', 'is-swiping-next');
    if (reduced()) return;
    void shell.offsetWidth;
    shell.classList.add(direction < 0 ? 'is-swiping-previous' : 'is-swiping-next');
    monthTimer = setTimeout(() => shell.classList.remove('is-swiping-previous', 'is-swiping-next'), 260);
  };
  function renderResults(items) {
    results.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = source().length ? 'Ebben a kategóriában még nincs kedvelt vagy tervezett eseményed.' : 'A kedvelt és a „Megyek rá” eseményeid itt jelennek meg.';
      results.append(empty);
      return;
    }
    if (!selected) return;
    const selectedItems = items.filter(event => matchesDate(event, selected));
    if (!selectedItems.length) return;
    const rail = document.createElement('div');
    rail.className = 'events-grid event-carousel vertical-event-list';
    rail.tabIndex = 0;
    rail.setAttribute('aria-label', 'A kiválasztott napra tervezett eseményeid');
    results.append(rail);
    for (let index = 0; index < selectedItems.length; index += 3) {
      const page = document.createElement('div');
      page.className = 'compact-event-page';
      rail.append(page);
      selectedItems.slice(index, index + 3).forEach((event, offset) => renderFavoritePair(event, index + offset, page, { compact: true }));
    }
    setupCarousel(rail);
    syncCarouselControls(rail);
  }
  function render({ selectFirst = false } = {}) {
    const now = new Date();
    section.querySelector('#planner-calendar-today-number').textContent = String(now.getDate());
    const fullDate = new Intl.DateTimeFormat('hu-HU', { dateStyle: 'long' }).format(now);
    todayButton.title = fullDate;
    todayButton.setAttribute('aria-label', `Ugrás a mai napra: ${fullDate}`);
    label.textContent = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(month);
    const items = source().filter(event => !category || eventCategories(event).includes(category));
    const year = month.getFullYear(), monthIndex = month.getMonth();
    const count = new Date(year, monthIndex + 1, 0).getDate();
    const dates = Array.from({ length: count }, (_, index) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
    const matchingDates = dates.filter(key => items.some(event => matchesDate(event, key)));
    if (selected && !matchingDates.includes(selected)) selected = '';
    if (!selected && matchingDates.includes(todayKey())) selected = todayKey();
    if (selectFirst && !selected) selected = matchingDates.find(key => key >= todayKey()) || matchingDates[0] || '';
    grid.replaceChildren();
    const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    for (let index = 0; index < offset; index++) {
      const blank = document.createElement('span'); blank.className = 'calendar-day empty'; grid.append(blank);
    }
    dates.forEach((key, index) => {
      const dayItems = items.filter(event => matchesDate(event, key));
      const liked = dayItems.some(event => favoriteIds.has(eventKey(event)));
      const attending = dayItems.some(event => pinnedEventKeys.has(eventKey(event)));
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'calendar-day'; button.dataset.dateKey = key;
      button.setAttribute('role', 'gridcell');
      button.classList.toggle('has-attendance', attending);
      button.classList.toggle('has-events', Boolean(dayItems.length));
      button.classList.toggle('has-favorite', liked);
      button.classList.toggle('today', key === todayKey());
      button.classList.toggle('selected', key === selected);
      button.setAttribute('aria-selected', String(key === selected));
      button.setAttribute('aria-label', `${index + 1}. nap${attending ? ', Megyek rá eseménnyel' : ''}${liked ? ', kedvelt eseménnyel' : ''}`);
      if (liked) {
        const heart = document.createElement('span'); heart.className = 'calendar-favorite-heart'; heart.setAttribute('aria-hidden', 'true'); heart.innerHTML = uiIconMarkup('heart'); button.append(heart);
      }
      const number = document.createElement('span'); number.className = 'calendar-day-number'; number.textContent = String(index + 1); button.append(number);
      if (dayItems.length) button.addEventListener('click', () => { cancelFlash(); selected = key; render(); vibrate(12); });
      else button.setAttribute('aria-disabled', 'true');
      grid.append(button);
    });
    renderResults(items);
  }
  populateTopicRail(filters, category, next => {
    cancelFlash(); category = next; selected = ''; render({ selectFirst: true });
    requestAnimationFrame(() => scrollToEventsStart(results, 12));
    vibrate(10);
  });
  todayButton.addEventListener('click', () => {
    cancelFlash();
    const now = new Date();
    const direction = (now.getFullYear() - month.getFullYear()) * 12 + now.getMonth() - month.getMonth();
    month = new Date(now.getFullYear(), now.getMonth(), 1); selected = ''; render();
    if (direction) animateMonth(direction);
    const day = grid.querySelector('.today');
    const pulse = () => {
      if (!day?.isConnected || reduced()) return;
      const opacity = Number(getComputedStyle(day).opacity);
      flash = day.animate([{ opacity }, { opacity: opacity * .25 }, { opacity }], { duration: 650, iterations: 2, fill: 'none', easing: 'ease-in-out' });
    };
    if (direction) flashTimer = setTimeout(pulse, 260); else pulse();
    vibrate(10);
  });
  let swipe;
  let suppressUntil = 0;
  shell.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) swipe = { id: event.pointerId, x: event.clientX, y: event.clientY }; }, { passive: true });
  shell.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y; swipe = null;
    if (Math.abs(dx) < 38 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
    cancelFlash(); const direction = dx > 0 ? -1 : 1; month.setMonth(month.getMonth() + direction); selected = ''; render(); animateMonth(direction); suppressUntil = performance.now() + 300; vibrate(8);
  });
  shell.addEventListener('pointercancel', () => { swipe = null; });
  shell.addEventListener('click', event => { if (performance.now() < suppressUntil) { event.preventDefault(); event.stopPropagation(); } }, true);
  const refreshDate = () => {
    clearTimeout(midnightTimer); render();
    const now = new Date(); midnightTimer = setTimeout(refreshDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100);
  };
  window.renderPlannerCalendar = render;
  window.addEventListener('pageshow', refreshDate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
  refreshDate();
})();
