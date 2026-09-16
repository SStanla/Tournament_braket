// Consolidated / property-style tests for vote resolution and tie-break
// (Task 9.3). These complement the example-based suites in voteMatchup.test.ts
// (Task 9.1) and tieBreak.test.ts (Task 9.2) by exercising the vote logic
// across a broad range of player counts and every valid split, asserting the
// universal properties hold rather than only spot examples.
//
// Coverage:
//   - Vote-sum invariant on EVERY decided matchup: for each decided matchup
//     votesA + votesB === playerCount (Req 16.3, 16.11).
//   - Leader selection: the option with more votes is committed as the winner
//     for many splits (Req 16.6).
//   - Rejection of any split whose sum would differ from the player count
//     (Req 16.11).
//   - Tie only on even counts; odd counts never tie across all valid splits
//     (Req 16.7, 16.10).
//   - Deterministic tie-break under a fixed seed (Req 16.9).
// _Requirements: 16.3, 16.6, 16.7, 16.9, 16.10, 16.11_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Tournament } from './model';
import {
  addOption,
  confirmMatchup,
  createTournament,
  generateBracket,
  isTie,
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

// The player counts probed by the property-style loops. A spread of small and
// larger, odd and even values so parity and boundary behaviour are exercised.
const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 21, 50, 99, 100];

describe('vote-sum invariant on every decided matchup (Req 16.3, 16.11)', () => {
  it('holds for every non-tie split across a range of player counts', () => {
    for (const playerCount of PLAYER_COUNTS) {
      const t = generatedVote(4, playerCount);
      const matchupId = t.rounds[0].matchups[0].id;

      // Try every valid split; a non-tie split produces a decided matchup whose
      // votes must sum to exactly the player count.
      for (let votesA = 0; votesA <= playerCount; votesA += 1) {
        const votesB = playerCount - votesA;
        if (votesA === votesB) {
          continue; // ties are not "decided" — covered by the parity suite.
        }
        const confirmed = splitAndConfirm(t, matchupId, votesA);
        const m = confirmed.rounds[0].matchups[0];
        // Decided by a committed winner.
        expect(m.winner).toBeDefined();
        // The sum invariant holds on the decided matchup.
        expect(m.votesA! + m.votesB!).toBe(playerCount);
      }
    }
  });

  it('holds on a decided matchup advanced to the champion (size 2)', () => {
    for (const playerCount of PLAYER_COUNTS) {
      const t = generatedVote(2, playerCount);
      const finalId = t.rounds[0].matchups[0].id;
      // A clear non-tie: give option A one more than half (rounded up).
      const votesA = Math.floor(playerCount / 2) + 1;
      if (votesA > playerCount) continue; // playerCount 1 => votesA 1 <= 1, fine
      const confirmed = splitAndConfirm(t, finalId, votesA);
      const m = confirmed.rounds[0].matchups[0];
      expect(m.winner).toBeDefined();
      expect(m.votesA! + m.votesB!).toBe(playerCount);
      expect(confirmed.champion?.id).toBe(m.winner!.id);
    }
  });
});

describe('leader selection — the option with more votes wins (Req 16.6)', () => {
  it('commits option A whenever votesA > votesB, option B otherwise, for many splits', () => {
    for (const playerCount of PLAYER_COUNTS) {
      const t = generatedVote(4, playerCount);
      const m0 = t.rounds[0].matchups[0];
      const optionA = m0.optionA!;
      const optionB = m0.optionB!;

      for (let votesA = 0; votesA <= playerCount; votesA += 1) {
        const votesB = playerCount - votesA;
        if (votesA === votesB) continue; // skip ties: no leader
        const confirmed = splitAndConfirm(t, m0.id, votesA);
        const winner = confirmed.rounds[0].matchups[0].winner!;
        const expected = votesA > votesB ? optionA : optionB;
        expect(winner.id).toBe(expected.id);
      }
    }
  });
});

describe('rejection of splits whose sum differs from the player count (Req 16.11)', () => {
  it('rejects out-of-range or non-integer votesA across player counts', () => {
    for (const playerCount of PLAYER_COUNTS) {
      const t = generatedVote(4, playerCount);
      const matchupId = t.rounds[0].matchups[0].id;

      // Any votesA outside [0, playerCount] would force votesB out of range and
      // break the sum invariant, so it must be rejected.
      expect(setProvisionalVotes(t, matchupId, -1).ok).toBe(false);
      expect(setProvisionalVotes(t, matchupId, playerCount + 1).ok).toBe(false);
      // A non-integer split can never sum to a whole player count.
      expect(setProvisionalVotes(t, matchupId, 0.5).ok).toBe(false);
    }
  });

  it('accepts every whole-number split within [0, playerCount] (they all sum correctly)', () => {
    for (const playerCount of PLAYER_COUNTS) {
      const t = generatedVote(4, playerCount);
      const matchupId = t.rounds[0].matchups[0].id;
      for (let votesA = 0; votesA <= playerCount; votesA += 1) {
        const prov = setProvisionalVotes(t, matchupId, votesA);
        expect(prov.ok).toBe(true);
        if (prov.ok) {
          const m = prov.tournament.rounds[0].matchups[0];
          expect(m.votesA! + m.votesB!).toBe(playerCount);
        }
      }
    }
  });
});

