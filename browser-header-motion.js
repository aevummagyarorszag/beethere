(() => {
  const header = document.getElementById('top');
  const canvas = document.getElementById('browser-header-motion');
  const logo = header.querySelector('.browser-logo');
  const context = canvas.getContext('2d');
  if (!context) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#FFCA43', '#FF8B38', '#F52F78', '#8925D5'];
  let width = 0, height = 0, logoBox, frame = 0, lastPaint = -Infinity;
  let visible = false;

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
  function resize() {
    const bounds = header.getBoundingClientRect();
    const image = logo.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    logoBox = { left: image.left - bounds.left - 10, right: image.right - bounds.left + 10,
      top: image.top - bounds.top - 10, bottom: image.bottom - bounds.top + 10 };
    draw(performance.now());
  }
  function draw(now) {
    if (!logoBox || !width || !height) return;
    context.clearRect(0, 0, width, height);
    const time = reducedMotion.matches ? 0 : now * .00016;
    // Fixed dot grid, with flowing, irregular wave fronts as in the reference.
    const spacing = width < 760 ? 5 : 6;
    for (let y = 3; y < height; y += spacing) {
      for (let x = 3; x < width; x += spacing) {
        const dx = Math.max(logoBox.left - x, 0, x - logoBox.right);
        const dy = Math.max(logoBox.top - y, 0, y - logoBox.bottom);
        const clearance = Math.min(1, Math.hypot(dx, dy) / 18);
        if (!clearance) continue;
        const nx = x / 105, ny = y / 85;
        const warp = noise(nx * .65 + time * .3, ny * .7 - time * .2);
        const field = noise(nx + time, ny - time * .8 + warp * 1.5) * .65
          + noise(nx * 2.8 - time * .6, ny * 2.8 + time * .5) * .25
          + noise(nx * 7 + time, ny * 7) * .1;
        const band = field + y / height * .16;
        if (band < .39 || (band < .45 && hash(x, y) > (band - .39) / .06)) continue;
        const color = Math.min(3, Math.floor(Math.max(0, band - .44) * 12));
        context.fillStyle = colors[color];
        context.globalAlpha = (.18 + field * .12) * smooth(clearance);
        context.beginPath(); context.arc(x, y, spacing * .36, 0, Math.PI * 2); context.fill();
      }
    }
    context.globalAlpha = 1;
  }
  function animate(now) {
    frame = 0;
    if (!visible || document.hidden || reducedMotion.matches || !document.body.classList.contains('browser-landing')) return;
    if (now - lastPaint >= 50) { draw(now); lastPaint = now; }
    frame = requestAnimationFrame(animate);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0;
    if (visible && !document.hidden && document.body.classList.contains('browser-landing')) {
      resize();
      if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
    }
  }
  new ResizeObserver(resize).observe(header);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(header);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  logo.addEventListener('load', resize);
})();
