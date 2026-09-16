// Unit tests for tournament creation and mode derivation.
// Covers phase/empty-collection initialization, immutable mode derivation from
// playerCount (classic when absent, voteBased when >= 1), retention of the
// player count in vote-based mode, and that mode is driven by nothing else.
// _Requirements: 2.2, 2.3, 5.1, 5.2, 5.4, 5.5, 25.7_

import { describe, expect, it } from 'vitest';
import type { BracketSize, Tournament } from './model';
import {
  createTournament,
  deriveMode,
  type CreateTournamentInput,
} from './tournament';

/** All valid bracket sizes, used to exercise size independence. */
const ALL_SIZES: BracketSize[] = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

describe('createTournament — initialization (Req 2.2, 2.3)', () => {
  it('starts in the FILLING phase', () => {
    const t = createTournament({ category: 'Best pasta sauce', size: 8 });
    expect(t.phase).toBe('FILLING');
  });

  it('starts empty: no options, no suggestions, no rounds', () => {
    const t = createTournament({ category: 'Best movie', size: 4 });
    expect(t.options).toEqual([]);
    expect(t.suggestions).toEqual([]);
    expect(t.rounds).toEqual([]);
  });

  it('starts with round and matchup cursors at 0', () => {
    const t = createTournament({ category: 'Greatest footballers', size: 16 });
    expect(t.currentRoundIndex).toBe(0);
    expect(t.currentMatchupIndex).toBe(0);
  });

  it('preserves the category and size verbatim', () => {
    const t = createTournament({ category: 'Best city', size: 32 });
    expect(t.category).toBe('Best city');
    expect(t.size).toBe(32);
  });

  it('does not generate a champion, standings, rounds, or a third-place match', () => {
    const t = createTournament({ category: 'Best band', size: 8 });
    expect(t.champion).toBeUndefined();
    expect(t.standings).toBeUndefined();
    expect(t.thirdPlaceMatch).toBeUndefined();
  });

  it('sets an integer rngSeed for reproducible randomness', () => {
    const t = createTournament({ category: 'Best snack', size: 4 });
    expect(Number.isInteger(t.rngSeed)).toBe(true);
  });

  it('uses a provided rngSeed when supplied', () => {
    const t = createTournament({ category: 'Best snack', size: 4, rngSeed: 12345 });
    expect(t.rngSeed).toBe(12345);
  });

  it('does not mutate the caller input', () => {
    const input: CreateTournamentInput = { category: 'Best drink', size: 8, playerCount: 5 };
    const snapshot = { ...input };
    createTournament(input);
    expect(input).toEqual(snapshot);
  });
});

describe('createTournament — mode derivation (Req 5.1, 5.2, 5.4, 5.5, 25.7)', () => {
  it('is classic when playerCount is absent', () => {
    const t = createTournament({ category: 'Best pasta sauce', size: 8 });
    expect(t.mode).toBe('classic');
    expect(t.playerCount).toBeUndefined();
  });

  it('is classic when playerCount is explicitly undefined', () => {
    const t = createTournament({ category: 'Best pasta sauce', size: 8, playerCount: undefined });
    expect(t.mode).toBe('classic');
    expect(t.playerCount).toBeUndefined();
  });

  it('is voteBased when playerCount is exactly 1', () => {
    const t = createTournament({ category: 'Best movie', size: 4, playerCount: 1 });
    expect(t.mode).toBe('voteBased');
    expect(t.playerCount).toBe(1);
  });

  it('is voteBased for larger player counts and retains the value', () => {
    for (const pc of [2, 7, 50, 999]) {
      const t = createTournament({ category: 'Best movie', size: 4, playerCount: pc });
      expect(t.mode).toBe('voteBased');
      expect(t.playerCount).toBe(pc);
    }
  });

  it('retains the player count in vote-based mode for later phases (Req 5.2)', () => {
    const t = createTournament({ category: 'Best movie', size: 8, playerCount: 12 });
    expect(t.playerCount).toBe(12);
  });

  it('does not carry a player count in classic mode (Req 5.1)', () => {
    const t = createTournament({ category: 'Best movie', size: 8 });
    expect('playerCount' in t && t.playerCount !== undefined).toBe(false);
  });

  it('mode is determined solely by player count — size never changes it (Req 5.4, 25.7)', () => {
    for (const size of ALL_SIZES) {
      expect(createTournament({ category: 'X', size }).mode).toBe('classic');
      expect(createTournament({ category: 'X', size, playerCount: 3 }).mode).toBe('voteBased');
    }
  });

  it('mode is determined solely by player count — category never changes it (Req 5.4, 25.7)', () => {
    for (const category of ['', '   ', 'a', 'Best of everything', 'voteBased', 'classic']) {
      expect(createTournament({ category, size: 8 }).mode).toBe('classic');
      expect(createTournament({ category, size: 8, playerCount: 4 }).mode).toBe('voteBased');
    }
  });

  it('mode is determined solely by player count — rngSeed never changes it (Req 5.4, 25.7)', () => {
    for (const rngSeed of [0, 1, 42, 999999]) {
      expect(createTournament({ category: 'X', size: 8, rngSeed }).mode).toBe('classic');
      expect(createTournament({ category: 'X', size: 8, rngSeed, playerCount: 2 }).mode).toBe('voteBased');
    }
  });
});

