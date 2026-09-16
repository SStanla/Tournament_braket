// Unit tests for third-place match handling (Task 11).
// Covers:
//   - population timing: the third-place match stays empty until BOTH
//     semifinals are decided, then auto-populates with the two semifinal losers
//     (Req 19.1), identically in classic and vote-based mode;
//   - 3rd/4th resolution: the decided playoff's winner is third and the other
//     is fourth (Req 19.3);
//   - vote-based decides the playoff exactly like any other matchup (Req 19.4);
//   - size 2: no third-place match and no third/fourth place (Req 19.5).
// _Requirements: 19.1, 19.3, 19.4, 19.5_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Matchup, Option, Tournament } from './model';
import {
  addOption,
  confirmMatchup,
  createTournament,
  generateBracket,
  populateThirdPlace,
  setProvisionalVotes,
  setProvisionalWinner,
  thirdPlaceResult,
} from './tournament';

/** Fill and generate a classic bracket for the given size using a fixed seed. */
function generatedClassic(size: BracketSize, rngSeed = 42): Tournament {
  let t = createTournament({ category: 'Best thing', size, rngSeed });
  for (let i = 1; i <= size; i += 1) {
    const result = addOption(t, `Opt ${i}`);
    if (!result.ok) throw new Error(`unexpected rejection: ${result.message}`);
    t = result.tournament;
  }
  return generateBracket(t);
}

