import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSuggestionsWithFallback } from '../services/auto-suggest';
import type { SuggestionParams } from '../types/suggestions';
import { CATEGORY_LISTS } from '../services/local-category-lists';

// ---------------------------------------------------------------------------
// Helper: mock fetch with various behaviors
// ---------------------------------------------------------------------------

function mockFetchSuccess(suggestions: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        content: JSON.stringify(suggestions),
      }),
  });
}

function mockFetchNetworkError(message: string) {
  return vi.fn().mockRejectedValue(new Error(message));
}

// ---------------------------------------------------------------------------
// Tests: generateSuggestionsWithFallback
// ---------------------------------------------------------------------------

describe('generateSuggestionsWithFallback', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns AI suggestions when AI succeeds', async () => {
    globalThis.fetch = mockFetchSuccess(['Margherita', 'Pepperoni', 'Hawaiian']);

    const params: SuggestionParams = {
      category: 'Best pizza types',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(3);
    expect(result.error).toBeUndefined();
  });

  it('falls back to local lists when AI fails with a known category', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    const params: SuggestionParams = {
      category: 'movies',
      existingParticipants: [],
      count: 5,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    expect(result.source).toBe('fallback');
    expect(result.suggestions).toHaveLength(5);
    expect(result.error).toBeUndefined();
    result.suggestions.forEach(s => {
      expect(s.source).toBe('fallback');
      expect(CATEGORY_LISTS['movies']).toContain(s.name);
    });
  });

  it('returns manual source when AI fails and category is unknown', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    const params: SuggestionParams = {
      category: 'best quantum physics theories',
      existingParticipants: [],
      count: 5,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    expect(result.source).toBe('manual');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('manually');
  });

  it('returns partial fallback with manual source when not enough local items', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    // Exhaust most of the movies list
    const existing = CATEGORY_LISTS['movies']!.slice(0, 34);

    const params: SuggestionParams = {
      category: 'movies',
      existingParticipants: existing,
      count: 5,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    // Only 2 movies left (36 total - 34 existing = 2)
    expect(result.source).toBe('manual');
    expect(result.suggestions.length).toBeLessThan(5);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.error).toContain('manually');
  });

  it('supplements AI results with local lists if AI returns fewer than needed', async () => {
    // AI returns only 2 when we need 5
    globalThis.fetch = mockFetchSuccess(['Custom Movie A', 'Custom Movie B']);

    const params: SuggestionParams = {
      category: 'movies',
      existingParticipants: [],
      count: 5,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    // Should supplement from local lists
    expect(result.suggestions.length).toBe(5);
    const aiSuggestions = result.suggestions.filter(s => s.source === 'ai');
    const fallbackSuggestions = result.suggestions.filter(s => s.source === 'fallback');
    expect(aiSuggestions).toHaveLength(2);
    expect(fallbackSuggestions).toHaveLength(3);
  });

  it('returns empty result for count 0', async () => {
    const params: SuggestionParams = {
      category: 'movies',
      existingParticipants: [],
      count: 0,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);
    expect(result.suggestions).toHaveLength(0);
  });

  it('excludes existing participants from fallback results', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    const existing = ['The Godfather', 'Inception'];
    const params: SuggestionParams = {
      category: 'movies',
      existingParticipants: existing,
      count: 5,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    const names = result.suggestions.map(s => s.name);
    expect(names).not.toContain('The Godfather');
    expect(names).not.toContain('Inception');
  });

  it('each suggestion has a unique id', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    const params: SuggestionParams = {
      category: 'animals',
      existingParticipants: [],
      count: 8,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    const ids = result.suggestions.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(result.suggestions.length);
  });

  it('all suggestions have pending status', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    const params: SuggestionParams = {
      category: 'countries',
      existingParticipants: [],
      count: 4,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    result.suggestions.forEach(s => {
      expect(s.status).toBe('pending');
    });
  });
});
