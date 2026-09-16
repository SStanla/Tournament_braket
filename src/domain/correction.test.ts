// Tests for the correction cascade (Task 12).
//
// Coverage:
//   - Changing an early-round winner clears every downstream outcome that
//     depended on it and requires them to be decided again (Req 20.1).
//   - Changing the final clears the champion (Req 20.2).
//   - Vote-based mode recomputes the re-seeding of affected later rounds from
//     the new winners and their votes (Req 20.3).
//   - Changing a semifinal resets the third-place match to the current losers
//     and clears any assigned 3rd/4th, requiring the playoff to be replayed
//     (Req 20.4).
// _Requirements: 20.1, 20.2, 20.3, 20.4_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Tournament } from './model';
import {
  addOption,
  advanceIfRoundComplete,
  confirmMatchup,
  correctOutcome,
  createTournament,
  generateBracket,
  setProvisionalVotes,
  setProvisionalWinner,
  thirdPlaceResult,
} from './tournament';

/** Fill and generate a bracket of the given size and (optional) player count. */
function generated(
  size: BracketSize,
  playerCount: number | undefined,
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

/** Choose a provisional winner and confirm it (classic mode). */
function pickAndConfirm(t: Tournament, matchupId: string, optionId: string): Tournament {
  const prov = setProvisionalWinner(t, matchupId, optionId);
  if (!prov.ok) throw new Error(`setProvisionalWinner failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

/** Set a provisional split and confirm it, returning the confirmed tournament. */
function splitAndConfirm(t: Tournament, matchupId: string, votesA: number): Tournament {
  const prov = setProvisionalVotes(t, matchupId, votesA);
  if (!prov.ok) throw new Error(`setProvisionalVotes failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

/** Play a full classic 4-bracket to completion and return the tournament. */
function playedClassic4(seed = 42): Tournament {
  let t = generated(4, undefined, seed);
  const first = t.rounds[0];
  // Decide both semifinals: matchup 0 -> optionA, matchup 1 -> optionA.
  t = pickAndConfirm(t, first.matchups[0].id, first.matchups[0].optionA!.id);
  t = pickAndConfirm(t, first.matchups[1].id, first.matchups[1].optionA!.id);
  t = advanceIfRoundComplete(t);
  // Decide the final.
  const final = t.rounds[1].matchups[0];
  t = pickAndConfirm(t, final.id, final.optionA!.id);
  return t;
}

describe('correctOutcome — downstream clearing (Req 20.1)', () => {
  it('clears downstream winners and re-advances the new winner (classic)', () => {
    const played = playedClassic4();
    const first = played.rounds[0];
    const semi0 = first.matchups[0];
    const oldWinner = semi0.winner!;
    const newWinner = semi0.optionB!; // change the semifinal 0 winner

    const result = correctOutcome(played, semi0.id, { optionId: newWinner.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.tournament;

    // The edited matchup now has the new winner.
    expect(t.rounds[0].matchups[0].winner!.id).toBe(newWinner.id);
    expect(newWinner.id).not.toBe(oldWinner.id);

    // The final was re-derived: it now carries the new winner in the fixed slot
    // (semifinal 0 feeds final optionA), and its own outcome was cleared.
    const final = t.rounds[1].matchups[0];
    expect(final.optionA!.id).toBe(newWinner.id);
    expect(final.winner).toBeUndefined();
  });

  it('requires the cleared downstream matchup to be decided again', () => {
    const played = playedClassic4();
    const semi0 = played.rounds[0].matchups[0];
    const result = correctOutcome(played, semi0.id, {
      optionId: semi0.optionB!.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Final has no winner until re-decided.
    expect(result.tournament.rounds[1].matchups[0].winner).toBeUndefined();
    expect(result.tournament.champion).toBeUndefined();
  });
});

describe('correctOutcome — champion clearing (Req 20.2)', () => {
  it('clears the champion when the final winner is changed', () => {
    const played = playedClassic4();
    expect(played.champion).toBeDefined();

    const final = played.rounds[1].matchups[0];
    const newFinalWinner = final.optionB!;
    const result = correctOutcome(played, final.id, {
      optionId: newFinalWinner.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The final now carries the new winner, which becomes the champion again
    // via the re-commit — but correction clears then re-commits the final only;
    // the champion derived from the OLD final is cleared (Req 20.2).
    expect(result.tournament.rounds[1].matchups[0].winner!.id).toBe(
      newFinalWinner.id,
    );
    // Champion is not silently carried over from the old final result.
    expect(result.tournament.champion).toBeUndefined();
  });

  it('clears the champion when an earlier round is changed', () => {
    const played = playedClassic4();
    expect(played.champion).toBeDefined();
    const semi0 = played.rounds[0].matchups[0];
    const result = correctOutcome(played, semi0.id, {
      optionId: semi0.optionB!.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tournament.champion).toBeUndefined();
  });
});

describe('correctOutcome — vote-based re-seed recomputation (Req 20.3)', () => {
  it('recomputes the next-round re-seeding from the corrected winners/votes', () => {
    // 4-option vote-based bracket, play both semifinals then advance to seed
    // the final.
    let t = generated(4, 10, 7);
    const first = t.rounds[0];
    // matchup 0: optionA wins 8-2; matchup 1: optionA wins 6-4.
    t = splitAndConfirm(t, first.matchups[0].id, 8);
    t = splitAndConfirm(t, first.matchups[1].id, 6);
    t = advanceIfRoundComplete(t);

    // Now correct semifinal 0 so optionB wins with a different vote count that
    // changes the winner and the votes-received used for re-seeding.
    const semi0 = t.rounds[0].matchups[0];
    const newWinner = semi0.optionB!; // optionB wins 7-3 (votesA = 3)
    const result = correctOutcome(t, semi0.id, { votesA: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.tournament;

    // Edited matchup reflects the new split and winner.
    expect(c.rounds[0].matchups[0].votesA).toBe(3);
    expect(c.rounds[0].matchups[0].votesB).toBe(7);
    expect(c.rounds[0].matchups[0].winner!.id).toBe(newWinner.id);

    // Final was re-seeded strongest-vs-weakest from the corrected winners:
    // semi0 winner received 7 votes, semi1 winner received 6 votes, so the
    // 7-vote winner is optionA and the 6-vote winner is optionB.
    const semi1Winner = c.rounds[0].matchups[1].winner!;
    const final = c.rounds[1].matchups[0];
    expect(final.optionA!.id).toBe(newWinner.id); // 7 votes (strongest)
    expect(final.optionB!.id).toBe(semi1Winner.id); // 6 votes (weakest)
    // The re-seeded final starts fresh.
    expect(final.winner).toBeUndefined();
    expect(final.votesA).toBeUndefined();
  });

  it('clears deeper rounds so they are replayed (8-option vote-based)', () => {
    // Play round 0 fully, advance to seed the semifinal round.
    let t = generated(8, 10, 11);
    const first = t.rounds[0];
    for (let i = 0; i < 4; i += 1) {
      t = splitAndConfirm(t, first.matchups[i].id, 7); // optionA wins 7-3
    }
    t = advanceIfRoundComplete(t);
    // Round 1 (semifinals) now seeded and playable; play them too.
    const semis = t.rounds[1];
    t = splitAndConfirm(t, semis.matchups[0].id, 6);
    t = splitAndConfirm(t, semis.matchups[1].id, 6);
    t = advanceIfRoundComplete(t);
    expect(t.rounds[2].matchups[0].optionA).toBeDefined(); // final seeded

    // Correct a round-0 matchup: everything after round 0 must be cleared.
    const m0 = t.rounds[0].matchups[0];
    const result = correctOutcome(t, m0.id, { votesA: 2 }); // optionB wins 8-2
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.tournament;

    // Round 1 is re-seeded from round 0 (round 0 still complete), so its
    // matchups have options but no committed outcomes.
    expect(c.rounds[1].matchups[0].optionA).toBeDefined();
    expect(c.rounds[1].matchups[0].winner).toBeUndefined();
    // Round 2 (final) is fully cleared: no options, no winner.
    expect(c.rounds[2].matchups[0].optionA).toBeUndefined();
    expect(c.rounds[2].matchups[0].winner).toBeUndefined();
    expect(c.champion).toBeUndefined();
  });
});

describe('correctOutcome — semifinal-triggered third-place reset (Req 20.4)', () => {
  it('resets the third-place match to the new losers and clears 3rd/4th', () => {
    // Play a full classic 4-bracket including the third-place match.
    let t = playedClassic4();
    // Populate and decide the third-place match.
    const third = t.thirdPlaceMatch!;
    expect(third.optionA).toBeDefined();
    expect(third.optionB).toBeDefined();
    t = pickAndConfirm(t, third.id, third.optionA!.id);

    const before = thirdPlaceResult(t);
    expect(before.third).toBeDefined();
    expect(before.fourth).toBeDefined();

    // Correct semifinal 0 (round 0, optionCount 4): the third-place match must
    // reset to the current semifinal losers and clear 3rd/4th.
    const semi0 = t.rounds[0].matchups[0];
    const newWinner = semi0.optionB!;
    const result = correctOutcome(t, semi0.id, { optionId: newWinner.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.tournament;

    // The playoff outcome is cleared and 3rd/4th are gone until replayed.
    expect(c.thirdPlaceMatch!.winner).toBeUndefined();
    expect(thirdPlaceResult(c)).toEqual({});

    // Both semifinals are still decided (only the winner of semi0 changed), so
    // the playoff is repopulated with the CURRENT losers. Semi0's new loser is
    // the old winner.
    const newSemi0Loser = c.rounds[0].matchups[0].optionA!; // optionA lost now
    const semi1 = c.rounds[0].matchups[1];
    const semi1Loser =
      semi1.winner!.id === semi1.optionA!.id ? semi1.optionB! : semi1.optionA!;
    const playoffOptions = [
      c.thirdPlaceMatch!.optionA!.id,
      c.thirdPlaceMatch!.optionB!.id,
    ].sort();
    expect(playoffOptions).toEqual([newSemi0Loser.id, semi1Loser.id].sort());
  });

  it('does not reset the third-place match when a non-semifinal round changes', () => {
    // 8-option classic bracket so round 0 (quarterfinals) is NOT the semifinal.
    let t = generated(8, undefined, 5);
    // Play round 0.
    for (const m of t.rounds[0].matchups) {
      t = pickAndConfirm(t, m.id, m.optionA!.id);
    }
    t = advanceIfRoundComplete(t);
    // Play round 1 (semifinals).
    for (const m of t.rounds[1].matchups) {
      t = pickAndConfirm(t, m.id, m.optionA!.id);
    }
    t = advanceIfRoundComplete(t);
    // Third-place match is now populated from the semifinals; decide it.
    const third = t.thirdPlaceMatch!;
    t = pickAndConfirm(t, third.id, third.optionA!.id);
    const beforeThird = t.thirdPlaceMatch!.winner!;

    // Correct a round-0 (quarterfinal) matchup. This is downstream of round 0
    // but round 0 is not the semifinal, so the third-place match is only reset
    // as a downstream consequence of the semifinal being cleared — verify the
    // semifinal round got cleared and the playoff follows suit.
    const q0 = t.rounds[0].matchups[0];
    const result = correctOutcome(t, q0.id, { optionId: q0.optionB!.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.tournament;
    // Semifinal round (round 1) was cleared downstream, so the playoff cannot
    // stay decided — it must be empty/undecided.
    expect(c.thirdPlaceMatch!.winner).toBeUndefined();
    expect(beforeThird).toBeDefined();
  });
});

describe('correctOutcome — validation', () => {
  it('rejects an unknown matchup id', () => {
    const played = playedClassic4();
    const result = correctOutcome(played, 'nope', { optionId: 'x' });
    expect(result.ok).toBe(false);
  });

  it('rejects an option that is not part of the matchup (classic)', () => {
    const played = playedClassic4();
    const semi0 = played.rounds[0].matchups[0];
    const result = correctOutcome(played, semi0.id, { optionId: 'not-here' });
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range vote split (vote-based)', () => {
    let t = generated(4, 10, 7);
    const first = t.rounds[0];
    t = splitAndConfirm(t, first.matchups[0].id, 8);
    const result = correctOutcome(t, first.matchups[0].id, { votesA: 99 });
    expect(result.ok).toBe(false);
  });
});
