(() => {
  const mode = matchMedia('(display-mode: standalone)');
  let installed = false;
  try { installed = localStorage.getItem('bee-there-installed') === 'true'; } catch {}
  const menu = document.getElementById('browser-menu');
  const toggle = document.getElementById('browser-menu-toggle');
  const links = document.getElementById('browser-menu-links');
  const dateRow = document.querySelector('.quick-navigation');
  const topicToolbar = document.getElementById('home-topic-toolbar');
  let menuFrame = 0;
  let menuAnchorY = 12;
  let menuRowInset = 48;
  let menuCeiling = 12;
  function measureMenu() {
    const row = topicToolbar.getBoundingClientRect();
    const chip = topicToolbar.querySelector('.topic-button')?.getBoundingClientRect();
    const download = document.getElementById('browser-floating-install').getBoundingClientRect();
    // Measure the original row position only when layout changes, never during scrolling.
    const section = topicToolbar.parentElement;
    const sectionTop = section.getBoundingClientRect().top;
    if (chip?.height && row.top > 12) menuRowInset = chip.top - sectionTop;
    menuAnchorY = chip?.height ? sectionTop + scrollY + menuRowInset : 12;
    const menuHeight = menu.classList.contains('is-open') ? 206 : 44;
    menuCeiling = Math.max(12, Math.min(innerHeight - menuHeight - 12, download.height ? download.top - menuHeight - 12 : Infinity));
    menu.style.setProperty('--browser-menu-right', `${Math.max(12, row.width ? innerWidth - row.right : 12)}px`);
    positionMenu();
  }
  function positionMenu() {
    menuFrame = 0;
    const top = Math.min(menuCeiling, Math.max(12, menuAnchorY - scrollY));
    menu.style.transform = `translate3d(0,${top - 12}px,0)`;
  }
  function scheduleMenuPosition() {
    if (!menuFrame) menuFrame = requestAnimationFrame(positionMenu);
  }
  window.addEventListener('scroll', scheduleMenuPosition, { passive: true });
  window.addEventListener('resize', measureMenu);
  const menuLayoutObserver = new ResizeObserver(measureMenu);
  menuLayoutObserver.observe(document.getElementById('top'));
  menuLayoutObserver.observe(document.getElementById('featured-section'));
  menuLayoutObserver.observe(topicToolbar);
  new MutationObserver(measureMenu).observe(dateRow, { attributes: true, attributeFilter: ['hidden'] });
  let targetKey = '';
  function closeMenu() { menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); links.inert = true; measureMenu(); }
  window.isBeeBrowserLanding = () => !installed && !mode.matches && navigator.standalone !== true;
  function syncMode() {
    if (mode.matches || navigator.standalone === true) {
      installed = true;
      try { localStorage.setItem('bee-there-installed', 'true'); } catch {}
    }
    document.body.classList.toggle('browser-landing', window.isBeeBrowserLanding());
    closeMenu();
    renderEvents();
    measureMenu();
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
    measureMenu();
  });
  links.querySelectorAll('[data-browser-view]').forEach(button => button.addEventListener('click', () => { closeMenu(); navigateToAppView(button.dataset.browserView, { animate: true }); }));
  document.addEventListener('click', event => { if (!menu.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); toggle.focus({ preventScroll: true }); } });
  for (const id of ['browser-floating-install', 'browser-promo-install']) document.getElementById(id).addEventListener('click', () => document.getElementById('install-app').click());
  document.getElementById('browser-event-date').addEventListener('click', () => {
    if (!targetKey) return;
    if (currentAppView !== 'home') navigateToAppView('home');
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
  measureMenu();
})();
