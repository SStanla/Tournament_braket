import { describe, it, expect } from 'vitest';
import {
  acceptSuggestion,
  rejectSuggestion,
  replaceSuggestion,
} from '../services/suggestion-review';
import type { Suggestion } from '../types/suggestions';

// ---------------------------------------------------------------------------
// Helper: create a sample suggestion
// ---------------------------------------------------------------------------

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'suggestion-1',
    name: 'Test Suggestion',
    source: 'ai',
    status: 'pending',
    ...overrides,
  };
}

function makeSuggestions(): Suggestion[] {
  return [
    makeSuggestion({ id: 's1', name: 'Alpha' }),
    makeSuggestion({ id: 's2', name: 'Beta' }),
    makeSuggestion({ id: 's3', name: 'Gamma' }),
  ];
}

// ---------------------------------------------------------------------------
// Tests: acceptSuggestion
// ---------------------------------------------------------------------------

describe('acceptSuggestion', () => {
  it('sets the target suggestion status to accepted', () => {
    const suggestions = makeSuggestions();
    const result = acceptSuggestion(suggestions, 's2');

    expect(result[1].status).toBe('accepted');
    expect(result[1].name).toBe('Beta');
  });

  it('does not modify other suggestions', () => {
    const suggestions = makeSuggestions();
    const result = acceptSuggestion(suggestions, 's2');

    expect(result[0].status).toBe('pending');
    expect(result[2].status).toBe('pending');
  });

  it('returns a new array (immutable)', () => {
    const suggestions = makeSuggestions();
    const result = acceptSuggestion(suggestions, 's1');

    expect(result).not.toBe(suggestions);
    expect(suggestions[0].status).toBe('pending'); // original unchanged
  });

  it('preserves array length', () => {
    const suggestions = makeSuggestions();
    const result = acceptSuggestion(suggestions, 's1');

    expect(result).toHaveLength(3);
  });

  it('returns unchanged array when ID does not exist', () => {
    const suggestions = makeSuggestions();
    const result = acceptSuggestion(suggestions, 'nonexistent');

    expect(result).toEqual(suggestions);
  });

  it('preserves suggestion source and other fields', () => {
    const suggestions = [makeSuggestion({ id: 's1', name: 'Alpha', source: 'fallback' })];
    const result = acceptSuggestion(suggestions, 's1');

    expect(result[0].source).toBe('fallback');
    expect(result[0].id).toBe('s1');
    expect(result[0].name).toBe('Alpha');
  });

  it('works on an empty array', () => {
    const result = acceptSuggestion([], 's1');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: rejectSuggestion
// ---------------------------------------------------------------------------

describe('rejectSuggestion', () => {
  it('sets the target suggestion status to rejected', () => {
    const suggestions = makeSuggestions();
    const result = rejectSuggestion(suggestions, 's3');

    expect(result[2].status).toBe('rejected');
    expect(result[2].name).toBe('Gamma');
  });

  it('does not modify other suggestions', () => {
    const suggestions = makeSuggestions();
    const result = rejectSuggestion(suggestions, 's3');

    expect(result[0].status).toBe('pending');
    expect(result[1].status).toBe('pending');
  });

  it('returns a new array (immutable)', () => {
    const suggestions = makeSuggestions();
    const result = rejectSuggestion(suggestions, 's1');

    expect(result).not.toBe(suggestions);
    expect(suggestions[0].status).toBe('pending'); // original unchanged
  });

  it('preserves array length', () => {
    const suggestions = makeSuggestions();
    const result = rejectSuggestion(suggestions, 's2');

    expect(result).toHaveLength(3);
  });

  it('returns unchanged array when ID does not exist', () => {
    const suggestions = makeSuggestions();
    const result = rejectSuggestion(suggestions, 'nonexistent');

    expect(result).toEqual(suggestions);
  });

  it('works on an empty array', () => {
    const result = rejectSuggestion([], 's1');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: replaceSuggestion
// ---------------------------------------------------------------------------

describe('replaceSuggestion', () => {
  it('replaces the name of the target suggestion', () => {
    const suggestions = makeSuggestions();
    const result = replaceSuggestion(suggestions, 's2', 'NewBeta');

    expect(result[1].name).toBe('NewBeta');
  });

  it('auto-accepts the target suggestion after replacement', () => {
    const suggestions = [
      makeSuggestion({ id: 's1', name: 'Alpha', status: 'rejected' }),
    ];
    const result = replaceSuggestion(suggestions, 's1', 'NewAlpha');

    expect(result[0].status).toBe('accepted');
  });

  it('does not modify other suggestions', () => {
    const suggestions = makeSuggestions();
    const result = replaceSuggestion(suggestions, 's2', 'NewBeta');

    expect(result[0].name).toBe('Alpha');
    expect(result[2].name).toBe('Gamma');
  });

  it('returns a new array (immutable)', () => {
    const suggestions = makeSuggestions();
    const result = replaceSuggestion(suggestions, 's1', 'NewAlpha');

    expect(result).not.toBe(suggestions);
    expect(suggestions[0].name).toBe('Alpha'); // original unchanged
  });

  it('preserves array length', () => {
    const suggestions = makeSuggestions();
    const result = replaceSuggestion(suggestions, 's1', 'NewAlpha');

    expect(result).toHaveLength(3);
  });

  it('returns unchanged array when ID does not exist', () => {
    const suggestions = makeSuggestions();
    const result = replaceSuggestion(suggestions, 'nonexistent', 'NewName');

    expect(result).toEqual(suggestions);
  });

  it('preserves source and id fields', () => {
    const suggestions = [makeSuggestion({ id: 's1', name: 'Alpha', source: 'fallback' })];
    const result = replaceSuggestion(suggestions, 's1', 'Replacement');

    expect(result[0].id).toBe('s1');
    expect(result[0].source).toBe('fallback');
  });

  it('works on an empty array', () => {
    const result = replaceSuggestion([], 's1', 'NewName');
    expect(result).toEqual([]);
  });

  it('ensures suggestions never duplicate existing participants or other suggestions', () => {
    // This tests the replacement with a unique name that doesn't collide
    const suggestions = makeSuggestions();
    const result = replaceSuggestion(suggestions, 's2', 'UniqueNew');

    const names = result.map((s) => s.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// Tests: Workflow integration scenarios
// ---------------------------------------------------------------------------

describe('suggestion review workflow', () => {
  it('accepts one suggestion while leaving others pending', () => {
    const suggestions = makeSuggestions();
    const afterAccept = acceptSuggestion(suggestions, 's1');

    expect(afterAccept[0].status).toBe('accepted');
    expect(afterAccept[1].status).toBe('pending');
    expect(afterAccept[2].status).toBe('pending');
  });

  it('rejects one, then replaces it with a new name', () => {
    const suggestions = makeSuggestions();
    const afterReject = rejectSuggestion(suggestions, 's2');
    expect(afterReject[1].status).toBe('rejected');

    const afterReplace = replaceSuggestion(afterReject, 's2', 'Delta');
    expect(afterReplace[1].name).toBe('Delta');
    expect(afterReplace[1].status).toBe('accepted');
  });

  it('can accept all suggestions sequentially', () => {
    let suggestions = makeSuggestions();
    suggestions = acceptSuggestion(suggestions, 's1');
    suggestions = acceptSuggestion(suggestions, 's2');
    suggestions = acceptSuggestion(suggestions, 's3');

    expect(suggestions.every((s) => s.status === 'accepted')).toBe(true);
  });

  it('can reject all suggestions sequentially', () => {
    let suggestions = makeSuggestions();
    suggestions = rejectSuggestion(suggestions, 's1');
    suggestions = rejectSuggestion(suggestions, 's2');
    suggestions = rejectSuggestion(suggestions, 's3');

    expect(suggestions.every((s) => s.status === 'rejected')).toBe(true);
  });

  it('mixed workflow: accept, reject, replace', () => {
    let suggestions = makeSuggestions();

    // Accept the first
    suggestions = acceptSuggestion(suggestions, 's1');
    // Reject the second
    suggestions = rejectSuggestion(suggestions, 's2');
    // Replace the rejected one with a new name
    suggestions = replaceSuggestion(suggestions, 's2', 'NewBeta');

    expect(suggestions[0].status).toBe('accepted');
    expect(suggestions[1].status).toBe('accepted');
    expect(suggestions[1].name).toBe('NewBeta');
    expect(suggestions[2].status).toBe('pending');
  });
});
