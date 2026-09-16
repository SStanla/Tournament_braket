// Unit tests for vote-based matchup resolution (Task 9.1).
// Covers provisional vote splitting deriving votesB = playerCount - votesA
// (Req 16.1, 16.2), rejection of any split whose sum would differ from the
// player count (Req 16.3, 16.11), and commit-on-confirm of the leader in a
// non-tie with the sum invariant enforced (Req 16.6). Tie handling is only
// checked here to the extent that confirming a tie records no winner and does
// not crash (Req 16.7); the full tie/tie-break suite lives in Tasks 9.2/9.3.
// _Requirements: 16.1, 16.2, 16.3, 16.6, 16.11_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Tournament } from './model';
import {
  addOption,
  confirmMatchup,
  createTournament,
  generateBracket,
  setProvisionalVotes,
} from './tournament';

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

describe('setProvisionalVotes — derives votesB and records nothing (Req 16.1, 16.2, 14.1)', () => {
  it('sets provisional votesA and derives votesB = playerCount - votesA', () => {
    const t = generatedVote(4, 10);
    const m = t.rounds[0].matchups[0];

    const result = setProvisionalVotes(t, m.id, 7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const target = result.tournament.rounds[0].matchups[0];
      expect(target.votesA).toBe(7);
      expect(target.votesB).toBe(3);
      expect(target.votesA! + target.votesB!).toBe(10);
      // Nothing committed yet (Req 14.1).
      expect(target.winner).toBeUndefined();
    }
  });

  it('accepts the boundary splits 0 and playerCount', () => {
    const t = generatedVote(4, 5);
    const m = t.rounds[0].matchups[0];

    const low = setProvisionalVotes(t, m.id, 0);
    expect(low.ok).toBe(true);
    if (low.ok) {
      const target = low.tournament.rounds[0].matchups[0];
      expect(target.votesA).toBe(0);
      expect(target.votesB).toBe(5);
    }

    const high = setProvisionalVotes(t, m.id, 5);
    expect(high.ok).toBe(true);
    if (high.ok) {
      const target = high.tournament.rounds[0].matchups[0];
      expect(target.votesA).toBe(5);
      expect(target.votesB).toBe(0);
    }
  });

  it('does not mutate the input tournament', () => {
    const t = generatedVote(4, 10);
    const snapshot = JSON.parse(JSON.stringify(t));
    setProvisionalVotes(t, t.rounds[0].matchups[0].id, 4);
    expect(JSON.parse(JSON.stringify(t))).toEqual(snapshot);
  });
});

describe('setProvisionalVotes — rejects splits that would not sum to the player count (Req 16.3, 16.11)', () => {
  it('rejects votesA above the player count', () => {
    const t = generatedVote(4, 10);
    const result = setProvisionalVotes(t, t.rounds[0].matchups[0].id, 11);
    expect(result.ok).toBe(false);
  });

  it('rejects negative votesA', () => {
    const t = generatedVote(4, 10);
    const result = setProvisionalVotes(t, t.rounds[0].matchups[0].id, -1);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer votesA', () => {
    const t = generatedVote(4, 10);
    const result = setProvisionalVotes(t, t.rounds[0].matchups[0].id, 3.5);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown matchup id', () => {
    const t = generatedVote(4, 10);
    expect(setProvisionalVotes(t, 'no-such-matchup', 5).ok).toBe(false);
  });

  it('rejects a classic-mode tournament', () => {
    let t = createTournament({ category: 'X', size: 4, rngSeed: 1 });
    for (let i = 1; i <= 4; i += 1) {
      const r = addOption(t, `Opt ${i}`);
      if (r.ok) t = r.tournament;
    }
    t = generateBracket(t);
    expect(setProvisionalVotes(t, t.rounds[0].matchups[0].id, 2).ok).toBe(false);
  });
});

describe('confirmMatchup — vote-based non-tie commits the leader (Req 16.6, 18.2)', () => {
  it('records the option with more votes as the winner and advances it', () => {
    const t = generatedVote(4, 10);
    const m0 = t.rounds[0].matchups[0];
    const expectedWinner = m0.optionA!; // votesA (7) > votesB (3)

    const prov = setProvisionalVotes(t, m0.id, 7);
    expect(prov.ok).toBe(true);
    if (!prov.ok) return;
    const confirmed = confirmMatchup(prov.tournament, m0.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      const target = confirmed.tournament.rounds[0].matchups[0];
      expect(target.winner?.id).toBe(expectedWinner.id);
      expect(target.votesA! + target.votesB!).toBe(10);
      // Advanced into the fixed next-round slot 0, optionA (even slot).
      expect(confirmed.tournament.rounds[1].matchups[0].optionA?.id).toBe(
        expectedWinner.id,
      );
    }
  });

  it('commits option B when it leads', () => {
    const t = generatedVote(4, 10);
    const m0 = t.rounds[0].matchups[0];
    const expectedWinner = m0.optionB!; // votesA (2) < votesB (8)

    const prov = setProvisionalVotes(t, m0.id, 2);
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, m0.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.tournament.rounds[0].matchups[0].winner?.id).toBe(
        expectedWinner.id,
      );
    }
  });

  it('sets the champion when the final is decided (size 2)', () => {
    const t = generatedVote(2, 9);
    const finalMatchup = t.rounds[0].matchups[0];
    const expectedWinner = finalMatchup.optionA!; // 6 > 3

    const prov = setProvisionalVotes(t, finalMatchup.id, 6);
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, finalMatchup.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.tournament.champion?.id).toBe(expectedWinner.id);
    }
  });

  it('rejects confirming without a provisional vote split', () => {
    const t = generatedVote(4, 10);
    const result = confirmMatchup(t, t.rounds[0].matchups[0].id);
    expect(result.ok).toBe(false);
  });
});

describe('confirmMatchup — vote-based tie records no winner (Req 16.7 seam)', () => {
  it('commits no winner and does not advance on an even-count tie', () => {
    const t = generatedVote(4, 10);
    const m0 = t.rounds[0].matchups[0];

    const prov = setProvisionalVotes(t, m0.id, 5); // 5 vs 5 tie
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, m0.id);
    // Confirming a tie must not crash; it records nothing (left for tie-break).
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      const target = confirmed.tournament.rounds[0].matchups[0];
      expect(target.winner).toBeUndefined();
      expect(confirmed.tournament.rounds[1].matchups[0].optionA).toBeUndefined();
    }
  });
});
