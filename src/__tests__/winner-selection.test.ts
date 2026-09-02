import { describe, it, expect } from 'vitest';
import { generateBracket, canSelectWinner, advanceWinner, getChampion } from '../services/bracket-manager';
import { Bracket, Participant, Matchup } from '../types/index';

function makeParticipants(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    name: `Player ${i + 1}`,
    source: 'manual' as const,
    seed: i + 1,
  }));
}

/**
 * Creates a deterministic bracket for testing (no random shuffle).
 * Participants are placed in order: P0 vs P1, P2 vs P3, etc.
 */
function createDeterministicBracket(size: number): Bracket {
  const participants = makeParticipants(size);
  // Generate the bracket — shuffle is random, so we'll fix participant placement
  const bracket = generateBracket(participants, size);

  // Replace first-round participants with deterministic placement for predictable testing
  const newRounds = bracket.rounds.map((round, rIdx) => {
    if (rIdx === 0) {
      return {
        ...round,
        matchups: round.matchups.map((m, mIdx) => ({
          ...m,
          participant1: participants[mIdx * 2],
          participant2: participants[mIdx * 2 + 1],
        })),
      };
    }
    return round;
  });

  return { ...bracket, rounds: newRounds, participants };
}

describe('canSelectWinner', () => {
  it('returns true when both participants are present', () => {
    const bracket = createDeterministicBracket(4);
    const matchupId = bracket.rounds[0].matchups[0].id;

    expect(canSelectWinner(bracket, matchupId)).toBe(true);
  });

  it('returns false when participant1 is null', () => {
    const bracket = createDeterministicBracket(4);
    const matchupId = bracket.rounds[1].matchups[0].id; // second round, no participants yet

    expect(canSelectWinner(bracket, matchupId)).toBe(false);
  });

  it('returns false when participant2 is null', () => {
    const bracket = createDeterministicBracket(4);
    // Manually set only participant1 in a second-round matchup
    const modifiedBracket: Bracket = {
      ...bracket,
      rounds: bracket.rounds.map((round, rIdx) => {
        if (rIdx === 1) {
          return {
            ...round,
            matchups: round.matchups.map((m) => ({
              ...m,
              participant1: makeParticipants(1)[0],
              participant2: null,
            })),
          };
        }
        return round;
      }),
    };
    const matchupId = modifiedBracket.rounds[1].matchups[0].id;

    expect(canSelectWinner(modifiedBracket, matchupId)).toBe(false);
  });

  it('returns false when matchup ID is not found', () => {
    const bracket = createDeterministicBracket(4);

    expect(canSelectWinner(bracket, 'non-existent-id')).toBe(false);
  });

  it('works independently of other matchups', () => {
    const bracket = createDeterministicBracket(8);
    // First-round matchups all have both participants
    for (const matchup of bracket.rounds[0].matchups) {
      expect(canSelectWinner(bracket, matchup.id)).toBe(true);
    }
    // Second-round matchups have no participants yet
    for (const matchup of bracket.rounds[1].matchups) {
      expect(canSelectWinner(bracket, matchup.id)).toBe(false);
    }
  });
});

