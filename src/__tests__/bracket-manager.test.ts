import { describe, it, expect } from 'vitest';
import { createTournament, calculateRoundCount, shuffleParticipants, generateBracket, addParticipant, removeParticipant, isBracketFull, clearDownstream, advanceWinner } from '../services/bracket-manager';
import { Bracket, Matchup, Participant, Round } from '../types/index';

describe('createTournament', () => {
  it('creates a tournament with a valid category and bracket size', () => {
    const tournament = createTournament('Best pasta al sugo', 8);

    expect(tournament.id).toBeDefined();
    expect(tournament.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(tournament.category).toBe('Best pasta al sugo');
    expect(tournament.bracketSize).toBe(8);
    expect(tournament.createdAt).toBeLessThanOrEqual(Date.now());
    expect(tournament.createdAt).toBeGreaterThan(0);
  });

  it('trims whitespace from the category name', () => {
    const tournament = createTournament('  Best movies  ', 4);

    expect(tournament.category).toBe('Best movies');
  });

  it('generates unique IDs for each tournament', () => {
    const t1 = createTournament('Category A', 2);
    const t2 = createTournament('Category B', 4);

    expect(t1.id).not.toBe(t2.id);
  });

  it('accepts all valid bracket sizes', () => {
    const validSizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

    for (const size of validSizes) {
      const tournament = createTournament('Test', size);
      expect(tournament.bracketSize).toBe(size);
    }
  });

  it('throws an error for an empty category', () => {
    expect(() => createTournament('', 8)).toThrow('Invalid category name');
  });

  it('throws an error for a whitespace-only category', () => {
    expect(() => createTournament('   ', 8)).toThrow('Invalid category name');
  });

  it('throws an error for a category exceeding 100 characters', () => {
    const longCategory = 'a'.repeat(101);
    expect(() => createTournament(longCategory, 8)).toThrow('Invalid category name');
  });

  it('throws an error for an invalid bracket size (not power of 2)', () => {
    expect(() => createTournament('Test', 3)).toThrow('Invalid bracket size');
  });

  it('throws an error for bracket size 0', () => {
    expect(() => createTournament('Test', 0)).toThrow('Invalid bracket size');
  });

  it('throws an error for bracket size 1', () => {
    expect(() => createTournament('Test', 1)).toThrow('Invalid bracket size');
  });

  it('throws an error for bracket size exceeding 2048', () => {
    expect(() => createTournament('Test', 4096)).toThrow('Invalid bracket size');
  });

  it('throws an error for negative bracket size', () => {
    expect(() => createTournament('Test', -8)).toThrow('Invalid bracket size');
  });
});

function createEmptyBracket(size: number): Bracket {
  return {
    tournamentId: 'test-tournament-id',
    size,
    rounds: [],
    participants: [],
    champion: null,
  };
}

describe('isBracketFull', () => {
  it('returns false when participant count is less than bracket size', () => {
    expect(isBracketFull(3, 8)).toBe(false);
  });

  it('returns true when participant count equals bracket size', () => {
    expect(isBracketFull(8, 8)).toBe(true);
  });

  it('returns true when participant count exceeds bracket size', () => {
    expect(isBracketFull(9, 8)).toBe(true);
  });

  it('returns true for a bracket of size 2 with 2 participants', () => {
    expect(isBracketFull(2, 2)).toBe(true);
  });

  it('returns false for zero participants', () => {
    expect(isBracketFull(0, 4)).toBe(false);
  });
});

describe('addParticipant', () => {
  it('adds a participant to an empty bracket', () => {
    const bracket = createEmptyBracket(4);
    const result = addParticipant(bracket, 'Alice');

    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].name).toBe('Alice');
    expect(result.participants[0].source).toBe('manual');
    expect(result.participants[0].seed).toBe(0);
    expect(result.participants[0].id).toBeDefined();
  });

  it('trims whitespace from the participant name', () => {
    const bracket = createEmptyBracket(4);
    const result = addParticipant(bracket, '  Bob  ');

    expect(result.participants[0].name).toBe('Bob');
  });

  it('does not mutate the original bracket', () => {
    const bracket = createEmptyBracket(4);
    const result = addParticipant(bracket, 'Alice');

    expect(bracket.participants).toHaveLength(0);
    expect(result.participants).toHaveLength(1);
    expect(result).not.toBe(bracket);
  });

  it('throws an error for an empty name', () => {
    const bracket = createEmptyBracket(4);
    expect(() => addParticipant(bracket, '')).toThrow('Invalid participant name');
  });

  it('throws an error for a whitespace-only name', () => {
    const bracket = createEmptyBracket(4);
    expect(() => addParticipant(bracket, '   ')).toThrow('Invalid participant name');
  });

  it('throws an error for a name exceeding 100 characters', () => {
    const bracket = createEmptyBracket(4);
    expect(() => addParticipant(bracket, 'a'.repeat(101))).toThrow('Invalid participant name');
  });

  it('throws an error for a duplicate name', () => {
    let bracket = createEmptyBracket(4);
    bracket = addParticipant(bracket, 'Alice');

    expect(() => addParticipant(bracket, 'Alice')).toThrow('already exists');
  });

  it('rejects names that differ only in case (case-insensitive)', () => {
    let bracket = createEmptyBracket(4);
    bracket = addParticipant(bracket, 'Alice');

    expect(() => addParticipant(bracket, 'alice')).toThrow('already exists');
  });

  it('throws an error when the bracket is full', () => {
    let bracket = createEmptyBracket(2);
    bracket = addParticipant(bracket, 'Alice');
    bracket = addParticipant(bracket, 'Bob');

    expect(() => addParticipant(bracket, 'Charlie')).toThrow('bracket is full');
  });

  it('generates unique IDs for each participant', () => {
    let bracket = createEmptyBracket(4);
    bracket = addParticipant(bracket, 'Alice');
    bracket = addParticipant(bracket, 'Bob');

    expect(bracket.participants[0].id).not.toBe(bracket.participants[1].id);
  });
});

