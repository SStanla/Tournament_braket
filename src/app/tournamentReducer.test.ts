// Tests for the tournament reducer (Task 14.1). These verify that each
// user-intent action maps to the correct pure domain transition and that the
// application-level shape (phase flow, completion, error handling, reset)
// behaves per the design and requirements.

import { describe, expect, it } from 'vitest';
import {
  allSuggestionsHandled,
  initialAppState,
  tournamentReducer,
  type AppState,
  type TournamentAction,
} from './tournamentReducer';
import type { Matchup, Suggestion, Tournament } from '../domain/model';

/** Apply a sequence of actions from an initial state. */
function run(state: AppState, actions: TournamentAction[]): AppState {
  return actions.reduce(tournamentReducer, state);
}

/** All matchup ids currently in the first round. */
function firstRoundIds(t: Tournament): string[] {
  return t.rounds[0].matchups.map((m) => m.id);
}

/** The option ids present in a matchup. */
function optionIds(m: Matchup): string[] {
  return [m.optionA!.id, m.optionB!.id];
}

describe('tournamentReducer — creation and lifecycle', () => {
  it('CREATE moves from the CREATE screen into the FILLING phase (Req 2.2, 2.3)', () => {
    const state = tournamentReducer(initialAppState, {
      type: 'CREATE',
      input: { category: 'Best pasta', size: 4, rngSeed: 1 },
    });

    expect(state.tournament).not.toBeNull();
    expect(state.tournament!.phase).toBe('FILLING');
    expect(state.tournament!.mode).toBe('classic');
    expect(state.tournament!.options).toEqual([]);
    expect(state.tournament!.rounds).toEqual([]);
  });

  it('derives vote-based mode from a player count (Req 5.2)', () => {
    const state = tournamentReducer(initialAppState, {
      type: 'CREATE',
      input: { category: 'Best movie', size: 4, playerCount: 5, rngSeed: 1 },
    });
    expect(state.tournament!.mode).toBe('voteBased');
    expect(state.tournament!.playerCount).toBe(5);
  });

  it('NEW_TOURNAMENT clears everything and returns to the CREATE screen (Req 2.4, 2.5)', () => {
    const created = run(initialAppState, [
      { type: 'CREATE', input: { category: 'X', size: 2, rngSeed: 1 } },
      { type: 'ADD_OPTION', name: 'A' },
      { type: 'ADD_OPTION', name: 'B' },
      { type: 'GENERATE' },
    ]);
    expect(created.tournament!.phase).toBe('PLAYING');

    const reset = tournamentReducer(created, { type: 'NEW_TOURNAMENT' });
    expect(reset.tournament).toBeNull();
    expect(reset).toEqual(initialAppState);
  });
});

describe('tournamentReducer — filling phase', () => {
  const base = tournamentReducer(initialAppState, {
    type: 'CREATE',
    input: { category: 'Fruit', size: 4, rngSeed: 42 },
  });

  it('ADD_OPTION appends valid options and REMOVE_OPTION frees a slot (Req 6, 7)', () => {
    const withTwo = run(base, [
      { type: 'ADD_OPTION', name: 'Apple' },
      { type: 'ADD_OPTION', name: 'Banana' },
    ]);
    expect(withTwo.tournament!.options.map((o) => o.name)).toEqual([
      'Apple',
      'Banana',
    ]);

    const removed = tournamentReducer(withTwo, {
      type: 'REMOVE_OPTION',
      id: withTwo.tournament!.options[0].id,
    });
    expect(removed.tournament!.options.map((o) => o.name)).toEqual(['Banana']);
  });

  it('ADD_OPTION rejects a duplicate and records lastError, leaving state unchanged (Req 6.5)', () => {
    const withOne = tournamentReducer(base, { type: 'ADD_OPTION', name: 'Apple' });
    const dup = tournamentReducer(withOne, { type: 'ADD_OPTION', name: 'apple' });
    expect(dup.tournament!.options).toHaveLength(1);
    expect(dup.lastError).toBeTruthy();
  });

  it('GENERATE is blocked until the bracket is exactly full (Req 8.1, 8.2)', () => {
    const partial = run(base, [
      { type: 'ADD_OPTION', name: 'Apple' },
      { type: 'ADD_OPTION', name: 'Banana' },
    ]);
    const blocked = tournamentReducer(partial, { type: 'GENERATE' });
    expect(blocked.tournament!.phase).toBe('FILLING');
    expect(blocked.lastError).toBeTruthy();
  });
});

