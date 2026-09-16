// End-to-end full-flow integration tests (Task 26).
//
// These drive the application through complete tournaments using the REAL
// application path — the tournament reducer dispatching to the pure domain
// layer — exactly as the UI would. They verify that the correctness properties
// from design.md hold across whole flows, not just in isolated unit tests:
//
//   - Property 7 (final-stage ordering) + Req 21.1/21.2: completion conditions
//     for size 2 (final alone) vs size >= 4 (final AND third place).
//   - Property 8 (correction cascade) + Req 20.1/20.3/20.4: a mid-tournament
//     correction clears downstream, recomputes vote-based re-seeding, and
//     resets the third-place match.
//   - Req 18.5: a round never advances until all its matchups are decided.
//   - Property 4 (re-seeding scope) + Req 17.3: rounds after the first are
//     re-seeded strongest-vs-weakest by votes in vote-based mode.
//   - Property 3 (tie parity) + Req 16.7/16.8/16.9: a vote tie on an even
//     player count blocks advance until the tie-break draw is used.
//
// _Requirements: 18.5, 20.1, 20.3, 20.4, 21.1, 21.2_

import { describe, expect, it } from 'vitest';
import {
  initialAppState,
  tournamentReducer,
  type AppState,
  type TournamentAction,
} from '../app/tournamentReducer';
import type { Matchup, Tournament } from '../domain/model';
import { isTie } from '../domain/tournament';

/** Apply a sequence of actions from a starting state (the real reducer path). */
function run(state: AppState, actions: TournamentAction[]): AppState {
  return actions.reduce(tournamentReducer, state);
}

/** Create + fill a bracket of `size` (optional player count) and GENERATE it. */
function generated(
  size: 2 | 4 | 8,
  playerCount: number | undefined,
  seed: number,
): AppState {
  const names = Array.from({ length: size }, (_, i) => `Opt ${i + 1}`);
  return run(initialAppState, [
    { type: 'CREATE', input: { category: 'Best thing', size, playerCount, rngSeed: seed } },
    ...names.map((name) => ({ type: 'ADD_OPTION' as const, name })),
    { type: 'GENERATE' },
  ]);
}

/** The current tournament, asserting it exists. */
function t(state: AppState): Tournament {
  expect(state.tournament).not.toBeNull();
  return state.tournament!;
}

/** The loser option of a decided matchup. */
function loserOf(m: Matchup): string {
  return m.winner!.id === m.optionA!.id ? m.optionB!.id : m.optionA!.id;
}

// ---------------------------------------------------------------------------
// Flow 1: size-2 classic — completes as soon as the final is decided (Req 21.1)
// ---------------------------------------------------------------------------

describe('full flow — size-2 classic tournament (Req 21.1)', () => {
  it('completes the moment the final is decided, with only 1st/2nd standings', () => {
    const state = generated(2, undefined, 42);
    const tour = t(state);

    // Size 2 has a single round (the final) and NO third-place match (Req 12.5).
    expect(tour.rounds).toHaveLength(1);
    expect(tour.thirdPlaceMatch).toBeUndefined();

    const final = tour.rounds[0].matchups[0];
    const championId = final.optionA!.id;
    const runnerUpId = final.optionB!.id;

    // Before deciding, the tournament is still in play.
    expect(tour.phase).toBe('PLAYING');

    const done = run(state, [
      { type: 'SET_PROVISIONAL', matchupId: final.id, choice: { optionId: championId } },
      { type: 'CONFIRM', matchupId: final.id },
    ]);
    const finished = t(done);

    // As soon as the final is decided, size 2 is complete -> RESULTS (Req 21.1).
    expect(finished.phase).toBe('RESULTS');
    expect(finished.champion!.id).toBe(championId);

    // Standings are 1st (gold) and 2nd (silver) only — no 3rd/4th (Req 22.4).
    const standings = finished.standings!;
    expect(standings.map((s) => s.place)).toEqual([1, 2]);
    expect(standings[0]).toMatchObject({ place: 1, medal: 'gold', option: { id: championId } });
    expect(standings[1]).toMatchObject({ place: 2, medal: 'silver', option: { id: runnerUpId } });
  });
});

// ---------------------------------------------------------------------------
// Flow 2: size-8 vote-based — tie-break, re-seeding, correction, third place
// (Req 18.5, 20.1, 20.3, 20.4, 21.2)
// ---------------------------------------------------------------------------