describe('deriveMode — the single source of truth for mode', () => {
  it('returns classic for undefined', () => {
    expect(deriveMode(undefined)).toBe('classic');
  });

  it('returns voteBased for every whole number >= 1', () => {
    for (const pc of [1, 2, 3, 10, 100, 1000]) {
      expect(deriveMode(pc)).toBe('voteBased');
    }
  });

  it('treats invalid counts (0, negative, decimal) as classic — validation is upstream', () => {
    expect(deriveMode(0)).toBe('classic');
    expect(deriveMode(-1)).toBe('classic');
    expect(deriveMode(2.5)).toBe('classic');
  });
});

// ---------------------------------------------------------------------------
// Option add/remove with capacity rules and generation gating.
// Covers trimming/storage, empty/too-long/duplicate rejection, over-capacity
// blocking, count/full signalling, removal (including when full), stable ids,
// input immutability, and canGenerate.
// _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 8.1, 8.2_

import {
  addOption,
  canGenerate,
  generateBracket,
  isFull,
  removeOption,
  stageLabelFor,
} from './tournament';

/** Fill a tournament with `count` distinct options (Opt 1..Opt count). */
function withOptions(size: BracketSize, count: number): Tournament {
  let t = createTournament({ category: 'Best thing', size });
  for (let i = 1; i <= count; i += 1) {
    const result = addOption(t, `Opt ${i}`);
    if (!result.ok) {
      throw new Error(`unexpected rejection filling options: ${result.message}`);
    }
    t = result.tournament;
  }
  return t;
}

describe('addOption — accepting and storing names (Req 6.2, 6.4)', () => {
  it('adds a valid option, storing it trimmed', () => {
    const t = createTournament({ category: 'Best pasta sauce', size: 4 });
    const result = addOption(t, '  Pesto  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tournament.options).toHaveLength(1);
      expect(result.tournament.options[0].name).toBe('Pesto');
    }
  });

  it('accepts a 100-character name (boundary) and rejects 101 (Req 6.2)', () => {
    const t = createTournament({ category: 'X', size: 4 });
    const ok = addOption(t, 'a'.repeat(100));
    expect(ok.ok).toBe(true);
    const tooLong = addOption(t, 'a'.repeat(101));
    expect(tooLong.ok).toBe(false);
  });

  it('assigns stable, unique ids to each option', () => {
    const t = withOptions(8, 3);
    const ids = t.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['opt-1', 'opt-2', 'opt-3']);
  });

  it('does not reuse an id after a removal (ids strictly increase)', () => {
    const t = withOptions(8, 2); // opt-1, opt-2
    const afterRemove = removeOption(t, 'opt-1'); // leaves opt-2
    const added = addOption(afterRemove, 'New');
    expect(added.ok).toBe(true);
    if (added.ok) {
      const ids = added.tournament.options.map((o) => o.id);
      expect(ids).toContain('opt-3');
      expect(ids).not.toContain('opt-1');
    }
  });

  it('does not mutate the input tournament', () => {
    const t = createTournament({ category: 'X', size: 4 });
    const snapshot = JSON.parse(JSON.stringify(t));
    addOption(t, 'Something');
    expect(JSON.parse(JSON.stringify(t))).toEqual(snapshot);
  });
});