describe('tournamentReducer — generation and play', () => {
  function fullClassic(size: 2 | 4, seed = 7): AppState {
    const names = ['A', 'B', 'C', 'D'].slice(0, size);
    return run(initialAppState, [
      { type: 'CREATE', input: { category: 'Test', size, rngSeed: seed } },
      ...names.map((name) => ({ type: 'ADD_OPTION' as const, name })),
    ]);
  }

  it('GENERATE moves to PLAYING and builds the rounds (Req 12)', () => {
    const generated = tournamentReducer(fullClassic(4), { type: 'GENERATE' });
    const t = generated.tournament!;
    expect(t.phase).toBe('PLAYING');
    expect(t.rounds).toHaveLength(2); // log2(4)
    expect(t.rounds[0].matchups).toHaveLength(2);
    expect(t.thirdPlaceMatch).toBeDefined();
  });

  it('confirm + Next advances a size-2 tournament to RESULTS with standings (Req 14.2, 21.1, 22.1)', () => {
    const generated = tournamentReducer(fullClassic(2), { type: 'GENERATE' });
    const t = generated.tournament!;
    const final = t.rounds[0].matchups[0];
    const winnerId = final.optionA!.id;

    const done = run(generated, [
      { type: 'SET_PROVISIONAL', matchupId: final.id, choice: { optionId: winnerId } },
      { type: 'CONFIRM', matchupId: final.id },
    ]);

    expect(done.tournament!.phase).toBe('RESULTS');
    expect(done.tournament!.champion!.id).toBe(winnerId);
    const standings = done.tournament!.standings!;
    expect(standings[0].place).toBe(1);
    expect(standings[0].option.id).toBe(winnerId);
    expect(standings.map((s) => s.place)).toEqual([1, 2]);
  });

  it('a full size-4 confirm/advance flow reaches RESULTS (Req 18.5, 19, 21.2)', () => {
    const generated = tournamentReducer(fullClassic(4), { type: 'GENERATE' });
    let state = generated;

    // Decide both semifinals (round 0). Pick optionA as winner each time.
    for (const id of firstRoundIds(state.tournament!)) {
      const m = state.tournament!.rounds[0].matchups.find((x) => x.id === id)!;
      state = run(state, [
        { type: 'SET_PROVISIONAL', matchupId: id, choice: { optionId: m.optionA!.id } },
        { type: 'CONFIRM', matchupId: id },
      ]);
    }

    // Navigate to the last matchup of the round, then NEXT advances the round
    // (NEXT only advances the round from the final matchup, Req 18.5).
    state = tournamentReducer(state, { type: 'NEXT' }); // move to matchup index 1
    state = tournamentReducer(state, { type: 'NEXT' }); // last matchup -> advance
    expect(state.tournament!.currentRoundIndex).toBe(1);

    // Decide the third-place match (semifinal losers) and the final.
    const third = state.tournament!.thirdPlaceMatch!;
    state = run(state, [
      { type: 'SET_PROVISIONAL', matchupId: third.id, choice: { optionId: third.optionA!.id } },
      { type: 'CONFIRM', matchupId: third.id },
    ]);
    const finalMatch = state.tournament!.rounds[1].matchups[0];
    state = run(state, [
      { type: 'SET_PROVISIONAL', matchupId: finalMatch.id, choice: { optionId: finalMatch.optionA!.id } },
      { type: 'CONFIRM', matchupId: finalMatch.id },
    ]);

    expect(state.tournament!.phase).toBe('RESULTS');
    const places = state.tournament!.standings!.map((s) => s.place);
    expect(places).toEqual([1, 2, 3, 4]);
  });

  it('PREVIOUS/NEXT navigate within the current round without leaving it (Req 13.5)', () => {
    const generated = tournamentReducer(fullClassic(4), { type: 'GENERATE' });
    // NEXT from matchup 0 (undecided round) moves within the round, not past it.
    const next = tournamentReducer(generated, { type: 'NEXT' });
    expect(next.tournament!.currentRoundIndex).toBe(0);
    expect(next.tournament!.currentMatchupIndex).toBe(1);

    const back = tournamentReducer(next, { type: 'PREVIOUS' });
    expect(back.tournament!.currentMatchupIndex).toBe(0);

    // NEXT on the last matchup of an undecided round does not advance the round.
    const stay = tournamentReducer(next, { type: 'NEXT' });
    expect(stay.tournament!.currentRoundIndex).toBe(0);
  });

  it('SET_PROVISIONAL records nothing until CONFIRM (Req 14.1)', () => {
    const generated = tournamentReducer(fullClassic(2), { type: 'GENERATE' });
    const final = generated.tournament!.rounds[0].matchups[0];
    const provisional = tournamentReducer(generated, {
      type: 'SET_PROVISIONAL',
      matchupId: final.id,
      choice: { optionId: final.optionA!.id },
    });
    expect(provisional.tournament!.rounds[0].matchups[0].winner).toBeUndefined();
    expect(provisional.tournament!.phase).toBe('PLAYING');
  });
});

