import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSuggestions,
  generateSuggestionsWithFallback,
  generateReplacementSuggestion,
  buildPrompt,
  parseAIResponse,
  deduplicateSuggestions,
} from '../services/auto-suggest';
import type { SuggestionParams } from '../types/suggestions';

// ---------------------------------------------------------------------------
// Helper: mock fetch with a given response
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

function mockFetchError(status: number, body = 'Error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

function mockFetchNetworkError(message: string) {
  return vi.fn().mockRejectedValue(new Error(message));
}

// ---------------------------------------------------------------------------
// Tests: buildPrompt
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  it('includes the category in the prompt', () => {
    const prompt = buildPrompt('Best pizza toppings', [], 5);
    expect(prompt).toContain('Best pizza toppings');
  });

  it('includes existing participants when provided', () => {
    const prompt = buildPrompt('Best movies', ['Inception', 'Interstellar'], 3);
    expect(prompt).toContain('Inception');
    expect(prompt).toContain('Interstellar');
    expect(prompt).toContain('do NOT repeat');
  });

  it('does not list existing participants when empty', () => {
    const prompt = buildPrompt('Best movies', [], 3);
    expect(prompt).not.toContain('do NOT repeat');
  });

  it('specifies the exact count requested', () => {
    const prompt = buildPrompt('Animals', [], 7);
    expect(prompt).toContain('7');
    expect(prompt).toContain('unique');
  });
});

// ---------------------------------------------------------------------------
// Tests: parseAIResponse
// ---------------------------------------------------------------------------

