// Unit tests for tie detection, block-advance helpers, and the seeded tie-break
// draw (Task 9.2). Covers:
//   - tie parity: a tie is possible only on an even player count; an odd player
//     count can never tie (Req 16.7, 16.10);
//   - block-advance: an unresolved tie is not "decided" so round advancement
//     stays blocked (Req 16.8);
//   - the tie-break control is valid only on a tie, and a fixed seed picks a
//     consistent 50/50 winner, sets tieBreakUsed, and advances (Req 16.9).
// _Requirements: 16.7, 16.8, 16.9, 16.10_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Tournament } from './model';
import { createSeededRng } from './rng';
import {
  addOption,
  confirmMatchup,
  createTournament,
  generateBracket,
  hasUnresolvedTie,
  isMatchupDecided,
  isTie,
  isTieUnresolved,
  resolveTieBreak,
  setProvisionalVotes,
} from './tournament';

/** Fill and generate a vote-based bracket of the given size and player count. */
function generatedVote(
  size: BracketSize,
  playerCount: number,
  rngSeed = 42,
): Tournament {
  let t = createTournament({ category: 'Best thing', size, playerCount, rngSeed });
  for (let i = 1; i <= size; i += 1) {
    const result = addOption(t, `Opt ${i}`);
    if (!result.ok) throw new Error(`unexpected rejection: ${result.message}`);
    t = result.tournament;
  }
  return generateBracket(t);
}