describe('tournamentReducer — vote-based play, tie-break and correction', () => {
  function fullVote(seed: number, playerCount: number): AppState {
    return run(initialAppState, [
      { type: 'CREATE', input: { category: 'Vote', size: 2, playerCount, rngSeed: seed } },
      { type: 'ADD_OPTION', name: 'A' },
      { type: 'ADD_OPTION', name: 'B' },
      { type: 'GENERATE' },
    ]);
  }

  it('SET_PROVISIONAL votes + CONFIRM decides a non-tie vote matchup (Req 16.6)', () => {
    const state = fullVote(3, 5);
    const final = state.tournament!.rounds[0].matchups[0];
    const done = run(state, [
      { type: 'SET_PROVISIONAL', matchupId: final.id, choice: { votesA: 4 } },
      { type: 'CONFIRM', matchupId: final.id },
    ]);
    expect(done.tournament!.phase).toBe('RESULTS');
    expect(done.tournament!.champion!.id).toBe(final.optionA!.id);
  });

  it('a tied split blocks completion until RESOLVE_TIE is used (Req 16.7, 16.8, 16.9)', () => {
    const state = fullVote(9, 4);
    const final = state.tournament!.rounds[0].matchups[0];
    const tied = run(state, [
      { type: 'SET_PROVISIONAL', matchupId: final.id, choice: { votesA: 2 } },
      { type: 'CONFIRM', matchupId: final.id },
    ]);
    // Tie: no champion yet, still PLAYING.
    expect(tied.tournament!.phase).toBe('PLAYING');
    expect(tied.tournament!.champion).toBeUndefined();

    const resolved = tournamentReducer(tied, { type: 'RESOLVE_TIE', matchupId: final.id });
    expect(resolved.tournament!.phase).toBe('RESULTS');
    expect(resolved.tournament!.champion).toBeDefined();
  });

  it('CORRECT changes a decided outcome (Req 20.1, 20.2)', () => {
    const state = fullVote(3, 5);
    const final = state.tournament!.rounds[0].matchups[0];
    const decided = run(state, [
      { type: 'SET_PROVISIONAL', matchupId: final.id, choice: { votesA: 4 } },
      { type: 'CONFIRM', matchupId: final.id },
    ]);
    const [aId, bId] = optionIds(final);
    expect(decided.tournament!.champion!.id).toBe(aId);

    // Correct so option B now wins the final. correctOutcome re-commits the
    // final's winner; the completion transition recomputes standings from the
    // decided final matchup (correctOutcome clears the champion field by design,
    // Req 20.2, so the recorded winner is read from the final matchup).
    const corrected = tournamentReducer(decided, {
      type: 'CORRECT',
      matchupId: final.id,
      correction: { votesA: 1 },
    });
    const correctedFinal = corrected.tournament!.rounds[0].matchups[0];
    expect(correctedFinal.winner!.id).toBe(bId);
    expect(corrected.tournament!.standings![0].option.id).toBe(bId);
  });

  it('an invalid vote split is rejected and recorded as lastError (Req 16.11)', () => {
    const state = fullVote(3, 5);
    const final = state.tournament!.rounds[0].matchups[0];
    const bad = tournamentReducer(state, {
      type: 'SET_PROVISIONAL',
      matchupId: final.id,
      choice: { votesA: 99 },
    });
    expect(bad.lastError).toBeTruthy();
    expect(bad.tournament!.rounds[0].matchups[0].votesA).toBeUndefined();
  });
});

