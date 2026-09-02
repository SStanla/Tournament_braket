import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { queryLocalLists, CATEGORY_LISTS } from '../services/local-category-lists';

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 9: Suggestion Count Equals Remaining Slots
// **Validates: Requirements 4.3**
// ---------------------------------------------------------------------------
describe('Property 9: Suggestion Count Equals Remaining Slots', () => {
  const PBT_CONFIG = { numRuns: 100 };

  const moviesList = CATEGORY_LISTS['movies']; // 36 items

  it('for any bracket with N participants where N < bracketSize, queryLocalLists produces exactly bracketSize - N suggestions when enough items are available', () => {
    // bracketSize is 8 or 16; N is some number of existing participants from the movies list
    // remaining = bracketSize - N; as long as remaining <= available items in list minus N
    fc.assert(
      fc.property(
        fc.constantFrom(8, 16),
        fc.nat({ max: 15 }), // N: number of existing participants (0..15)
        (bracketSize, n) => {
          // Ensure N < bracketSize
          const existingCount = Math.min(n, bracketSize - 1);
          const count = bracketSize - existingCount; // remaining slots

          // Pick the first existingCount items as "existing participants"
          const existing = moviesList.slice(0, existingCount);

          // Available items in list after removing existing = 36 - existingCount
          // We need count <= available
          const available = moviesList.length - existingCount;
          if (count > available) return; // skip if not enough items

          const result = queryLocalLists('movies', existing, count);
          expect(result.length).toBe(count);
        }
      ),
      PBT_CONFIG
    );
  });

  it('for any bracket with N existing participants picked randomly, suggestion count equals remaining slots', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(8, 16),
        fc.shuffledSubarray(moviesList, { minLength: 0, maxLength: 15 }),
        (bracketSize, existing) => {
          // Ensure existing < bracketSize
          const trimmedExisting = existing.slice(0, Math.min(existing.length, bracketSize - 1));
          const count = bracketSize - trimmedExisting.length;

          // Ensure enough available items
          const available = moviesList.length - trimmedExisting.length;
          if (count > available) return;

          const result = queryLocalLists('movies', trimmedExisting, count);
          expect(result.length).toBe(count);
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 10: Suggestion Uniqueness
// **Validates: Requirements 4.2**
// ---------------------------------------------------------------------------
describe('Property 10: Suggestion Uniqueness', () => {
  const PBT_CONFIG = { numRuns: 100 };

  const animalsList = CATEGORY_LISTS['animals']; // 36 items
  const moviesList = CATEGORY_LISTS['movies']; // 36 items

  it('no suggestion duplicates any existing participant name', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(animalsList, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 16 }),
        (existing, count) => {
          // Ensure enough available items
          const available = animalsList.length - existing.length;
          if (count > available) return;

          const result = queryLocalLists('animals', existing, count);

          // No suggestion should duplicate any existing participant
          const existingLower = new Set(existing.map(e => e.toLowerCase()));
          for (const suggestion of result) {
            expect(existingLower.has(suggestion.toLowerCase())).toBe(false);
          }
        }
      ),
      PBT_CONFIG
    );
  });

  it('no suggestion appears more than once in the results', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(moviesList, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1, max: 16 }),
        (existing, count) => {
          // Ensure enough available items
          const available = moviesList.length - existing.length;
          if (count > available) return;

          const result = queryLocalLists('movies', existing, count);

          // No duplicates within the result set
          const seen = new Set<string>();
          for (const suggestion of result) {
            expect(seen.has(suggestion)).toBe(false);
            seen.add(suggestion);
          }
        }
      ),
      PBT_CONFIG
    );
  });

  it('all results belong to the category list', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('animals', 'movies'),
        fc.nat({ max: 15 }),
        fc.integer({ min: 1, max: 10 }),
        (category, existingCount, count) => {
          const list = CATEGORY_LISTS[category];
          const existing = list.slice(0, Math.min(existingCount, list.length - 1));

          const available = list.length - existing.length;
          if (count > available) return;

          const result = queryLocalLists(category, existing, count);

          // All results should be from the category list
          const listLower = new Set(list.map(item => item.toLowerCase()));
          for (const suggestion of result) {
            expect(listLower.has(suggestion.toLowerCase())).toBe(true);
          }
        }
      ),
      PBT_CONFIG
    );
  });

  it('combined uniqueness: no suggestion duplicates existing or other suggestions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('animals', 'movies'),
        fc.shuffledSubarray(animalsList, { minLength: 1, maxLength: 15 }),
        fc.integer({ min: 1, max: 10 }),
        (category, existingFromAnimals, count) => {
          const list = CATEGORY_LISTS[category];
          // Use existing items that are actually from the target category
          const existing = existingFromAnimals
            .filter(item => list.map(l => l.toLowerCase()).includes(item.toLowerCase()))
            .slice(0, 15);

          const available = list.length - existing.length;
          if (count > available || count < 1) return;

          const result = queryLocalLists(category, existing, count);

          // No suggestion duplicates any existing
          const existingLower = new Set(existing.map(e => e.toLowerCase()));
          for (const suggestion of result) {
            expect(existingLower.has(suggestion.toLowerCase())).toBe(false);
          }

          // No duplicates within results
          const resultLower = result.map(r => r.toLowerCase());
          const uniqueResults = new Set(resultLower);
          expect(uniqueResults.size).toBe(result.length);
        }
      ),
      PBT_CONFIG
    );
  });
});