/** Set a provisional split and confirm it, returning the confirmed tournament. */
function splitAndConfirm(
  t: Tournament,
  matchupId: string,
  votesA: number,
): Tournament {
  const prov = setProvisionalVotes(t, matchupId, votesA);
  if (!prov.ok) throw new Error(`setProvisionalVotes failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

describe('isTie / tie parity — even vs odd player counts (Req 16.7, 16.10)', () => {
  it('detects a tie on an even player count', () => {
    const t = generatedVote(4, 10);
    const confirmed = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5); // 5 vs 5
    const m = confirmed.rounds[0].matchups[0];
    expect(isTie(m)).toBe(true);
    expect(hasUnresolvedTie(m)).toBe(true);
  });

  it('an odd player count can never tie for any valid split', () => {
    const playerCount = 9;
    const t = generatedVote(4, playerCount);
    const matchupId = t.rounds[0].matchups[0].id;
    // Exhaust every valid split 0..playerCount: votesA + votesB is always odd,
    // so votesA can never equal votesB (Req 16.10).
    for (let votesA = 0; votesA <= playerCount; votesA += 1) {
      const prov = setProvisionalVotes(t, matchupId, votesA);
      expect(prov.ok).toBe(true);
      if (prov.ok) {
        const m = prov.tournament.rounds[0].matchups[0];
        expect(isTie(m)).toBe(false);
      }
    }
  });

  it('is not a tie when votes are absent (classic-style matchup)', () => {
    const t = generatedVote(4, 10);
    expect(isTie(t.rounds[0].matchups[0])).toBe(false);
  });
});

describe('block-advance helpers — unresolved tie is not decided (Req 16.8)', () => {
  it('treats a confirmed tie as undecided until the tie-break runs', () => {
    const t = generatedVote(4, 10);
    const confirmed = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const m = confirmed.rounds[0].matchups[0];
    expect(isMatchupDecided(m)).toBe(false);
    expect(isTieUnresolved(m)).toBe(true);
  });

  it('treats a non-tie confirmed matchup as decided', () => {
    const t = generatedVote(4, 10);
    const confirmed = splitAndConfirm(t, t.rounds[0].matchups[0].id, 7); // 7 vs 3
    const m = confirmed.rounds[0].matchups[0];
    expect(isMatchupDecided(m)).toBe(true);
    expect(isTieUnresolved(m)).toBe(false);
  });

  it('treats a tie as decided once resolved by the tie-break', () => {
    const t = generatedVote(4, 10);
    const tied = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const m0 = tied.rounds[0].matchups[0];
    const resolved = resolveTieBreak(tied, m0.id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      const m = resolved.tournament.rounds[0].matchups[0];
      expect(isMatchupDecided(m)).toBe(true);
      expect(isTieUnresolved(m)).toBe(false);
    }
  });
});

describe('resolveTieBreak — seeded 50/50 draw (Req 16.9)', () => {
  it('rejects a matchup that is not tied', () => {
    const t = generatedVote(4, 10);
    const decided = splitAndConfirm(t, t.rounds[0].matchups[0].id, 7);
    const result = resolveTieBreak(decided, decided.rounds[0].matchups[0].id);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown matchup id', () => {
    const t = generatedVote(4, 10);
    expect(resolveTieBreak(t, 'no-such-matchup').ok).toBe(false);
  });

  it('rejects a classic-mode tournament', () => {
    let t = createTournament({ category: 'X', size: 4, rngSeed: 1 });
    for (let i = 1; i <= 4; i += 1) {
      const r = addOption(t, `Opt ${i}`);
      if (r.ok) t = r.tournament;
    }
    t = generateBracket(t);
    expect(resolveTieBreak(t, t.rounds[0].matchups[0].id).ok).toBe(false);
  });

  it('picks one of the two options and sets tieBreakUsed', () => {
    const t = generatedVote(4, 10);
    const tied = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const m0 = tied.rounds[0].matchups[0];
    const result = resolveTieBreak(tied, m0.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const target = result.tournament.rounds[0].matchups[0];
      expect([m0.optionA!.id, m0.optionB!.id]).toContain(target.winner?.id);
      expect(target.tieBreakUsed).toBe(true);
    }
  });

  it('advances the drawn winner into the fixed next-round slot', () => {
    const t = generatedVote(4, 10);
    const tied = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const m0 = tied.rounds[0].matchups[0];
    const result = resolveTieBreak(tied, m0.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const winner = result.tournament.rounds[0].matchups[0].winner!;
      // Slot 0 is even, so it feeds next round slot 0, optionA.
      expect(result.tournament.rounds[1].matchups[0].optionA?.id).toBe(winner.id);
    }
  });

  it('is deterministic under a fixed seed: repeated draws pick the same winner', () => {
    const t = generatedVote(4, 10, 123);
    const tied = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const m0 = tied.rounds[0].matchups[0];

    const first = resolveTieBreak(tied, m0.id);
    const second = resolveTieBreak(tied, m0.id);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      const w1 = first.tournament.rounds[0].matchups[0].winner!.id;
      const w2 = second.tournament.rounds[0].matchups[0].winner!.id;
      expect(w1).toBe(w2);
    }
  });

  it('honours an injected RNG for a controlled outcome', () => {
    const t = generatedVote(4, 10);
    const tied = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const m0 = tied.rounds[0].matchups[0];

    // nextBoolean() true => optionB; force it via a seed that draws true first.
    // Rather than depend on a seed, use a stub RNG that always returns true.
    const stubTrue = { ...createSeededRng(0), nextBoolean: () => true };
    const stubFalse = { ...createSeededRng(0), nextBoolean: () => false };

    const bWin = resolveTieBreak(tied, m0.id, stubTrue);
    const aWin = resolveTieBreak(tied, m0.id, stubFalse);
    expect(bWin.ok && aWin.ok).toBe(true);
    if (bWin.ok && aWin.ok) {
      expect(bWin.tournament.rounds[0].matchups[0].winner?.id).toBe(m0.optionB!.id);
      expect(aWin.tournament.rounds[0].matchups[0].winner?.id).toBe(m0.optionA!.id);
    }
  });

  it('sets the champion when a final tie is resolved (size 2)', () => {
    const t = generatedVote(2, 8);
    const finalId = t.rounds[0].matchups[0].id;
    const tied = splitAndConfirm(t, finalId, 4); // 4 vs 4 tie
    const result = resolveTieBreak(tied, finalId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const winner = result.tournament.rounds[0].matchups[0].winner!;
      expect(result.tournament.champion?.id).toBe(winner.id);
    }
  });

  it('does not mutate the input tournament', () => {
    const t = generatedVote(4, 10);
    const tied = splitAndConfirm(t, t.rounds[0].matchups[0].id, 5);
    const snapshot = JSON.parse(JSON.stringify(tied));
    resolveTieBreak(tied, tied.rounds[0].matchups[0].id);
    expect(JSON.parse(JSON.stringify(tied))).toEqual(snapshot);
  });
});