describe('parseAIResponse', () => {
  it('parses a plain JSON array', () => {
    const result = parseAIResponse('["Apple", "Banana", "Cherry"]');
    expect(result).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('parses a JSON array wrapped in markdown code fences', () => {
    const response = '```json\n["Alpha", "Beta"]\n```';
    const result = parseAIResponse(response);
    expect(result).toEqual(['Alpha', 'Beta']);
  });

  it('extracts a JSON array embedded in surrounding text', () => {
    const response = 'Here are my suggestions: ["One", "Two", "Three"] Hope that helps!';
    const result = parseAIResponse(response);
    expect(result).toEqual(['One', 'Two', 'Three']);
  });

  it('returns empty array for completely invalid response', () => {
    const result = parseAIResponse('I cannot help with that.');
    expect(result).toEqual([]);
  });

  it('returns empty array for non-string arrays', () => {
    const result = parseAIResponse('[1, 2, 3]');
    expect(result).toEqual([]);
  });

  it('handles whitespace around the response', () => {
    const result = parseAIResponse('  \n  ["Item1", "Item2"]  \n  ');
    expect(result).toEqual(['Item1', 'Item2']);
  });
});

// ---------------------------------------------------------------------------
// Tests: deduplicateSuggestions
// ---------------------------------------------------------------------------

describe('deduplicateSuggestions', () => {
  it('removes names that match existing participants', () => {
    const result = deduplicateSuggestions(
      ['Alice', 'Bob', 'Charlie'],
      ['Bob']
    );
    expect(result).toEqual(['Alice', 'Charlie']);
  });

  it('removes duplicate names within the suggestions', () => {
    const result = deduplicateSuggestions(['Alpha', 'Beta', 'Alpha', 'Gamma'], []);
    expect(result).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('trims whitespace from names', () => {
    const result = deduplicateSuggestions(['  Hello  ', 'World'], []);
    expect(result).toEqual(['Hello', 'World']);
  });

  it('removes empty/whitespace-only names', () => {
    const result = deduplicateSuggestions(['', '   ', 'Valid'], []);
    expect(result).toEqual(['Valid']);
  });

  it('is case-insensitive against existing and within suggestions', () => {
    const result = deduplicateSuggestions(['alice', 'Alice'], ['ALICE']);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: generateSuggestions (AI-only path)
// ---------------------------------------------------------------------------

describe('generateSuggestions', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns AI suggestions on successful API call', async () => {
    globalThis.fetch = mockFetchSuccess(['Margherita', 'Pepperoni', 'Hawaiian']);

    const params: SuggestionParams = {
      category: 'Best pizza types',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.error).toBeUndefined();
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].name).toBe('Margherita');
    expect(result.suggestions[0].source).toBe('ai');
    expect(result.suggestions[0].status).toBe('pending');
    expect(result.suggestions[0].id).toBeTruthy();
  });

  it('deduplicates against existing participants', async () => {
    globalThis.fetch = mockFetchSuccess(['Alpha', 'Beta', 'Gamma', 'Delta']);

    const params: SuggestionParams = {
      category: 'Letters',
      existingParticipants: ['Beta'],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.suggestions).toHaveLength(3);
    const names = result.suggestions.map((s) => s.name);
    expect(names).not.toContain('Beta');
    expect(names).toEqual(['Alpha', 'Gamma', 'Delta']);
  });

  it('trims suggestions to the requested count', async () => {
    globalThis.fetch = mockFetchSuccess(['A', 'B', 'C', 'D', 'E']);

    const params: SuggestionParams = {
      category: 'Letters',
      existingParticipants: [],
      count: 2,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);
    expect(result.suggestions).toHaveLength(2);
  });

  it('returns error result on HTTP error', async () => {
    globalThis.fetch = mockFetchError(429, 'Rate limited');

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('429');
  });

  it('returns error result on network failure', async () => {
    globalThis.fetch = mockFetchNetworkError('Network unreachable');

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('Network unreachable');
  });

  it('returns error on timeout (AbortError)', async () => {
    // Simulate a fetch that takes longer than the timeout
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }
      });
    });

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
      timeout: 50, // Very short timeout for test
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('timed out');
  });

  it('returns error when response has no content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: '' }),
    });

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('No content');
  });

  it('returns error when response cannot be parsed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: 'Sorry, I cannot help with that.',
        }),
    });

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('parse');
  });

  it('returns empty result with source ai when count is 0', async () => {
    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 0,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  it('returns empty result with source ai when count is negative', async () => {
    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: -1,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);

    expect(result.source).toBe('ai');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  it('uses default timeout when not specified', async () => {
    globalThis.fetch = mockFetchSuccess(['A', 'B', 'C']);

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
    };

    const result = await generateSuggestions(params);
    expect(result.suggestions).toHaveLength(3);
    expect(result.source).toBe('ai');
  });

  it('generates unique IDs for each suggestion', async () => {
    globalThis.fetch = mockFetchSuccess(['A', 'B', 'C']);

    const params: SuggestionParams = {
      category: 'Test',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestions(params);
    const ids = result.suggestions.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});

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

  it('falls back to local lists when AI fails for known category', async () => {
    globalThis.fetch = mockFetchNetworkError('Network error');

    const params: SuggestionParams = {
      category: 'movies',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    expect(result.source).toBe('fallback');
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].source).toBe('fallback');
  });

  it('returns manual source when AI fails and no local list matches', async () => {
    globalThis.fetch = mockFetchNetworkError('Network error');

    const params: SuggestionParams = {
      category: 'obscure category with no local list',
      existingParticipants: [],
      count: 3,
      timeout: 5000,
    };

    const result = await generateSuggestionsWithFallback(params);

    expect(result.source).toBe('manual');
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: generateReplacementSuggestion
// ---------------------------------------------------------------------------

describe('generateReplacementSuggestion', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns a single replacement suggestion from AI', async () => {
    globalThis.fetch = mockFetchSuccess(['New Suggestion']);

    const result = await generateReplacementSuggestion({
      category: 'Test',
      existingParticipants: ['Existing'],
      rejectedNames: ['Rejected'],
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('New Suggestion');
    expect(result!.source).toBe('ai');
    expect(result!.status).toBe('pending');
  });

  it('falls back to local lists when AI fails', async () => {
    globalThis.fetch = mockFetchNetworkError('Network error');

    const result = await generateReplacementSuggestion({
      category: 'movies',
      existingParticipants: [],
      rejectedNames: [],
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('fallback');
  });

  it('returns null when both AI and local lists fail', async () => {
    globalThis.fetch = mockFetchNetworkError('Network error');

    const result = await generateReplacementSuggestion({
      category: 'completely unknown category xyz',
      existingParticipants: [],
      rejectedNames: [],
    });

    expect(result).toBeNull();
  });
});