describe('advanceWinner', () => {
  it('sets the winner on the current matchup', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0];
    const winnerId = matchup.participant1!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    const updatedMatchup = result.rounds[0].matchups[0];
    expect(updatedMatchup.winner).not.toBeNull();
    expect(updatedMatchup.winner!.id).toBe(winnerId);
  });

  it('advances winner to participant1 of next matchup for even position', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0]; // position 0 (even)
    const winnerId = matchup.participant1!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    const nextMatchup = result.rounds[1].matchups[0];
    expect(nextMatchup.participant1).not.toBeNull();
    expect(nextMatchup.participant1!.id).toBe(winnerId);
  });

  it('advances winner to participant2 of next matchup for odd position', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[1]; // position 1 (odd)
    const winnerId = matchup.participant1!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    const nextMatchup = result.rounds[1].matchups[0];
    expect(nextMatchup.participant2).not.toBeNull();
    expect(nextMatchup.participant2!.id).toBe(winnerId);
  });

  it('sets champion when winning the final matchup', () => {
    let bracket = createDeterministicBracket(2);
    const matchup = bracket.rounds[0].matchups[0]; // Final matchup for size 2
    const winnerId = matchup.participant1!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    expect(result.champion).not.toBeNull();
    expect(result.champion!.id).toBe(winnerId);
  });

  it('does not set champion when winning a non-final matchup', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0]; // First round
    const winnerId = matchup.participant1!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    expect(result.champion).toBeNull();
  });

  it('does not mutate the original bracket', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0];
    const winnerId = matchup.participant1!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    expect(result).not.toBe(bracket);
    expect(bracket.rounds[0].matchups[0].winner).toBeNull();
    expect(bracket.rounds[1].matchups[0].participant1).toBeNull();
  });

  it('throws when both participants are not present', () => {
    const bracket = createDeterministicBracket(4);
    const matchupId = bracket.rounds[1].matchups[0].id; // empty matchup

    expect(() => advanceWinner(bracket, matchupId, 'any-id')).toThrow(
      'Both participants must be present'
    );
  });

  it('throws when winnerId does not match either participant', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0];

    expect(() => advanceWinner(bracket, matchup.id, 'invalid-winner-id')).toThrow(
      'Winner ID does not match either participant'
    );
  });

  it('can select participant2 as winner', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0];
    const winnerId = matchup.participant2!.id;

    const result = advanceWinner(bracket, matchup.id, winnerId);

    const updatedMatchup = result.rounds[0].matchups[0];
    expect(updatedMatchup.winner!.id).toBe(winnerId);
  });

  it('preserves winner identity exactly when advancing', () => {
    const bracket = createDeterministicBracket(4);
    const matchup = bracket.rounds[0].matchups[0];
    const winner = matchup.participant1!;

    const result = advanceWinner(bracket, matchup.id, winner.id);

    const nextMatchup = result.rounds[1].matchups[0];
    expect(nextMatchup.participant1).toEqual(winner);
  });

  it('progresses through a full 4-participant bracket to champion', () => {
    let bracket = createDeterministicBracket(4);

    // Win first round: matchup 0 → participant1 wins, matchup 1 → participant1 wins
    bracket = advanceWinner(bracket, bracket.rounds[0].matchups[0].id, bracket.rounds[0].matchups[0].participant1!.id);
    bracket = advanceWinner(bracket, bracket.rounds[0].matchups[1].id, bracket.rounds[0].matchups[1].participant1!.id);

    // Now the final should have both participants
    expect(canSelectWinner(bracket, bracket.rounds[1].matchups[0].id)).toBe(true);

    // Win the final
    const finalMatchup = bracket.rounds[1].matchups[0];
    bracket = advanceWinner(bracket, finalMatchup.id, finalMatchup.participant1!.id);

    expect(bracket.champion).not.toBeNull();
    expect(bracket.champion!.id).toBe(bracket.rounds[0].matchups[0].participant1!.id);
  });
});

describe('getChampion', () => {
  it('returns null for a fresh bracket', () => {
    const bracket = createDeterministicBracket(4);

    expect(getChampion(bracket)).toBeNull();
  });

  it('returns null when final matchup has no winner', () => {
    let bracket = createDeterministicBracket(4);
    // Win first round only
    bracket = advanceWinner(bracket, bracket.rounds[0].matchups[0].id, bracket.rounds[0].matchups[0].participant1!.id);

    expect(getChampion(bracket)).toBeNull();
  });

  it('returns the champion after final matchup is decided', () => {
    let bracket = createDeterministicBracket(2);
    const winnerId = bracket.rounds[0].matchups[0].participant1!.id;

    bracket = advanceWinner(bracket, bracket.rounds[0].matchups[0].id, winnerId);

    const champion = getChampion(bracket);
    expect(champion).not.toBeNull();
    expect(champion!.id).toBe(winnerId);
  });

  it('returns the correct champion for a full 4-bracket tournament', () => {
    let bracket = createDeterministicBracket(4);

    // Advance winners through both rounds
    bracket = advanceWinner(bracket, bracket.rounds[0].matchups[0].id, bracket.rounds[0].matchups[0].participant1!.id);
    bracket = advanceWinner(bracket, bracket.rounds[0].matchups[1].id, bracket.rounds[0].matchups[1].participant2!.id);

    const finalMatchup = bracket.rounds[1].matchups[0];
    bracket = advanceWinner(bracket, finalMatchup.id, finalMatchup.participant2!.id);

    const champion = getChampion(bracket);
    expect(champion).not.toBeNull();
    expect(champion!.id).toBe(bracket.rounds[0].matchups[1].participant2!.id);
  });

  it('returns null for an empty bracket with no rounds', () => {
    const bracket: Bracket = {
      tournamentId: 'test',
      size: 2,
      rounds: [],
      participants: [],
      champion: null,
    };

    expect(getChampion(bracket)).toBeNull();
  });
});