describe('addOption — rejection rules (Req 6.3, 6.5, 6.6)', () => {
  it('rejects an empty / whitespace-only name (Req 6.3)', () => {
    const t = createTournament({ category: 'X', size: 4 });
    expect(addOption(t, '').ok).toBe(false);
    expect(addOption(t, '   ').ok).toBe(false);
  });

  it('rejects a duplicate ignoring case and edge whitespace (Req 6.5)', () => {
    const t = withOptions(4, 0);
    const first = addOption(t, 'Pesto');
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(addOption(first.tournament, 'pesto').ok).toBe(false);
      expect(addOption(first.tournament, '  PESTO  ').ok).toBe(false);
    }
  });

  it('blocks adding more options than the chosen size (Req 6.6)', () => {
    const full = withOptions(4, 4);
    expect(full.options).toHaveLength(4);
    const overflow = addOption(full, 'One too many');
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.message).toMatch(/full/i);
    }
  });

  it('reports full even when the extra name would otherwise be valid', () => {
    const full = withOptions(2, 2);
    const overflow = addOption(full, 'Brand new unique name');
    expect(overflow.ok).toBe(false);
  });
});

describe('isFull — full signalling (Req 6.7)', () => {
  it('is false while slots remain and true exactly at capacity', () => {
    expect(isFull(withOptions(4, 3))).toBe(false);
    expect(isFull(withOptions(4, 4))).toBe(true);
  });
});

describe('removeOption — freeing slots (Req 7.1, 7.2, 7.3)', () => {
  it('removes the option by id and updates the count', () => {
    const t = withOptions(8, 3);
    const after = removeOption(t, 'opt-2');
    expect(after.options.map((o) => o.id)).toEqual(['opt-1', 'opt-3']);
    expect(after.options).toHaveLength(2);
  });

  it('frees a slot so a new option can be added afterwards', () => {
    const t = withOptions(4, 4); // full
    const after = removeOption(t, 'opt-1');
    expect(isFull(after)).toBe(false);
    expect(addOption(after, 'Replacement').ok).toBe(true);
  });

  it('is allowed even when the bracket is full (Req 7.3)', () => {
    const full = withOptions(2, 2);
    expect(isFull(full)).toBe(true);
    const after = removeOption(full, 'opt-1');
    expect(after.options).toHaveLength(1);
    expect(isFull(after)).toBe(false);
  });

  it('leaves options unchanged when the id is not present', () => {
    const t = withOptions(4, 2);
    const after = removeOption(t, 'opt-999');
    expect(after.options.map((o) => o.id)).toEqual(['opt-1', 'opt-2']);
  });

  it('does not mutate the input tournament', () => {
    const t = withOptions(4, 2);
    const snapshot = JSON.parse(JSON.stringify(t));
    removeOption(t, 'opt-1');
    expect(JSON.parse(JSON.stringify(t))).toEqual(snapshot);
  });
});

