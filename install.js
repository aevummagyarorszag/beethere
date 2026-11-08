(() => {
  const button = document.getElementById('install-app');
  const installer = document.querySelector('pwa-install');
  const modal = document.getElementById('pwa-install-modal');
  const displayMode = matchMedia('(display-mode: standalone)');
  let installed = false;
  let observedRoot;

  function syncViewport() {
    const viewport = window.visualViewport;
    installer.style.setProperty('--bee-install-height', `${viewport?.height || window.innerHeight}px`);
    installer.style.setProperty('--bee-install-bottom', `${Math.max(0, window.innerHeight - (viewport ? viewport.offsetTop + viewport.height : window.innerHeight))}px`);
  }

  function closeGuide() {
    installer.hideDialog();
    if (modal.open) modal.close();
    document.body.classList.remove('install-guide-open');
  }

  function syncModal() {
    const visible = !installer.isDialogHidden && !!installer.shadowRoot?.querySelector('.install-dialog.available');
    syncViewport();
    if (visible && !modal.open) {
      modal.showModal();
      const panel = [...installer.shadowRoot.querySelectorAll('.install-dialog.available')]
        .find(element => getComputedStyle(element).display !== 'none');
      if (panel) { panel.tabIndex = -1; panel.focus({ preventScroll: true }); }
    }
    if (!visible && modal.open) modal.close();
    document.body.classList.toggle('install-guide-open', visible);
  }

  function connectDialog() {
    const root = installer.shadowRoot;
    if (!root || observedRoot === root) return;
    observedRoot = root;
    // External CSS respects the app's self-only style CSP inside Shadow DOM.
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = new URL('./install-component.css?v=20261105-06', document.baseURI).href;
    root.append(style);
    new MutationObserver(syncModal).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    syncModal();
  }

  function update() {
    const runningInstalled = installed || displayMode.matches || navigator.standalone === true;
    button.hidden = runningInstalled;
    if (runningInstalled) closeGuide();
    connectDialog();
    syncModal();
  }
  customElements.whenDefined('pwa-install').then(async () => {
    await installer.updateComplete;
    update();
  });
  window.addEventListener('pwa-install-available-event', update);
  window.addEventListener('pwa-install-success-event', update);
  window.addEventListener('appinstalled', () => { installed = true; update(); });
  displayMode.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);
  window.addEventListener('resize', syncViewport);
  modal.addEventListener('cancel', event => { event.preventDefault(); closeGuide(); });
  modal.addEventListener('click', event => {
    // The full-screen transparent dialog receives outside clicks without
    // dispatching them to the underlying app or bottom navigation.
    if (event.target === modal) { event.preventDefault(); event.stopPropagation(); closeGuide(); }
  });
  modal.addEventListener('close', () => {
    installer.hideDialog();
    document.body.classList.remove('install-guide-open');
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch(error => console.warn('[Bee There] Service worker regisztráció sikertelen:', error));
    }, { once: true });
  }
  button.addEventListener('click', async () => {
    if (button.hidden || button.disabled) return;
    button.disabled = true;
    try {
      installer.showDialog(true);
      await installer.updateComplete;
      connectDialog();
      syncModal();
    } finally { button.disabled = false; update(); }
  });
  update();
})();
