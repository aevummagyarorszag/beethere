(() => {
  const mode = matchMedia('(display-mode: standalone)');
  let installed = false;
  try { installed = localStorage.getItem('bee-there-installed') === 'true'; } catch {}
  const menu = document.getElementById('browser-menu');
  const toggle = document.getElementById('browser-menu-toggle');
  const links = document.getElementById('browser-menu-links');
  let targetKey = '';
  function closeMenu() { menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); links.inert = true; }
  window.isBeeBrowserLanding = () => !installed && !mode.matches && navigator.standalone !== true;
  function syncMode() {
    if (mode.matches || navigator.standalone === true) {
      installed = true;
      try { localStorage.setItem('bee-there-installed', 'true'); } catch {}
    }
    document.body.classList.toggle('browser-landing', window.isBeeBrowserLanding());
    closeMenu();
    renderEvents();
  }
  window.updateBrowserHeader = () => {
    const dates = [...new Set(events.filter(event => !isPastEvent(event)).flatMap(eventDateKeys))].filter(key => key >= todayKey()).sort();
    targetKey = dates[0] || '';
    const caption = !targetKey ? 'Hamarosan!' : targetKey === todayKey() ? 'Mai események!' : targetKey === tomorrowKey() ? 'Holnapi események!' : 'Következő események!';
    const date = targetKey ? new Date(targetKey + 'T12:00:00') : new Date();
    const button = document.getElementById('browser-event-date');
    button.querySelector('span').textContent = String(date.getDate());
    button.disabled = !targetKey;
    button.setAttribute('aria-label', `${caption} ${date.toLocaleDateString('hu-HU')}`);
    document.getElementById('browser-date-caption').textContent = caption;
  };
  toggle.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); links.inert = !open;
  });
  links.querySelectorAll('[data-browser-view]').forEach(button => button.addEventListener('click', () => { closeMenu(); navigateToAppView(button.dataset.browserView, { animate: true }); }));
  document.addEventListener('click', event => { if (!menu.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); toggle.focus({ preventScroll: true }); } });
  for (const id of ['browser-floating-install', 'browser-promo-install']) document.getElementById(id).addEventListener('click', () => document.getElementById('install-app').click());
  document.getElementById('browser-event-date').addEventListener('click', () => {
    if (!targetKey) return;
    navigateToAppView('home');
    const [year, month] = targetKey.split('-').map(Number);
    calendarMonth = new Date(year, month - 1, 1); calendarSelectedDate = targetKey; calendarCategory = ''; syncTopicSelection(calendarFilters, ''); renderCalendar();
    calendarSection.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  document.getElementById('city-use-location').addEventListener('click', () => {
    closeCityDialog(); accountSettings.locationEnabled = true; position = null; requestGeolocation();
  });
  mode.addEventListener('change', syncMode);
  window.addEventListener('appinstalled', () => { installed = true; try { localStorage.setItem('bee-there-installed', 'true'); } catch {} syncMode(); });
  let midnightTimer;
  const refreshHeaderDate = () => {
    clearTimeout(midnightTimer); window.updateBrowserHeader();
    const now = new Date();
    midnightTimer = setTimeout(refreshHeaderDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100);
  };
  window.addEventListener('pageshow', refreshHeaderDate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshHeaderDate(); });
  refreshHeaderDate();
  syncMode();
})();
