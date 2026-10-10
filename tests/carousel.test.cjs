const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'script.js'), 'utf8');
const start = source.indexOf('function setupCarousel(');
const implementation = source.slice(start, source.indexOf('\nfunction scrollCarousel(', start));

function fixture({ compact = false, reduced = false } = {}) {
  let now = 0, nextId = 0, capture = null;
  const frames = new Map(), timers = new Map(), listeners = new Map();
  const classes = () => {
    const values = new Set();
    return { add: x => values.add(x), remove: x => values.delete(x), contains: x => values.has(x), toggle(x, on) { on ? values.add(x) : values.delete(x); } };
  };
  const control = () => ({ matches: () => false, classList: classes(), setAttribute() {}, addEventListener() {}, closest: () => null });
  const carousel = {
    dataset: {}, classList: classes(), parentElement: { classList: classes() },
    scrollLeft: 0, scrollWidth: 1920, clientWidth: 320, isConnected: true,
    children: [], contains: x => carousel.children.includes(x), append: x => carousel.children.push(x),
    getBoundingClientRect: () => ({ left: 0, width: 320 }),
    addEventListener(name, callback) { listeners.set(name, callback); },
    setPointerCapture: id => { capture = id; }, hasPointerCapture: id => capture === id,
    releasePointerCapture(id) { capture = null; listeners.get('lostpointercapture')?.({ pointerId: id, type: 'lostpointercapture' }); },
  };
  const cards = Array.from({ length: 6 }, (_, index) => ({
    matches: selector => compact && selector === '.compact-event-page',
    getBoundingClientRect: () => ({ left: index * 320 - carousel.scrollLeft, width: 300 }),
  }));
  carousel.children.push(...cards);
  const context = {
    window: {
      requestAnimationFrame(f) { frames.set(++nextId, f); return nextId; }, cancelAnimationFrame: id => frames.delete(id),
      setTimeout(f) { timers.set(++nextId, f); return nextId; }, clearTimeout: id => timers.delete(id),
      matchMedia: () => ({ matches: reduced }), addEventListener() {},
    }, performance: { now: () => now }, document: { createElement: control },
    getComputedStyle: () => ({ scrollPaddingLeft: '0' }),
    findAll: () => cards, syncCarouselControls() {}, recordSkippedCards() {}, updateCarouselCardVisibility() {},
    MutationObserver: class { observe() {} }, triggerBounce() {}, vibrate() {},
  };
  vm.createContext(context); vm.runInContext(implementation, context); context.setupCarousel(carousel);
  const target = kind => ({ closest(selector) {
    if (selector === '[data-carousel-ready="true"]') return carousel;
    if (kind === 'input' && selector.includes('input')) return {};
    if (kind === 'button' && selector.includes('button')) return { classList: classes() };
    return null;
  } });
  let prevented = false;
  const fire = (type, values = {}) => {
    const event = { type, pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 250, clientY: 20,
      target: target('card'), preventDefault() { prevented = true; }, stopPropagation() {}, ...values };
    listeners.get(type)?.(event); return event;
  };
  const tick = ms => { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(f => f(now)); };
  const finish = () => { for (let i = 0; i < 30 && frames.size; i++) tick(16); };
  const drag = (dx, kind = 'card') => {
    const t = target(kind);
    fire('pointerdown', { target: t }); tick(16);
    fire('pointermove', { clientX: 250 - dx, target: t }); tick(16);
    fire('pointerup', { clientX: 250 - dx, target: t });
  };
  return { carousel, fire, tick, finish, drag, target, prevented: () => prevented, timers };
}