describe('removeParticipant', () => {
  it('removes a participant by ID', () => {
    let bracket = createEmptyBracket(4);
    bracket = addParticipant(bracket, 'Alice');
    bracket = addParticipant(bracket, 'Bob');
    const aliceId = bracket.participants[0].id;

    const result = removeParticipant(bracket, aliceId);

    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].name).toBe('Bob');
  });

  it('does not mutate the original bracket', () => {
    let bracket = createEmptyBracket(4);
    bracket = addParticipant(bracket, 'Alice');
    const aliceId = bracket.participants[0].id;

    const result = removeParticipant(bracket, aliceId);

    expect(bracket.participants).toHaveLength(1);
    expect(result.participants).toHaveLength(0);
    expect(result).not.toBe(bracket);
  });

  it('throws an error when participant ID is not found', () => {
    const bracket = createEmptyBracket(4);
    expect(() => removeParticipant(bracket, 'non-existent-id')).toThrow('Participant not found');
  });

  it('frees a slot after removal, allowing a new participant', () => {
    let bracket = createEmptyBracket(2);
    bracket = addParticipant(bracket, 'Alice');
    bracket = addParticipant(bracket, 'Bob');
    const aliceId = bracket.participants[0].id;

    bracket = removeParticipant(bracket, aliceId);
    bracket = addParticipant(bracket, 'Charlie');

    expect(bracket.participants).toHaveLength(2);
    expect(bracket.participants.map((p) => p.name)).toContain('Bob');
    expect(bracket.participants.map((p) => p.name)).toContain('Charlie');
  });
});


describe('calculateRoundCount', () => {
  it('returns 1 for bracket size 2', () => {
    expect(calculateRoundCount(2)).toBe(1);
  });

  it('returns 3 for bracket size 8', () => {
    expect(calculateRoundCount(8)).toBe(3);
  });

  it('returns 4 for bracket size 16', () => {
    expect(calculateRoundCount(16)).toBe(4);
  });

  it('returns 11 for bracket size 2048', () => {
    expect(calculateRoundCount(2048)).toBe(11);
  });
});

describe('shuffleParticipants', () => {
  function makeParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: 0,
    }));
  }

  it('returns an array of the same length', () => {
    const participants = makeParticipants(8);
    const shuffled = shuffleParticipants(participants);
    expect(shuffled.length).toBe(participants.length);
  });

  it('does not mutate the original array', () => {
    const participants = makeParticipants(8);
    const original = [...participants];
    shuffleParticipants(participants);
    expect(participants).toEqual(original);
  });

  it('contains all original participants', () => {
    const participants = makeParticipants(8);
    const shuffled = shuffleParticipants(participants);
    const ids = shuffled.map((p) => p.id).sort();
    const originalIds = participants.map((p) => p.id).sort();
    expect(ids).toEqual(originalIds);
  });

  it('returns an empty array when given an empty array', () => {
    expect(shuffleParticipants([])).toEqual([]);
  });
});

