import { describe, it, expect, vi } from 'vitest';
import * as suggestionService from './suggestionService';
import {
  requestSuggestions,
  regenerateOne,
  type FetchLike,
} from './suggestionService';
import { fuzzyMatchCategory } from './curatedLists';

// Minimal sanity coverage for the cascade (full suite is Task 16.3).

/** Build a FetchLike that returns a 200 with the given suggestions. */
function okFetch(suggestions: string[]): FetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ suggestions }),
  }));
}

/** Build a FetchLike that returns a non-200 (e.g. not configured). */
function notConfiguredFetch(): FetchLike {
  return vi.fn(async () => ({
    ok: false,
    status: 501,
    json: async () => ({ status: 'not_configured' }),
  }));
}

describe('requestSuggestions cascade', () => {
  it('uses AI suggestions when the endpoint returns enough (Req 9.3)', async () => {
    const result = await requestSuggestions('Movies', ['Alien'], 3, {
      fetchImpl: okFetch(['Titanic', 'Jaws', 'Rocky']),
    });
    expect(result.suggestions).toEqual(['Titanic', 'Jaws', 'Rocky']);
    expect(result.manualFillNeeded).toBe(false);
  });

  it('excludes already-present names case/whitespace-insensitively (Req 9.7, 9.9)', async () => {
    const result = await requestSuggestions('Movies', ['  jaws '], 2, {
      fetchImpl: okFetch(['Jaws', 'Rocky', 'Titanic']),
    });
    expect(result.suggestions).toEqual(['Rocky', 'Titanic']);
  });

  it('deduplicates suggestions among themselves (Req 9.9)', async () => {
    const result = await requestSuggestions('Movies', [], 2, {
      fetchImpl: okFetch(['Rocky', 'rocky', 'Titanic']),
    });
    expect(result.suggestions).toEqual(['Rocky', 'Titanic']);
  });

  it('falls back to curated lists when the AI is not configured (Req 9.5, 9.11)', async () => {
    const result = await requestSuggestions('a movie night', [], 4, {
      fetchImpl: notConfiguredFetch(),
    });
    expect(result.suggestions).toHaveLength(4);
    expect(result.manualFillNeeded).toBe(false);
  });

  it('returns partial and flags manual fill when nothing can fill the slots (Req 9.8)', async () => {
    const result = await requestSuggestions('an unknown niche topic', [], 3, {
      fetchImpl: notConfiguredFetch(),
    });
    expect(result.suggestions).toEqual([]);
    expect(result.manualFillNeeded).toBe(true);
  });

  it('treats a fetch rejection (timeout/network) as failure and falls back (Req 9.4, 9.5)', async () => {
    const failing: FetchLike = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await requestSuggestions('colors', [], 3, {
      fetchImpl: failing,
    });
    expect(result.suggestions).toHaveLength(3);
  });
});

describe('regenerateOne (reject)', () => {
  it('returns a unique replacement from the AI (Req 10.3, 11.1)', async () => {
    const replacement = await regenerateOne('Movies', ['Alien'], ['Titanic'], {
      fetchImpl: okFetch(['Rocky']),
    });
    expect(replacement).toBe('Rocky');
  });

  it('skips candidates that duplicate options or pending suggestions (Req 10.3)', async () => {
    const replacement = await regenerateOne(
      'Movies',
      ['  alien '],
      ['titanic'],
      // AI returns duplicates of an option and a pending suggestion first.
      { fetchImpl: okFetch(['Alien', 'Titanic', 'Rocky']) },
    );
    expect(replacement).toBe('Rocky');
  });

  it('falls back to curated lists when the AI is not configured (Req 9.5, 9.11)', async () => {
    const replacement = await regenerateOne('a movie night', [], [], {
      fetchImpl: notConfiguredFetch(),
    });
    expect(typeof replacement).toBe('string');
    expect((replacement ?? '').length).toBeGreaterThan(0);
  });

  it('returns null when no unique replacement can be produced (Req 10.4)', async () => {
    const replacement = await regenerateOne(
      'an unknown niche topic',
      [],
      [],
      { fetchImpl: notConfiguredFetch() },
    );
    expect(replacement).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 16.3 — comprehensive coverage of the cascade order and the reject-vs-
// replace regeneration distinction.
// ---------------------------------------------------------------------------

/**
 * A fetch that rejects when its abort signal fires and otherwise never
 * resolves. This models a fetch implementation that respects AbortController,
 * so a small timeoutMs deterministically triggers the abort branch (Req 9.4).
 */
function abortableNeverResolvingFetch(): FetchLike {
  return vi.fn(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) {
            reject(new Error('aborted'));
            return;
          }
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }
        // Never resolve on its own; only the abort above ends this promise.
      }) as ReturnType<FetchLike>,
  );
}

