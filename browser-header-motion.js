(() => {
  const states = [...document.querySelectorAll('.browser-motion')].map(canvas => ({
    canvas, context: canvas.getContext('2d'), area: canvas.parentElement,
    width: 0, height: 0, visible: false
  })).filter(state => state.context);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#FFCA43', '#FF8B38', '#F52F78', '#8925D5'];
  let frame = 0, lastPaint = -Infinity;
  const smooth = value => value * value * (3 - 2 * value);
  const hash = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const sx = smooth(x - ix), sy = smooth(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  function resize(state) {
    if (state.canvas.id === 'browser-promo-motion') {
      state.canvas.style.width = `${document.documentElement.clientWidth}px`;
      state.canvas.style.left = `${-state.area.getBoundingClientRect().left}px`;
    }
    const bounds = state.canvas.getBoundingClientRect();
    state.width = bounds.width; state.height = bounds.height;
    state.quietArea = null;
    if (state.canvas.id === 'browser-header-motion') {
      const text = state.area.querySelector('.browser-tagline');
      const range = document.createRange();
      range.selectNodeContents(text);
      const label = range.getBoundingClientRect();
      state.quietArea = { left: label.left - bounds.left, right: label.right - bounds.left,
        top: label.top - bounds.top, bottom: label.bottom - bounds.top };
    }
    const scale = Math.min(devicePixelRatio || 1, 2);
    state.canvas.width = Math.round(state.width * scale);
    state.canvas.height = Math.round(state.height * scale);
    state.context.setTransform(scale, 0, 0, scale, 0, 0);
    draw(state, performance.now());
  }
  function draw(state, now) {
    const { context, width, height } = state;
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const time = reducedMotion.matches ? 0 : now * .00016;
    // Both sections share the same moving dot field and warm brand palette.
    const spacing = width < 760 ? 5 : 6;
    for (let y = 3; y < height; y += spacing) {
      if (state.quietArea && y + spacing * .36 > state.quietArea.bottom) break;
      for (let x = 3; x < width; x += spacing) {
        const quiet = state.quietArea;
        if (quiet) {
          const dx = Math.max(quiet.left - x, 0, x - quiet.right);
          const dy = Math.max(quiet.top - y, 0, y - quiet.bottom);
          // Keep the text clear, with a stable, irregular scatter around its edges.
          const edge = 2 + noise(x / 23, y / 17) * 6 + hash(x, y) ** 2 * 14;
          if (Math.hypot(dx, dy) < edge) continue;
        }
        const nx = x / 105, ny = y / 85;
        const warp = noise(nx * .65 + time * .3, ny * .7 - time * .2);
        const field = noise(nx + time, ny - time * .8 + warp * 1.5) * .65
          + noise(nx * 2.8 - time * .6, ny * 2.8 + time * .5) * .25
          + noise(nx * 7 + time, ny * 7) * .1;
        const band = field + y / height * .16;
        if (band < .39 || (band < .45 && hash(x, y) > (band - .39) / .06)) continue;
        context.fillStyle = colors[Math.min(3, Math.floor(Math.max(0, band - .44) * 12))];
        context.globalAlpha = .25 + field * .16;
        context.beginPath(); context.arc(x, y, spacing * .36, 0, Math.PI * 2); context.fill();
      }
    }
    context.globalAlpha = 1;
  }
  function canAnimate() {
    return !document.hidden && !reducedMotion.matches && document.body.classList.contains('browser-landing');
  }
  function animate(now) {
    frame = 0;
    if (!canAnimate() || !states.some(state => state.visible)) return;
    if (now - lastPaint >= 50) {
      states.filter(state => state.visible).forEach(state => draw(state, now));
      lastPaint = now;
    }
    frame = requestAnimationFrame(animate);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0;
    if (!document.hidden && document.body.classList.contains('browser-landing')) {
      states.filter(state => state.visible).forEach(resize);
      if (canAnimate() && states.some(state => state.visible)) frame = requestAnimationFrame(animate);
    }
  }
  const sizeObserver = new ResizeObserver(entries => entries.forEach(entry => {
    const state = states.find(item => item.area === entry.target);
    if (state) resize(state);
  }));
  const visibilityObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { states.find(state => state.area === entry.target).visible = entry.isIntersecting; });
    sync();
  });
  states.forEach(state => { sizeObserver.observe(state.area); visibilityObserver.observe(state.area); });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('resize', () => states.forEach(resize));
})();
