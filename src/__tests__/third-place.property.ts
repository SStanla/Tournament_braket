import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateBracket,
  advanceWinner,
  advanceThirdPlaceWinner,
  clearDownstream,
} from '../services/bracket-manager';
import { tournamentReducer, initialState, TournamentState } from '../state/tournament-context';
import { Bracket, Matchup, Participant } from '../types/index';

// Persisted state is written on every reducer transition; stub it so the
// vote-mode reducer flow below runs without touching sessionStorage.
import { vi } from 'vitest';
vi.mock('../services/persistence', () => ({
  saveTournament: vi.fn(),
  loadTournament: vi.fn(() => null),
  clearTournament: vi.fn(),
}));

const PBT_CONFIG = { numRuns: 100 };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Creates N unique dummy participants. */
function createParticipants(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    name: `Player ${i + 1}`,
    source: 'manual' as const,
    seed: 0,
  }));
}

/** Re-reads a matchup from the current bracket state by id. */
function findMatchupById(bracket: Bracket, id: string): Matchup | undefined {
  return bracket.rounds.flatMap((r) => r.matchups).find((m) => m.id === id);
}

/** The loser of a decided matchup: the participant that is not the recorded winner. */
function loserOf(matchup: Matchup): Participant {
  return matchup.participant1!.id === matchup.winner!.id
    ? matchup.participant2!
    : matchup.participant1!;
}

/**
 * Advances winners through every round up to and INCLUDING the Semifinal round,
 * leaving the Final undecided. After this, both Semifinal matchups have winners
 * and (for size >= 4) the third-place slots are populated by advanceWinner's
 * built-in populateThirdPlace call.
 *
 * `pickFirst` chooses participant1 (true) or participant2 (false) as the winner
 * of each matchup, so tests can vary which participants lose the semifinals.
 */
function advanceThroughSemifinals(bracket: Bracket, pickFirst: boolean): Bracket {
  let current = bracket;
  const semifinalRoundNumber = current.rounds.find((r) => r.label === 'Semifinal')!.roundNumber;

  for (let roundNumber = 1; roundNumber <= semifinalRoundNumber; roundNumber++) {
    const round = current.rounds.find((r) => r.roundNumber === roundNumber)!;
    // Snapshot the matchup ids for this round, then re-read each from current state.
    const matchupIds = round.matchups.map((m) => m.id);
    for (const matchupId of matchupIds) {
      const fresh = findMatchupById(current, matchupId)!;
      if (fresh.participant1 && fresh.participant2 && !fresh.winner) {
        const winnerId = pickFirst ? fresh.participant1.id : fresh.participant2.id;
        current = advanceWinner(current, matchupId, winnerId);
      }
    }
  }

  return current;
}

