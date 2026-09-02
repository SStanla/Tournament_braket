import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isValidBracketSize, isValidCategoryName, isValidParticipantName, isValidPlayerCount } from '../services/validation';
import {
  VALID_BRACKET_SIZES,
  MIN_CATEGORY_LENGTH,
  MAX_CATEGORY_LENGTH,
  MIN_PARTICIPANT_NAME_LENGTH,
  MAX_PARTICIPANT_NAME_LENGTH,
} from '../types/index';

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 1: Category Name Validation
// **Validates: Requirements 1.2, 1.3**
// ---------------------------------------------------------------------------
describe('Property 1: Category Name Validation', () => {
  const PBT_CONFIG = { numRuns: 100 };

  it('should accept any string whose trimmed length is between 1 and 100 characters', () => {
    const validCategory = fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(validCategory, (name) => {
        const trimmed = name.trim();
        if (
          trimmed.length >= MIN_CATEGORY_LENGTH &&
          trimmed.length <= MAX_CATEGORY_LENGTH
        ) {
          expect(isValidCategoryName(name)).toBe(true);
        }
      }),
      PBT_CONFIG
    );
  });

  it('should reject empty strings', () => {
    expect(isValidCategoryName('')).toBe(false);
  });

  it('should reject whitespace-only strings', () => {
    const whitespaceOnly = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1 });

    fc.assert(
      fc.property(whitespaceOnly, (name) => {
        expect(isValidCategoryName(name)).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  it('should reject strings exceeding 100 characters after trimming', () => {
    const tooLongAfterTrim = fc
      .string({ minLength: 101, maxLength: 200 })
      .filter((s) => s.trim().length > MAX_CATEGORY_LENGTH);

    fc.assert(
      fc.property(tooLongAfterTrim, (name) => {
        expect(isValidCategoryName(name)).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  it('should accept if and only if trimmed length is between 1 and 100 inclusive', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (name) => {
        const trimmed = name.trim();
        const expectedValid =
          trimmed.length >= MIN_CATEGORY_LENGTH &&
          trimmed.length <= MAX_CATEGORY_LENGTH;
        expect(isValidCategoryName(name)).toBe(expectedValid);
      }),
      PBT_CONFIG
    );
  });
});

// Feature: tournament-bracket-creator, Property 3: Bracket Size Validation
// **Validates: Requirements 2.3**
describe('Property 3: Bracket Size Validation', () => {
  const PBT_CONFIG = { numRuns: 100 };

  /** Helper: checks if a number is a power of 2 and within [2, 2048] */
  function isPowerOf2InRange(n: number): boolean {
    if (!Number.isInteger(n) || n < 2 || n > 2048) return false;
    return (n & (n - 1)) === 0;
  }

  it('should accept all valid bracket sizes (powers of 2 in [2, 2048])', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048),
        (size) => {
          expect(isValidBracketSize(size)).toBe(true);
        }
      ),
      PBT_CONFIG
    );
  });

  it('should reject integers that are not powers of 2 or outside [2, 2048]', () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => !(VALID_BRACKET_SIZES as readonly number[]).includes(n)),
        (size) => {
          expect(isValidBracketSize(size)).toBe(false);
        }
      ),
      PBT_CONFIG
    );
  });

  it('should accept a value if and only if it is a power of 2 in [2, 2048]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 10000 }),
        (size) => {
          const expected = isPowerOf2InRange(size);
          expect(isValidBracketSize(size)).toBe(expected);
        }
      ),
      PBT_CONFIG
    );
  });

  it('should reject non-integer numbers', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }).filter(
          (n) => !Number.isInteger(n)
        ),
        (size) => {
          expect(isValidBracketSize(size)).toBe(false);
        }
      ),
      PBT_CONFIG
    );
  });

  it('should reject NaN and Infinity', () => {
    expect(isValidBracketSize(NaN)).toBe(false);
    expect(isValidBracketSize(Infinity)).toBe(false);
    expect(isValidBracketSize(-Infinity)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 5: Participant Name Validation
// **Validates: Requirements 3.2, 3.3**
// ---------------------------------------------------------------------------
describe('Property 5: Participant Name Validation', () => {
  const PBT_CONFIG = { numRuns: 100 };

  it('should accept any string whose trimmed length is between 1 and 100 characters', () => {
    const validParticipantName = fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(validParticipantName, (name) => {
        const trimmed = name.trim();
        if (
          trimmed.length >= MIN_PARTICIPANT_NAME_LENGTH &&
          trimmed.length <= MAX_PARTICIPANT_NAME_LENGTH
        ) {
          expect(isValidParticipantName(name)).toBe(true);
        }
      }),
      PBT_CONFIG
    );
  });

  it('should reject empty strings', () => {
    expect(isValidParticipantName('')).toBe(false);
  });

  it('should reject whitespace-only strings', () => {
    const whitespaceOnly = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1 });

    fc.assert(
      fc.property(whitespaceOnly, (name) => {
        expect(isValidParticipantName(name)).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  it('should reject strings exceeding 100 characters after trimming', () => {
    const tooLongAfterTrim = fc
      .string({ minLength: 101, maxLength: 200 })
      .filter((s) => s.trim().length > MAX_PARTICIPANT_NAME_LENGTH);

    fc.assert(
      fc.property(tooLongAfterTrim, (name) => {
        expect(isValidParticipantName(name)).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  it('should accept if and only if trimmed length is between 1 and 100 inclusive', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (name) => {
        const trimmed = name.trim();
        const expectedValid =
          trimmed.length >= MIN_PARTICIPANT_NAME_LENGTH &&
          trimmed.length <= MAX_PARTICIPANT_NAME_LENGTH;
        expect(isValidParticipantName(name)).toBe(expectedValid);
      }),
      PBT_CONFIG
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tournament-bracket-creator, Property 26: Player count validation is accept-iff (positive integer or null)
// **Validates: Requirements 11.3, 11.4**
// ---------------------------------------------------------------------------
describe('Feature: tournament-bracket-creator, Property 26: Player count validation is accept-iff (positive integer or null)', () => {
  const PBT_CONFIG = { numRuns: 100 };

  /**
   * Mixes null, valid positive integers, and invalid values (0, negatives,
   * fractions, NaN, Infinity) so both branches of the accept-iff are exercised.
   */
  const playerCountArb = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 1, max: 100_000 }), // valid
    fc.constantFrom(0, -1, -100, NaN, Infinity, -Infinity), // invalid
    fc
      .double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true })
      .filter((n) => !Number.isInteger(n)) // fractional invalid
  );

  it('accepts iff the value is null or an integer >= 1', () => {
    fc.assert(
      fc.property(playerCountArb, (value) => {
        const expected = value === null || (Number.isInteger(value) && value >= 1);
        expect(isValidPlayerCount(value)).toBe(expected);
      }),
      PBT_CONFIG
    );
  });

  it('rejects 0, negatives, fractions, NaN, and Infinity', () => {
    expect(isValidPlayerCount(0)).toBe(false);
    expect(isValidPlayerCount(-1)).toBe(false);
    expect(isValidPlayerCount(1.5)).toBe(false);
    expect(isValidPlayerCount(NaN)).toBe(false);
    expect(isValidPlayerCount(Infinity)).toBe(false);
    expect(isValidPlayerCount(-Infinity)).toBe(false);
  });

  it('accepts null (Classic_Mode) and any positive integer (Vote_Based_Mode)', () => {
    expect(isValidPlayerCount(null)).toBe(true);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (n) => {
        expect(isValidPlayerCount(n)).toBe(true);
      }),
      PBT_CONFIG
    );
  });
});
