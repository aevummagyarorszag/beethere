(() => {
  const button = document.getElementById('install-app');
  const installer = document.querySelector('pwa-install');
  const backdrop = document.getElementById('pwa-install-backdrop');
  const displayMode = matchMedia('(display-mode: standalone)');
  let installed = false;
  const backgroundInertState = new Map();

  function blockBackground(blocked) {
    backdrop.hidden = !blocked;
    if (blocked) {
      for (const element of document.body.children) {
        if (element === backdrop || element === installer || element.tagName === 'SCRIPT') continue;
        if (!backgroundInertState.has(element)) backgroundInertState.set(element, element.inert);
        element.inert = true;
      }
      document.body.classList.add('install-guide-open');
      return;
    }
    for (const [element, wasInert] of backgroundInertState) element.inert = wasInert;
    backgroundInertState.clear();
    document.body.classList.remove('install-guide-open');
  }

  function closeGuide() {
    installer.hideDialog();
    blockBackground(false);
  }

  function update() {
    const runningInstalled = installed || displayMode.matches || navigator.standalone === true;
    button.hidden = runningInstalled;
    if (runningInstalled) closeGuide();
  }
  window.addEventListener('pwa-install-available-event', update);
  window.addEventListener('pwa-install-success-event', update);
  window.addEventListener('appinstalled', () => { installed = true; update(); });
  displayMode.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  backdrop.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    closeGuide();
  });
  installer.addEventListener('click', event => {
    if (event.composedPath().some(node => node instanceof Element && node.matches('button.close'))) {
      blockBackground(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !backdrop.hidden) closeGuide();
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
      if (installer.isAppleMobilePlatform || installer.isAppleDesktopPlatform) {
        installer.showDialog(true);
        blockBackground(true);
      } else if (typeof installer.install === 'function') {
        if (installer.isAndroidFallback) blockBackground(true);
        await installer.install();
      } else {
        installer.showDialog(true);
      }
    } finally { button.disabled = false; update(); }
  });
  update();
})();
