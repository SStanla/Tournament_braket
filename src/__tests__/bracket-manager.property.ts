import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createTournament, generateBracket, calculateRoundCount, addParticipant, removeParticipant, advanceWinner, canSelectWinner, getChampion } from '../services/bracket-manager';
import { Bracket, Matchup } from '../types/index';
import { Participant } from '../types/index';

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 2: Tournament Creation Identity Preservation
// **Validates: Requirements 1.1**
// ---------------------------------------------------------------------------
describe('Property 2: Tournament Creation Identity Preservation', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Generators
  const validCategory = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  const validBracketSize = fc.constantFrom(2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048);

  it('should produce a tournament with a unique UUID for each call', () => {
    fc.assert(
      fc.property(validCategory, validBracketSize, (category, bracketSize) => {
        const tournament1 = createTournament(category, bracketSize);
        const tournament2 = createTournament(category, bracketSize);

        // Each tournament must have a non-empty string ID
        expect(tournament1.id).toBeTruthy();
        expect(tournament2.id).toBeTruthy();

        // IDs must be different even with the same inputs
        expect(tournament1.id).not.toBe(tournament2.id);
      }),
      PBT_CONFIG
    );
  });

  it('should preserve the category field as the trimmed version of the input', () => {
    fc.assert(
      fc.property(validCategory, validBracketSize, (category, bracketSize) => {
        const tournament = createTournament(category, bracketSize);

        expect(tournament.category).toBe(category.trim());
      }),
      PBT_CONFIG
    );
  });

  it('should produce unique IDs across multiple calls (no collisions)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(validCategory, validBracketSize),
          { minLength: 2, maxLength: 10 }
        ),
        (inputs) => {
          const tournaments = inputs.map(([cat, size]) => createTournament(cat, size));
          const ids = tournaments.map((t) => t.id);
          const uniqueIds = new Set(ids);

          // All IDs must be unique — no collisions
          expect(uniqueIds.size).toBe(ids.length);
        }
      ),
      PBT_CONFIG
    );
  });

  it('should preserve bracketSize exactly as provided', () => {
    fc.assert(
      fc.property(validCategory, validBracketSize, (category, bracketSize) => {
        const tournament = createTournament(category, bracketSize);

        expect(tournament.bracketSize).toBe(bracketSize);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 12: Participant Assignment Is a Permutation
// **Validates: Requirements 5.2**
// ---------------------------------------------------------------------------
describe('Property 12: Participant Assignment Is a Permutation', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Use smaller bracket sizes for performance
  const validBracketSize = fc.constantFrom(2, 4, 8, 16);

  // Generator: creates exactly bracketSize unique participants
  const participantsForSize = (bracketSize: number) =>
    fc
      .uniqueArray(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        { minLength: bracketSize, maxLength: bracketSize }
      )
      .map((names) =>
        names.map(
          (name, index): Participant => ({
            id: `participant-${index}`,
            name: name.trim(),
            source: 'manual',
            seed: 0,
          })
        )
      );

  it('should assign every participant to exactly one first-round matchup slot', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        return fc.assert(
          fc.property(participantsForSize(bracketSize), (participants) => {
            const bracket = generateBracket(participants, bracketSize);

            // Get first-round matchups
            const firstRound = bracket.rounds.find((r) => r.roundNumber === 1);
            expect(firstRound).toBeDefined();

            // Collect all participant IDs from first-round matchup slots
            const assignedIds: string[] = [];
            for (const matchup of firstRound!.matchups) {
              if (matchup.participant1) {
                assignedIds.push(matchup.participant1.id);
              }
              if (matchup.participant2) {
                assignedIds.push(matchup.participant2.id);
              }
            }

            // The original participant IDs (after seeding, IDs are preserved)
            const originalIds = bracket.participants.map((p) => p.id);

            // Assert: same number of assigned IDs as participants
            expect(assignedIds.length).toBe(originalIds.length);

            // Assert: no duplicates in assigned IDs
            const uniqueAssignedIds = new Set(assignedIds);
            expect(uniqueAssignedIds.size).toBe(assignedIds.length);

            // Assert: the set of assigned IDs equals the set of original participant IDs
            const originalIdSet = new Set(originalIds);
            expect(uniqueAssignedIds.size).toBe(originalIdSet.size);
            for (const id of assignedIds) {
              expect(originalIdSet.has(id)).toBe(true);
            }
          }),
          { numRuns: 1 } // inner property runs once per bracketSize draw
        );
      }),
      PBT_CONFIG
    );
  });

  it('should have the collected first-round participants equal the original participant set (same elements)', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        return fc.assert(
          fc.property(participantsForSize(bracketSize), (participants) => {
            const bracket = generateBracket(participants, bracketSize);

            const firstRound = bracket.rounds.find((r) => r.roundNumber === 1)!;

            // Collect participant names from first-round slots
            const assignedNames: string[] = [];
            for (const matchup of firstRound.matchups) {
              if (matchup.participant1) {
                assignedNames.push(matchup.participant1.name);
              }
              if (matchup.participant2) {
                assignedNames.push(matchup.participant2.name);
              }
            }

            // Original participant names
            const originalNames = participants.map((p) => p.name);

            // Assert: same size
            expect(assignedNames.length).toBe(originalNames.length);

            // Assert: same elements (sorted comparison)
            expect([...assignedNames].sort()).toEqual([...originalNames].sort());
          }),
          { numRuns: 1 }
        );
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 4: Bracket Slot Count Invariant
// **Validates: Requirements 2.2, 2.4**
// ---------------------------------------------------------------------------
describe('Property 4: Bracket Slot Count Invariant', () => {
  const PBT_CONFIG = { numRuns: 100 };

  const validBracketSize = fc.constantFrom(2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048);

  /**
   * Helper: generates an array of N dummy participants for testing.
   */
  function createDummyParticipants(count: number): Participant[] {
    const participants: Participant[] = [];
    for (let i = 0; i < count; i++) {
      participants.push({
        id: `participant-${i}`,
        name: `Participant ${i + 1}`,
        source: 'manual',
        seed: 0,
      });
    }
    return participants;
  }

  it('should produce exactly bracketSize participant slots in first-round matchups', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // First round is always round 1
        const firstRound = bracket.rounds.find((r) => r.roundNumber === 1);
        expect(firstRound).toBeDefined();

        // Count total participant slots: each matchup has 2 slots (participant1 and participant2)
        const totalSlots = firstRound!.matchups.length * 2;

        // Total slots must equal bracketSize
        expect(totalSlots).toBe(bracketSize);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 11: Round Count Equals Log₂ of Bracket Size
// **Validates: Requirements 5.1**
// ---------------------------------------------------------------------------
describe('Property 11: Round Count Equals Log₂ of Bracket Size', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Generator for valid bracket sizes (powers of 2 from 2 to 2048)
  const validBracketSize = fc.constantFrom(2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048);

  it('should produce exactly log₂(bracketSize) rounds when generating a bracket', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        // Create N dummy participants to fill the bracket
        const participants: Participant[] = Array.from({ length: bracketSize }, (_, i) => ({
          id: `participant-${i}`,
          name: `Player ${i + 1}`,
          source: 'manual' as const,
          seed: i + 1,
        }));

        const bracket = generateBracket(participants, bracketSize);

        // The number of rounds must equal log₂ of the bracket size
        expect(bracket.rounds.length).toBe(Math.log2(bracketSize));
      }),
      PBT_CONFIG
    );
  });

  it('should have calculateRoundCount return log₂ of the bracket size', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        expect(calculateRoundCount(bracketSize)).toBe(Math.log2(bracketSize));
      }),
      PBT_CONFIG
    );
  });
});


// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function createEmptyBracket(size: number): Bracket {
  return { tournamentId: 'test-id', size, rounds: [], participants: [], champion: null };
}

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 7: Duplicate Participant Rejection
// **Validates: Requirements 3.7**
// ---------------------------------------------------------------------------
describe('Property 7: Duplicate Participant Rejection', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Generator: valid participant name (1-100 chars, non-empty after trim)
  const validParticipantName = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  it('should reject adding a duplicate name (case-sensitive) and leave participant list unchanged', () => {
    fc.assert(
      fc.property(validParticipantName, (name) => {
        // Create an empty bracket of size 8 and add the participant once
        const emptyBracket = createEmptyBracket(8);
        const bracketWithOne = addParticipant(emptyBracket, name);

        // Attempting to add the same name again should throw
        expect(() => addParticipant(bracketWithOne, name)).toThrow();

        // The participant count should still be 1 (unchanged)
        expect(bracketWithOne.participants.length).toBe(1);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 8: Participant Removal Frees Slot
// **Validates: Requirements 3.6**
// ---------------------------------------------------------------------------
describe('Property 8: Participant Removal Frees Slot', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Generator: bracket size (small for performance)
  const smallBracketSize = fc.constantFrom(2, 4);

  // Generator: array of unique valid names for filling a bracket
  const uniqueNames = (count: number) =>
    fc.uniqueArray(
      fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
      { minLength: count, maxLength: count, comparator: (a, b) => a.trim() === b.trim() }
    );

  it('should decrease participant count by 1 after removal and allow a new participant to fill the slot', () => {
    fc.assert(
      fc.property(smallBracketSize, (bracketSize) => {
        // Fill the bracket to capacity with unique names
        let bracket = createEmptyBracket(bracketSize);
        const names: string[] = [];
        for (let i = 0; i < bracketSize; i++) {
          const name = `Participant_${i}_${Date.now()}`;
          bracket = addParticipant(bracket, name);
          names.push(name);
        }

        // Bracket should be full
        expect(bracket.participants.length).toBe(bracketSize);

        // Remove the first participant
        const removedId = bracket.participants[0].id;
        const bracketAfterRemoval = removeParticipant(bracket, removedId);

        // Count should decrease by exactly 1
        expect(bracketAfterRemoval.participants.length).toBe(bracketSize - 1);

        // Adding a new participant should succeed (slot was freed)
        const newName = `NewParticipant_${Date.now()}`;
        const bracketAfterAdd = addParticipant(bracketAfterRemoval, newName);

        // Final count should equal the bracket size again
        expect(bracketAfterAdd.participants.length).toBe(bracketSize);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 6: Bracket Capacity Invariant
// **Validates: Requirements 3.4, 3.5**
// ---------------------------------------------------------------------------
describe('Property 6: Bracket Capacity Invariant', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Use smaller bracket sizes for performance
  const validBracketSize = fc.constantFrom(2, 4, 8);

  /**
   * Helper: creates an empty bracket with a given size.
   */
  function createEmptyBracket(size: number): Bracket {
    return { tournamentId: 'test-id', size, rounds: [], participants: [], champion: null };
  }

  it('should allow adding participants up to bracket size N, then reject any addition beyond N', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        let bracket = createEmptyBracket(bracketSize);

        // Add N unique participants — each should succeed
        for (let i = 0; i < bracketSize; i++) {
          bracket = addParticipant(bracket, `Participant_${i}`);
        }

        // Assert bracket has exactly N participants after N additions
        expect(bracket.participants.length).toBe(bracketSize);

        // Try to add one more (N+1th) — should throw an error about bracket being full
        expect(() => addParticipant(bracket, `Participant_${bracketSize}`)).toThrow();

        // Assert the participant count stays at N
        expect(bracket.participants.length).toBe(bracketSize);
      }),
      PBT_CONFIG
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 13: Winner Advancement
// **Validates: Requirements 5.4, 6.1**
// ---------------------------------------------------------------------------
describe('Property 13: Winner Advancement', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Bracket sizes that keep tests fast while covering multiple round structures
  const bracketSize = fc.constantFrom(4, 8);

  /**
   * Helper: creates N unique participants for a bracket.
   */
  function createParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `participant-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: 0,
    }));
  }

  it('should place the winner in the correct slot of the next-round matchup with identity preserved', () => {
    fc.assert(
      fc.property(bracketSize, fc.boolean(), (size, pickFirst) => {
        const participants = createParticipants(size);
        const bracket = generateBracket(participants, size);

        // Get first-round matchups where both participants are present
        const firstRound = bracket.rounds.find((r) => r.roundNumber === 1)!;

        for (const matchup of firstRound.matchups) {
          if (!canSelectWinner(bracket, matchup.id)) {
            continue;
          }

          // Pick winner based on the random boolean
          const winner = pickFirst ? matchup.participant1! : matchup.participant2!;

          // Advance the winner
          const updatedBracket = advanceWinner(bracket, matchup.id, winner.id);

          // Find the next matchup
          expect(matchup.nextMatchupId).not.toBeNull();
          const nextMatchup = updatedBracket.rounds
            .flatMap((r) => r.matchups)
            .find((m) => m.id === matchup.nextMatchupId);
          expect(nextMatchup).toBeDefined();

          // Determine expected slot: even position → participant1, odd position → participant2
          if (matchup.position % 2 === 0) {
            expect(nextMatchup!.participant1).not.toBeNull();
            expect(nextMatchup!.participant1!.id).toBe(winner.id);
            expect(nextMatchup!.participant1!.name).toBe(winner.name);
          } else {
            expect(nextMatchup!.participant2).not.toBeNull();
            expect(nextMatchup!.participant2!.id).toBe(winner.id);
            expect(nextMatchup!.participant2!.name).toBe(winner.name);
          }
        }
      }),
      PBT_CONFIG
    );
  });

  it('should preserve the winner identity exactly (id and name unchanged)', () => {
    fc.assert(
      fc.property(bracketSize, fc.boolean(), (size, pickFirst) => {
        const participants = createParticipants(size);
        const bracket = generateBracket(participants, size);

        const firstRound = bracket.rounds.find((r) => r.roundNumber === 1)!;
        // Pick the first matchup that can select a winner
        const matchup = firstRound.matchups.find((m) => canSelectWinner(bracket, m.id));

        if (!matchup) {
          return; // No valid matchup (shouldn't happen with full bracket)
        }

        const winner = pickFirst ? matchup.participant1! : matchup.participant2!;
        const updatedBracket = advanceWinner(bracket, matchup.id, winner.id);

        // The matchup itself should have the winner set
        const updatedMatchup = updatedBracket.rounds
          .flatMap((r) => r.matchups)
          .find((m) => m.id === matchup.id)!;

        expect(updatedMatchup.winner).not.toBeNull();
        expect(updatedMatchup.winner!.id).toBe(winner.id);
        expect(updatedMatchup.winner!.name).toBe(winner.name);
      }),
      PBT_CONFIG
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 14: Winner Selection Requires Both Participants
// **Validates: Requirements 6.2, 6.5**
// ---------------------------------------------------------------------------
describe('Property 14: Winner Selection Requires Both Participants', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Generator: bracket sizes that produce enough matchups across rounds
  const validBracketSize = fc.constantFrom(4, 8, 16);

  /**
   * Helper: creates an array of N dummy participants.
   */
  function createDummyParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `participant-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: i + 1,
    }));
  }

  it('should return true for first-round matchups where both participants are present', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // First-round matchups should all have both participants present
        const firstRound = bracket.rounds.find((r) => r.roundNumber === 1)!;
        for (const matchup of firstRound.matchups) {
          expect(canSelectWinner(bracket, matchup.id)).toBe(true);
        }
      }),
      PBT_CONFIG
    );
  });

  it('should return false for later-round matchups with empty slots', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // Later rounds (round > 1) have empty participant slots before winners are advanced
        for (const round of bracket.rounds) {
          if (round.roundNumber === 1) continue;
          for (const matchup of round.matchups) {
            // These matchups have null participant slots since no winners have been advanced
            expect(canSelectWinner(bracket, matchup.id)).toBe(false);
          }
        }
      }),
      PBT_CONFIG
    );
  });

  it('should return false when only participant1 is present', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // Take a second-round matchup and manually set only participant1
        const secondRound = bracket.rounds.find((r) => r.roundNumber === 2)!;
        const targetMatchup = secondRound.matchups[0];

        // Create a modified bracket with only participant1 in the target matchup
        const modifiedBracket: Bracket = {
          ...bracket,
          rounds: bracket.rounds.map((round) => ({
            ...round,
            matchups: round.matchups.map((m) => {
              if (m.id === targetMatchup.id) {
                return {
                  ...m,
                  participant1: { id: 'test-p1', name: 'Test P1', source: 'manual' as const, seed: 1 },
                  participant2: null,
                };
              }
              return m;
            }),
          })),
        };

        expect(canSelectWinner(modifiedBracket, targetMatchup.id)).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  it('should return false when only participant2 is present', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // Take a second-round matchup and manually set only participant2
        const secondRound = bracket.rounds.find((r) => r.roundNumber === 2)!;
        const targetMatchup = secondRound.matchups[0];

        // Create a modified bracket with only participant2 in the target matchup
        const modifiedBracket: Bracket = {
          ...bracket,
          rounds: bracket.rounds.map((round) => ({
            ...round,
            matchups: round.matchups.map((m) => {
              if (m.id === targetMatchup.id) {
                return {
                  ...m,
                  participant1: null,
                  participant2: { id: 'test-p2', name: 'Test P2', source: 'manual' as const, seed: 2 },
                };
              }
              return m;
            }),
          })),
        };

        expect(canSelectWinner(modifiedBracket, targetMatchup.id)).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  it('should return true when both participant1 and participant2 are present', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // Take a second-round matchup and manually set both participants
        const secondRound = bracket.rounds.find((r) => r.roundNumber === 2)!;
        const targetMatchup = secondRound.matchups[0];

        // Create a modified bracket with both participants in the target matchup
        const modifiedBracket: Bracket = {
          ...bracket,
          rounds: bracket.rounds.map((round) => ({
            ...round,
            matchups: round.matchups.map((m) => {
              if (m.id === targetMatchup.id) {
                return {
                  ...m,
                  participant1: { id: 'test-p1', name: 'Test P1', source: 'manual' as const, seed: 1 },
                  participant2: { id: 'test-p2', name: 'Test P2', source: 'manual' as const, seed: 2 },
                };
              }
              return m;
            }),
          })),
        };

        expect(canSelectWinner(modifiedBracket, targetMatchup.id)).toBe(true);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 16: Champion Detection
// **Validates: Requirements 6.3**
// ---------------------------------------------------------------------------
describe('Property 16: Champion Detection', () => {
  const PBT_CONFIG = { numRuns: 100 };

  // Use small bracket sizes for performance
  const validBracketSize = fc.constantFrom(2, 4);

  /**
   * Helper: creates N unique dummy participants.
   */
  function createDummyParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `participant-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: i + 1,
    }));
  }

  /**
   * Helper: advances winners through all rounds of a bracket.
   * Uses a boolean array to decide: true = pick participant1, false = pick participant2.
   * Returns the fully-decided bracket.
   */
  function advanceAllWinners(bracket: Bracket, picks: boolean[]): Bracket {
    let current = bracket;
    let pickIndex = 0;

    for (const round of current.rounds) {
      // We need to re-read rounds from `current` each iteration because advancing
      // modifies the bracket structure (participants get placed in later rounds).
      const currentRound = current.rounds.find((r) => r.roundNumber === round.roundNumber)!;
      for (const matchup of currentRound.matchups) {
        // Re-find the matchup in the current state of the bracket
        const freshMatchup = current.rounds
          .find((r) => r.roundNumber === round.roundNumber)!
          .matchups.find((m) => m.id === matchup.id)!;

        if (freshMatchup.participant1 && freshMatchup.participant2) {
          const pickFirst = picks[pickIndex % picks.length];
          pickIndex++;
          const winnerId = pickFirst
            ? freshMatchup.participant1.id
            : freshMatchup.participant2.id;
          current = advanceWinner(current, freshMatchup.id, winnerId);
        }
      }
    }

    return current;
  }

  it('should return null for an undecided bracket (no winners selected)', () => {
    fc.assert(
      fc.property(validBracketSize, (bracketSize) => {
        const participants = createDummyParticipants(bracketSize);
        const bracket = generateBracket(participants, bracketSize);

        // No winners have been advanced — champion should be null
        const champion = getChampion(bracket);
        expect(champion).toBeNull();
      }),
      PBT_CONFIG
    );
  });

  it('should return the final-round matchup winner for a fully-decided bracket', () => {
    fc.assert(
      fc.property(
        validBracketSize,
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        (bracketSize, picks) => {
          const participants = createDummyParticipants(bracketSize);
          const bracket = generateBracket(participants, bracketSize);

          // Advance all winners through every round
          const decidedBracket = advanceAllWinners(bracket, picks);

          // Get the champion
          const champion = getChampion(decidedBracket);

          // Champion must be non-null for a fully-decided bracket
          expect(champion).not.toBeNull();

          // Champion must equal the winner of the final matchup
          const finalRound = decidedBracket.rounds[decidedBracket.rounds.length - 1];
          const finalMatchup = finalRound.matchups[0];
          expect(champion!.id).toBe(finalMatchup.winner!.id);
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 15: Downstream Clearing on Winner Change
// **Validates: Requirements 6.4**
// ---------------------------------------------------------------------------
import { advanceWinner, clearDownstream } from '../services/bracket-manager';

describe('Property 15: Downstream Clearing on Winner Change', () => {
  const PBT_CONFIG = { numRuns: 100 };

  /**
   * Helper: creates a list of N unique participants.
   */
  function createParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `p-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: i + 1,
    }));
  }

  it('should clear downstream matchups in the dependency chain when a first-round winner is changed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(4, 8),
        fc.nat(),
        (bracketSize, natValue) => {
          const participants = createParticipants(bracketSize);
          let bracket = generateBracket(participants, bracketSize);

          // Advance all first-round winners
          const firstRound = bracket.rounds[0];
          for (const matchup of firstRound.matchups) {
            // Pick participant1 as winner for all first-round matchups
            bracket = advanceWinner(bracket, matchup.id, matchup.participant1!.id);
          }

          // Advance second-round winners (and beyond until final)
          for (let roundIdx = 1; roundIdx < bracket.rounds.length; roundIdx++) {
            const round = bracket.rounds[roundIdx];
            for (const matchup of round.matchups) {
              if (matchup.participant1 && matchup.participant2) {
                bracket = advanceWinner(bracket, matchup.id, matchup.participant1!.id);
              }
            }
          }

          // Pick a first-round matchup to clear from (using nat to select index)
          const firstRoundMatchups = bracket.rounds[0].matchups;
          const matchupIndex = natValue % firstRoundMatchups.length;
          const targetMatchup = firstRoundMatchups[matchupIndex];

          // Call clearDownstream on the selected first-round matchup
          const clearedBracket = clearDownstream(bracket, targetMatchup.id);

          // Determine the slot that was cleared in the next-round matchup
          const slotToClear = targetMatchup.position % 2 === 0 ? 'participant1' : 'participant2';

          // Find the next-round matchup that the target feeds into
          const nextMatchupId = targetMatchup.nextMatchupId!;
          const nextRound = clearedBracket.rounds[1];
          const nextMatchup = nextRound.matchups.find((m) => m.id === nextMatchupId)!;

          // Assert: the corresponding slot in the next-round matchup is cleared
          expect(nextMatchup[slotToClear]).toBeNull();

          // Assert: the downstream matchup's winner is cleared
          expect(nextMatchup.winner).toBeNull();

          // Assert: if the dependency chain reaches the final, champion is cleared
          // Trace the chain from the next matchup to the final
          let current = nextMatchup;
          while (current.nextMatchupId) {
            const downstreamRound = clearedBracket.rounds.find((r) =>
              r.matchups.some((m) => m.id === current.nextMatchupId)
            )!;
            const downstream = downstreamRound.matchups.find(
              (m) => m.id === current.nextMatchupId
            )!;
            // The slot fed by `current` should be cleared
            const downstreamSlot = current.position % 2 === 0 ? 'participant1' : 'participant2';
            expect(downstream[downstreamSlot]).toBeNull();
            expect(downstream.winner).toBeNull();
            current = downstream;
          }

          // If the final matchup is in the chain, champion must be null
          const finalRound = clearedBracket.rounds[clearedBracket.rounds.length - 1];
          const finalMatchup = finalRound.matchups[0];
          if (finalMatchup.id === nextMatchupId || current.id === finalMatchup.id) {
            expect(clearedBracket.champion).toBeNull();
          }

          // Assert: matchups NOT in the dependency chain are unaffected
          // Build the set of affected matchup IDs
          const affectedIds = new Set<string>();
          affectedIds.add(nextMatchupId);
          let tracing = nextMatchup;
          while (tracing.nextMatchupId) {
            affectedIds.add(tracing.nextMatchupId);
            const found = clearedBracket.rounds
              .flatMap((r) => r.matchups)
              .find((m) => m.id === tracing.nextMatchupId);
            if (!found) break;
            tracing = found;
          }

          // Check that unaffected matchups still have their original state
          for (const round of clearedBracket.rounds) {
            for (const matchup of round.matchups) {
              if (matchup.id === targetMatchup.id || affectedIds.has(matchup.id)) {
                continue; // skip the target and downstream
              }
              // Find the corresponding original matchup
              const originalMatchup = bracket.rounds
                .flatMap((r) => r.matchups)
                .find((m) => m.id === matchup.id)!;

              // Winner and participants should remain unchanged
              expect(matchup.winner?.id).toBe(originalMatchup.winner?.id);
              expect(matchup.participant1?.id).toBe(originalMatchup.participant1?.id);
              expect(matchup.participant2?.id).toBe(originalMatchup.participant2?.id);
            }
          }
        }
      ),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 20: Completion requires the Final and, for size >= 4, the third-place winner
// **Validates: Requirements 6.4, 10.11**
// ---------------------------------------------------------------------------
import {
  advanceThirdPlaceWinner as advanceThirdPlaceWinnerP20,
  isTournamentComplete as isTournamentCompleteP20,
} from '../services/bracket-manager';

describe('Feature: tournament-bracket-creator, Property 20: Completion requires the Final and, for size >= 4, the third-place winner', () => {
  const PBT_CONFIG_20 = { numRuns: 100 };

  function createParticipantsP20(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `p20-participant-${i}`,
      name: `Player ${i + 1}`,
      source: 'manual' as const,
      seed: 0,
    }));
  }

  function findMatchupByIdP20(bracket: Bracket, id: string): Matchup | undefined {
    return bracket.rounds.flatMap((r) => r.matchups).find((m) => m.id === id);
  }

  /** Advances winners through all rounds INCLUDING the Final (leaving third place undecided). */
  function decideAllRounds(bracket: Bracket, pickFirst: boolean): Bracket {
    let current = bracket;
    for (const round of bracket.rounds) {
      const matchupIds = round.matchups.map((m) => m.id);
      for (const matchupId of matchupIds) {
        const fresh = findMatchupByIdP20(current, matchupId)!;
        if (fresh.participant1 && fresh.participant2 && !fresh.winner) {
          const winnerId = pickFirst ? fresh.participant1.id : fresh.participant2.id;
          current = advanceWinner(current, matchupId, winnerId);
        }
      }
    }
    return current;
  }

  it('is complete iff the Final is decided AND (size >= 4) the third-place winner is decided', () => {
    fc.assert(
      fc.property(fc.constantFrom(2, 4, 8), fc.boolean(), (size, pickFirst) => {
        const fresh = generateBracket(createParticipantsP20(size), size);

        // Undecided bracket → never complete.
        expect(isTournamentCompleteP20(fresh)).toBe(false);

        // Decide all rounds through the Final (third place still undecided).
        const finalDecided = decideAllRounds(fresh, pickFirst);
        expect(getChampion(finalDecided)).not.toBeNull();

        if (size === 2) {
          // No third-place match → the decided Final alone completes the tournament.
          expect(finalDecided.thirdPlaceMatch).toBeNull();
          expect(isTournamentCompleteP20(finalDecided)).toBe(true);
          return;
        }

        // size >= 4: the Final is decided but third place is NOT → NOT complete.
        expect(finalDecided.thirdPlaceMatch).not.toBeNull();
        expect(finalDecided.thirdPlace).toBeNull();
        expect(isTournamentCompleteP20(finalDecided)).toBe(false);

        // Decide the third-place match → now complete.
        const tpm = finalDecided.thirdPlaceMatch!;
        const completed = advanceThirdPlaceWinnerP20(finalDecided, tpm.participant1!.id);
        expect(completed.thirdPlace).not.toBeNull();
        expect(isTournamentCompleteP20(completed)).toBe(true);
      }),
      PBT_CONFIG_20
    );
  });

  it('for size >= 4 stays incomplete when third place is decided but the Final is not', () => {
    fc.assert(
      fc.property(fc.constantFrom(4, 8), fc.boolean(), (size, pickFirst) => {
        const fresh = generateBracket(createParticipantsP20(size), size);

        // Decide only up to and including the Semifinals (Final undecided), which
        // populates the third-place slots via advanceWinner.
        let current = fresh;
        const semifinalRoundNumber = current.rounds.find((r) => r.label === 'Semifinal')!
          .roundNumber;
        for (let roundNumber = 1; roundNumber <= semifinalRoundNumber; roundNumber++) {
          const round = current.rounds.find((r) => r.roundNumber === roundNumber)!;
          for (const matchupId of round.matchups.map((m) => m.id)) {
            const fresh2 = findMatchupByIdP20(current, matchupId)!;
            if (fresh2.participant1 && fresh2.participant2 && !fresh2.winner) {
              const winnerId = pickFirst ? fresh2.participant1.id : fresh2.participant2.id;
              current = advanceWinner(current, matchupId, winnerId);
            }
          }
        }

        // Decide the third-place match while the Final remains undecided.
        const tpm = current.thirdPlaceMatch!;
        const thirdDecided = advanceThirdPlaceWinnerP20(current, tpm.participant1!.id);

        expect(thirdDecided.thirdPlace).not.toBeNull();
        expect(getChampion(thirdDecided)).toBeNull();
        // Final undecided → still NOT complete even though third place is set.
        expect(isTournamentCompleteP20(thirdDecided)).toBe(false);
      }),
      PBT_CONFIG_20
    );
  });
});