/** Returns the two Semifinal matchups (positions 0 and 1) from the current bracket. */
function getSemifinals(bracket: Bracket): { semifinal0: Matchup; semifinal1: Matchup } {
  const semifinalRound = bracket.rounds.find((r) => r.label === 'Semifinal')!;
  const semifinal0 = semifinalRound.matchups.find((m) => m.position === 0)!;
  const semifinal1 = semifinalRound.matchups.find((m) => m.position === 1)!;
  return { semifinal0, semifinal1 };
}

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 21: Third-place match exists exactly when size >= 4
// **Validates: Requirements 5.7, 10.1, 10.6**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 21: Third-place match exists exactly when size >= 4', () => {
  const anyValidSize = fc.constantFrom(2, 4, 8, 16);

  it('has a non-null third-place match iff size >= 4', () => {
    fc.assert(
      fc.property(anyValidSize, (size) => {
        const bracket = generateBracket(createParticipants(size), size);

        if (size >= 4) {
          expect(bracket.thirdPlaceMatch).not.toBeNull();
        } else {
          expect(bracket.thirdPlaceMatch).toBeNull();
        }
      }),
      PBT_CONFIG
    );
  });

  it('creates exactly one third-place match (distinct from every round matchup) for size >= 4', () => {
    fc.assert(
      fc.property(fc.constantFrom(4, 8, 16), (size) => {
        const bracket = generateBracket(createParticipants(size), size);

        expect(bracket.thirdPlaceMatch).not.toBeNull();

        // The third-place match must not be one of the ordinary round matchups.
        const roundMatchupIds = new Set(bracket.rounds.flatMap((r) => r.matchups.map((m) => m.id)));
        expect(roundMatchupIds.has(bracket.thirdPlaceMatch!.id)).toBe(false);

        // It sits past the Final and feeds nowhere.
        expect(bracket.thirdPlaceMatch!.nextMatchupId).toBeNull();
      }),
      PBT_CONFIG
    );
  });

  it('never designates third/fourth place at size 2 and omits the third-place match', () => {
    const bracket = generateBracket(createParticipants(2), 2);
    expect(bracket.thirdPlaceMatch).toBeNull();
    expect(bracket.thirdPlace).toBeNull();
    expect(bracket.fourthPlace).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 22: Third-place slots are the two semifinal losers
// **Validates: Requirements 10.2**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 22: Third-place slots are the two semifinal losers', () => {
  const sizeWithTwoSemifinals = fc.constantFrom(4, 8);

  it('fills the third-place slots with exactly the losing participant from each Semifinal', () => {
    fc.assert(
      fc.property(sizeWithTwoSemifinals, fc.boolean(), (size, pickFirst) => {
        const bracket = generateBracket(createParticipants(size), size);
        const decided = advanceThroughSemifinals(bracket, pickFirst);

        const { semifinal0, semifinal1 } = getSemifinals(decided);
        const expectedLoser0 = loserOf(semifinal0);
        const expectedLoser1 = loserOf(semifinal1);

        const tpm = decided.thirdPlaceMatch!;
        expect(tpm.participant1).not.toBeNull();
        expect(tpm.participant2).not.toBeNull();
        expect(tpm.participant1!.id).toBe(expectedLoser0.id);
        expect(tpm.participant2!.id).toBe(expectedLoser1.id);

        // The occupants must be exactly the two semifinal losers and not the winners.
        expect(tpm.participant1!.id).not.toBe(semifinal0.winner!.id);
        expect(tpm.participant2!.id).not.toBe(semifinal1.winner!.id);
      }),
      PBT_CONFIG
    );
  });

  it('fills the third-place slots with the two semifinal losers in VOTE mode too (via the reducer flow)', () => {
    fc.assert(
      // votesForSlot1 chooses how many of `playerCount` votes go to participant1 of
      // each semifinal. Constrain it to (0, playerCount) so there is never a tie —
      // each semifinal produces a clear winner (and therefore a clear loser).
      fc.property(
        sizeWithTwoSemifinals,
        fc.integer({ min: 3, max: 12 }),
        (size, playerCount) => {
          // Build a Vote_Based_Mode tournament through the reducer: create with a
          // playerCount, add `size` participants, then generate the bracket.
          let state: TournamentState = tournamentReducer(initialState, {
            type: 'CREATE_TOURNAMENT',
            payload: { category: 'Votes', bracketSize: size, playerCount },
          });
          for (let i = 0; i < size; i++) {
            state = tournamentReducer(state, {
              type: 'ADD_PARTICIPANT',
              payload: { name: `Player ${i + 1}` },
            });
          }
          state = tournamentReducer(state, { type: 'GENERATE_BRACKET' });

          // Decide every round up to and INCLUDING the Semifinal by entering a
          // non-tied vote split for each matchup. Re-read the current round each
          // time because vote-mode reseeds the following round on completion.
          const semifinalRoundNumber = state.bracket!.rounds.find(
            (r) => r.label === 'Semifinal'
          )!.roundNumber;

          // Split votes so participant1 always wins (votes1 > votes2), giving a
          // deterministic loser (participant2) for each decided matchup. With
          // playerCount >= 3 this is always a clear, non-tied split.
          const safeVotes1 = playerCount - 1;
          const votes2 = 1;

          // Track the expected losers (participant2 of each decided semifinal).
          const expectedSemifinalLosers: Participant[] = [];

          for (let roundNumber = 1; roundNumber <= semifinalRoundNumber; roundNumber++) {
            const round = state.bracket!.rounds.find((r) => r.roundNumber === roundNumber)!;
            const matchupIds = round.matchups.map((m) => m.id);
            for (const matchupId of matchupIds) {
              const fresh = state.bracket!.rounds
                .flatMap((r) => r.matchups)
                .find((m) => m.id === matchupId)!;
              if (fresh.participant1 && fresh.participant2 && !fresh.winner) {
                if (roundNumber === semifinalRoundNumber) {
                  // participant2 loses (votes1 > votes2).
                  expectedSemifinalLosers.push(fresh.participant2);
                }
                state = tournamentReducer(state, {
                  type: 'ENTER_VOTES',
                  payload: { matchupId, votes1: safeVotes1, votes2 },
                });
              }
            }
          }

          // After both Semifinals are decided in vote mode, the third-place slots
          // must contain exactly the two semifinal losers — matching classic mode.
          const tpm = state.bracket!.thirdPlaceMatch!;
          expect(tpm.participant1).not.toBeNull();
          expect(tpm.participant2).not.toBeNull();

          const slotIds = [tpm.participant1!.id, tpm.participant2!.id].sort();
          const expectedIds = expectedSemifinalLosers.map((p) => p.id).sort();
          expect(slotIds).toEqual(expectedIds);
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 23: Third-place selection designates third and fourth
// **Validates: Requirements 10.3, 10.5**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 23: Third-place selection designates third and fourth', () => {
  const sizeWithTwoSemifinals = fc.constantFrom(4, 8);

  it('sets thirdPlace to the selected participant and fourthPlace to the other', () => {
    fc.assert(
      fc.property(sizeWithTwoSemifinals, fc.boolean(), fc.boolean(), (size, pickFirst, selectSlot1) => {
        const bracket = generateBracket(createParticipants(size), size);
        const decided = advanceThroughSemifinals(bracket, pickFirst);

        const tpm = decided.thirdPlaceMatch!;
        const selected = selectSlot1 ? tpm.participant1! : tpm.participant2!;
        const other = selectSlot1 ? tpm.participant2! : tpm.participant1!;

        const result = advanceThirdPlaceWinner(decided, selected.id);

        expect(result.thirdPlace).not.toBeNull();
        expect(result.fourthPlace).not.toBeNull();
        expect(result.thirdPlace!.id).toBe(selected.id);
        expect(result.fourthPlace!.id).toBe(other.id);
        expect(result.thirdPlaceMatch!.winner!.id).toBe(selected.id);
      }),
      PBT_CONFIG
    );
  });

  it('rejects selection when a third-place slot is unoccupied and leaves state unchanged', () => {
    fc.assert(
      fc.property(sizeWithTwoSemifinals, (size) => {
        // Freshly generated bracket: third-place slots are still empty (no semifinal decided).
        const bracket = generateBracket(createParticipants(size), size);
        const tpm = bracket.thirdPlaceMatch!;
        expect(tpm.participant1).toBeNull();
        expect(tpm.participant2).toBeNull();

        // Any winnerId is invalid while slots are unoccupied.
        expect(() => advanceThirdPlaceWinner(bracket, 'participant-0')).toThrow();

        // State is unchanged: no placements recorded, slots still empty.
        expect(bracket.thirdPlace).toBeNull();
        expect(bracket.fourthPlace).toBeNull();
        expect(bracket.thirdPlaceMatch!.participant1).toBeNull();
        expect(bracket.thirdPlaceMatch!.participant2).toBeNull();
        expect(bracket.thirdPlaceMatch!.winner).toBeNull();
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 24: Changing a semifinal winner refreshes and clears third place
// **Validates: Requirements 10.7**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 24: Changing a semifinal winner refreshes and clears third place', () => {
  const sizeWithTwoSemifinals = fc.constantFrom(4, 8);

  it('replaces the affected slot with the new loser and clears the third-place outcome', () => {
    fc.assert(
      fc.property(
        sizeWithTwoSemifinals,
        fc.boolean(),
        fc.boolean(),
        (size, pickFirst, chooseThirdPlaceWinner) => {
          const bracket = generateBracket(createParticipants(size), size);
          let decided = advanceThroughSemifinals(bracket, pickFirst);

          // Optionally also decide the third-place match, so we can prove it gets cleared.
          if (chooseThirdPlaceWinner) {
            const tpm = decided.thirdPlaceMatch!;
            decided = advanceThirdPlaceWinner(decided, tpm.participant1!.id);
            expect(decided.thirdPlace).not.toBeNull();
            expect(decided.fourthPlace).not.toBeNull();
          }

          // Change Semifinal 0's winner: clear its downstream (via clearDownstream) then
          // advance the OTHER participant as the new winner.
          const { semifinal0 } = getSemifinals(decided);
          const previousWinnerId = semifinal0.winner!.id;
          const newWinner =
            semifinal0.participant1!.id === previousWinnerId
              ? semifinal0.participant2!
              : semifinal0.participant1!;
          // The participant who now loses semifinal 0 (previous winner becomes the new loser).
          const expectedNewLoserId = previousWinnerId;

          const cleared = clearDownstream(decided, semifinal0.id);
          const rebuilt = advanceWinner(cleared, semifinal0.id, newWinner.id);

          const tpm = rebuilt.thirdPlaceMatch!;

          // The affected slot (semifinal 0 -> participant1) now holds the new loser.
          expect(tpm.participant1).not.toBeNull();
          expect(tpm.participant1!.id).toBe(expectedNewLoserId);

          // The recorded third-place winner and third/fourth designations are cleared.
          expect(tpm.winner).toBeNull();
          expect(rebuilt.thirdPlace).toBeNull();
          expect(rebuilt.fourthPlace).toBeNull();
        }
      ),
      PBT_CONFIG
    );
  });
});