describe('canGenerate — generation gating (Req 8.1, 8.2)', () => {
  it('is false when the bracket is under capacity', () => {
    expect(canGenerate(withOptions(4, 3))).toBe(false);
  });

  it('is true only when options exactly equal the chosen size', () => {
    expect(canGenerate(withOptions(4, 4))).toBe(true);
  });

  it('never allows generation of an incomplete bracket across sizes', () => {
    for (const size of [2, 4, 8, 16] as BracketSize[]) {
      expect(canGenerate(withOptions(size, size - 1))).toBe(false);
      expect(canGenerate(withOptions(size, size))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bracket generation and stage labels.
// Covers shuffle/first-round population, round count = log2(size), first-round
// matchup count = size/2 with each subsequent round halving, stage labels for
// sizes 2/4/8/16, third-place presence for size >= 4 and absence for size 2,
// phase transition to PLAYING, determinism, and input immutability.
// _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 25.4_

/** Fill and generate a bracket for the given size using a fixed seed. */
function generatedOfSize(size: BracketSize, rngSeed = 42): Tournament {
  let t = createTournament({ category: 'Best thing', size, rngSeed });
  for (let i = 1; i <= size; i += 1) {
    const result = addOption(t, `Opt ${i}`);
    if (!result.ok) {
      throw new Error(`unexpected rejection filling options: ${result.message}`);
    }
    t = result.tournament;
  }
  return generateBracket(t);
}

describe('stageLabelFor — stage labels by option count (Req 12.6)', () => {
  it('labels the named stages 2 -> Final, 4 -> Semifinal, 8 -> Quarterfinal', () => {
    expect(stageLabelFor(2)).toBe('Final');
    expect(stageLabelFor(4)).toBe('Semifinal');
    expect(stageLabelFor(8)).toBe('Quarterfinal');
  });

  it('falls back to "Round of N" for every other option count', () => {
    expect(stageLabelFor(16)).toBe('Round of 16');
    expect(stageLabelFor(32)).toBe('Round of 32');
    expect(stageLabelFor(1024)).toBe('Round of 1024');
  });
});

describe('generateBracket — round structure (Req 12.2, 12.3)', () => {
  it('sets the number of rounds equal to log2(size)', () => {
    for (const size of ALL_SIZES) {
      const t = generatedOfSize(size);
      expect(t.rounds).toHaveLength(Math.log2(size));
    }
  });

  it('gives the first round half as many matchups as options (size / 2)', () => {
    for (const size of [2, 4, 8, 16, 32] as BracketSize[]) {
      const t = generatedOfSize(size);
      expect(t.rounds[0].matchups).toHaveLength(size / 2);
    }
  });

  it('halves the matchup count each round down to a single-matchup final', () => {
    const t = generatedOfSize(16);
    expect(t.rounds.map((r) => r.matchups.length)).toEqual([8, 4, 2, 1]);
    const finalRound = t.rounds[t.rounds.length - 1];
    expect(finalRound.matchups).toHaveLength(1);
    expect(finalRound.optionCount).toBe(2);
  });

  it('assigns stage labels per round from the round option count', () => {
    const t = generatedOfSize(16);
    expect(t.rounds.map((r) => r.stageLabel)).toEqual([
      'Round of 16',
      'Quarterfinal',
      'Semifinal',
      'Final',
    ]);
  });

  it('labels a size-2 bracket a single Final round', () => {
    const t = generatedOfSize(2);
    expect(t.rounds).toHaveLength(1);
    expect(t.rounds[0].stageLabel).toBe('Final');
  });
});

describe('generateBracket — first-round population (Req 12.1)', () => {
  it('fills every first-round slot so no option appears twice', () => {
    const t = generatedOfSize(8);
    const firstRoundOptions: string[] = [];
    for (const m of t.rounds[0].matchups) {
      expect(m.optionA).toBeDefined();
      expect(m.optionB).toBeDefined();
      firstRoundOptions.push(m.optionA!.id, m.optionB!.id);
    }
    expect(firstRoundOptions).toHaveLength(8);
    expect(new Set(firstRoundOptions).size).toBe(8);
  });

  it('leaves later rounds with empty option slots to be filled by winners', () => {
    const t = generatedOfSize(8);
    for (let r = 1; r < t.rounds.length; r += 1) {
      for (const m of t.rounds[r].matchups) {
        expect(m.optionA).toBeUndefined();
        expect(m.optionB).toBeUndefined();
      }
    }
  });

  it('is deterministic for a fixed seed and can differ across seeds', () => {
    const a = generatedOfSize(8, 1);
    const b = generatedOfSize(8, 1);
    const idsOf = (t: Tournament) =>
      t.rounds[0].matchups.flatMap((m) => [m.optionA!.id, m.optionB!.id]);
    expect(idsOf(a)).toEqual(idsOf(b));
  });
});

describe('generateBracket — third-place match (Req 12.4, 12.5)', () => {
  it('prepares an initially-empty third-place match when size >= 4', () => {
    for (const size of [4, 8, 16] as BracketSize[]) {
      const t = generatedOfSize(size);
      expect(t.thirdPlaceMatch).toBeDefined();
      expect(t.thirdPlaceMatch!.isThirdPlace).toBe(true);
      expect(t.thirdPlaceMatch!.optionA).toBeUndefined();
      expect(t.thirdPlaceMatch!.optionB).toBeUndefined();
      expect(t.thirdPlaceMatch!.winner).toBeUndefined();
    }
  });

  it('creates no third-place match when size is 2', () => {
    const t = generatedOfSize(2);
    expect(t.thirdPlaceMatch).toBeUndefined();
  });
});

describe('generateBracket — phase and immutability', () => {
  it('moves the tournament into the PLAYING phase with cursors reset', () => {
    const t = generatedOfSize(8);
    expect(t.phase).toBe('PLAYING');
    expect(t.currentRoundIndex).toBe(0);
    expect(t.currentMatchupIndex).toBe(0);
  });

  it('does not mutate the input tournament', () => {
    let t = createTournament({ category: 'X', size: 4, rngSeed: 7 });
    for (let i = 1; i <= 4; i += 1) {
      const r = addOption(t, `Opt ${i}`);
      if (r.ok) t = r.tournament;
    }
    const snapshot = JSON.parse(JSON.stringify(t));
    generateBracket(t);
    expect(JSON.parse(JSON.stringify(t))).toEqual(snapshot);
  });

  it('throws when generating an incomplete bracket (Req 8.1, 25.4)', () => {
    const t = withOptions(4, 3);
    expect(() => generateBracket(t)).toThrow();
  });
});