describe('cascade order (Req 9.4, 9.5)', () => {
  it('AI success: uses the AI result and does not consult curated lists', async () => {
    const fuzzy = vi.fn(() => ['Curated A', 'Curated B', 'Curated C']);
    const result = await requestSuggestions('Movies', [], 3, {
      fetchImpl: okFetch(['AI One', 'AI Two', 'AI Three']),
      fuzzyMatch: fuzzy,
    });
    expect(result.suggestions).toEqual(['AI One', 'AI Two', 'AI Three']);
    expect(result.manualFillNeeded).toBe(false);
    // Enough came from the AI, so the curated fallback is never invoked.
    expect(fuzzy).not.toHaveBeenCalled();
  });

  it('AI failure (rejection): falls back to curated lists (Req 9.5)', async () => {
    const failing: FetchLike = vi.fn(async () => {
      throw new Error('upstream error');
    });
    const fuzzy = vi.fn(() => ['Fallback 1', 'Fallback 2']);
    const result = await requestSuggestions('Movies', [], 2, {
      fetchImpl: failing,
      fuzzyMatch: fuzzy,
    });
    expect(fuzzy).toHaveBeenCalledWith('Movies');
    expect(result.suggestions).toEqual(['Fallback 1', 'Fallback 2']);
    expect(result.manualFillNeeded).toBe(false);
  });

  it('AI non-200 (e.g. bad request): falls back to curated lists (Req 9.5)', async () => {
    const badRequest: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad request' }),
    }));
    const fuzzy = vi.fn(() => ['Fallback 1', 'Fallback 2']);
    const result = await requestSuggestions('Movies', [], 2, {
      fetchImpl: badRequest,
      fuzzyMatch: fuzzy,
    });
    expect(fuzzy).toHaveBeenCalledWith('Movies');
    expect(result.suggestions).toEqual(['Fallback 1', 'Fallback 2']);
  });

  it('AI timeout: aborts after timeoutMs and falls back to curated lists (Req 9.4, 9.5)', async () => {
    const slow = abortableNeverResolvingFetch();
    const fuzzy = vi.fn(() => ['Fallback 1', 'Fallback 2', 'Fallback 3']);
    const result = await requestSuggestions('Movies', [], 3, {
      fetchImpl: slow,
      // A tiny ceiling stands in for the ~10s production timeout so the test
      // exercises the abort branch quickly and deterministically.
      timeoutMs: 5,
      fuzzyMatch: fuzzy,
    });
    expect(slow).toHaveBeenCalledOnce();
    expect(fuzzy).toHaveBeenCalledWith('Movies');
    expect(result.suggestions).toEqual(['Fallback 1', 'Fallback 2', 'Fallback 3']);
    expect(result.manualFillNeeded).toBe(false);
  });

  it('AI short result: keeps AI items and fills the remainder from curated (Req 9.5)', async () => {
    // AI returns only 1 of the 3 requested; curated fills the other 2.
    const fuzzy = vi.fn(() => ['Curated X', 'Curated Y', 'Curated Z']);
    const result = await requestSuggestions('Movies', [], 3, {
      fetchImpl: okFetch(['AI Only']),
      fuzzyMatch: fuzzy,
    });
    expect(fuzzy).toHaveBeenCalledWith('Movies');
    expect(result.suggestions).toEqual(['AI Only', 'Curated X', 'Curated Y']);
    expect(result.manualFillNeeded).toBe(false);
  });

  it('AI short + curated de-duplicates against AI items and existing names (Req 9.7, 9.9)', async () => {
    // Curated repeats the AI item and an existing name; both must be skipped.
    const fuzzy = vi.fn(() => ['ai only', 'Existing', 'Fresh One', 'Fresh Two']);
    const result = await requestSuggestions('Movies', ['existing'], 3, {
      fetchImpl: okFetch(['AI Only']),
      fuzzyMatch: fuzzy,
    });
    expect(result.suggestions).toEqual(['AI Only', 'Fresh One', 'Fresh Two']);
  });

  it('AI short + curated still short: returns partial and flags manual fill (Req 9.8)', async () => {
    const fuzzy = vi.fn(() => ['Curated Only']);
    const result = await requestSuggestions('Movies', [], 4, {
      fetchImpl: okFetch(['AI Only']),
      fuzzyMatch: fuzzy,
    });
    expect(result.suggestions).toEqual(['AI Only', 'Curated Only']);
    expect(result.manualFillNeeded).toBe(true);
  });
});

