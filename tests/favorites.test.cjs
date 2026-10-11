const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const start = source.indexOf('function syncSavedEventControls(');
const end = source.indexOf('\nfunction rerankEventRows(', start);

function button() {
  const classes = new Set();
  const attributes = new Map();
  return {
    isConnected: true,
    classList: {
      toggle(name, active) { active ? classes.add(name) : classes.delete(name); },
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    closest: () => ({ dataset: { eventKey: 'concert' } }),
  };
}

function fixture(view = 'home') {
  const heart = button();
  heart.dataset = { eventKey: 'concert' };
  const pin = button();
  const frames = [];
  const timers = new Map();
  let nextTimer = 0;
  const forbidden = () => assert.fail('A favorite interaction rebuilt content or changed the scroll position');
  const context = {
    favoriteIds: new Set(), favoriteNotes: {}, pinnedEventKeys: new Set(), negativeFeedback: {},
    currentAppView: view, plannerPin: pin, plannerEvent: { dataset: { eventKey: 'concert' } },
    window: {
      scrollY: 640, scrollTo: forbidden,
      requestAnimationFrame(callback) { frames.push(callback); },
      setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout(id) { timers.delete(id); },
    },
    localStorage: { setItem() {} }, NEGATIVE_FEEDBACK_STORAGE_KEY: 'feedback',
    eventKey: event => event.id,
    findAll: selector => selector.startsWith('.favorite-button') ? [heart] : selector === '.planner-card-pin' ? [pin] : [],
    saveFavorites() {}, saveFavoriteNotes() {}, savePinnedPlannerEvents() {},
    recordNegativeFeedback(event) { context.negativeFeedback[event.id] = 1; },
    refreshCalendarFavoriteMarkers() {}, updateProfileSummary() {}, triggerBounce() {}, vibrate() {},
    preservePageScroll: forbidden, rerankEventRows: forbidden, renderFavorites: forbidden,
    showSnackbar(message, options) { context.snackbar = { message, ...options }; },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, heart, pin, frames, timers, event: { id: 'concert' }, card: { dataset: {} } };
}

for (const view of ['home', 'permanent', 'favorites', 'search']) {
  test(`liking and unliking in ${view} keeps the feed and scroll position intact`, () => {
    const f = fixture(view);
    f.context.toggleFavoriteForEvent(f.event, f.heart, f.card);
    assert.ok(f.context.favoriteIds.has('concert'));
    assert.equal(f.heart.getAttribute('aria-pressed'), 'true');
    f.context.window.scrollY = 720;
    f.context.toggleFavoriteForEvent(f.event, f.heart, f.card);
    assert.ok(!f.context.favoriteIds.has('concert'));
    assert.equal(f.heart.getAttribute('aria-pressed'), 'false');
    assert.equal(f.context.window.scrollY, 720);
    assert.equal(f.frames.length, 0);
  });
}

test('undo restores the favorite, plan and note without scrolling back', () => {
  const f = fixture('favorites');
  f.context.favoriteIds.add('concert');
  f.context.pinnedEventKeys.add('concert');
  f.context.favoriteNotes.concert = 'Meet at the entrance';
  f.context.toggleFavoriteForEvent(f.event, f.heart, f.card);
  assert.equal(f.pin.getAttribute('aria-pressed'), 'false');
  f.context.window.scrollY = 900;
  f.context.snackbar.action();
  assert.ok(f.context.favoriteIds.has('concert'));
  assert.ok(f.context.pinnedEventKeys.has('concert'));
  assert.equal(f.pin.getAttribute('aria-pressed'), 'true');
  assert.equal(f.context.favoriteNotes.concert, 'Meet at the entrance');
  assert.equal(f.context.window.scrollY, 900);
  assert.equal(f.frames.length, 0);
});

test('an unlike during the heart animation is immediate and cancels the old timer', () => {
  const f = fixture();
  f.context.toggleFavoriteForEvent(f.event, f.heart, f.card);
  assert.ok(f.heart.classList.contains('is-heart-feedback'));
  assert.equal(f.timers.size, 1);
  f.context.toggleFavoriteForEvent(f.event, f.heart, f.card);
  assert.ok(!f.heart.classList.contains('is-heart-feedback'));
  assert.equal(f.timers.size, 0);
  f.context.toggleFavoriteForEvent(f.event, f.heart, f.card);
  assert.equal(f.heart.getAttribute('aria-pressed'), 'true');
  assert.equal(f.timers.size, 1);
});

test('a favorite in an open detail dialog does not unlock or scroll the background', () => {
  const f = fixture();
  f.context.document = { body: { style: { position: 'fixed', top: '-640px' } } };
  f.context.toggleFavoriteForEvent(f.event, f.heart);
  assert.equal(f.context.document.body.style.position, 'fixed');
  assert.equal(f.context.document.body.style.top, '-640px');
  assert.equal(f.frames.length, 0);
});
