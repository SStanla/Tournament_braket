import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { saveTournament, loadTournament, clearTournament, _resetFallbackState } from '../services/persistence';
import type { Tournament, Bracket, Participant, Round, Matchup } from '../types/index';

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 17: Session Storage Round Trip
// **Validates: Requirements 7.4**
// ---------------------------------------------------------------------------
describe('Property 17: Session Storage Round Trip', () => {
  const PBT_CONFIG = { numRuns: 100 };

  beforeEach(() => {
    _resetFallbackState();
    sessionStorage.clear();
  });

  // Generators
  const validCategory = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  const validBracketSize = fc.constantFrom(2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048);

  const validName = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  const participantArb: fc.Arbitrary<Participant> = fc.record({
    id: fc.uuid(),
    name: validName,
    source: fc.constantFrom('manual' as const, 'suggestion' as const),
    seed: fc.nat(),
  });

  const matchupArb: fc.Arbitrary<Matchup> = fc.record({
    id: fc.uuid(),
    roundNumber: fc.integer({ min: 1, max: 11 }),
    position: fc.nat({ max: 1023 }),
    participant1: fc.option(participantArb, { nil: null }),
    participant2: fc.option(participantArb, { nil: null }),
    winner: fc.option(participantArb, { nil: null }),
    nextMatchupId: fc.option(fc.uuid(), { nil: null }),
    // Vote_Based_Mode fields: null in Classic_Mode / before votes, else integers.
    votes1: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
    votes2: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
  });

  const roundArb: fc.Arbitrary<Round> = fc.record({
    roundNumber: fc.integer({ min: 1, max: 11 }),
    label: fc.constantFrom('Round 1', 'Quarterfinal', 'Semifinal', 'Final'),
    matchups: fc.array(matchupArb, { minLength: 0, maxLength: 4 }),
  });

  const tournamentArb: fc.Arbitrary<Tournament> = fc.record({
    id: fc.uuid(),
    category: validCategory,
    bracketSize: validBracketSize,
    createdAt: fc.nat(),
    // null selects Classic_Mode; a positive integer selects Vote_Based_Mode.
    playerCount: fc.option(fc.integer({ min: 1, max: 10_000 }), { nil: null }),
  });

  const bracketArb: fc.Arbitrary<Bracket> = fc.record({
    tournamentId: fc.uuid(),
    size: validBracketSize,
    rounds: fc.array(roundArb, { minLength: 0, maxLength: 4 }),
    participants: fc.array(participantArb, { minLength: 0, maxLength: 8 }),
    champion: fc.option(participantArb, { nil: null }),
    currentRound: fc.integer({ min: 1, max: 11 }),
    thirdPlaceMatch: fc.option(matchupArb, { nil: null }),
    thirdPlace: fc.option(participantArb, { nil: null }),
    fourthPlace: fc.option(participantArb, { nil: null }),
  });

  it('should produce a deeply equal object after save and load round trip', () => {
    fc.assert(
      fc.property(tournamentArb, bracketArb, (tournament, bracket) => {
        // Clear any previous state
        clearTournament();
        _resetFallbackState();

        // Save
        saveTournament(tournament, bracket);

        // Load
        const loaded = loadTournament();

        // Assert round-trip equality
        expect(loaded).not.toBeNull();
        expect(loaded!.tournament).toEqual(tournament);
        expect(loaded!.bracket).toEqual(bracket);
      }),
      PBT_CONFIG
    );
  });

  it('should return null when no data has been saved', () => {
    clearTournament();
    _resetFallbackState();
    const loaded = loadTournament();
    expect(loaded).toBeNull();
  });

  it('should produce deeply equal data regardless of bracket complexity', () => {
    fc.assert(
      fc.property(
        tournamentArb,
        fc.record({
          tournamentId: fc.uuid(),
          size: validBracketSize,
          rounds: fc.array(roundArb, { minLength: 1, maxLength: 6 }),
          participants: fc.array(participantArb, { minLength: 1, maxLength: 16 }),
          champion: fc.option(participantArb, { nil: null }),
          currentRound: fc.integer({ min: 1, max: 11 }),
          thirdPlaceMatch: fc.option(matchupArb, { nil: null }),
          thirdPlace: fc.option(participantArb, { nil: null }),
          fourthPlace: fc.option(participantArb, { nil: null }),
        }),
        (tournament, bracket) => {
          clearTournament();
          _resetFallbackState();

          saveTournament(tournament, bracket);
          const loaded = loadTournament();

          expect(loaded).toEqual({ tournament, bracket });
        }
      ),
      PBT_CONFIG
    );
  });
});
