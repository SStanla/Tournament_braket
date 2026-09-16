// Tests for tournament completion and final standings (Task 13).
//
// Coverage:
//   - isComplete for size 2: complete as soon as the final is decided
//     (Req 21.1).
//   - isComplete for size >= 4: complete only when BOTH the final and the
//     third-place match are decided — not complete with only the final decided
//     (Req 21.2).
//   - computeStandings medal assignment: size 2 yields gold/silver only
//     (Req 22.2, 22.4); size >= 4 yields gold/silver/bronze plus a 4th place
//     with no medal (Req 22.2, 22.3).
//   - computeStandings returns [] while the tournament is incomplete.
// _Requirements: 21.1, 21.2, 22.2, 22.3, 22.4_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Tournament } from './model';
import {
  addOption,
  advanceIfRoundComplete,
  computeStandings,
  confirmMatchup,
  createTournament,
  generateBracket,
  isComplete,
  setProvisionalWinner,
} from './tournament';

/** Fill and generate a classic bracket of the given size. */
function generated(size: BracketSize, rngSeed = 7): Tournament {
  let t = createTournament({ category: 'Best thing', size, rngSeed });
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

/** Play a size-2 bracket to a decided final (its only matchup). */
function playedSize2(): { tournament: Tournament; championId: string; runnerUpId: string } {
  const t0 = generated(2);
  const final = t0.rounds[0].matchups[0];
  const championId = final.optionA!.id;
  const runnerUpId = final.optionB!.id;
  const t = pickAndConfirm(t0, final.id, championId);
  return { tournament: t, championId, runnerUpId };
}

/**
 * Play a size-4 bracket. Decides both semifinals and the final. When
 * `playThirdPlace` is true, also decides the auto-populated third-place match.
 */
function playedSize4(playThirdPlace: boolean): Tournament {
  let t = generated(4);
  const semis = t.rounds[0];
  // Both semifinals: winner is optionA of each (losers become 3rd-place pair).
  t = pickAndConfirm(t, semis.matchups[0].id, semis.matchups[0].optionA!.id);
  t = pickAndConfirm(t, semis.matchups[1].id, semis.matchups[1].optionA!.id);
  t = advanceIfRoundComplete(t);
  // Final.
  const final = t.rounds[1].matchups[0];
  t = pickAndConfirm(t, final.id, final.optionA!.id);
  if (playThirdPlace) {
    const tp = t.thirdPlaceMatch!;
    t = pickAndConfirm(t, tp.id, tp.optionA!.id);
  }
  return t;
}

describe('isComplete (Req 21)', () => {
  it('size 2: complete as soon as the final is decided (Req 21.1)', () => {
    const before = generated(2);
    expect(isComplete(before)).toBe(false);

    const { tournament } = playedSize2();
    expect(isComplete(tournament)).toBe(true);
  });

  it('size >= 4: not complete with only the final decided (Req 21.2)', () => {
    const finalOnly = playedSize4(false);
    // Final is decided and champion is set, but the playoff is still open.
    expect(finalOnly.champion).toBeDefined();
    expect(isComplete(finalOnly)).toBe(false);
  });

  it('size >= 4: complete only when final AND third-place are decided (Req 21.2)', () => {
    const full = playedSize4(true);
    expect(isComplete(full)).toBe(true);
  });
});

describe('computeStandings (Req 22)', () => {
  it('returns [] while the tournament is incomplete', () => {
    expect(computeStandings(generated(2))).toEqual([]);
    expect(computeStandings(playedSize4(false))).toEqual([]);
  });

  it('size 2: gold/silver only, ordered 1st then 2nd (Req 22.2, 22.4)', () => {
    const { tournament, championId, runnerUpId } = playedSize2();
    const standings = computeStandings(tournament);

    expect(standings).toHaveLength(2);
    expect(standings.map((s) => s.place)).toEqual([1, 2]);

    expect(standings[0]).toMatchObject({ place: 1, medal: 'gold' });
    expect(standings[0].option.id).toBe(championId);

    expect(standings[1]).toMatchObject({ place: 2, medal: 'silver' });
    expect(standings[1].option.id).toBe(runnerUpId);
  });

  it('size >= 4: gold/silver/bronze plus 4th with no medal (Req 22.2, 22.3)', () => {
    const full = playedSize4(true);
    const standings = computeStandings(full);

    expect(standings).toHaveLength(4);
    expect(standings.map((s) => s.place)).toEqual([1, 2, 3, 4]);
    expect(standings.map((s) => s.medal)).toEqual([
      'gold',
      'silver',
      'bronze',
      undefined,
    ]);

    // 1st is the champion and every placed option is distinct.
    expect(standings[0].option.id).toBe(full.champion!.id);
    const ids = standings.map((s) => s.option.id);
    expect(new Set(ids).size).toBe(4);

    // 3rd/4th match the decided third-place playoff.
    const tp = full.thirdPlaceMatch!;
    expect(standings[2].option.id).toBe(tp.winner!.id);
    const loserId = tp.winner!.id === tp.optionA!.id ? tp.optionB!.id : tp.optionA!.id;
    expect(standings[3].option.id).toBe(loserId);
  });
});