describe('full flow — size-8 vote-based tournament', () => {
  const PLAYER_COUNT = 4; // even => a 2/2 split is a tie (Property 3, Req 16.7)

  /**
   * Confirm a vote-based matchup with `votesA` votes for option A. Returns the
   * new state; the leader (or, on a tie, nothing) is committed per Req 16.6/16.7.
   */
  function decide(state: AppState, matchupId: string, votesA: number): AppState {
    return run(state, [
      { type: 'SET_PROVISIONAL', matchupId, choice: { votesA } },
      { type: 'CONFIRM', matchupId },
    ]);
  }

  it('drives a whole vote-based tournament through every critical rule', () => {
    let state = generated(8, PLAYER_COUNT, 123);
    const tour = t(state);
    expect(tour.mode).toBe('voteBased');
    expect(tour.rounds).toHaveLength(3); // log2(8): quarter, semi, final
    expect(tour.thirdPlaceMatch).toBeDefined(); // size >= 4 (Req 12.4)

    // --- Round 0 (quarterfinals): decide with distinct vote margins so the
    //     re-seed ordering is observable. A tie on one matchup exercises the
    //     tie-break; the rest are clear wins. --------------------------------
    const r0 = t(state).rounds[0].matchups.map((m) => m.id);

    // Matchup 0: an exact tie (2-2) — Property 3 / Req 16.7, 16.8.
    state = decide(state, r0[0], 2);
    let m0 = t(state).rounds[0].matchups[0];
    // The tie committed NO winner and the split is a tie (blocks advance).
    expect(m0.winner).toBeUndefined();
    expect(isTie(m0)).toBe(true);

    // Req 18.5 / 16.8: the round cannot advance while matchup 0 is an
    // unresolved tie (and other matchups are still undecided). Try to advance
    // from the last matchup — it must stay in round 0.
    const beforeAdvance = state;
    // Navigate to the last matchup and press NEXT; nothing is decided yet.
    state = tournamentReducer(state, { type: 'NEXT' });
    state = tournamentReducer(state, { type: 'NEXT' });
    state = tournamentReducer(state, { type: 'NEXT' });
    expect(t(state).currentRoundIndex).toBe(0);
    state = beforeAdvance; // reset cursor bookkeeping; state value is immutable

    // Resolve the tie with the 50/50 draw (Req 16.9). Only then does matchup 0
    // count as decided.
    state = tournamentReducer(state, { type: 'RESOLVE_TIE', matchupId: r0[0] });
    m0 = t(state).rounds[0].matchups[0];
    expect(m0.winner).toBeDefined();
    expect(m0.tieBreakUsed).toBe(true);

    // Remaining quarterfinals: clear 3-1 / 4-0 wins for option A.
    state = decide(state, r0[1], 3);
    state = decide(state, r0[2], 4);
    state = decide(state, r0[3], 3);

    // Req 18.5: every quarterfinal is now decided, so the round may advance.
    // Advance via NEXT from the last matchup (the reducer gates on completeness).
    // Move the cursor to the final matchup of the round first.
    while (t(state).currentMatchupIndex < t(state).rounds[0].matchups.length - 1) {
      state = tournamentReducer(state, { type: 'NEXT' });
    }
    state = tournamentReducer(state, { type: 'NEXT' }); // advance the round
    expect(t(state).currentRoundIndex).toBe(1);

    // --- Property 4 / Req 17.3: the semifinal round was RE-SEEDED
    //     strongest-vs-weakest by the votes each winner received. Verify the
    //     seeding matches votes received (desc) paired top-vs-bottom. ---------
    const round0Decided = t(beforeAdvance).rounds[0].matchups; // votes as decided
    // votesReceived for each winner (post tie-break for m0).
    const decidedR0 = t(state).rounds[0].matchups;
    const votesReceived = decidedR0.map((m) => {
      const winnerIsA = m.winner!.id === m.optionA!.id;
      return winnerIsA ? m.votesA! : m.votesB!;
    });
    // The re-seeded semifinals pair the highest-voted winner with the
    // lowest-voted winner. The top seed's votesReceived must be the max and it
    // must face the min in one of the two semifinal matchups.
    const semis = t(state).rounds[1].matchups;
    expect(semis).toHaveLength(2);
    // Each semifinal slot is populated (re-seeded pairing is complete).
    for (const m of semis) {
      expect(m.optionA).toBeDefined();
      expect(m.optionB).toBeDefined();
    }
    const maxVotes = Math.max(...votesReceived);
    const minVotes = Math.min(...votesReceived);
    expect(maxVotes).not.toBe(minVotes); // margins were distinct enough
    // The strongest and weakest winners are paired together (Req 17.3): find the
    // matchup that contains both the max-vote and min-vote winners.
    const winnerVotes = new Map<string, number>();
    decidedR0.forEach((m, i) => winnerVotes.set(m.winner!.id, votesReceived[i]));
    const strongestVsWeakest = semis.some((m) => {
      const a = winnerVotes.get(m.optionA!.id);
      const b = winnerVotes.get(m.optionB!.id);
      return (a === maxVotes && b === minVotes) || (a === minVotes && b === maxVotes);
    });
    expect(strongestVsWeakest).toBe(true);
    void round0Decided; // referenced for clarity of the pre-advance snapshot

    // --- Play the semifinals so the third-place match populates (Req 19.1). --
    const semiIds = semis.map((m) => m.id);
    state = decide(state, semiIds[0], 3); // option A wins 3-1
    state = decide(state, semiIds[1], 3); // option A wins 3-1
    // Advance to the final round.
    while (t(state).currentMatchupIndex < t(state).rounds[1].matchups.length - 1) {
      state = tournamentReducer(state, { type: 'NEXT' });
    }
    state = tournamentReducer(state, { type: 'NEXT' });
    expect(t(state).currentRoundIndex).toBe(2);

    // The third-place match is now populated with the two semifinal losers
    // (Req 19.1) and is playable.
    const semisDecided = t(state).rounds[1].matchups;
    const thirdBefore = t(state).thirdPlaceMatch!;
    expect(thirdBefore.optionA).toBeDefined();
    expect(thirdBefore.optionB).toBeDefined();
    const expectedThirdContestants = [loserOf(semisDecided[0]), loserOf(semisDecided[1])].sort();
    expect([thirdBefore.optionA!.id, thirdBefore.optionB!.id].sort()).toEqual(
      expectedThirdContestants,
    );

    // --- Property 7 / Req 21.2: decide the FINAL only — the tournament must
    //     NOT be complete until the third-place match is also decided. --------
    const finalMatch = t(state).rounds[2].matchups[0];
    state = decide(state, finalMatch.id, 3); // option A wins the title 3-1
    expect(t(state).phase).toBe('PLAYING'); // final decided, but not complete
    expect(t(state).champion).toBeDefined();

    // Now decide the third-place match: completion requires BOTH (Req 21.2).
    const thirdMatch = t(state).thirdPlaceMatch!;
    state = decide(state, thirdMatch.id, 3); // third-place option A wins 3-1
    const finished = t(state);
    expect(finished.phase).toBe('RESULTS');

    // Standings now include 1st..4th with the right medals (Req 22.3).
    const standings = finished.standings!;
    expect(standings.map((s) => s.place)).toEqual([1, 2, 3, 4]);
    expect(standings[0].medal).toBe('gold');
    expect(standings[1].medal).toBe('silver');
    expect(standings[2].medal).toBe('bronze');
    expect(standings[3].medal).toBeUndefined();
    // 3rd is the third-place match winner; 4th is its loser.
    expect(standings[2].option.id).toBe(t(state).thirdPlaceMatch!.winner!.id);
    expect(standings[3].option.id).toBe(loserOf(t(state).thirdPlaceMatch!));
  });

  it('a mid-tournament correction cascades: clears downstream, re-seeds, resets third place (Req 20.1, 20.3, 20.4)', () => {
    // Build a completed size-8 vote-based tournament first.
    let state = generated(8, PLAYER_COUNT, 321);
    const decideM = (s: AppState, id: string, votesA: number) =>
      run(s, [
        { type: 'SET_PROVISIONAL', matchupId: id, choice: { votesA } },
        { type: 'CONFIRM', matchupId: id },
      ]);

    // Round 0: decide all four quarterfinals with clear (non-tie) margins.
    const r0 = t(state).rounds[0].matchups.map((m) => m.id);
    state = decideM(state, r0[0], 3);
    state = decideM(state, r0[1], 4);
    state = decideM(state, r0[2], 3);
    state = decideM(state, r0[3], 4);
    while (t(state).currentMatchupIndex < t(state).rounds[0].matchups.length - 1) {
      state = tournamentReducer(state, { type: 'NEXT' });
    }
    state = tournamentReducer(state, { type: 'NEXT' }); // -> semifinals
    expect(t(state).currentRoundIndex).toBe(1);

    // Round 1 (semifinals): decide both.
    const r1 = t(state).rounds[1].matchups.map((m) => m.id);
    state = decideM(state, r1[0], 3);
    state = decideM(state, r1[1], 3);
    while (t(state).currentMatchupIndex < t(state).rounds[1].matchups.length - 1) {
      state = tournamentReducer(state, { type: 'NEXT' });
    }
    state = tournamentReducer(state, { type: 'NEXT' }); // -> final
    expect(t(state).currentRoundIndex).toBe(2);

    // Decide the final and the third-place match to complete the tournament.
    const finalId = t(state).rounds[2].matchups[0].id;
    state = decideM(state, finalId, 3);
    const thirdId = t(state).thirdPlaceMatch!.id;
    state = decideM(state, thirdId, 3);
    expect(t(state).phase).toBe('RESULTS');
    expect(t(state).champion).toBeDefined();

    // Snapshot the pre-correction semifinal seeding for comparison.
    const semisBefore = t(state).rounds[1].matchups.map((m) => [
      m.optionA!.id,
      m.optionB!.id,
    ]);
    const thirdWinnerBefore = t(state).thirdPlaceMatch!.winner!.id;
    void thirdWinnerBefore;

    // --- CORRECT a round-0 quarterfinal: flip matchup 0 so option B wins with
    //     a very different margin. This must cascade (Property 8, Req 20). -----
    const q0 = t(state).rounds[0].matchups[0];
    const correction = tournamentReducer(state, {
      type: 'CORRECT',
      matchupId: q0.id,
      correction: { votesA: 0 }, // option B wins 4-0 (was an option-A win)
    });
    const c = t(correction);

    // Req 20.1: the edited matchup now has the new winner (option B).
    expect(c.rounds[0].matchups[0].winner!.id).toBe(q0.optionB!.id);
    expect(c.rounds[0].matchups[0].votesA).toBe(0);
    expect(c.rounds[0].matchups[0].votesB).toBe(4);

    // Req 20.1/20.2: the tournament is no longer complete; champion cleared and
    // it returned to PLAYING so the cleared downstream can be replayed.
    expect(correction.tournament!.phase).toBe('PLAYING');
    expect(c.champion).toBeUndefined();
    expect(c.standings).toBeUndefined();

    // Req 20.3: round 0 is still complete, so the semifinal round was
    // RE-SEEDED from the corrected winners/votes — its pairing changed and all
    // downstream outcomes were cleared.
    const semisAfter = c.rounds[1].matchups.map((m) => [m.optionA!.id, m.optionB!.id]);
    for (const m of c.rounds[1].matchups) {
      expect(m.optionA).toBeDefined();
      expect(m.optionB).toBeDefined();
      expect(m.winner).toBeUndefined(); // re-seeded slots start fresh
      expect(m.votesA).toBeUndefined();
    }
    // The corrected quarterfinal produced a new winner/votes, so the re-seeded
    // semifinal pairing differs from before.
    expect(semisAfter).not.toEqual(semisBefore);

    // Req 20.3 (deeper): the final round is fully cleared (no options, no winner).
    expect(c.rounds[2].matchups[0].optionA).toBeUndefined();
    expect(c.rounds[2].matchups[0].winner).toBeUndefined();

    // Req 20.4: the third-place match was reset — its previous outcome is
    // cleared and it awaits the new semifinal losers.
    expect(c.thirdPlaceMatch!.winner).toBeUndefined();

    // --- Replay to completion to confirm the corrected tournament is
    //     internally consistent and can finish again. Matchups are decided by
    //     id (the domain path), independent of the play cursor: the re-seeded
    //     semifinals are playable, then the final, then the third place. -----
    let replay = correction;
    // The re-seeded semifinal round (round 1) is playable straight away.
    const newSemiIds = t(replay).rounds[1].matchups.map((m) => m.id);
    replay = decideM(replay, newSemiIds[0], 3);
    replay = decideM(replay, newSemiIds[1], 3);
    // Deciding both semifinals advances winners into the final and populates the
    // third-place match with the new semifinal losers.
    const newFinalId = t(replay).rounds[2].matchups[0].id;
    expect(t(replay).rounds[2].matchups[0].optionA).toBeDefined();
    replay = decideM(replay, newFinalId, 3);
    // Not complete until third place is decided again (Req 21.2).
    expect(t(replay).phase).toBe('PLAYING');
    const newThirdId = t(replay).thirdPlaceMatch!.id;
    expect(t(replay).thirdPlaceMatch!.optionA).toBeDefined();
    replay = decideM(replay, newThirdId, 3);
    expect(t(replay).phase).toBe('RESULTS');
    expect(t(replay).standings!.map((s) => s.place)).toEqual([1, 2, 3, 4]);
  });
});
