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

test('place empty state uses a Hungarian city inflection or neutral settlement wording', () => {
  const context = searchContext();
  assert.equal(context.placeNoResultsMessage('Győr'), 'Nincs Győrben esemény.');
  assert.equal(context.placeNoResultsMessage('Kiskunmajsa'), 'Nincs esemény ezen a településen: Kiskunmajsa.');
});

test('search suggestions update immediately from the input event without waiting for blur', () => {
  const calls = [];
  const clearButton = { hidden: true };
  const context = {
    searchInput: { value: 'a' },
    window: { clearTimeout() {} },
    currentAppView: 'search',
    find: () => clearButton,
    renderSearchResults(query, options) { calls.push([query, options]); },
  };
  vm.createContext(context);
  const start = source.indexOf('let searchDebounceTimer = 0;');
  const end = source.indexOf('\nfunction renderSearchResults(', start);
  vm.runInContext(source.slice(start, end), context);
  context.scheduleSearchSuggestions();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'a');
  assert.equal(calls[0][1].showSuggestions, true);
  assert.equal(clearButton.hidden, false);
});
