const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const start = source.indexOf('function userPreferenceTraits(');
const end = source.indexOf('\nfunction diversifyEqualScoreEvents(', start);
const implementation = source.slice(start, end);

function recommendationContext({ favorites = [], pinned = [], details = new Set() } = {}) {
  const catalog = Array.from({ length: 30 }, (_, index) => ({ id: `event-${index}` }));
  const context = {
    events: catalog,
    permanentEvents: [],
    favoriteIds: new Set(favorites),
    pinnedEventKeys: new Set(pinned),
    detailInterestWeights: {},
    detailedEventKeys: details,
    profilePreferences: { categories: [], moods: [], companions: [], budget: 20000, times: [], spontaneity: '' },
    refreshTraitPenalties: new Map(),
    refreshEventPenalties: new Map(),
    refreshShuffleBoosts: new Map(),
    refreshSeenEventKeys: new Set(),
    shareInterestScores: new Map(),
    negativeFeedback: {},
    eventKey: event => event.id,
    eventPreferenceTraits: () => ['category:party'],
    eventCategories: () => [],
    distancePreferencePoints: () => 0,
    eventMoodMatches: () => false,
    eventCompanionMatches: () => false,
    eventPriceValue: () => Number.NaN,
    eventPriceTrait: () => '',
    eventTimeMatches: () => false,
    eventTimeTrait: () => '',
    eventDayTrait: () => '',
    eventSpontaneityMatches: () => false,
  };
  vm.createContext(context);
  vm.runInContext(implementation, context);
  return context;
}

test('favorite signals have diminishing returns and a low ceiling', () => {
  const one = recommendationContext({ favorites: ['event-0'] }).userPreferenceTraits().get('category:party');
  const four = recommendationContext({ favorites: ['event-0', 'event-1', 'event-2', 'event-3'] }).userPreferenceTraits().get('category:party');
  const many = recommendationContext({ favorites: Array.from({ length: 30 }, (_, index) => `event-${index}`) }).userPreferenceTraits().get('category:party');
  assert.ok(one < four && four < many);
  assert.equal(many, 0.7);
});

test('planning intent contributes more than a like without unbounded growth', () => {
  const favorite = recommendationContext({ favorites: ['event-0'] }).userPreferenceTraits().get('category:party');
  const planned = recommendationContext({ pinned: ['event-0'] }).userPreferenceTraits().get('category:party');
  const manyPlanned = recommendationContext({ pinned: Array.from({ length: 30 }, (_, index) => `event-${index}`) }).userPreferenceTraits().get('category:party');
  assert.ok(planned > favorite);
  assert.equal(manyPlanned, 1.8);
});

test('opening details gives a stable event-level interest bonus', () => {
  const context = recommendationContext({ details: new Set(['event-0']) });
  const event = { id: 'event-0' };
  const other = { id: 'event-1' };
  const baseline = context.eventPreferenceScore(other, Number.POSITIVE_INFINITY);
  assert.equal(context.eventPreferenceScore(event, Number.POSITIVE_INFINITY) - baseline, 0.75);
});

test('a planned event receives a positive event-level recommendation bonus', () => {
  const context = recommendationContext({ pinned: ['event-0'] });
  const event = { id: 'event-0' };
  const other = { id: 'event-1' };
  const baseline = context.eventPreferenceScore(other, Number.POSITIVE_INFINITY);
  assert.equal(context.eventPreferenceScore(event, Number.POSITIVE_INFINITY) - baseline, 1.25);
});
