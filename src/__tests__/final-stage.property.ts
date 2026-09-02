import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateBracket,
  advanceWinner,
  advanceThirdPlaceWinner,
  getCurrentStageMatchups,
  getFinalStandings,
} from '../services/bracket-manager';
import { Bracket, Matchup, Participant } from '../types/index';

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

/**
 * Advances winners through every round up to and INCLUDING the Semifinal round,
 * leaving the Final undecided. After this, both Semifinal matchups have winners
 * and (for size >= 4) the third-place slots are populated by advanceWinner's
 * built-in populateThirdPlace call. `currentRound` reaches the Final via the
 * reducer in production; here we don't need it — the selectors derive the
 * current round from the round decisions themselves.
 *
 * `pickFirst` chooses participant1 (true) or participant2 (false) as the winner
 * of each matchup.
 */
function advanceThroughSemifinals(bracket: Bracket, pickFirst: boolean): Bracket {
  let current = bracket;
  const semifinalRoundNumber = current.rounds.find((r) => r.label === 'Semifinal')!.roundNumber;

  for (let roundNumber = 1; roundNumber <= semifinalRoundNumber; roundNumber++) {
    const round = current.rounds.find((r) => r.roundNumber === roundNumber)!;
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

/**
 * Decides the Final matchup by advancing participant1 (or participant2 when
 * pickFirst is false) so the champion is set. Assumes the Final has both slots
 * filled (i.e. the Semifinals are already decided).
 */
function decideFinal(bracket: Bracket, pickFirst: boolean): Bracket {
  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  const finalMatchup = finalRound.matchups[0];
  const winnerId = pickFirst ? finalMatchup.participant1!.id : finalMatchup.participant2!.id;
  return advanceWinner(bracket, finalMatchup.id, winnerId);
}

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 34: Final-stage ordering exposes the third-place match before the final (size >= 4)
// **Validates: Requirements 10.9, 10.10, 14.6, 14.7, 14.8**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 34: Final-stage ordering exposes the third-place match before the final (size >= 4)', () => {
  const sizeWithSemifinals = fc.constantFrom(4, 8);

  it('exposes exactly [thirdPlaceMatch] before its winner is set, then exactly the Final round matchups', () => {
    fc.assert(
      fc.property(sizeWithSemifinals, fc.boolean(), fc.boolean(), (size, pickFirst, selectSlot1) => {
        const bracket = generateBracket(createParticipants(size), size);
        const atFinalStage = advanceThroughSemifinals(bracket, pickFirst);

        const tpm = atFinalStage.thirdPlaceMatch!;
        expect(tpm).not.toBeNull();
        expect(tpm.winner).toBeNull();

        // While the third-place winner is undecided, only the third-place match
        // is exposed — the Final matchup is NOT included.
        const beforeStage = getCurrentStageMatchups(atFinalStage);
        expect(beforeStage).toHaveLength(1);
        expect(beforeStage[0].id).toBe(tpm.id);

        const finalRound = atFinalStage.rounds[atFinalStage.rounds.length - 1];
        const finalMatchupId = finalRound.matchups[0].id;
        expect(beforeStage.some((m) => m.id === finalMatchupId)).toBe(false);

        // Decide the third-place match (Final still undecided).
        const selected = selectSlot1 ? tpm.participant1! : tpm.participant2!;
        const decidedThird = advanceThirdPlaceWinner(atFinalStage, selected.id);
        expect(decidedThird.thirdPlaceMatch!.winner).not.toBeNull();

        // Now the exposed matchups are exactly the Final round's matchups.
        const afterStage = getCurrentStageMatchups(decidedThird);
        const expectedFinalIds = finalRound.matchups.map((m) => m.id).sort();
        expect(afterStage.map((m) => m.id).sort()).toEqual(expectedFinalIds);
      }),
      PBT_CONFIG
    );
  });

  it('for size 2 exposes the Final directly and has no third-place match', () => {
    const bracket = generateBracket(createParticipants(2), 2);
    expect(bracket.thirdPlaceMatch).toBeNull();

    const stage = getCurrentStageMatchups(bracket);
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    expect(stage.map((m) => m.id).sort()).toEqual(finalRound.matchups.map((m) => m.id).sort());
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 35: Final standings are ordered placements derived from the completed bracket
// **Validates: Requirements 15.2, 15.3, 15.4**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 35: Final standings are ordered placements derived from the completed bracket', () => {
  it('returns strictly-increasing places from 1 with place1=final winner and place2=final loser (size >= 4 → 4 entries)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(4, 8),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (size, pickFirst, selectThirdSlot1, finalPickFirst) => {
          const bracket = generateBracket(createParticipants(size), size);
          const atFinalStage = advanceThroughSemifinals(bracket, pickFirst);

          // Decide the third-place match.
          const tpm = atFinalStage.thirdPlaceMatch!;
          const thirdSelected = selectThirdSlot1 ? tpm.participant1! : tpm.participant2!;
          const decidedThird = advanceThirdPlaceWinner(atFinalStage, thirdSelected.id);

          // Decide the Final → the tournament is now complete.
          const complete = decideFinal(decidedThird, finalPickFirst);

          const finalRound = complete.rounds[complete.rounds.length - 1];
          const finalMatchup = finalRound.matchups[0];
          const champion = finalMatchup.winner!;
          const runnerUp =
            finalMatchup.participant1!.id === champion.id
              ? finalMatchup.participant2!
              : finalMatchup.participant1!;

          const standings = getFinalStandings(complete);

          // Exactly four entries for size >= 4.
          expect(standings).toHaveLength(4);

          // Places strictly increasing starting at 1.
          expect(standings.map((s) => s.place)).toEqual([1, 2, 3, 4]);

          // Place 1 = champion, place 2 = runner-up.
          expect(standings[0].participant.id).toBe(champion.id);
          expect(standings[1].participant.id).toBe(runnerUp.id);

          // Place 3 = thirdPlace, place 4 = fourthPlace.
          expect(standings[2].participant.id).toBe(complete.thirdPlace!.id);
          expect(standings[3].participant.id).toBe(complete.fourthPlace!.id);
        }
      ),
      PBT_CONFIG
    );
  });

  it('returns exactly two entries (places 1 and 2) for a completed size-2 bracket', () => {
    fc.assert(
      fc.property(fc.boolean(), (finalPickFirst) => {
        const bracket = generateBracket(createParticipants(2), 2);
        const complete = decideFinal(bracket, finalPickFirst);

        const finalMatchup = complete.rounds[complete.rounds.length - 1].matchups[0];
        const champion = finalMatchup.winner!;
        const runnerUp =
          finalMatchup.participant1!.id === champion.id
            ? finalMatchup.participant2!
            : finalMatchup.participant1!;

        const standings = getFinalStandings(complete);

        expect(standings).toHaveLength(2);
        expect(standings.map((s) => s.place)).toEqual([1, 2]);
        expect(standings[0].participant.id).toBe(champion.id);
        expect(standings[1].participant.id).toBe(runnerUp.id);
      }),
      PBT_CONFIG
    );
  });
});
