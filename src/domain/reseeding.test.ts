// Tests for round advancement and vote-based re-seeding (Task 10).
//
// Coverage:
//   - reseedNextRound ranks winners by votes received (desc) and the caller
//     pairs strongest-vs-weakest (Req 17.3).
//   - Equal votes are ordered deterministically so exactly one complete
//     pairing results under a fixed seed (Req 17.4).
//   - advanceIfRoundComplete only advances when every matchup in the round is
//     decided — including being blocked by an unresolved tie (Req 18.4, 18.5).
//   - Vote-based mode re-seeds rounds after the first; the first round keeps
//     its generation-time random pairings (Req 17.1, 17.2, 17.5).
//   - Classic mode never re-seeds: fixed pairings are preserved (Req 17.6).
// _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 18.4, 18.5_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Option, Tournament } from './model';
import { createSeededRng } from './rng';
import {
  addOption,
  advanceIfRoundComplete,
  confirmMatchup,
  createTournament,
  generateBracket,
  reseedNextRound,
  setProvisionalVotes,
  setProvisionalWinner,
  type WinnerWithVotes,
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

/** Set a provisional split and confirm it, returning the confirmed tournament. */
function splitAndConfirm(t: Tournament, matchupId: string, votesA: number): Tournament {
  const prov = setProvisionalVotes(t, matchupId, votesA);
  if (!prov.ok) throw new Error(`setProvisionalVotes failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

/** Choose a provisional winner and confirm it (classic mode). */
function pickAndConfirm(t: Tournament, matchupId: string, optionId: string): Tournament {
  const prov = setProvisionalWinner(t, matchupId, optionId);
  if (!prov.ok) throw new Error(`setProvisionalWinner failed: ${prov.message}`);
  const confirmed = confirmMatchup(prov.tournament, matchupId);
  if (!confirmed.ok) throw new Error(`confirmMatchup failed: ${confirmed.message}`);
  return confirmed.tournament;
}

const opt = (id: string): Option => ({ id, name: id });

describe('reseedNextRound — strongest-vs-weakest ranking (Req 17.3)', () => {
  it('ranks winners by votes received, most-voted first', () => {
    const winners: WinnerWithVotes[] = [
      { option: opt('a'), votesReceived: 3 },
      { option: opt('b'), votesReceived: 9 },
      { option: opt('c'), votesReceived: 5 },
      { option: opt('d'), votesReceived: 7 },
    ];
    const order = reseedNextRound(winners, createSeededRng(1));
    expect(order.map((o) => o.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('pairs strongest-vs-weakest when the caller pairs index i with n-1-i', () => {
    const winners: WinnerWithVotes[] = [
      { option: opt('a'), votesReceived: 3 },
      { option: opt('b'), votesReceived: 9 },
      { option: opt('c'), votesReceived: 5 },
      { option: opt('d'), votesReceived: 7 },
    ];
    const order = reseedNextRound(winners, createSeededRng(1));
    // order = [b(9), d(7), c(5), a(3)] => pair 0-vs-3 and 1-vs-2.
    const pairs = [
      [order[0].id, order[3].id],
      [order[1].id, order[2].id],
    ];
    expect(pairs).toEqual([
      ['b', 'a'], // strongest vs weakest
      ['d', 'c'], // second vs second-to-last
    ]);
  });
});

describe('reseedNextRound — equal-vote determinism (Req 17.4)', () => {
  it('produces exactly one complete ordering that is stable across runs', () => {
    const winners: WinnerWithVotes[] = [
      { option: opt('a'), votesReceived: 5 },
      { option: opt('b'), votesReceived: 5 },
      { option: opt('c'), votesReceived: 5 },
      { option: opt('d'), votesReceived: 5 },
    ];
    const first = reseedNextRound(winners, createSeededRng(123)).map((o) => o.id);
    const second = reseedNextRound(winners, createSeededRng(123)).map((o) => o.id);
    expect(second).toEqual(first);

    // Exactly one complete pairing: all four options present exactly once.
    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(first).size).toBe(4);
  });

  it('orders ties by the seed, independent of input order', () => {
    const winners: WinnerWithVotes[] = [
      { option: opt('a'), votesReceived: 5 },
      { option: opt('b'), votesReceived: 5 },
    ];
    const reversed: WinnerWithVotes[] = [
      { option: opt('b'), votesReceived: 5 },
      { option: opt('a'), votesReceived: 5 },
    ];
    // Same seed draws the same key sequence; the tie order is determined by the
    // seed-derived keys assigned in input order, so both inputs resolve to a
    // single deterministic pairing per seed.
    const a = reseedNextRound(winners, createSeededRng(7)).map((o) => o.id);
    const b = reseedNextRound(winners, createSeededRng(7)).map((o) => o.id);
    expect(a).toEqual(b);
    // A different seed can order the tie differently but still completely.
    const c = reseedNextRound(reversed, createSeededRng(7)).map((o) => o.id);
    expect([...c].sort()).toEqual(['a', 'b']);
  });
});

describe('advanceIfRoundComplete — no advance until complete (Req 18.4, 18.5)', () => {
  it('does not advance while the round has undecided matchups', () => {
    const t = generated(4, undefined); // classic, 2 first-round matchups
    const first = t.rounds[0];
    // Decide only one of the two matchups.
    const partial = pickAndConfirm(t, first.matchups[0].id, first.matchups[0].optionA!.id);
    const result = advanceIfRoundComplete(partial);
    expect(result.currentRoundIndex).toBe(0);
    expect(result.currentMatchupIndex).toBe(0);
  });

  it('advances once every matchup in the round is decided (any order)', () => {
    const t = generated(4, undefined);
    const first = t.rounds[0];
    // Decide the second matchup first, then the first — order must not matter.
    let played = pickAndConfirm(t, first.matchups[1].id, first.matchups[1].optionB!.id);
    played = pickAndConfirm(played, first.matchups[0].id, first.matchups[0].optionA!.id);
    const result = advanceIfRoundComplete(played);
    expect(result.currentRoundIndex).toBe(1);
    expect(result.currentMatchupIndex).toBe(0);
  });

  it('does not advance while an unresolved tie blocks the round', () => {
    // Even player count so a tie is possible; both first-round matchups.
    const t = generated(4, 4);
    const first = t.rounds[0];
    // Decide matchup 0 as a clear win, matchup 1 as a tie (2/2) — unresolved.
    let played = splitAndConfirm(t, first.matchups[0].id, 3);
    played = splitAndConfirm(played, first.matchups[1].id, 2); // 2 vs 2 tie
    const result = advanceIfRoundComplete(played);
    // The tie leaves the round incomplete, so no advance occurs (Req 16.8, 18.5).
    expect(result.currentRoundIndex).toBe(0);
  });
});

describe('advanceIfRoundComplete — vote-based re-seeding (Req 17.1, 17.2, 17.3)', () => {
  it('keeps the first round pairings from generation and re-seeds only the next round', () => {
    const t = generated(4, 10);
    const first = t.rounds[0];
    const firstRoundPairsBefore = first.matchups.map((m) => [m.optionA!.id, m.optionB!.id]);

    // Decide both first-round matchups with distinct winner vote counts so the
    // re-seed order is unambiguous.
    // matchup 0: optionA wins with 8 votes.
    let played = splitAndConfirm(t, first.matchups[0].id, 8);
    // matchup 1: optionB wins with 9 votes (votesA = 1).
    played = splitAndConfirm(played, first.matchups[1].id, 1);

    const winnerM0 = played.rounds[0].matchups[0].winner!; // 8 votes
    const winnerM1 = played.rounds[0].matchups[1].winner!; // 9 votes

    const advanced = advanceIfRoundComplete(played);

    // First round pairings are untouched (Req 17.1).
    const firstRoundPairsAfter = advanced.rounds[0].matchups.map((m) => [
      m.optionA!.id,
      m.optionB!.id,
    ]);
    expect(firstRoundPairsAfter).toEqual(firstRoundPairsBefore);

    // Next round (the final here) is re-seeded strongest-vs-weakest: the
    // 9-vote winner is optionA, the 8-vote winner is optionB (Req 17.3).
    const finalMatch = advanced.rounds[1].matchups[0];
    expect(finalMatch.optionA!.id).toBe(winnerM1.id); // strongest (9)
    expect(finalMatch.optionB!.id).toBe(winnerM0.id); // weakest (8)
    // The re-seeded matchup starts fresh.
    expect(finalMatch.winner).toBeUndefined();
    expect(finalMatch.votesA).toBeUndefined();
  });

  it('re-seeds an 8-option round strongest-vs-weakest by votes received', () => {
    const t = generated(8, 20);
    const first = t.rounds[0];
    // Give the four matchups distinct winner-vote counts so optionA genuinely
    // wins each: 16,15,14,13 (playerCount 20, so votesB is 4,5,6,7).
    const winnerVotes = [16, 15, 14, 13];
    let played = t;
    const winners: { id: string; votes: number }[] = [];
    for (let i = 0; i < 4; i += 1) {
      const m = first.matchups[i];
      // Make optionA the winner with the chosen vote count.
      played = splitAndConfirm(played, m.id, winnerVotes[i]);
      winners.push({ id: m.optionA!.id, votes: winnerVotes[i] });
    }

    const advanced = advanceIfRoundComplete(played);
    expect(advanced.currentRoundIndex).toBe(1);

    // Ranked desc: 16,15,14,13 => pair (16 vs 13) and (15 vs 14).
    const semi = advanced.rounds[1].matchups;
    expect(semi[0].optionA!.id).toBe(winners[0].id); // 16
    expect(semi[0].optionB!.id).toBe(winners[3].id); // 13
    expect(semi[1].optionA!.id).toBe(winners[1].id); // 15
    expect(semi[1].optionB!.id).toBe(winners[2].id); // 14
  });

  it('equal winner votes still yield exactly one complete pairing of the next round', () => {
    const t = generated(8, 8);
    const first = t.rounds[0];
    // All four winners receive the same votes (5 each) so ordering falls to the
    // deterministic seed-derived key.
    let played = t;
    const winnerIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const m = first.matchups[i];
      played = splitAndConfirm(played, m.id, 5); // optionA wins 5-3
      winnerIds.push(m.optionA!.id);
    }

    const advanced = advanceIfRoundComplete(played);
    const semi = advanced.rounds[1].matchups;
    const seated = [
      semi[0].optionA!.id,
      semi[0].optionB!.id,
      semi[1].optionA!.id,
      semi[1].optionB!.id,
    ];
    // Every winner appears exactly once — one complete pairing (Req 17.4).
    expect([...seated].sort()).toEqual([...winnerIds].sort());
    expect(new Set(seated).size).toBe(4);

    // Deterministic under a fixed seed: re-running the exact same play produces
    // the identical seating.
    let replay = generated(8, 8);
    const rfirst = replay.rounds[0];
    for (let i = 0; i < 4; i += 1) {
      replay = splitAndConfirm(replay, rfirst.matchups[i].id, 5);
    }
    const readvanced = advanceIfRoundComplete(replay);
    const rsemi = readvanced.rounds[1].matchups;
    expect([
      rsemi[0].optionA!.id,
      rsemi[0].optionB!.id,
      rsemi[1].optionA!.id,
      rsemi[1].optionB!.id,
    ]).toEqual(seated);
  });
});

describe('advanceIfRoundComplete — classic mode never re-seeds (Req 17.6)', () => {
  it('preserves the fixed next-round pairings produced by confirm', () => {
    const t = generated(4, undefined); // classic
    const first = t.rounds[0];
    // Decide both matchups: matchup 0 -> optionA (feeds final optionA),
    // matchup 1 -> optionB (feeds final optionB) via fixed advancement.
    let played = pickAndConfirm(t, first.matchups[0].id, first.matchups[0].optionA!.id);
    const expectedFinalA = played.rounds[0].matchups[0].winner!;
    played = pickAndConfirm(played, first.matchups[1].id, first.matchups[1].optionB!.id);
    const expectedFinalB = played.rounds[0].matchups[1].winner!;

    const finalBefore = played.rounds[1].matchups[0];
    expect(finalBefore.optionA!.id).toBe(expectedFinalA.id);
    expect(finalBefore.optionB!.id).toBe(expectedFinalB.id);

    const advanced = advanceIfRoundComplete(played);
    // Classic advancement cursors move, but pairings are untouched (Req 17.6).
    expect(advanced.currentRoundIndex).toBe(1);
    const finalAfter = advanced.rounds[1].matchups[0];
    expect(finalAfter.optionA!.id).toBe(expectedFinalA.id);
    expect(finalAfter.optionB!.id).toBe(expectedFinalB.id);
  });
});