describe('tie parity — tie only on even counts, never on odd (Req 16.7, 16.10)', () => {
  it('an even player count ties exactly at the half-and-half split and nowhere else', () => {
    for (const playerCount of PLAYER_COUNTS.filter((n) => n % 2 === 0)) {
      const t = generatedVote(4, playerCount);
      const matchupId = t.rounds[0].matchups[0].id;
      for (let votesA = 0; votesA <= playerCount; votesA += 1) {
        const prov = setProvisionalVotes(t, matchupId, votesA);
        expect(prov.ok).toBe(true);
        if (prov.ok) {
          const m = prov.tournament.rounds[0].matchups[0];
          const shouldTie = votesA === playerCount / 2;
          expect(isTie(m)).toBe(shouldTie);
        }
      }
    }
  });

  it('an odd player count never ties for any valid split', () => {
    for (const playerCount of PLAYER_COUNTS.filter((n) => n % 2 === 1)) {
      const t = generatedVote(4, playerCount);
      const matchupId = t.rounds[0].matchups[0].id;
      for (let votesA = 0; votesA <= playerCount; votesA += 1) {
        const prov = setProvisionalVotes(t, matchupId, votesA);
        expect(prov.ok).toBe(true);
        if (prov.ok) {
          const m = prov.tournament.rounds[0].matchups[0];
          expect(isTie(m)).toBe(false);
        }
      }
    }
  });
});

describe('deterministic tie-break under a fixed seed (Req 16.9)', () => {
  it('the same seed yields the same drawn winner across many seeds and even counts', () => {
    const seeds = [1, 7, 42, 123, 2024, 999983];
    const evenCounts = PLAYER_COUNTS.filter((n) => n % 2 === 0);

    for (const seed of seeds) {
      for (const playerCount of evenCounts) {
        const t = generatedVote(4, playerCount, seed);
        const matchupId = t.rounds[0].matchups[0].id;
        const tied = splitAndConfirm(t, matchupId, playerCount / 2);

        const first = resolveTieBreak(tied, matchupId);
        const second = resolveTieBreak(tied, matchupId);
        expect(first.ok && second.ok).toBe(true);
        if (first.ok && second.ok) {
          const w1 = first.tournament.rounds[0].matchups[0].winner!.id;
          const w2 = second.tournament.rounds[0].matchups[0].winner!.id;
          // Reproducible: repeated draws on the same seed pick the same winner.
          expect(w1).toBe(w2);
          // And the winner is always one of the two contestants.
          expect([tied.rounds[0].matchups[0].optionA!.id, tied.rounds[0].matchups[0].optionB!.id]).toContain(w1);
        }
      }
    }
  });

  it('distinct matchups draw independently yet reproducibly under one seed', () => {
    // Two tied matchups in the same round. Each has its own per-matchup seed
    // (derived from the tournament seed + matchup id), so re-running each draw
    // reproduces its own winner regardless of the other.
    const t = generatedVote(4, 8, 555);
    const idA = t.rounds[0].matchups[0].id;
    const idB = t.rounds[0].matchups[1].id;

    let tied = splitAndConfirm(t, idA, 4); // tie in matchup 0
    tied = splitAndConfirm(tied, idB, 4); // tie in matchup 1

    const a1 = resolveTieBreak(tied, idA);
    const a2 = resolveTieBreak(tied, idA);
    const b1 = resolveTieBreak(tied, idB);
    const b2 = resolveTieBreak(tied, idB);
    expect(a1.ok && a2.ok && b1.ok && b2.ok).toBe(true);
    if (a1.ok && a2.ok && b1.ok && b2.ok) {
      expect(a1.tournament.rounds[0].matchups[0].winner!.id).toBe(
        a2.tournament.rounds[0].matchups[0].winner!.id,
      );
      expect(b1.tournament.rounds[0].matchups[1].winner!.id).toBe(
        b2.tournament.rounds[0].matchups[1].winner!.id,
      );
    }
  });
});
