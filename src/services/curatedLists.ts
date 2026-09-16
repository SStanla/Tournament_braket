// Curated predefined option lists for a small set of common tournament
// categories, used as the fallback source when the AI-based generation service
// is unavailable, times out, or returns too few options (Req 9.5).
//
// This module is pure data plus a fuzzy, case-insensitive category matcher
// (Req 9.6). It performs no I/O and has no React dependency, so it is trivially
// testable and reusable by the suggestion service.

/** A single curated list entry: the canonical category plus keyword aliases. */
export interface CuratedCategory {
  /** Canonical category name (used for exact/containment matching). */
  category: string;
  /**
   * Additional lowercase keywords that should map to this list (e.g. singular
   * or synonym forms). Matched case-insensitively as whole-word-ish keywords.
   */
  keywords: string[];
  /** The curated option names for this category. */
  options: string[];
}

/**
 * The curated catalog. Kept intentionally small — a handful of common
 * categories is enough to demonstrate the fallback cascade; more can be added
 * later without touching the matching logic.
 */
export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    category: 'Movies',
    keywords: ['movie', 'film', 'films', 'cinema'],
    options: [
      'The Godfather',
      'Pulp Fiction',
      'The Shawshank Redemption',
      'Inception',
      'The Matrix',
      'Forrest Gump',
      'Jurassic Park',
      'Titanic',
      'Jaws',
      'Rocky',
      'Gladiator',
      'The Dark Knight',
      'Star Wars',
      'Back to the Future',
      'The Lion King',
      'Interstellar',
    ],
  },
  {
    category: 'Food',
    keywords: ['food', 'foods', 'dish', 'dishes', 'meal', 'meals', 'cuisine'],
    options: [
      'Pizza',
      'Sushi',
      'Burger',
      'Tacos',
      'Pasta',
      'Ramen',
      'Curry',
      'Dumplings',
      'Steak',
      'Salad',
      'Sandwich',
      'Fried Chicken',
      'Pancakes',
      'Ice Cream',
      'Barbecue',
      'Falafel',
    ],
  },
  {
    category: 'Sports',
    keywords: ['sport', 'sports', 'athletics'],
    options: [
      'Soccer',
      'Basketball',
      'Tennis',
      'Baseball',
      'Cricket',
      'Rugby',
      'Golf',
      'Hockey',
      'Volleyball',
      'Boxing',
      'Cycling',
      'Swimming',
      'Table Tennis',
      'Badminton',
      'American Football',
      'Skiing',
    ],
  },
  {
    category: 'Colors',
    keywords: ['color', 'colors', 'colour', 'colours'],
    options: [
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Blue',
      'Indigo',
      'Violet',
      'Purple',
      'Pink',
      'Teal',
      'Cyan',
      'Magenta',
      'Brown',
      'Black',
      'White',
      'Gray',
    ],
  },
];

/**
 * Fuzzy, case-insensitive match of a free-text category to one curated list
 * (Req 9.6). Recognition, in order of precedence:
 *   1. Exact match against the canonical category name.
 *   2. Containment — the input contains the category name or vice versa.
 *   3. Keyword — the input contains any of the category's keywords as a token,
 *      or a keyword contains the input.
 *
 * Returns a copy of the matched options, or `null` if nothing matches.
 */
export function fuzzyMatchCategory(category: string): string[] | null {
  const query = category.trim().toLocaleLowerCase();
  if (query.length === 0) return null;

  // 1. Exact match on the canonical category name.
  for (const entry of CURATED_CATEGORIES) {
    if (entry.category.toLocaleLowerCase() === query) {
      return [...entry.options];
    }
  }

  // 2. Containment either direction against the canonical name.
  for (const entry of CURATED_CATEGORIES) {
    const name = entry.category.toLocaleLowerCase();
    if (query.includes(name) || name.includes(query)) {
      return [...entry.options];
    }
  }

  // 3. Keyword recognition: match keywords against whitespace-separated tokens
  //    of the input, plus a containment check either direction.
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  for (const entry of CURATED_CATEGORIES) {
    for (const keyword of entry.keywords) {
      const kw = keyword.toLocaleLowerCase();
      if (
        tokens.includes(kw) ||
        query.includes(kw) ||
        kw.includes(query)
      ) {
        return [...entry.options];
      }
    }
  }

  return null;
}
