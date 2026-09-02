import { describe, it, expect } from 'vitest';
import {
  queryLocalLists,
  matchCategory,
  CATEGORY_LISTS,
} from '../services/local-category-lists';

// ---------------------------------------------------------------------------
// Tests: matchCategory
// ---------------------------------------------------------------------------

describe('matchCategory', () => {
  it('matches exact category keys (case-insensitive)', () => {
    expect(matchCategory('movies')).toBe('movies');
    expect(matchCategory('Movies')).toBe('movies');
    expect(matchCategory('MOVIES')).toBe('movies');
  });

  it('matches partial category keys', () => {
    expect(matchCategory('best movies of all time')).toBe('movies');
    expect(matchCategory('football players in history')).toBe('football players');
    expect(matchCategory('top video games')).toBe('video games');
  });

  it('matches when key is contained in category', () => {
    expect(matchCategory('my favorite pasta dishes')).toBe('pasta');
    expect(matchCategory('famous cities around the world')).toBe('cities');
  });

  it('matches individual words in category against keys', () => {
    expect(matchCategory('greatest musical artists ever')).toBe('music artists');
    expect(matchCategory('coolest animals on earth')).toBe('animals');
  });

  it('returns undefined for unknown categories', () => {
    expect(matchCategory('quantum physics theories')).toBeUndefined();
    expect(matchCategory('best programming languages')).toBeUndefined();
    expect(matchCategory('xyz')).toBeUndefined();
  });

  it('handles empty and whitespace-only strings', () => {
    expect(matchCategory('')).toBeUndefined();
    expect(matchCategory('   ')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: queryLocalLists
// ---------------------------------------------------------------------------

describe('queryLocalLists', () => {
  it('returns suggestions for a matching category', () => {
    const results = queryLocalLists('movies', [], 5);
    expect(results).toHaveLength(5);
    results.forEach(item => {
      expect(CATEGORY_LISTS['movies']).toContain(item);
    });
  });

  it('excludes existing participants from results', () => {
    const existing = ['The Godfather', 'Inception', 'The Matrix'];
    const results = queryLocalLists('movies', existing, 10);

    expect(results).toHaveLength(10);
    existing.forEach(name => {
      expect(results).not.toContain(name);
    });
  });

  it('excludes existing participants case-insensitively', () => {
    const existing = ['the godfather', 'INCEPTION'];
    const results = queryLocalLists('movies', existing, 30);

    const resultsLower = results.map(r => r.toLowerCase());
    expect(resultsLower).not.toContain('the godfather');
    expect(resultsLower).not.toContain('inception');
  });

  it('returns up to count items', () => {
    const results = queryLocalLists('animals', [], 3);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results.length).toBe(3);
  });

  it('returns fewer items if not enough available after filtering', () => {
    // Request more than available after filtering most out
    const existing = CATEGORY_LISTS['sports']!.slice(0, 34);
    const results = queryLocalLists('sports', existing, 10);
    expect(results.length).toBeLessThanOrEqual(10);
    expect(results.length).toBe(CATEGORY_LISTS['sports']!.length - 34);
  });

  it('returns empty array for unknown categories', () => {
    const results = queryLocalLists('quantum physics', [], 5);
    expect(results).toEqual([]);
  });

  it('returns empty array when all items are excluded', () => {
    const allMovies = [...CATEGORY_LISTS['movies']!];
    const results = queryLocalLists('movies', allMovies, 5);
    expect(results).toEqual([]);
  });

  it('handles fuzzy category matching', () => {
    const results = queryLocalLists('best football players ever', [], 5);
    expect(results).toHaveLength(5);
    results.forEach(item => {
      expect(CATEGORY_LISTS['football players']).toContain(item);
    });
  });

  it('shuffles results (non-deterministic but from valid set)', () => {
    // Run multiple times and check all results are valid
    for (let i = 0; i < 5; i++) {
      const results = queryLocalLists('countries', [], 5);
      expect(results).toHaveLength(5);
      results.forEach(item => {
        expect(CATEGORY_LISTS['countries']).toContain(item);
      });
    }
  });
});
