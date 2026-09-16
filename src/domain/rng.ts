// Pure, deterministic seeded RNG for the tournament bracket creator.
// No React imports and no I/O — only pure functions.
//
// A single injected seeded RNG (driven by Tournament.rngSeed) powers:
//   - shuffling options at bracket generation (Req 12.1)
//   - the 50/50 tie-break draw in vote-based mode (Req 16.9)
//   - deterministic equal-vote ordering during re-seeding (Req 17.4)
//
// Injecting a seed makes this randomness reproducible in tests while still
// appearing random to users. The PRNG is mulberry32: a small, fast, well-
// distributed 32-bit generator that is fully determined by its seed.

/** A deterministic, seedable random-number generator. */
export interface SeededRng {
  /** The seed used to construct this generator (for reference/reproduction). */
  readonly seed: number;
  /** Next float in the half-open range [0, 1). */
  nextFloat(): number;
  /**
   * Next integer in [0, max). Returns 0 when max <= 0.
   * @param max exclusive upper bound.
   */
  nextInt(max: number): number;
  /** A 50/50 boolean draw with equal probability (Req 16.9). */
  nextBoolean(): boolean;
  /**
   * Return a new array that is a uniformly shuffled permutation of the input
   * (Fisher–Yates). The input array is not mutated (Req 12.1).
   */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * mulberry32 PRNG step. Given a 32-bit state, returns a float in [0, 1).
 * The state is advanced by mutating the single-element holder.
 */
function mulberry32Step(state: Uint32Array): number {
  // Advance state by the mulberry32 increment.
  state[0] = (state[0] + 0x6d2b79f5) | 0;
  let t = state[0];
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Create a deterministic RNG seeded by a number. The same seed always yields
 * the same sequence of outputs, making shuffles, tie-breaks, and equal-vote
 * ordering reproducible (Req 12.1, 16.9, 17.4).
 *
 * Non-finite seeds are coerced to 0 so a generator is always well-defined.
 */
export function createSeededRng(seed: number): SeededRng {
  const initial = Number.isFinite(seed) ? Math.floor(seed) : 0;
  // Uint32Array coerces the seed into the 32-bit state space.
  const state = new Uint32Array([initial >>> 0]);

  const nextFloat = (): number => mulberry32Step(state);

  const nextInt = (max: number): number => {
    if (!Number.isFinite(max) || max <= 0) {
      return 0;
    }
    return Math.floor(nextFloat() * Math.floor(max));
  };

  const nextBoolean = (): boolean => nextFloat() < 0.5;

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = nextInt(i + 1);
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  };

  return {
    seed: initial,
    nextFloat,
    nextInt,
    nextBoolean,
    shuffle,
  };
}