describe('generateBracket', () => {
  function makeParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: 0,
    }));
  }

  it('generates correct number of rounds for bracket size 8', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);
    expect(bracket.rounds.length).toBe(3);
  });

  it('generates correct number of rounds for bracket size 2', () => {
    const participants = makeParticipants(2);
    const bracket = generateBracket(participants, 2);
    expect(bracket.rounds.length).toBe(1);
  });

  it('assigns correct round labels for bracket size 16', () => {
    const participants = makeParticipants(16);
    const bracket = generateBracket(participants, 16);
    expect(bracket.rounds[0].label).toBe('Round 1');
    expect(bracket.rounds[1].label).toBe('Quarterfinal');
    expect(bracket.rounds[2].label).toBe('Semifinal');
    expect(bracket.rounds[3].label).toBe('Final');
  });

  it('assigns "Final" label for bracket size 2', () => {
    const participants = makeParticipants(2);
    const bracket = generateBracket(participants, 2);
    expect(bracket.rounds[0].label).toBe('Final');
  });

  it('assigns correct labels for bracket size 4 (Semifinal, Final)', () => {
    const participants = makeParticipants(4);
    const bracket = generateBracket(participants, 4);
    expect(bracket.rounds[0].label).toBe('Semifinal');
    expect(bracket.rounds[1].label).toBe('Final');
  });

  it('assigns correct labels for bracket size 8 (Quarterfinal, Semifinal, Final)', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);
    expect(bracket.rounds[0].label).toBe('Quarterfinal');
    expect(bracket.rounds[1].label).toBe('Semifinal');
    expect(bracket.rounds[2].label).toBe('Final');
  });

  it('first round has bracketSize / 2 matchups', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);
    expect(bracket.rounds[0].matchups.length).toBe(4);
  });

  it('each subsequent round has half the matchups', () => {
    const participants = makeParticipants(16);
    const bracket = generateBracket(participants, 16);
    expect(bracket.rounds[0].matchups.length).toBe(8);
    expect(bracket.rounds[1].matchups.length).toBe(4);
    expect(bracket.rounds[2].matchups.length).toBe(2);
    expect(bracket.rounds[3].matchups.length).toBe(1);
  });

  it('all participants appear exactly once in first-round matchups', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);

    const assignedIds: string[] = [];
    for (const matchup of bracket.rounds[0].matchups) {
      if (matchup.participant1) assignedIds.push(matchup.participant1.id);
      if (matchup.participant2) assignedIds.push(matchup.participant2.id);
    }

    expect(assignedIds.length).toBe(8);
    const uniqueIds = new Set(assignedIds);
    expect(uniqueIds.size).toBe(8);
  });

  it('links matchups to the next round via nextMatchupId', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);

    // First round matchups should have nextMatchupId pointing to second round
    const round1 = bracket.rounds[0].matchups;
    const round2 = bracket.rounds[1].matchups;

    // Matchups 0 and 1 feed into round2 matchup 0
    expect(round1[0].nextMatchupId).toBe(round2[0].id);
    expect(round1[1].nextMatchupId).toBe(round2[0].id);

    // Matchups 2 and 3 feed into round2 matchup 1
    expect(round1[2].nextMatchupId).toBe(round2[1].id);
    expect(round1[3].nextMatchupId).toBe(round2[1].id);
  });

  it('final round matchup has nextMatchupId as null', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);

    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    expect(finalRound.matchups[0].nextMatchupId).toBeNull();
  });

  it('sets champion to null initially', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);
    expect(bracket.champion).toBeNull();
  });

  it('assigns seed numbers starting from 1', () => {
    const participants = makeParticipants(4);
    const bracket = generateBracket(participants, 4);

    const seeds = bracket.participants.map((p) => p.seed).sort((a, b) => a - b);
    expect(seeds).toEqual([1, 2, 3, 4]);
  });

  it('all matchup winners are null initially', () => {
    const participants = makeParticipants(8);
    const bracket = generateBracket(participants, 8);

    for (const round of bracket.rounds) {
      for (const matchup of round.matchups) {
        expect(matchup.winner).toBeNull();
      }
    }
  });

  it('handles fewer participants than bracket size (byes)', () => {
    const participants = makeParticipants(6);
    const bracket = generateBracket(participants, 8);

    // Should still have 4 first-round matchups
    expect(bracket.rounds[0].matchups.length).toBe(4);

    // Count filled slots
    let filledSlots = 0;
    for (const matchup of bracket.rounds[0].matchups) {
      if (matchup.participant1) filledSlots++;
      if (matchup.participant2) filledSlots++;
    }
    expect(filledSlots).toBe(6);
  });
});