describe('tournamentReducer — suggestion review state transitions (Req 10, 11)', () => {
  /** A filling-phase tournament of the given size, with a few existing options. */
  function filling(size: 2 | 4 | 8 = 8, existing: string[] = []): AppState {
    return run(initialAppState, [
      { type: 'CREATE', input: { category: 'Fruit', size, rngSeed: 1 } },
      ...existing.map((name) => ({ type: 'ADD_OPTION' as const, name })),
    ]);
  }

  /** Build a pending suggestion with a stable id. */
  function sug(id: string, name: string): Suggestion {
    return { id, name, status: 'pending' };
  }

  /** Install a set of pending suggestions on a state. */
  function withSuggestions(state: AppState, suggestions: Suggestion[]): AppState {
    return tournamentReducer(state, { type: 'REQUEST_SUGGESTIONS', suggestions });
  }

  it('ACCEPT_SUGGESTION turns a pending suggestion into an option (Req 10.2)', () => {
    const state = withSuggestions(filling(), [sug('s1', 'Apple'), sug('s2', 'Banana')]);
    const accepted = tournamentReducer(state, { type: 'ACCEPT_SUGGESTION', id: 's1' });

    expect(accepted.tournament!.options.map((o) => o.name)).toContain('Apple');
    const s1 = accepted.tournament!.suggestions.find((s) => s.id === 's1')!;
    expect(s1.status).toBe('accepted');
    // The untouched suggestion stays pending (Req 10.1).
    expect(accepted.tournament!.suggestions.find((s) => s.id === 's2')!.status).toBe(
      'pending',
    );
  });

  it('ACCEPT_SUGGESTION on a full bracket is rejected with lastError and adds nothing (Req 10.10, 6.6)', () => {
    const full = filling(2, ['A', 'B']); // size 2 already full
    const state = withSuggestions(full, [sug('s1', 'C')]);
    const accepted = tournamentReducer(state, { type: 'ACCEPT_SUGGESTION', id: 's1' });

    expect(accepted.lastError).toBeTruthy();
    expect(accepted.tournament!.options).toHaveLength(2);
    expect(accepted.tournament!.suggestions.find((s) => s.id === 's1')!.status).toBe(
      'pending',
    );
  });

  // --- Reject vs replace regeneration distinction (Req 10.3, 10.5, 10.6, 11) ---

  it('REJECT_SUGGESTION discards and installs the resolved regenerated replacement (Req 10.3, 11.1)', () => {
    const state = withSuggestions(filling(), [sug('s1', 'Apple')]);
    // The async service resolved a unique replacement for the freed slot; the
    // caller passes it in. This is the regeneration path.
    const rejected = tournamentReducer(state, {
      type: 'REJECT_SUGGESTION',
      id: 's1',
      replacement: sug('s1r', 'Cherry'),
    });

    const s1 = rejected.tournament!.suggestions.find((s) => s.id === 's1')!;
    expect(s1.status).toBe('rejected');
    // A new pending suggestion took the slot.
    const replacement = rejected.tournament!.suggestions.find((s) => s.id === 's1r')!;
    expect(replacement.status).toBe('pending');
    expect(replacement.name).toBe('Cherry');
    // Nothing was added to the tournament from a reject (Property 11).
    expect(rejected.tournament!.options).toHaveLength(0);
  });

  it('REJECT_SUGGESTION with no replacement leaves the slot empty for manual fill (Req 10.4)', () => {
    const state = withSuggestions(filling(), [sug('s1', 'Apple')]);
    const rejected = tournamentReducer(state, { type: 'REJECT_SUGGESTION', id: 's1' });

    expect(rejected.tournament!.suggestions.find((s) => s.id === 's1')!.status).toBe(
      'rejected',
    );
    // No new pending suggestion was created (no unique replacement available).
    expect(
      rejected.tournament!.suggestions.filter((s) => s.status === 'pending'),
    ).toHaveLength(0);
  });

  it('REPLACE_SUGGESTION renames + accepts in one action with NO regeneration (Req 10.5, 10.6, 11.2, 25.5)', () => {
    const state = withSuggestions(filling(), [sug('s1', 'Apple'), sug('s2', 'Banana')]);
    const replaced = tournamentReducer(state, {
      type: 'REPLACE_SUGGESTION',
      id: 's1',
      name: 'Dragonfruit',
    });

    // The typed name became an option immediately.
    expect(replaced.tournament!.options.map((o) => o.name)).toContain('Dragonfruit');
    const s1 = replaced.tournament!.suggestions.find((s) => s.id === 's1')!;
    expect(s1.status).toBe('replaced');
    expect(s1.name).toBe('Dragonfruit');

    // Contrast with reject: replace must NOT add a new pending suggestion for
    // the slot (no regeneration). The only remaining pending one is the
    // untouched s2 (Req 10.6, 11.2, 25.5).
    const pending = replaced.tournament!.suggestions.filter((s) => s.status === 'pending');
    expect(pending.map((s) => s.id)).toEqual(['s2']);
  });

  it('REPLACE_SUGGESTION rejects an invalid (duplicate) name and changes nothing (Req 10.7)', () => {
    const state = withSuggestions(filling(8, ['Apple']), [sug('s1', 'Banana')]);
    const replaced = tournamentReducer(state, {
      type: 'REPLACE_SUGGESTION',
      id: 's1',
      name: 'apple', // duplicates the existing option, case-insensitively
    });

    expect(replaced.lastError).toBeTruthy();
    // Suggestion unchanged, still pending; no option added.
    expect(replaced.tournament!.suggestions.find((s) => s.id === 's1')!).toEqual(
      sug('s1', 'Banana'),
    );
    expect(replaced.tournament!.options.map((o) => o.name)).toEqual(['Apple']);
  });

  // --- Accept all skipping (Req 10.8, 10.9, 10.10) ---------------------------

  it('ACCEPT_ALL accepts all pending, skips duplicates and over-capacity without blocking others (Req 10.8, 10.10)', () => {
    // Size 4 with one existing option (Apple) => 3 free slots. Four pending
    // suggestions where one duplicates an option and one duplicates another
    // suggestion; the overflow one must be skipped too.
    const state = withSuggestions(filling(4, ['Apple']), [
      sug('s1', 'apple'), // duplicate of existing option -> skip
      sug('s2', 'Banana'), // ok (fills slot 2)
      sug('s3', 'Cherry'), // ok (fills slot 3)
      sug('s4', 'banana'), // duplicate of s2 (accepted earlier in batch) -> skip
      sug('s5', 'Date'), // ok (fills slot 4, bracket now full)
      sug('s6', 'Elderberry'), // would overflow capacity (4/4) -> skip
    ]);

    const accepted = tournamentReducer(state, { type: 'ACCEPT_ALL' });
    const names = accepted.tournament!.options.map((o) => o.name);
    expect(names).toEqual(['Apple', 'Banana', 'Cherry', 'Date']);
    expect(accepted.tournament!.options).toHaveLength(4); // bracket now full

    // Accepted ones marked accepted; skipped ones remain pending (still reviewable).
    const byId = (id: string) =>
      accepted.tournament!.suggestions.find((s) => s.id === id)!.status;
    expect(byId('s2')).toBe('accepted');
    expect(byId('s3')).toBe('accepted');
    expect(byId('s5')).toBe('accepted');
    expect(byId('s1')).toBe('pending'); // duplicate of existing option
    expect(byId('s4')).toBe('pending'); // duplicate within batch
    expect(byId('s6')).toBe('pending'); // over capacity
  });

  it('ACCEPT_ALL leaves already rejected or replaced suggestions untouched (Req 10.9)', () => {
    let state = withSuggestions(filling(8), [
      sug('s1', 'Apple'),
      sug('s2', 'Banana'),
    ]);
    // Reject s1 (no replacement) and replace s2, then Accept all.
    state = tournamentReducer(state, { type: 'REJECT_SUGGESTION', id: 's1' });
    state = tournamentReducer(state, {
      type: 'REPLACE_SUGGESTION',
      id: 's2',
      name: 'Cherry',
    });
    const before = state.tournament!.suggestions;

    const accepted = tournamentReducer(state, { type: 'ACCEPT_ALL' });
    // Nothing pending remained, so ACCEPT_ALL is a no-op on statuses.
    expect(accepted.tournament!.suggestions).toEqual(before);
    expect(accepted.tournament!.suggestions.find((s) => s.id === 's1')!.status).toBe(
      'rejected',
    );
    expect(accepted.tournament!.suggestions.find((s) => s.id === 's2')!.status).toBe(
      'replaced',
    );
  });

  // --- Reject all regeneration (Req 10.11, 10.12) ----------------------------

  it('REJECT_ALL rejects all pending; a fresh set arrives via REQUEST_SUGGESTIONS (Req 10.11, 10.12)', () => {
    const state = withSuggestions(filling(), [
      sug('s1', 'Apple'),
      sug('s2', 'Banana'),
    ]);
    const rejectedAll = tournamentReducer(state, { type: 'REJECT_ALL' });

    // Every previously-pending suggestion is now rejected.
    expect(
      rejectedAll.tournament!.suggestions.every((s) => s.status === 'rejected'),
    ).toBe(true);
    // No options were added (Property 11).
    expect(rejectedAll.tournament!.options).toHaveLength(0);

    // The async service produces a fresh AI-based set and the caller delivers it
    // via REQUEST_SUGGESTIONS (Req 10.12). The new pending ones can be reviewed
    // again while the rejected ones are preserved.
    const fresh = tournamentReducer(rejectedAll, {
      type: 'REQUEST_SUGGESTIONS',
      suggestions: [sug('n1', 'Cherry'), sug('n2', 'Date')],
    });
    const pending = fresh.tournament!.suggestions.filter((s) => s.status === 'pending');
    expect(pending.map((s) => s.name)).toEqual(['Cherry', 'Date']);
    expect(
      fresh.tournament!.suggestions.filter((s) => s.status === 'rejected'),
    ).toHaveLength(2);
  });

  it('REJECT_ALL leaves already-handled suggestions untouched (Req 10.11)', () => {
    let state = withSuggestions(filling(), [sug('s1', 'Apple'), sug('s2', 'Banana')]);
    state = tournamentReducer(state, { type: 'ACCEPT_SUGGESTION', id: 's1' });

    const rejectedAll = tournamentReducer(state, { type: 'REJECT_ALL' });
    expect(rejectedAll.tournament!.suggestions.find((s) => s.id === 's1')!.status).toBe(
      'accepted',
    );
    expect(rejectedAll.tournament!.suggestions.find((s) => s.id === 's2')!.status).toBe(
      'rejected',
    );
  });

  // --- All-handled indication (Req 10.13) ------------------------------------

  it('allSuggestionsHandled reflects whether any suggestion is still pending (Req 10.13)', () => {
    const state = withSuggestions(filling(), [sug('s1', 'Apple'), sug('s2', 'Banana')]);
    expect(allSuggestionsHandled(state.tournament!)).toBe(false);

    const one = tournamentReducer(state, { type: 'ACCEPT_SUGGESTION', id: 's1' });
    expect(allSuggestionsHandled(one.tournament!)).toBe(false);

    const both = tournamentReducer(one, { type: 'REJECT_SUGGESTION', id: 's2' });
    expect(allSuggestionsHandled(both.tournament!)).toBe(true);
  });
});
