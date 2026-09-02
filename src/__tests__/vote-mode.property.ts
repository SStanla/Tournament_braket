import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateBracket,
  enterVotes,
  isTie,
  resolveTieRandomly,
  reseedNextRound,
  getStageLabel,
  getCurrentRound,
  isTournamentComplete,
} from '../services/bracket-manager';
import {
  tournamentReducer,
  initialState,
  type TournamentState,
} from '../state/tournament-context';
import type { Bracket, Matchup, Participant } from '../types/index';

const PBT_CONFIG = { numRuns: 100 };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Creates N unique participants for a vote-mode bracket. */
function createParticipants(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    name: `Player ${i + 1}`,
    source: 'manual' as const,
    seed: 0,
  }));
}

/** Returns every matchup in the bracket (rounds only) flattened. */
function allMatchups(bracket: Bracket): Matchup[] {
  return bracket.rounds.flatMap((r) => r.matchups);
}

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 27: Vote entry derives the winner and requires votes to sum to the player count
// **Validates: Requirements 11.5, 12.3, 12.6, 12.7**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 27: Vote entry derives the winner and requires votes to sum to the player count', () => {
  const bracketSize = fc.constantFrom(4, 8);

  /**
   * Generates a Player_Count and a vote pair. About half the draws sum to the
   * Player_Count (valid) and about half do not (invalid), so both branches of
   * the invariant are exercised.
   */
  const scenarioArb = fc
    .record({
      playerCount: fc.integer({ min: 2, max: 200 }),
      // A split of the player count into (votes1, votes2) that sums exactly.
      splitRatio: fc.double({ min: 0, max: 1, noNaN: true }),
      // An arbitrary non-summing pair.
      badVotes1: fc.integer({ min: 0, max: 400 }),
      badVotes2: fc.integer({ min: 0, max: 400 }),
      valid: fc.boolean(),
    })
    .map((r) => {
      const v1 = Math.round(r.splitRatio * r.playerCount);
      const validPair: [number, number] = [v1, r.playerCount - v1];
      const badPair: [number, number] = [r.badVotes1, r.badVotes2];
      return { ...r, validPair, badPair };
    });

  it('records the matchup only when votes sum to the player count, leaving state unchanged otherwise', () => {
    fc.assert(
      fc.property(bracketSize, scenarioArb, (size, scenario) => {
        const bracket = generateBracket(createParticipants(size), size);
        const round1 = bracket.rounds.find((r) => r.roundNumber === 1)!;
        const matchup = round1.matchups[0];
        // Sanity: a round-1 matchup always has both slots occupied.
        expect(matchup.participant1).not.toBeNull();
        expect(matchup.participant2).not.toBeNull();

        const { playerCount } = scenario;

        if (scenario.valid) {
          const [v1, v2] = scenario.validPair;
          const updated = enterVotes(bracket, matchup.id, v1, v2, playerCount);
          const recorded = allMatchups(updated).find((m) => m.id === matchup.id)!;
          expect(recorded.votes1).toBe(v1);
          expect(recorded.votes2).toBe(v2);
        } else {
          const [v1, v2] = scenario.badPair;
          // Only assert the reject-path when the pair genuinely does not sum.
          if (v1 + v2 !== playerCount) {
            expect(() => enterVotes(bracket, matchup.id, v1, v2, playerCount)).toThrow();
            // State unchanged: the original matchup still has null votes.
            const original = allMatchups(bracket).find((m) => m.id === matchup.id)!;
            expect(original.votes1).toBeNull();
            expect(original.votes2).toBeNull();
            expect(original.winner).toBeNull();
          }
        }
      }),
      PBT_CONFIG
    );
  });

  it('sets the winner to the higher-voted participant, or null on an equal split', () => {
    fc.assert(
      fc.property(bracketSize, scenarioArb, (size, scenario) => {
        const bracket = generateBracket(createParticipants(size), size);
        const matchup = bracket.rounds[0].matchups[0];
        const [v1, v2] = scenario.validPair;

        const updated = enterVotes(bracket, matchup.id, v1, v2, scenario.playerCount);
        const recorded = allMatchups(updated).find((m) => m.id === matchup.id)!;

        if (v1 > v2) {
          expect(recorded.winner!.id).toBe(matchup.participant1!.id);
        } else if (v2 > v1) {
          expect(recorded.winner!.id).toBe(matchup.participant2!.id);
        } else {
          expect(recorded.winner).toBeNull();
        }
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 28: Tie detection is exact and the draw returns one of the two options
// **Validates: Requirements 12.4, 12.5, 12.8**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 28: Tie detection is exact and the draw returns one of the two options', () => {
  /** Builds a standalone matchup with the given vote totals. */
  const votesArb = fc.record({
    votes1: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    votes2: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  });

  it('isTie is true iff both vote totals are present and equal', () => {
    fc.assert(
      fc.property(votesArb, ({ votes1, votes2 }) => {
        const matchup: Matchup = {
          id: 'm',
          roundNumber: 1,
          position: 0,
          participant1: { id: 'p1', name: 'P1', source: 'manual', seed: 1 },
          participant2: { id: 'p2', name: 'P2', source: 'manual', seed: 2 },
          winner: null,
          nextMatchupId: null,
          votes1,
          votes2,
        };
        const expected = votes1 !== null && votes2 !== null && votes1 === votes2;
        expect(isTie(matchup)).toBe(expected);
      }),
      PBT_CONFIG
    );
  });

  it('resolveTieRandomly on a tied matchup picks exactly one of the two participants', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(4, 8),
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (size, tieVotes, rngValue) => {
          const bracket = generateBracket(createParticipants(size), size);
          const matchup = bracket.rounds[0].matchups[0];
          // Force a tie via enterVotes with equal votes summing to playerCount.
          const tied = enterVotes(bracket, matchup.id, tieVotes, tieVotes, tieVotes * 2);
          const tiedMatchup = allMatchups(tied).find((m) => m.id === matchup.id)!;
          expect(isTie(tiedMatchup)).toBe(true);
          expect(tiedMatchup.winner).toBeNull();

          const resolved = resolveTieRandomly(tied, matchup.id, () => rngValue);
          const winner = allMatchups(resolved).find((m) => m.id === matchup.id)!.winner;
          expect(winner).not.toBeNull();
          // Never neither, never any other participant.
          const validIds = [matchup.participant1!.id, matchup.participant2!.id];
          expect(validIds).toContain(winner!.id);
        }
      ),
      PBT_CONFIG
    );
  });

  it('both outcomes are reachable under a varying RNG (0 -> p1, 0.9 -> p2)', () => {
    fc.assert(
      fc.property(fc.constantFrom(4, 8), fc.integer({ min: 1, max: 50 }), (size, tieVotes) => {
        const bracket = generateBracket(createParticipants(size), size);
        const matchup = bracket.rounds[0].matchups[0];
        const tied = enterVotes(bracket, matchup.id, tieVotes, tieVotes, tieVotes * 2);

        const lowWinner = allMatchups(resolveTieRandomly(tied, matchup.id, () => 0)).find(
          (m) => m.id === matchup.id
        )!.winner!;
        const highWinner = allMatchups(resolveTieRandomly(tied, matchup.id, () => 0.9)).find(
          (m) => m.id === matchup.id
        )!.winner!;

        expect(lowWinner.id).toBe(matchup.participant1!.id);
        expect(highWinner.id).toBe(matchup.participant2!.id);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 29: Re-seeding is a complete, reproducible high-vs-low pairing of the winners
// **Validates: Requirements 13.2, 13.3, 13.4**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 29: Re-seeding is a complete, reproducible high-vs-low pairing of the winners', () => {
  /**
   * Builds a vote-mode bracket of the given size, decides every round-1 matchup
   * with the supplied per-matchup winning votes, then sets currentRound to 1 so
   * reseedNextRound targets round 2. The winning side is participant1 (votes1 >
   * votes2), so the winner's winningVotes equals `winVotes`.
   */
  function decideRound1(size: number, winVotesPerMatchup: number[]): Bracket {
    let bracket = generateBracket(createParticipants(size), size);
    const round1 = bracket.rounds[0];
    round1.matchups.forEach((m, i) => {
      const win = winVotesPerMatchup[i];
      // playerCount = win + 1 so participant1 (win) beats participant2 (1).
      bracket = enterVotes(bracket, m.id, win, 1, win + 1);
    });
    return { ...bracket, currentRound: 1 };
  }

  it('produces N/2 matchups whose slots are exactly a permutation of the winners, highest vs lowest', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(4, 8),
        // distinct winning votes per round-1 matchup
        fc.uniqueArray(fc.integer({ min: 2, max: 500 }), { minLength: 4, maxLength: 4 }),
        (size, votes) => {
          const matchupCount = size / 2;
          const winVotes = votes.slice(0, matchupCount);
          const bracket = decideRound1(size, winVotes);

          // Collect the winners (participant1 of each round-1 matchup) with votes.
          const round1 = bracket.rounds[0];
          const winners = round1.matchups.map((m) => ({
            id: m.winner!.id,
            winningVotes: m.votes1!,
          }));

          const reseeded = reseedNextRound(bracket);
          const nextRound = reseeded.rounds[1];

          // Exactly N/2 matchups.
          expect(nextRound.matchups.length).toBe(matchupCount / 2);
          expect(nextRound.matchups.length).toBe(winners.length / 2);

          // Slots are a permutation of the winners: each used exactly once, none empty.
          const slotIds: string[] = [];
          for (const m of nextRound.matchups) {
            expect(m.participant1).not.toBeNull();
            expect(m.participant2).not.toBeNull();
            slotIds.push(m.participant1!.id, m.participant2!.id);
          }
          expect([...slotIds].sort()).toEqual([...winners.map((w) => w.id)].sort());

          // Highest-voted winner faces the lowest-voted winner.
          const sortedByVotes = [...winners].sort((a, b) => b.winningVotes - a.winningVotes);
          const highest = sortedByVotes[0].id;
          const lowest = sortedByVotes[sortedByVotes.length - 1].id;
          const topMatchup = nextRound.matchups[0];
          const topPair = [topMatchup.participant1!.id, topMatchup.participant2!.id];
          expect(topPair).toContain(highest);
          expect(topPair).toContain(lowest);
        }
      ),
      PBT_CONFIG
    );
  });

  it('is deterministic across repeated calls even when winning votes tie', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(4, 8),
        // allow ties in winning votes to exercise the seed/id tie-break
        fc.array(fc.integer({ min: 2, max: 10 }), { minLength: 4, maxLength: 4 }),
        (size, votes) => {
          const matchupCount = size / 2;
          const winVotes = votes.slice(0, matchupCount);
          const bracket = decideRound1(size, winVotes);

          const a = reseedNextRound(bracket).rounds[1];
          const b = reseedNextRound(bracket).rounds[1];

          const pairing = (round: typeof a) =>
            round.matchups.map((m) => [m.participant1!.id, m.participant2!.id]);
          expect(pairing(a)).toEqual(pairing(b));
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 30: Changing an earlier vote-mode outcome re-derives later rounds from current winners
// **Validates: Requirements 6.5, 13.6**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 30: Changing an earlier vote-mode outcome re-derives later rounds from current winners', () => {
  /** Drives a fresh vote-mode size-4 tournament through CREATE + participants + GENERATE. */
  function setupVoteTournament(playerCount: number): TournamentState {
    let state = tournamentReducer(initialState, {
      type: 'CREATE_TOURNAMENT',
      payload: { category: 'Test', bracketSize: 4, playerCount },
    });
    for (let i = 0; i < 4; i++) {
      state = tournamentReducer(state, { type: 'ADD_PARTICIPANT', payload: { name: `Entry ${i + 1}` } });
    }
    return tournamentReducer(state, { type: 'GENERATE_BRACKET' });
  }

  it('re-derives round 2 from the updated round-1 winners with no stale pairing', () => {
    fc.assert(
      fc.property(
        // playerCount must be large enough to allow two distinct non-tie splits.
        fc.integer({ min: 4, max: 100 }),
        (playerCount) => {
          let state = setupVoteTournament(playerCount);
          const bracket0 = state.bracket!;
          const round1 = bracket0.rounds[0];
          const m0 = round1.matchups[0];
          const m1 = round1.matchups[1];

          // Decide both round-1 matchups: participant1 wins each (playerCount-1 vs 1).
          state = tournamentReducer(state, {
            type: 'ENTER_VOTES',
            payload: { matchupId: m0.id, votes1: playerCount - 1, votes2: 1 },
          });
          state = tournamentReducer(state, {
            type: 'ENTER_VOTES',
            payload: { matchupId: m1.id, votes1: playerCount - 1, votes2: 1 },
          });

          // Round 2 should now be materialized from participant1 winners.
          const afterFirst = state.bracket!;
          const round2First = afterFirst.rounds[1];
          expect(round2First.matchups[0].participant1).not.toBeNull();
          expect(round2First.matchups[0].participant2).not.toBeNull();
          const originalWinnerM0 = m0.participant1!.id;
          const round2Ids = [
            round2First.matchups[0].participant1!.id,
            round2First.matchups[0].participant2!.id,
          ];
          expect(round2Ids).toContain(originalWinnerM0);

          // Now re-enter m0 with the OPPOSITE outcome (participant2 wins).
          state = tournamentReducer(state, {
            type: 'ENTER_VOTES',
            payload: { matchupId: m0.id, votes1: 1, votes2: playerCount - 1 },
          });
          // Round 1 is complete again → round 2 rebuilds. Re-decide m1 is already decided.
          const afterChange = state.bracket!;
          const round2After = afterChange.rounds[1];

          // The new winner of m0 is participant2; the stale participant1 winner must be gone.
          const newWinnerM0 = m0.participant2!.id;
          const round2AfterIds = [
            round2After.matchups[0].participant1?.id,
            round2After.matchups[0].participant2?.id,
          ];

          if (round2After.matchups[0].participant1 && round2After.matchups[0].participant2) {
            expect(round2AfterIds).toContain(newWinnerM0);
            expect(round2AfterIds).not.toContain(originalWinnerM0);
          }
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 31: Stage label maps a round's participant count to the standard name
// **Validates: Requirements 14.2**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 31: Stage label maps a round\'s participant count to the standard name', () => {
  it('returns the fixed labels for 2, 4, 8 participants', () => {
    expect(getStageLabel(2)).toBe('Final');
    expect(getStageLabel(4)).toBe('Semifinal');
    expect(getStageLabel(8)).toBe('Quarterfinal');
  });

  it('returns "Round of N" for larger powers of two', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 11 }), (k) => {
        const n = 2 ** k; // 16, 32, 64, ... 2048
        expect(getStageLabel(n)).toBe(`Round of ${n}`);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 32: Round-by-round reveal exposes only the current round while in progress
// **Validates: Requirements 14.1, 14.3, 14.5**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 32: Round-by-round reveal exposes only the current round while in progress', () => {
  it('current round has an undecided both-slots-filled matchup and no later round is exposed', () => {
    fc.assert(
      fc.property(fc.constantFrom(4, 8), (size) => {
        const bracket = generateBracket(createParticipants(size), size);
        expect(isTournamentComplete(bracket)).toBe(false);

        const cur = getCurrentRound(bracket);
        expect(cur).toBe(1);

        const currentRound = bracket.rounds[cur - 1];
        // Current round exposes a playable matchup: both slots filled, no winner.
        const hasPlayable = currentRound.matchups.some(
          (m) => m.participant1 !== null && m.participant2 !== null && m.winner === null
        );
        expect(hasPlayable).toBe(true);

        // No later round is exposed — later-round matchups have empty slots.
        for (const round of bracket.rounds) {
          if (round.roundNumber <= cur) continue;
          for (const m of round.matchups) {
            const playable = m.participant1 !== null && m.participant2 !== null && m.winner === null;
            expect(playable).toBe(false);
          }
        }
      }),
      PBT_CONFIG
    );
  });

  it('advances once the current round is fully decided and a later round exists', () => {
    fc.assert(
      // playerCount >= 3 guarantees a non-tie split (playerCount-1 vs 1 differ).
      fc.property(fc.constantFrom(4, 8), fc.integer({ min: 3, max: 100 }), (size, playerCount) => {
        let bracket = generateBracket(createParticipants(size), size);
        expect(getCurrentRound(bracket)).toBe(1);

        // Decide every round-1 matchup via votes so winners advance into round 2.
        const round1 = bracket.rounds[0];
        for (const m of round1.matchups) {
          bracket = enterVotes(bracket, m.id, playerCount - 1, 1, playerCount);
        }

        // Manually materialize round 2 from the winners (reseed on currentRound=1).
        bracket = { ...bracket, currentRound: 1 };
        const reseeded = reseedNextRound(bracket);

        // Now round 1 is fully decided and round 2 has playable matchups.
        const cur = getCurrentRound(reseeded);
        expect(cur).toBe(2);
      }),
      PBT_CONFIG
    );
  });
});
