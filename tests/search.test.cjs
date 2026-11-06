const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const searchStart = source.indexOf('function normalizeSearchText(');
const searchEnd = source.indexOf('\nfunction rememberSearch(', searchStart);

function event(Title, Category, Location, Date = '2026.08.14') {
  return { Title, Category, Location, Date, Description: '', 'Long description': '' };
}

function searchContext(programs = []) {
  const context = {
    CITIES: [
      { name: 'Budapest' }, { name: 'Debrecen' }, { name: 'Győr' },
      { name: 'Pécs' }, { name: 'Székesfehérvár' },
    ],
    CATEGORIES: ['party', 'kultúra', 'sport'],
    events: programs,
    permanentEvents: [],
    eventCategories: item => [item.Category || ''].filter(Boolean),
    eventKey: item => `${item.Title}|${item.Date}|${item.Location}`,
    eventDateValue: item => item.Date,
    dateKey(value) {
      const match = String(value || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
    },
    isPastEvent: () => false,
    isFree: () => false,
    eventStartTimeText: () => '',
    eventDateOnly: item => item.Date,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function eventDateRange('), source.indexOf('function formatEventDateKey(')), context);
  vm.runInContext(source.slice(searchStart, searchEnd), context);
  return context;
}

test('search accepts year-first and day-first dates and rejects invalid dates', () => {
  const context = searchContext();
  assert.equal(context.parseSearchDate('2026.08.14'), '2026-08-14');
  assert.equal(context.parseSearchDate('14/08/2026'), '2026-08-14');
  assert.equal(context.parseSearchDate('2026-02-31'), '');
  assert.equal(context.parseSearchDate('party'), '');
});

test('title matches rank ahead of topic matches, which rank ahead of location matches', () => {
  const context = searchContext([
    event('Party Nights', 'zene', 'Budapest'),
    event('Nyári koncert', 'party', 'Debrecen'),
    event('Kézműves vásár', 'kultúra', 'Party utca'),
  ]);
  const ranked = context.rankedSearchEvents('party');
  assert.deepEqual(Array.from(ranked, item => item.Title), ['Party Nights', 'Nyári koncert', 'Kézműves vásár']);
});

test('a Hungarian topic synonym finds events in that category', () => {
  const context = searchContext([
    event('Péntek esti program', 'party', 'Budapest'),
    event('Komolyzenei hangverseny', 'kultúra', 'Pécs'),
  ]);
  assert.deepEqual(Array.from(context.rankedSearchEvents('parti'), item => item.Title), ['Péntek esti program']);
});

test('a numeric date query returns only events on that date', () => {
  const context = searchContext([
    event('Első esemény', 'party', 'Budapest', '2026.08.14'),
    event('Második esemény', 'kultúra', 'Pécs', '2026.08.15'),
  ]);
  assert.deepEqual(Array.from(context.rankedSearchEvents('14.08.2026'), item => item.Title), ['Első esemény']);
});

test('city detection requires a known settlement and ignores capitalization', () => {
  const context = searchContext();
  for (const query of ['Koncert', 'KONCERT', 'Party Nights', 'Sportfalu', 'Ismeretlenváros']) {
    assert.equal(context.isLikelyPlaceQuery(query), false, query);
  }
  for (const query of ['Győr', 'győr', 'GYŐR', '  Budapest  ']) {
    assert.equal(context.isLikelyPlaceQuery(query), true, query);
  }
});

test('place empty state uses a Hungarian city inflection or neutral settlement wording', () => {
  const context = searchContext();
  assert.equal(context.placeNoResultsMessage('Győr'), 'Nincs Győrben esemény.');
  assert.equal(context.placeNoResultsMessage('Kiskunmajsa'), 'Nincs esemény ezen a településen: Kiskunmajsa.');
});

test('search suggestions wait 300ms and cancel the previous pending query', () => {
  const calls = [];
  const timeouts = new Map();
  const canceled = [];
  const indicator = { hidden: true };
  const searchResults = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; } };
  const clearButton = { hidden: true };
  let nextTimeout = 0;
  const context = {
    searchInput: { value: 'a' },
    searchResults,
    window: {
      clearTimeout(id) { if (!id) return; canceled.push(id); timeouts.delete(id); },
      setTimeout(callback, delay) { assert.equal(delay, 300); const id = ++nextTimeout; timeouts.set(id, callback); return id; },
    },
    find(selector) { return selector === '#search-loading' ? indicator : clearButton; },
    renderSearchResults(query, options) { calls.push([query, options]); indicator.hidden = true; searchResults.removeAttribute('aria-busy'); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function eventDateRange('), source.indexOf('function formatEventDateKey(')), context);
  const start = source.indexOf('let searchDebounceTimer = 0;');
  const end = source.indexOf('\nfunction renderSearchResults(', start);
  vm.runInContext(source.slice(start, end), context);
  context.scheduleSearchSuggestions();
  assert.equal(calls.length, 0);
  assert.equal(indicator.hidden, false);
  assert.equal(searchResults.attributes['aria-busy'], 'true');
  const firstTimeout = nextTimeout;
  context.searchInput.value = 'ab';
  context.scheduleSearchSuggestions();
  assert.deepEqual(canceled, [firstTimeout]);
  assert.equal(calls.length, 0);
  const latestTimeout = nextTimeout;
  timeouts.get(latestTimeout)();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'ab');
  assert.equal(calls[0][1].showSuggestions, true);
  assert.equal(indicator.hidden, true);
  assert.equal(clearButton.hidden, false);
});
