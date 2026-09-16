import { describe, it, expect } from 'vitest';
import { createSeededRng } from './rng';

describe('createSeededRng — determinism', () => {
  it('produces the same nextFloat sequence for the same seed', () => {
    const a = createSeededRng(12345);
    const b = createSeededRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).not.toEqual(seqB);
  });

  it('reproduces the same shuffle for the same seed and input', () => {
    const input = Array.from({ length: 16 }, (_, i) => i);
    const first = createSeededRng(999).shuffle(input);
    const second = createSeededRng(999).shuffle(input);
    expect(first).toEqual(second);
  });

  it('coerces non-finite seeds to a well-defined generator', () => {
    const a = createSeededRng(Number.NaN);
    const b = createSeededRng(0);
    expect(a.seed).toBe(0);
    const seqA = Array.from({ length: 5 }, () => a.nextFloat());
    const seqB = Array.from({ length: 5 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });
});

describe('createSeededRng — nextFloat range', () => {
  it('always returns values in [0, 1)', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 5000; i += 1) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createSeededRng — nextInt', () => {
  it('always returns integers in [0, max)', () => {
    const rng = createSeededRng(7);
    const max = 10;
    for (let i = 0; i < 5000; i += 1) {
      const v = rng.nextInt(max);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(max);
    }
  });

  it('returns 0 for non-positive or non-finite bounds', () => {
    const rng = createSeededRng(3);
    expect(rng.nextInt(0)).toBe(0);
    expect(rng.nextInt(-5)).toBe(0);
    expect(rng.nextInt(Number.NaN)).toBe(0);
    expect(rng.nextInt(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('covers the full range across many draws', () => {
    const rng = createSeededRng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(rng.nextInt(4));
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('createSeededRng — nextBoolean (50/50 draw)', () => {
  it('produces both outcomes and stays roughly balanced', () => {
    const rng = createSeededRng(555);
    let trues = 0;
    const n = 10000;
    for (let i = 0; i < n; i += 1) {
      if (rng.nextBoolean()) trues += 1;
    }
    // Deterministic sequence, but should be close to a fair coin.
    expect(trues).toBeGreaterThan(n * 0.4);
    expect(trues).toBeLessThan(n * 0.6);
  });

  it('is deterministic for a fixed seed', () => {
    const a = createSeededRng(88);
    const b = createSeededRng(88);
    const seqA = Array.from({ length: 30 }, () => a.nextBoolean());
    const seqB = Array.from({ length: 30 }, () => b.nextBoolean());
    expect(seqA).toEqual(seqB);
  });
});

describe('createSeededRng — shuffle is a permutation', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    createSeededRng(1).shuffle(input);
    expect(input).toEqual(copy);
  });

  it('returns a permutation (same multiset) for many seeds and sizes', () => {
    // Property-style check: for a range of seeds and sizes, the shuffle output
    // is always a permutation of the input (same elements, same length).
    for (let seed = 0; seed < 100; seed += 1) {
      for (const size of [1, 2, 4, 8, 16, 33]) {
        const input = Array.from({ length: size }, (_, i) => i);
        const shuffled = createSeededRng(seed).shuffle(input);
        expect(shuffled).toHaveLength(size);
        expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
      }
    }
  });

  it('handles empty and single-element arrays', () => {
    expect(createSeededRng(1).shuffle([])).toEqual([]);
    expect(createSeededRng(1).shuffle(['only'])).toEqual(['only']);
  });
});
