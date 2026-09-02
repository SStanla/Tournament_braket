import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  acceptSuggestion,
  rejectSuggestion,
  replaceSuggestion,
  acceptAllPending,
} from '../services/suggestion-review';
import type { Suggestion } from '../types/suggestions';

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 13: Suggestion review updates only the target suggestion, and a valid replacement auto-accepts it
// **Validates: Requirements 4.5, 4.11**
//
// For any suggestion list and any target id, acceptSuggestion / rejectSuggestion /
// replaceSuggestion SHALL change only the targeted entry (its status, or its name
// and status) and SHALL leave every other entry unchanged. A valid replacement is
// an atomic accept: it sets the target's name to the new name AND its status to
// 'accepted'.
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 13: Suggestion review updates only the target suggestion, and a valid replacement auto-accepts it', () => {
  const PBT_CONFIG = { numRuns: 100 };

  const nonEmptyName = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0);

  const sourceArb = fc.constantFrom('ai' as const, 'fallback' as const);
  const statusArb = fc.constantFrom(
    'pending' as const,
    'accepted' as const,
    'rejected' as const
  );

  /**
   * Generates a non-empty Suggestion[] with unique ids, plus a valid target index
   * into that array. Ids are derived from a de-duplicated set of integers so that
   * every entry is guaranteed to have a distinct id (the functions match by id).
   */
  const suggestionsWithTargetArb = fc
    .uniqueArray(fc.integer({ min: 0, max: 100_000 }), {
      minLength: 1,
      maxLength: 12,
    })
    .chain((uniqueIntIds) => {
      const suggestionArbs = uniqueIntIds.map((intId) =>
        fc.record<Suggestion>({
          id: fc.constant(`suggestion-${intId}`),
          name: nonEmptyName,
          source: sourceArb,
          status: statusArb,
        })
      );

      return fc.tuple(
        fc.tuple(...suggestionArbs),
        fc.nat({ max: uniqueIntIds.length - 1 })
      );
    })
    .map(([suggestions, targetIndex]) => ({
      suggestions: suggestions as Suggestion[],
      targetIndex,
    }));

  /**
   * Asserts that every entry other than the one at `targetIndex` is deeply equal
   * to the corresponding original entry.
   */
  function expectOthersUnchanged(
    original: Suggestion[],
    result: Suggestion[],
    targetIndex: number
  ): void {
    expect(result).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      if (i === targetIndex) continue;
      expect(result[i]).toEqual(original[i]);
    }
  }

  it('acceptSuggestion sets only the target status to accepted and leaves others unchanged', () => {
    fc.assert(
      fc.property(suggestionsWithTargetArb, ({ suggestions, targetIndex }) => {
        const targetId = suggestions[targetIndex].id;
        const result = acceptSuggestion(suggestions, targetId);

        // Only the target changed: status -> 'accepted', everything else on the
        // entry (id, name, source) preserved.
        expect(result[targetIndex].status).toBe('accepted');
        expect(result[targetIndex].id).toBe(suggestions[targetIndex].id);
        expect(result[targetIndex].name).toBe(suggestions[targetIndex].name);
        expect(result[targetIndex].source).toBe(suggestions[targetIndex].source);

        expectOthersUnchanged(suggestions, result, targetIndex);
      }),
      PBT_CONFIG
    );
  });

  it('rejectSuggestion sets only the target status to rejected and leaves others unchanged', () => {
    fc.assert(
      fc.property(suggestionsWithTargetArb, ({ suggestions, targetIndex }) => {
        const targetId = suggestions[targetIndex].id;
        const result = rejectSuggestion(suggestions, targetId);

        expect(result[targetIndex].status).toBe('rejected');
        expect(result[targetIndex].id).toBe(suggestions[targetIndex].id);
        expect(result[targetIndex].name).toBe(suggestions[targetIndex].name);
        expect(result[targetIndex].source).toBe(suggestions[targetIndex].source);

        expectOthersUnchanged(suggestions, result, targetIndex);
      }),
      PBT_CONFIG
    );
  });

  it('replaceSuggestion changes only the target name+status and leaves others unchanged', () => {
    fc.assert(
      fc.property(
        suggestionsWithTargetArb,
        nonEmptyName,
        ({ suggestions, targetIndex }, newName) => {
          const targetId = suggestions[targetIndex].id;
          const result = replaceSuggestion(suggestions, targetId, newName);

          // Target: name replaced, status auto-accepted, id/source preserved.
          expect(result[targetIndex].name).toBe(newName);
          expect(result[targetIndex].status).toBe('accepted');
          expect(result[targetIndex].id).toBe(suggestions[targetIndex].id);
          expect(result[targetIndex].source).toBe(suggestions[targetIndex].source);

          expectOthersUnchanged(suggestions, result, targetIndex);
        }
      ),
      PBT_CONFIG
    );
  });

  it('does not mutate the original array for any of the three operations', () => {
    fc.assert(
      fc.property(
        suggestionsWithTargetArb,
        nonEmptyName,
        ({ suggestions, targetIndex }, newName) => {
          const targetId = suggestions[targetIndex].id;
          const snapshot = suggestions.map((s) => ({ ...s }));

          acceptSuggestion(suggestions, targetId);
          rejectSuggestion(suggestions, targetId);
          replaceSuggestion(suggestions, targetId, newName);

          // Original array is untouched by any operation.
          expect(suggestions).toEqual(snapshot);
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 33: Accept-all accepts all and only currently-pending suggestions
// **Validates: Requirements 4.9, 4.10**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 33: Accept-all accepts all and only currently-pending suggestions', () => {
  const PBT_CONFIG = { numRuns: 100 };

  const nonEmptyName = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0);

  const sourceArb = fc.constantFrom('ai' as const, 'fallback' as const);
  const statusArb = fc.constantFrom(
    'pending' as const,
    'accepted' as const,
    'rejected' as const
  );

  /** An arbitrary suggestion list (ids need not be unique for this property). */
  const suggestionsArb = fc.array(
    fc.record<Suggestion>({
      id: fc.uuid(),
      name: nonEmptyName,
      source: sourceArb,
      status: statusArb,
    }),
    { minLength: 0, maxLength: 20 }
  );

  it('sets every pending entry to accepted and leaves accepted/rejected entries unchanged', () => {
    fc.assert(
      fc.property(suggestionsArb, (suggestions) => {
        const result = acceptAllPending(suggestions);

        expect(result).toHaveLength(suggestions.length);
        for (let i = 0; i < suggestions.length; i++) {
          const before = suggestions[i];
          const after = result[i];
          // id, name, source always preserved.
          expect(after.id).toBe(before.id);
          expect(after.name).toBe(before.name);
          expect(after.source).toBe(before.source);

          if (before.status === 'pending') {
            expect(after.status).toBe('accepted');
          } else {
            // accepted / rejected left as-is.
            expect(after.status).toBe(before.status);
          }
        }
      }),
      PBT_CONFIG
    );
  });

  it('the count of newly-accepted entries equals the number that were pending', () => {
    fc.assert(
      fc.property(suggestionsArb, (suggestions) => {
        const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
        const result = acceptAllPending(suggestions);

        // Newly accepted = entries that were pending before and are accepted now.
        let newlyAccepted = 0;
        for (let i = 0; i < suggestions.length; i++) {
          if (suggestions[i].status === 'pending' && result[i].status === 'accepted') {
            newlyAccepted++;
          }
        }
        expect(newlyAccepted).toBe(pendingCount);

        // No pending entries remain.
        expect(result.filter((s) => s.status === 'pending')).toHaveLength(0);
      }),
      PBT_CONFIG
    );
  });

  it('does not mutate the original array', () => {
    fc.assert(
      fc.property(suggestionsArb, (suggestions) => {
        const snapshot = suggestions.map((s) => ({ ...s }));
        acceptAllPending(suggestions);
        expect(suggestions).toEqual(snapshot);
      }),
      PBT_CONFIG
    );
  });
});