test('rapid swipes advance immediately while the preceding animation is unfinished', () => {
  const f = fixture(); f.drag(100); f.tick(8);
  assert.ok(f.carousel.scrollLeft < 160);
  f.drag(100); f.finish(); assert.equal(f.carousel.scrollLeft, 640);
  f.drag(100); f.finish(); assert.equal(f.carousel.scrollLeft, 960);
});
test('swipe starting on a card button advances; an ordinary button tap is preserved', () => {
  const f = fixture(); f.drag(110, 'button'); f.finish(); assert.equal(f.carousel.scrollLeft, 320);
  f.fire('pointerdown', { target: f.target('button') }); f.fire('pointerup');
  const tap = fixture(); tap.fire('pointerdown', { target: tap.target('button') }); tap.fire('pointerup');
  tap.fire('click'); assert.equal(tap.prevented(), false);
});
test('forward travel settles on one page, backward travel can cross multiple pages', () => {
  const f = fixture(); f.drag(1200); f.finish(); assert.equal(f.carousel.scrollLeft, 320);
  f.carousel.scrollLeft = 1280; f.drag(-700); f.finish(); assert.ok(f.carousel.scrollLeft <= 640);
});
test('compact three-card pages use page boundaries', () => {
  const f = fixture({ compact: true }); f.drag(110); f.finish(); assert.equal(f.carousel.scrollLeft, 320);
});
test('vertical gesture and cancelled pointer do not lock the next swipe', () => {
  const f = fixture(); f.fire('pointerdown'); f.fire('pointermove', { clientY: 100 }); f.fire('pointercancel');
  assert.equal(f.carousel.scrollLeft, 0);
  f.fire('pointerdown'); f.fire('pointermove', { clientX: 100 }); f.fire('pointercancel'); f.finish();
  f.drag(120); f.finish(); assert.equal(f.carousel.scrollLeft, 320);
});
test('endpoints remain usable and reduced motion settles without an animation', () => {
  const f = fixture({ reduced: true }); f.drag(-200); assert.equal(f.carousel.scrollLeft, 0);
  f.carousel.scrollLeft = 1600; f.drag(200); assert.equal(f.carousel.scrollLeft, 1600);
  f.drag(-350); assert.ok(f.carousel.scrollLeft < 1600);
});
test('repeated arrow actions advance during settling and vertical wheels remain native', () => {
  const f = fixture(); f.carousel._stepPage(1); f.tick(8); f.carousel._stepPage(1); f.finish();
  assert.equal(f.carousel.scrollLeft, 640);
  f.fire('wheel', { deltaX: 0, deltaY: 80, deltaMode: 0 }); assert.equal(f.prevented(), false);
});

test('trackpad horizontal bursts settle and the following burst advances again', () => {
  const f = fixture();
  const burst = () => {
    for (let i = 0; i < 4; i++) { f.fire('wheel', { deltaX: 30, deltaY: 0, deltaMode: 0 }); f.tick(16); }
    const pending = [...f.timers.values()]; f.timers.clear(); pending.forEach(fn => fn());
    f.finish();
  };
  burst(); assert.equal(f.carousel.scrollLeft, 320);
  burst(); assert.equal(f.carousel.scrollLeft, 640);
});

test('a tap during settling does not freeze a card between two positions', () => {
  const f = fixture(); f.drag(100); f.tick(8);
  f.fire('pointerdown'); f.fire('pointerup'); f.finish();
  assert.equal(f.carousel.scrollLeft, 320);
});

test('another nested carousel or an editable input cannot start this carousel', () => {
  const f = fixture();
  const nested = { closest: () => ({}) };
  f.fire('pointerdown', { target: nested }); f.fire('pointermove', { clientX: 10, target: nested }); f.fire('pointerup');
  f.drag(100, 'input'); f.finish(); assert.equal(f.carousel.scrollLeft, 0);
});

test('hover after a release outside the rail never moves a card', () => {
  const f = fixture();
  f.fire('pointerdown');
  f.fire('pointermove', { clientX: 100, buttons: 0 });
  f.finish(); assert.equal(f.carousel.scrollLeft, 0);
  f.fire('pointerdown'); f.fire('pointerleave');
  f.fire('pointermove', { clientX: 80, buttons: 0 });
  f.finish(); assert.equal(f.carousel.scrollLeft, 0);
});

test('tiny quick movements and diagonal taps do not advance', () => {
  const f = fixture(); f.drag(8); f.finish(); assert.equal(f.carousel.scrollLeft, 0);
  f.drag(15); f.finish(); assert.equal(f.carousel.scrollLeft, 0);
  f.fire('pointerdown'); f.fire('pointermove', { clientX: 236, clientY: 33 }); f.fire('pointerup');
  f.finish(); assert.equal(f.carousel.scrollLeft, 0);
});
