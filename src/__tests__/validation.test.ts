import { describe, it, expect } from 'vitest';
import {
  isValidBracketSize,
  isValidCategoryName,
  isValidParticipantName,
  isDuplicateParticipant,
} from '../services/validation';

describe('isValidCategoryName', () => {
  it('accepts a simple valid category name', () => {
    expect(isValidCategoryName('Best pasta')).toBe(true);
  });

  it('accepts a single character name', () => {
    expect(isValidCategoryName('A')).toBe(true);
  });

  it('accepts a name at exactly 100 characters', () => {
    const name = 'a'.repeat(100);
    expect(isValidCategoryName(name)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidCategoryName('')).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    expect(isValidCategoryName('   ')).toBe(false);
    expect(isValidCategoryName('\t\n')).toBe(false);
  });

  it('rejects a string exceeding 100 characters after trimming', () => {
    const name = 'a'.repeat(101);
    expect(isValidCategoryName(name)).toBe(false);
  });

  it('trims the name before validating length', () => {
    // 98 chars + surrounding spaces = valid after trim
    const name = '  ' + 'a'.repeat(98) + '  ';
    expect(isValidCategoryName(name)).toBe(true);
  });

  it('rejects when trimmed length exceeds 100', () => {
    const name = '  ' + 'a'.repeat(101) + '  ';
    expect(isValidCategoryName(name)).toBe(false);
  });
});

describe('isValidParticipantName', () => {
  it('accepts a valid participant name', () => {
    expect(isValidParticipantName('Player 1')).toBe(true);
  });

  it('accepts a single character name', () => {
    expect(isValidParticipantName('X')).toBe(true);
  });

  it('accepts a name at exactly 100 characters', () => {
    const name = 'b'.repeat(100);
    expect(isValidParticipantName(name)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidParticipantName('')).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    expect(isValidParticipantName('   ')).toBe(false);
    expect(isValidParticipantName('\t')).toBe(false);
  });

  it('rejects a string exceeding 100 characters after trimming', () => {
    const name = 'c'.repeat(101);
    expect(isValidParticipantName(name)).toBe(false);
  });

  it('trims the name before validating', () => {
    expect(isValidParticipantName('  valid  ')).toBe(true);
  });
});

describe('isDuplicateParticipant', () => {
  it('returns true when the name exists in the list', () => {
    expect(isDuplicateParticipant('Alice', ['Alice', 'Bob', 'Charlie'])).toBe(true);
  });

  it('returns false when the name does not exist', () => {
    expect(isDuplicateParticipant('Dave', ['Alice', 'Bob', 'Charlie'])).toBe(false);
  });

  it('performs case-insensitive comparison', () => {
    expect(isDuplicateParticipant('alice', ['Alice', 'Bob'])).toBe(true);
    expect(isDuplicateParticipant('ALICE', ['Alice', 'Bob'])).toBe(true);
  });

  it('returns false for an empty existing list', () => {
    expect(isDuplicateParticipant('Alice', [])).toBe(false);
  });

  it('ignores leading/trailing whitespace when matching', () => {
    expect(isDuplicateParticipant('Alice ', ['Alice'])).toBe(true);
    expect(isDuplicateParticipant('Alice', ['Alice '])).toBe(true);
  });
});

describe('isValidBracketSize', () => {
  it('should accept all valid bracket sizes (powers of 2 from 2 to 2048)', () => {
    const validSizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    for (const size of validSizes) {
      expect(isValidBracketSize(size)).toBe(true);
    }
  });

  it('should reject 0 and 1', () => {
    expect(isValidBracketSize(0)).toBe(false);
    expect(isValidBracketSize(1)).toBe(false);
  });

  it('should reject powers of 2 outside the valid range', () => {
    expect(isValidBracketSize(4096)).toBe(false);
    expect(isValidBracketSize(8192)).toBe(false);
  });

  it('should reject non-power-of-2 numbers', () => {
    expect(isValidBracketSize(3)).toBe(false);
    expect(isValidBracketSize(5)).toBe(false);
    expect(isValidBracketSize(6)).toBe(false);
    expect(isValidBracketSize(7)).toBe(false);
    expect(isValidBracketSize(10)).toBe(false);
    expect(isValidBracketSize(100)).toBe(false);
    expect(isValidBracketSize(1000)).toBe(false);
  });

  it('should reject negative numbers', () => {
    expect(isValidBracketSize(-1)).toBe(false);
    expect(isValidBracketSize(-2)).toBe(false);
    expect(isValidBracketSize(-16)).toBe(false);
  });

  it('should reject non-integer numbers', () => {
    expect(isValidBracketSize(2.5)).toBe(false);
    expect(isValidBracketSize(4.1)).toBe(false);
    expect(isValidBracketSize(16.0001)).toBe(false);
  });

  it('should reject NaN and Infinity', () => {
    expect(isValidBracketSize(NaN)).toBe(false);
    expect(isValidBracketSize(Infinity)).toBe(false);
    expect(isValidBracketSize(-Infinity)).toBe(false);
  });
});
