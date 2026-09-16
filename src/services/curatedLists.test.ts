import { describe, it, expect } from 'vitest';
import { fuzzyMatchCategory, CURATED_CATEGORIES } from './curatedLists';

// Tests for the fuzzy, case-insensitive category matcher used as the curated
// fallback source (Req 9.6). Recognition covers exact matches, containment in
// either direction, and keyword recognition, all case-insensitively; anything
// unrecognized yields null.

/** Look up the canonical options for a category by name, for assertions. */
function optionsFor(categoryName: string): string[] {
  const entry = CURATED_CATEGORIES.find((c) => c.category === categoryName);
  if (!entry) throw new Error(`no curated category named ${categoryName}`);
  return entry.options;
}

describe('fuzzyMatchCategory (Req 9.6)', () => {
  it('matches the canonical category name exactly', () => {
    expect(fuzzyMatchCategory('Movies')).toEqual(optionsFor('Movies'));
  });

  it('matches exactly regardless of letter case', () => {
    expect(fuzzyMatchCategory('movies')).toEqual(optionsFor('Movies'));
    expect(fuzzyMatchCategory('MOVIES')).toEqual(optionsFor('Movies'));
    expect(fuzzyMatchCategory('MoViEs')).toEqual(optionsFor('Movies'));
  });

  it('trims surrounding whitespace before matching', () => {
    expect(fuzzyMatchCategory('   Movies   ')).toEqual(optionsFor('Movies'));
  });

  it('matches when the input contains the category name (containment)', () => {
    // Input contains the canonical name "Movies".
    expect(fuzzyMatchCategory('favorite movies of all time')).toEqual(
      optionsFor('Movies'),
    );
  });

  it('matches when the category name contains the input (reverse containment)', () => {
    // The canonical name "Colors" contains the shorter input "color".
    expect(fuzzyMatchCategory('color')).toEqual(optionsFor('Colors'));
  });

  it('matches via a keyword token, case-insensitively', () => {
    // "film" is a keyword alias for Movies; here it appears as a standalone token.
    expect(fuzzyMatchCategory('best film ever')).toEqual(optionsFor('Movies'));
    expect(fuzzyMatchCategory('FILM')).toEqual(optionsFor('Movies'));
  });

  it('matches via a keyword for other categories', () => {
    expect(fuzzyMatchCategory('cuisine')).toEqual(optionsFor('Food'));
    expect(fuzzyMatchCategory('athletics')).toEqual(optionsFor('Sports'));
    // British spelling keyword for Colors.
    expect(fuzzyMatchCategory('colour')).toEqual(optionsFor('Colors'));
  });

  it('returns null for an unrecognized category', () => {
    expect(fuzzyMatchCategory('an unknown niche topic')).toBeNull();
  });

  it('returns null for an empty or whitespace-only input', () => {
    expect(fuzzyMatchCategory('')).toBeNull();
    expect(fuzzyMatchCategory('   ')).toBeNull();
  });

  it('returns a copy so callers cannot mutate the curated catalog', () => {
    const first = fuzzyMatchCategory('Movies');
    expect(first).not.toBeNull();
    first!.push('Mutated');
    // A fresh lookup must be unaffected by the mutation above.
    expect(fuzzyMatchCategory('Movies')).toEqual(optionsFor('Movies'));
  });
});
