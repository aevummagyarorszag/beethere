(() => {
  const button = document.getElementById('install-app');
  const guide = document.getElementById('install-guide');
  const steps = document.getElementById('install-steps');
  const mode = matchMedia('(display-mode: standalone)');
  let deferredPrompt;
  let installed = false;

  function update() {
    button.hidden = installed || mode.matches || navigator.standalone === true;
    if (button.hidden && guide.open) guide.close();
  }

  const preview = guide.querySelector('.install-preview');
  const play = document.getElementById('install-play');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let sequence = [];
  let current = 0;
  let playing = false;
  let timer;

  function instructions() {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return [
      ['toolbar', 'Böngésző', '⋮', 'Nyisd meg a böngésző menüjét.'],
      ['menu', 'Böngészőmenü', 'Alkalmazás telepítése', 'Válaszd az „Alkalmazás telepítése” vagy a „Főképernyőhöz adás” lehetőséget, ha elérhető.'],
      ['confirm', 'Bee There', 'Telepítés', 'Erősítsd meg a telepítést a megjelenő ablakban.']
    ];
    const chrome = /CriOS/.test(ua);
    const safari = /Version\/.*Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    const list = [
      [chrome ? 'chrome' : 'share', chrome ? 'Chrome · címsor' : 'Böngészőmenü', 'Megosztás',
        chrome ? 'Koppints a Chrome címsorának jobb oldalán a megosztás ikonra.' : 'Koppints a megosztás ikonra. Ha nem látod, nyisd meg a böngésző menüjét.'],
      ['menu', 'Megosztási lap', '⊞  Főképernyőhöz adás', 'Görgess le a megosztási lapon, és válaszd a „Főképernyőhöz adás” sort.']
    ];
    if (safari) list.push(['toggle', 'Főképernyőhöz adás', 'Open as Web App', 'Ha megjelenik az „Open as Web App” kapcsoló, kapcsold be.']);
    list.push(['confirm', 'Bee There', 'Hozzáadás', 'Koppints a „Hozzáadás” gombra. Ezután a Bee There ikonról indítható.']);
    return list;
  }

  function schedule() {
    clearTimeout(timer);
    play.textContent = playing ? 'Szünet' : 'Lejátszás';
    preview.classList.toggle('playing', playing);
    if (playing && guide.open && !document.hidden) timer = setTimeout(() => advance(1), 4500);
  }

  function advance(delta) {
    current = (current + delta + sequence.length) % sequence.length;
    const [layout, context, target] = sequence[current];
    preview.dataset.layout = layout;
    document.getElementById('install-context').textContent = context;
    document.getElementById('install-target').textContent = target;
    document.getElementById('install-position').textContent = (current + 1) + ' / ' + sequence.length + '. lépés';
    Array.from(steps.children).forEach((item, index) => {
      if (index === current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    schedule();
  }

  function showGuide() {
    sequence = instructions();
    current = 0;
    playing = !reducedMotion.matches;
    steps.replaceChildren(...sequence.map(([, , , text]) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    guide.showModal();
    advance(0);
  }

  for (const [id, delta] of [['install-prev', -1], ['install-next', 1]]) {
    document.getElementById(id).addEventListener('click', () => {
      playing = false;
      advance(delta);
    });
  }
  play.addEventListener('click', () => { playing = !playing; schedule(); });
  guide.addEventListener('close', () => clearTimeout(timer));
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', () => { playing = !reducedMotion.matches; schedule(); });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    update();
  });
  mode.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  button.addEventListener('click', async () => {
    if (button.hidden || button.disabled) return;
    if (!deferredPrompt) return showGuide();
    const request = deferredPrompt;
    deferredPrompt = null;
    button.disabled = true;
    try {
      await request.prompt();
      await request.userChoice;
    } catch {
      if (!button.hidden) showGuide();
    } finally {
      button.disabled = false;
    }
  });
  update();
})();
