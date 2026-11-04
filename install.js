(() => {
  const button = document.getElementById('install-app');
  const installer = document.querySelector('pwa-install');
  const displayMode = matchMedia('(display-mode: standalone)');
  let installed = false;
  function update() {
    const runningInstalled = installed || displayMode.matches || navigator.standalone === true;
    button.hidden = runningInstalled;
    if (runningInstalled) installer.hideDialog();
  }
  window.addEventListener('pwa-install-available-event', update);
  window.addEventListener('pwa-install-success-event', update);
  window.addEventListener('appinstalled', () => { installed = true; update(); });
  displayMode.addEventListener('change', update);
  window.addEventListener('pageshow', update);
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
      } else if (typeof installer.install === 'function') {
        await installer.install();
      } else {
        installer.showDialog(true);
      }
    } finally { button.disabled = false; update(); }
  });
  update();
})();
