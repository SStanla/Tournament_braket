// Unit tests for classic matchup resolution.
// Covers provisional selection recording nothing before confirm (Req 14.1),
// commit-on-confirm setting the winner (Req 14.2, 15.3), selectable options and
// changeable provisional highlight (Req 15.1, 15.2), decidability requiring
// both options (Req 18.1), winner advancement into the fixed next-round slot
// with no re-seeding (Req 15.5, 18.2), and champion assignment on the final.
// _Requirements: 14.1, 14.2, 15.1, 15.2, 15.3, 15.4, 15.5, 18.1, 18.2_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Matchup, Tournament } from './model';
import {
  addOption,
  confirmMatchup,
  createTournament,
  generateBracket,
  setProvisionalWinner,
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

/** Find a matchup by id across all rounds (and third-place). */
function matchupById(t: Tournament, id: string): Matchup | undefined {
  for (const round of t.rounds) {
    const found = round.matchups.find((m) => m.id === id);
    if (found) return found;
  }
  return t.thirdPlaceMatch?.id === id ? t.thirdPlaceMatch : undefined;
}

describe('setProvisionalWinner — provisional highlight records nothing (Req 14.1, 15.2)', () => {
  it('marks the provisional winner without setting the recorded winner', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];
    const chosen = m.optionA!.id;

    const result = setProvisionalWinner(t, m.id, chosen);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const after = matchupById(result.tournament, m.id)!;
      expect(after.provisionalWinnerId).toBe(chosen);
      expect(after.winner).toBeUndefined();
    }
  });

  it('records no winner anywhere in the bracket before confirmation (Req 14.1)', () => {
    const t = generatedClassic(8);
    const m = t.rounds[0].matchups[0];
    const result = setProvisionalWinner(t, m.id, m.optionB!.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const anyWinner = result.tournament.rounds.some((r) =>
        r.matchups.some((mm) => mm.winner !== undefined),
      );
      expect(anyWinner).toBe(false);
      expect(result.tournament.champion).toBeUndefined();
    }
  });

  it('lets the provisional choice be changed freely before confirming (Req 15.2)', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];

    const first = setProvisionalWinner(t, m.id, m.optionA!.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = setProvisionalWinner(first.tournament, m.id, m.optionB!.id);
    expect(second.ok).toBe(true);
    if (second.ok) {
      const after = matchupById(second.tournament, m.id)!;
      expect(after.provisionalWinnerId).toBe(m.optionB!.id);
      expect(after.winner).toBeUndefined();
    }
  });

  it('does not mutate the input tournament', () => {
    const t = generatedClassic(4);
    const snapshot = JSON.parse(JSON.stringify(t));
    setProvisionalWinner(t, t.rounds[0].matchups[0].id, t.rounds[0].matchups[0].optionA!.id);
    expect(JSON.parse(JSON.stringify(t))).toEqual(snapshot);
  });
});

describe('setProvisionalWinner — rejection rules (Req 18.1)', () => {
  it('rejects an unknown matchup id', () => {
    const t = generatedClassic(4);
    const result = setProvisionalWinner(t, 'no-such-matchup', 'opt-1');
    expect(result.ok).toBe(false);
  });

  it('rejects an option that is not part of the matchup', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];
    const result = setProvisionalWinner(t, m.id, 'opt-999');
    expect(result.ok).toBe(false);
  });

  it('rejects a matchup that is not yet decidable (missing an option) (Req 18.1)', () => {
    const t = generatedClassic(4);
    const secondRoundMatchup = t.rounds[1].matchups[0];
    expect(secondRoundMatchup.optionA).toBeUndefined();
    const result = setProvisionalWinner(t, secondRoundMatchup.id, 'opt-1');
    expect(result.ok).toBe(false);
  });
});

describe('confirmMatchup — commit on confirm (Req 14.2, 15.3)', () => {
  it('records the provisional option as the winner and clears the provisional flag', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];
    const chosen = m.optionA!;

    const prov = setProvisionalWinner(t, m.id, chosen.id);
    expect(prov.ok).toBe(true);
    if (!prov.ok) return;
    const confirmed = confirmMatchup(prov.tournament, m.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      const after = matchupById(confirmed.tournament, m.id)!;
      expect(after.winner).toBeDefined();
      expect(after.winner!.id).toBe(chosen.id);
      expect(after.provisionalWinnerId).toBeUndefined();
    }
  });

  it('rejects confirming without a provisional selection (nothing chosen) (Req 14.1)', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];
    const result = confirmMatchup(t, m.id);
    expect(result.ok).toBe(false);
  });

  it('rejects confirming an unknown matchup', () => {
    const t = generatedClassic(4);
    expect(confirmMatchup(t, 'no-such-matchup').ok).toBe(false);
  });

  it('does not mutate the input tournament', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];
    const prov = setProvisionalWinner(t, m.id, m.optionA!.id);
    if (!prov.ok) throw new Error('setup failed');
    const snapshot = JSON.parse(JSON.stringify(prov.tournament));
    confirmMatchup(prov.tournament, m.id);
    expect(JSON.parse(JSON.stringify(prov.tournament))).toEqual(snapshot);
  });
});