/** Fill and generate a vote-based bracket of the given size and player count. */
function generatedVote(
  size: BracketSize,
  playerCount: number,
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

/** The loser option of a decided matchup (the one that is not the winner). */
function loserOf(m: Matchup): Option {
  return m.winner!.id === m.optionA!.id ? m.optionB! : m.optionA!;
}

/** Classic: provisionally pick `optionA` and confirm, returning the new state. */
function pickAndConfirm(t: Tournament, matchupId: string, chosen: Option): Tournament {
  const prov = setProvisionalWinner(t, matchupId, chosen.id);
  if (!prov.ok) throw new Error(`setProvisionalWinner failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

/** Vote-based: set a split then confirm, returning the new state. */
function splitAndConfirm(t: Tournament, matchupId: string, votesA: number): Tournament {
  const prov = setProvisionalVotes(t, matchupId, votesA);
  if (!prov.ok) throw new Error(`setProvisionalVotes failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

describe('populateThirdPlace — population timing (Req 19.1)', () => {
  it('leaves the playoff empty before any semifinal is decided', () => {
    const t = generatedClassic(4);
    const after = populateThirdPlace(t);
    expect(after.thirdPlaceMatch).toBeDefined();
    expect(after.thirdPlaceMatch!.optionA).toBeUndefined();
    expect(after.thirdPlaceMatch!.optionB).toBeUndefined();
  });

  it('leaves the playoff empty when only ONE semifinal is decided', () => {
    // Size 4: rounds[0] is the semifinal (two matchups); decide only the first.
    let t = generatedClassic(4);
    const semiA = t.rounds[0].matchups[0];
    t = pickAndConfirm(t, semiA.id, semiA.optionA!);

    expect(t.thirdPlaceMatch!.optionA).toBeUndefined();
    expect(t.thirdPlaceMatch!.optionB).toBeUndefined();
  });

  it('auto-populates with both semifinal losers once BOTH semifinals are decided (classic)', () => {
    let t = generatedClassic(4);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    const expectedLoserA = semiA.optionB!; // we pick optionA as winner
    const expectedLoserB = semiB.optionB!;

    t = pickAndConfirm(t, semiA.id, semiA.optionA!);
    t = pickAndConfirm(t, semiB.id, semiB.optionA!);

    const tp = t.thirdPlaceMatch!;
    const ids = [tp.optionA!.id, tp.optionB!.id].sort();
    expect(ids).toEqual([expectedLoserA.id, expectedLoserB.id].sort());
    // Playable but not yet decided.
    expect(tp.winner).toBeUndefined();
  });

  it('auto-populates identically in vote-based mode (Req 19.1, 19.4)', () => {
    let t = generatedVote(4, 10);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    const expectedLoserA = semiA.optionB!; // votesA=7 => optionA wins, optionB loses
    const expectedLoserB = semiB.optionB!;

    t = splitAndConfirm(t, semiA.id, 7);
    t = splitAndConfirm(t, semiB.id, 7);

    const tp = t.thirdPlaceMatch!;
    const ids = [tp.optionA!.id, tp.optionB!.id].sort();
    expect(ids).toEqual([expectedLoserA.id, expectedLoserB.id].sort());
    expect(tp.winner).toBeUndefined();
  });

  it('is idempotent and does not mutate the input', () => {
    let t = generatedClassic(4);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    t = pickAndConfirm(t, semiA.id, semiA.optionA!);
    t = pickAndConfirm(t, semiB.id, semiB.optionA!);

    const once = populateThirdPlace(t);
    const twice = populateThirdPlace(once);
    expect(twice.thirdPlaceMatch!.optionA!.id).toBe(once.thirdPlaceMatch!.optionA!.id);
    expect(twice.thirdPlaceMatch!.optionB!.id).toBe(once.thirdPlaceMatch!.optionB!.id);
    // Original snapshot untouched by a fresh call.
    const beforeA = t.thirdPlaceMatch!.optionA!.id;
    populateThirdPlace(t);
    expect(t.thirdPlaceMatch!.optionA!.id).toBe(beforeA);
  });

  it('does not clobber an already-decided playoff winner', () => {
    let t = generatedClassic(4);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    t = pickAndConfirm(t, semiA.id, semiA.optionA!);
    t = pickAndConfirm(t, semiB.id, semiB.optionA!);

    // Decide the third-place match.
    const tp = t.thirdPlaceMatch!;
    t = pickAndConfirm(t, tp.id, tp.optionA!);
    const decidedWinnerId = t.thirdPlaceMatch!.winner!.id;

    const after = populateThirdPlace(t);
    expect(after.thirdPlaceMatch!.winner!.id).toBe(decidedWinnerId);
  });
});

describe('thirdPlaceResult — winner => 3rd, loser => 4th (Req 19.3)', () => {
  it('returns nothing while the playoff is undecided', () => {
    let t = generatedClassic(4);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    t = pickAndConfirm(t, semiA.id, semiA.optionA!);
    t = pickAndConfirm(t, semiB.id, semiB.optionA!);

    expect(thirdPlaceResult(t)).toEqual({});
  });

  it('assigns the playoff winner to third and the other to fourth (classic)', () => {
    let t = generatedClassic(4);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    t = pickAndConfirm(t, semiA.id, semiA.optionA!);
    t = pickAndConfirm(t, semiB.id, semiB.optionA!);

    const tp = t.thirdPlaceMatch!;
    const expectedThird = tp.optionA!;
    const expectedFourth = tp.optionB!;
    t = pickAndConfirm(t, tp.id, expectedThird);

    const { third, fourth } = thirdPlaceResult(t);
    expect(third!.id).toBe(expectedThird.id);
    expect(fourth!.id).toBe(expectedFourth.id);
  });

  it('decides the playoff by votes and assigns 3rd/4th (vote-based, Req 19.4)', () => {
    let t = generatedVote(4, 10);
    const semiA = t.rounds[0].matchups[0];
    const semiB = t.rounds[0].matchups[1];
    t = splitAndConfirm(t, semiA.id, 7);
    t = splitAndConfirm(t, semiB.id, 7);

    const tp = t.thirdPlaceMatch!;
    const expectedThird = tp.optionA!; // votesA=8 => optionA wins
    const expectedFourth = tp.optionB!;
    t = splitAndConfirm(t, tp.id, 8);

    const { third, fourth } = thirdPlaceResult(t);
    expect(third!.id).toBe(expectedThird.id);
    expect(fourth!.id).toBe(expectedFourth.id);
    expect(loserOf(t.thirdPlaceMatch!).id).toBe(expectedFourth.id);
  });
});

describe('size 2 — no third or fourth place (Req 19.5)', () => {
  it('generates no third-place match at size 2', () => {
    const t = generatedClassic(2);
    expect(t.thirdPlaceMatch).toBeUndefined();
  });

  it('populateThirdPlace is a no-op at size 2', () => {
    const t = generatedClassic(2);
    const after = populateThirdPlace(t);
    expect(after.thirdPlaceMatch).toBeUndefined();
    expect(after).toEqual(t);
  });

  it('thirdPlaceResult is empty at size 2', () => {
    const t = generatedClassic(2);
    expect(thirdPlaceResult(t)).toEqual({});
  });
});