describe('regenerateOne cascade order (Req 10.3, 10.4)', () => {
  it('AI success: returns the unique AI replacement without curated fallback', async () => {
    const fuzzy = vi.fn(() => ['Curated']);
    const replacement = await regenerateOne('Movies', ['Alien'], ['Titanic'], {
      fetchImpl: okFetch(['Rocky']),
      fuzzyMatch: fuzzy,
    });
    expect(replacement).toBe('Rocky');
    expect(fuzzy).not.toHaveBeenCalled();
  });

  it('AI timeout: aborts and produces a curated replacement (Req 9.4, 10.3)', async () => {
    const slow = abortableNeverResolvingFetch();
    const fuzzy = vi.fn(() => ['Curated Replacement']);
    const replacement = await regenerateOne('Movies', [], [], {
      fetchImpl: slow,
      timeoutMs: 5,
      fuzzyMatch: fuzzy,
    });
    expect(slow).toHaveBeenCalledOnce();
    expect(replacement).toBe('Curated Replacement');
  });

  it('returns a unique replacement, skipping options and pending suggestions (Req 10.3)', async () => {
    // AI offers duplicates of an option and a pending suggestion before a unique one.
    const replacement = await regenerateOne(
      'Movies',
      ['  alien '],
      ['titanic'],
      { fetchImpl: okFetch(['Alien', 'Titanic', 'Rocky']) },
    );
    expect(replacement).toBe('Rocky');
  });

  it('returns null when neither AI nor curated can produce a unique replacement (Req 10.4)', async () => {
    // Every curated candidate is already taken as an option or suggestion.
    const fuzzy = vi.fn(() => ['Alien', 'Titanic']);
    const replacement = await regenerateOne(
      'Movies',
      ['alien'],
      ['titanic'],
      {
        fetchImpl: vi.fn(async () => {
          throw new Error('down');
        }),
        fuzzyMatch: fuzzy,
      },
    );
    expect(replacement).toBeNull();
  });
});

describe('reject vs replace regeneration distinction (Req 10.6, 11.2, 25.5)', () => {
  // Replace is a review-state action (Task 17): the user types a name that is
  // validated, renamed, and accepted with NO regeneration. Regeneration is the
  // reject-only path (Req 11.1). At the service level we verify that the module
  // exposes exactly one regeneration entry point — regenerateOne, used on
  // reject — and no replace-regeneration function. The behavioral test for
  // replace lives with the review-state transitions in Task 17.

  it('exposes regenerateOne as the only regeneration entry point (reject path)', () => {
    expect(typeof suggestionService.regenerateOne).toBe('function');
    const exportedNames = Object.keys(suggestionService);
    // The only regeneration-related export is regenerateOne; there is no
    // replace/regenerateOnReplace function, so replace cannot trigger one.
    const regenExports = exportedNames.filter((n) =>
      /regen|replace/i.test(n),
    );
    expect(regenExports).toEqual(['regenerateOne']);
  });

  it('regenerateOne is not wired to any replace flow (documented service boundary)', () => {
    // Guard against a future export that would let replace regenerate. If a
    // replace-specific regeneration helper is ever added here, this assertion
    // fails and forces a spec review against Req 10.6 / 11.2 / 25.5.
    expect(
      (suggestionService as Record<string, unknown>).regenerateOnReplace,
    ).toBeUndefined();
    expect(
      (suggestionService as Record<string, unknown>).replaceSuggestion,
    ).toBeUndefined();
  });
});

// Keep an explicit reference to fuzzyMatchCategory so the default (real curated
// data) path is exercised at least once from the service's perspective without
// injecting a fake matcher.
describe('default curated matcher integration (Req 9.5, 9.6)', () => {
  it('uses the real fuzzyMatchCategory when no fuzzyMatch override is given', async () => {
    // Sanity: the real matcher recognizes "film" as Movies.
    expect(fuzzyMatchCategory('film')).not.toBeNull();
    const result = await requestSuggestions('a film night', [], 3, {
      fetchImpl: notConfiguredFetch(),
    });
    expect(result.suggestions).toHaveLength(3);
    expect(result.manualFillNeeded).toBe(false);
  });
});