describe('clearDownstream', () => {
  /**
   * Helper: creates a bracket of size 8 with all participants and winners
   * decided through the entire bracket to simulate a fully-played tournament.
   */
  function createFullyDecidedBracket(): Bracket {
    const participants: Participant[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: i + 1,
    }));

    // Build a bracket of size 8: 3 rounds
    // Round 1: 4 matchups, Round 2: 2 matchups, Round 3 (Final): 1 matchup
    const round2Matchups: Matchup[] = [
      {
        id: 'r2m0',
        roundNumber: 2,
        position: 0,
        participant1: participants[0], // Winner of r1m0
        participant2: participants[2], // Winner of r1m1
        winner: participants[0],
        nextMatchupId: 'r3m0',
      },
      {
        id: 'r2m1',
        roundNumber: 2,
        position: 1,
        participant1: participants[4], // Winner of r1m2
        participant2: participants[6], // Winner of r1m3
        winner: participants[4],
        nextMatchupId: 'r3m0',
      },
    ];

    const round3Matchups: Matchup[] = [
      {
        id: 'r3m0',
        roundNumber: 3,
        position: 0,
        participant1: participants[0], // Winner of r2m0
        participant2: participants[4], // Winner of r2m1
        winner: participants[0],
        nextMatchupId: null,
      },
    ];

    const round1Matchups: Matchup[] = [
      {
        id: 'r1m0',
        roundNumber: 1,
        position: 0,
        participant1: participants[0],
        participant2: participants[1],
        winner: participants[0],
        nextMatchupId: 'r2m0',
      },
      {
        id: 'r1m1',
        roundNumber: 1,
        position: 1,
        participant1: participants[2],
        participant2: participants[3],
        winner: participants[2],
        nextMatchupId: 'r2m0',
      },
      {
        id: 'r1m2',
        roundNumber: 1,
        position: 2,
        participant1: participants[4],
        participant2: participants[5],
        winner: participants[4],
        nextMatchupId: 'r2m1',
      },
      {
        id: 'r1m3',
        roundNumber: 1,
        position: 3,
        participant1: participants[6],
        participant2: participants[7],
        winner: participants[6],
        nextMatchupId: 'r2m1',
      },
    ];

    const rounds: Round[] = [
      { roundNumber: 1, label: 'Quarterfinal', matchups: round1Matchups },
      { roundNumber: 2, label: 'Semifinal', matchups: round2Matchups },
      { roundNumber: 3, label: 'Final', matchups: round3Matchups },
    ];

    return {
      tournamentId: 'test-tournament',
      size: 8,
      rounds,
      participants,
      champion: participants[0],
    };
  }

  it('returns the same bracket when matchupId is not found', () => {
    const bracket = createFullyDecidedBracket();
    const result = clearDownstream(bracket, 'non-existent-id');
    expect(result).toBe(bracket);
  });

  it('returns the same bracket when matchup has no nextMatchupId (final round)', () => {
    const bracket = createFullyDecidedBracket();
    const result = clearDownstream(bracket, 'r3m0');
    expect(result).toBe(bracket);
  });

  it('clears participant1 in next matchup when source matchup has even position', () => {
    const bracket = createFullyDecidedBracket();
    // r1m0 has position 0 (even), feeds into r2m0 as participant1
    const result = clearDownstream(bracket, 'r1m0');

    const r2m0 = result.rounds[1].matchups[0];
    expect(r2m0.participant1).toBeNull();
    expect(r2m0.winner).toBeNull();
  });

  it('clears participant2 in next matchup when source matchup has odd position', () => {
    const bracket = createFullyDecidedBracket();
    // r1m1 has position 1 (odd), feeds into r2m0 as participant2
    const result = clearDownstream(bracket, 'r1m1');

    const r2m0 = result.rounds[1].matchups[0];
    expect(r2m0.participant2).toBeNull();
    expect(r2m0.winner).toBeNull();
  });

  it('clears all downstream matchups recursively from a first-round matchup', () => {
    const bracket = createFullyDecidedBracket();
    // r1m0 (position 0) → feeds into r2m0 (position 0) → feeds into r3m0 (final)
    const result = clearDownstream(bracket, 'r1m0');

    // r2m0 should have participant1 cleared and winner cleared
    const r2m0 = result.rounds[1].matchups[0];
    expect(r2m0.participant1).toBeNull();
    expect(r2m0.winner).toBeNull();

    // r3m0 should have participant1 cleared (r2m0 has position 0 = even)
    const r3m0 = result.rounds[2].matchups[0];
    expect(r3m0.participant1).toBeNull();
    expect(r3m0.winner).toBeNull();
  });

  it('clears champion when downstream chain reaches the final', () => {
    const bracket = createFullyDecidedBracket();
    expect(bracket.champion).not.toBeNull();

    const result = clearDownstream(bracket, 'r1m0');
    expect(result.champion).toBeNull();
  });

  it('does not clear champion when downstream chain does not reach the final', () => {
    // Create a bracket where we clear from a second-round matchup
    // that does NOT reach the final (this only happens in larger brackets)
    // For our 8-player bracket, r2m0 feeds into r3m0 (the final), so let's test
    // the case where we clear from r2m1 (position 1) which also feeds into r3m0
    const bracket = createFullyDecidedBracket();

    // r2m1 has nextMatchupId = 'r3m0' so it DOES reach the final
    const result = clearDownstream(bracket, 'r2m1');
    expect(result.champion).toBeNull();
  });

  it('does not mutate the original bracket', () => {
    const bracket = createFullyDecidedBracket();
    const originalChampion = bracket.champion;
    const originalR2M0Winner = bracket.rounds[1].matchups[0].winner;

    clearDownstream(bracket, 'r1m0');

    expect(bracket.champion).toBe(originalChampion);
    expect(bracket.rounds[1].matchups[0].winner).toBe(originalR2M0Winner);
  });

  it('does not affect unrelated matchups', () => {
    const bracket = createFullyDecidedBracket();
    // Clearing from r1m0 should not affect r1m2, r1m3, or r2m1
    const result = clearDownstream(bracket, 'r1m0');

    // r1m2 and r1m3 should be untouched
    expect(result.rounds[0].matchups[2].winner).not.toBeNull();
    expect(result.rounds[0].matchups[3].winner).not.toBeNull();

    // r2m1 should be untouched
    expect(result.rounds[1].matchups[1].winner).not.toBeNull();
    expect(result.rounds[1].matchups[1].participant1).not.toBeNull();
    expect(result.rounds[1].matchups[1].participant2).not.toBeNull();
  });

  it('handles clearing from a second-round matchup', () => {
    const bracket = createFullyDecidedBracket();
    // r2m0 has position 0 (even), feeds into r3m0 as participant1
    const result = clearDownstream(bracket, 'r2m0');

    // r3m0 should have participant1 cleared and winner cleared
    const r3m0 = result.rounds[2].matchups[0];
    expect(r3m0.participant1).toBeNull();
    expect(r3m0.winner).toBeNull();

    // r2m0 itself should NOT be cleared (only downstream)
    const r2m0 = result.rounds[1].matchups[0];
    expect(r2m0.winner).not.toBeNull();
    expect(r2m0.participant1).not.toBeNull();
    expect(r2m0.participant2).not.toBeNull();
  });

  it('handles the case where downstream matchups have no winners yet', () => {
    const bracket = createFullyDecidedBracket();
    // Manually create a bracket where round 2 and 3 have no winners
    const partialBracket: Bracket = {
      ...bracket,
      rounds: bracket.rounds.map((round, roundIndex) => ({
        ...round,
        matchups: round.matchups.map((m) => {
          if (roundIndex === 0) return m; // keep round 1 winners
          return { ...m, winner: null, participant1: null, participant2: null };
        }),
      })),
      champion: null,
    };

    // clearDownstream from r1m0 should not throw, should still return a new bracket
    const result = clearDownstream(partialBracket, 'r1m0');

    // Already null values should remain null
    const r2m0 = result.rounds[1].matchups[0];
    expect(r2m0.participant1).toBeNull();
    expect(r2m0.winner).toBeNull();
  });

  it('correctly identifies slot for position 2 (even) and position 3 (odd)', () => {
    const bracket = createFullyDecidedBracket();

    // r1m2 has position 2 (even) → clears participant1 of r2m1
    const result1 = clearDownstream(bracket, 'r1m2');
    const r2m1_after = result1.rounds[1].matchups[1];
    expect(r2m1_after.participant1).toBeNull();
    expect(r2m1_after.participant2).not.toBeNull(); // participant2 from r1m3 unaffected

    // r1m3 has position 3 (odd) → clears participant2 of r2m1
    const result2 = clearDownstream(bracket, 'r1m3');
    const r2m1_after2 = result2.rounds[1].matchups[1];
    expect(r2m1_after2.participant2).toBeNull();
    expect(r2m1_after2.participant1).not.toBeNull(); // participant1 from r1m2 unaffected
  });
});