describe('confirmMatchup — winner advancement into fixed slot with no re-seeding (Req 15.5, 18.2)', () => {
  it('advances slot 0 winner into next round slot 0, optionA (even slot)', () => {
    const t = generatedClassic(4);
    const m0 = t.rounds[0].matchups[0];
    const winner = m0.optionA!;
    const prov = setProvisionalWinner(t, m0.id, winner.id);
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, m0.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      const nextRoundSlot0 = confirmed.tournament.rounds[1].matchups[0];
      expect(nextRoundSlot0.optionA).toBeDefined();
      expect(nextRoundSlot0.optionA!.id).toBe(winner.id);
      expect(nextRoundSlot0.optionB).toBeUndefined();
    }
  });

  it('advances slot 1 winner into next round slot 0, optionB (odd slot)', () => {
    const t = generatedClassic(4);
    const m1 = t.rounds[0].matchups[1];
    const winner = m1.optionB!;
    const prov = setProvisionalWinner(t, m1.id, winner.id);
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, m1.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      const nextRoundSlot0 = confirmed.tournament.rounds[1].matchups[0];
      expect(nextRoundSlot0.optionB).toBeDefined();
      expect(nextRoundSlot0.optionB!.id).toBe(winner.id);
    }
  });

  it('feeds slot s into next round slot floor(s/2) across an 8-bracket', () => {
    const t = generatedClassic(8);
    // Decide all four first-round matchups picking optionA each time.
    let current = t;
    const expectedFeeds: { winnerId: string; targetSlot: number; asA: boolean }[] = [];
    for (let s = 0; s < 4; s += 1) {
      const m = current.rounds[0].matchups[s];
      const winner = m.optionA!;
      expectedFeeds.push({ winnerId: winner.id, targetSlot: Math.floor(s / 2), asA: s % 2 === 0 });
      const prov = setProvisionalWinner(current, m.id, winner.id);
      if (!prov.ok) throw new Error('setup failed');
      const confirmed = confirmMatchup(prov.tournament, m.id);
      if (!confirmed.ok) throw new Error('confirm failed');
      current = confirmed.tournament;
    }
    for (const feed of expectedFeeds) {
      const target = current.rounds[1].matchups[feed.targetSlot];
      const slotOption = feed.asA ? target.optionA : target.optionB;
      expect(slotOption).toBeDefined();
      expect(slotOption!.id).toBe(feed.winnerId);
    }
  });

  it('keeps pairings fixed: the same generated pairing is preserved through advancement', () => {
    // The set of options that reach the second round must be exactly the chosen
    // first-round winners in their predetermined slots — no re-seeding.
    const t = generatedClassic(8);
    let current = t;
    const winners: string[] = [];
    for (let s = 0; s < 4; s += 1) {
      const m = current.rounds[0].matchups[s];
      // Alternate picks to avoid a trivial all-optionA case.
      const winner = s % 2 === 0 ? m.optionA! : m.optionB!;
      winners.push(winner.id);
      const prov = setProvisionalWinner(current, m.id, winner.id);
      if (!prov.ok) throw new Error('setup failed');
      const confirmed = confirmMatchup(prov.tournament, m.id);
      if (!confirmed.ok) throw new Error('confirm failed');
      current = confirmed.tournament;
    }
    // Round 1 slot 0 gets winners of round 0 slots 0 and 1; slot 1 gets 2 and 3.
    expect(current.rounds[1].matchups[0].optionA!.id).toBe(winners[0]);
    expect(current.rounds[1].matchups[0].optionB!.id).toBe(winners[1]);
    expect(current.rounds[1].matchups[1].optionA!.id).toBe(winners[2]);
    expect(current.rounds[1].matchups[1].optionB!.id).toBe(winners[3]);
  });
});

describe('confirmMatchup — champion on the final (Req 18.2)', () => {
  it('sets the champion when the final round matchup is decided (size 2)', () => {
    const t = generatedClassic(2);
    const finalMatchup = t.rounds[0].matchups[0];
    const winner = finalMatchup.optionA!;
    const prov = setProvisionalWinner(t, finalMatchup.id, winner.id);
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, finalMatchup.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.tournament.champion).toBeDefined();
      expect(confirmed.tournament.champion!.id).toBe(winner.id);
    }
  });

  it('does not set a champion when a non-final matchup is decided', () => {
    const t = generatedClassic(4);
    const m = t.rounds[0].matchups[0];
    const prov = setProvisionalWinner(t, m.id, m.optionA!.id);
    if (!prov.ok) throw new Error('setup failed');
    const confirmed = confirmMatchup(prov.tournament, m.id);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.tournament.champion).toBeUndefined();
    }
  });
});
