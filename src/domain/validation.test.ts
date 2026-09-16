// Unit tests for the pure domain validation utilities.
// Covers category boundaries, player-count parsing/mode determination, option
// name length + duplicate detection, and the normalize/equality helpers.
// _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 6.5_

import { describe, expect, it } from 'vitest';
import type { Option, Suggestion } from './model';
import {
  MAX_NAME_LENGTH,
  normalizeName,
  namesEqual,
  validateCategory,
  validatePlayerCount,
  validateOptionName,
} from './validation';

/** Helper to build an Option with a given name. */
function opt(name: string, id = name): Option {
  return { id, name };
}

/** Helper to build a pending Suggestion with a given name. */
function sug(name: string, id = name): Suggestion {
  return { id, name, status: 'pending' };
}

describe('normalizeName', () => {
  it('trims leading and trailing whitespace only', () => {
    expect(normalizeName('  hello  ')).toBe('hello');
    expect(normalizeName('\t\n mid space \n')).toBe('mid space');
  });

  it('leaves interior whitespace untouched', () => {
    expect(normalizeName('a  b')).toBe('a  b');
  });

  it('reduces a whitespace-only string to empty', () => {
    expect(normalizeName('   ')).toBe('');
  });
});

describe('namesEqual (case- and edge-whitespace-insensitive)', () => {
  it('matches names differing only by case', () => {
    expect(namesEqual('Pizza', 'pizza')).toBe(true);
    expect(namesEqual('PIZZA', 'pizza')).toBe(true);
  });

  it('matches names differing only by edge whitespace', () => {
    expect(namesEqual('  pizza', 'pizza  ')).toBe(true);
  });

  it('matches names differing by both case and edge whitespace', () => {
    expect(namesEqual('  PiZzA ', 'pizza')).toBe(true);
  });

  it('does not match different names', () => {
    expect(namesEqual('pizza', 'pasta')).toBe(false);
  });

  it('treats interior whitespace as significant', () => {
    expect(namesEqual('a b', 'ab')).toBe(false);
  });
});

describe('validateCategory (Req 3.1, 3.2, 3.3)', () => {
  it('rejects an empty string as required (0 chars)', () => {
    const result = validateCategory('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/required/i);
  });

  it('rejects a whitespace-only string as required', () => {
    const result = validateCategory('   \t\n ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/required/i);
  });

  it('accepts a single character (lower boundary, 1 char)', () => {
    const result = validateCategory('a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('a');
  });

  it('accepts exactly 100 characters after trimming (upper boundary)', () => {
    const raw = '  ' + 'x'.repeat(MAX_NAME_LENGTH) + '  ';
    const result = validateCategory(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('x'.repeat(MAX_NAME_LENGTH));
      expect(result.value.length).toBe(100);
    }
  });

  it('rejects 101 characters after trimming (over boundary)', () => {
    const result = validateCategory('x'.repeat(MAX_NAME_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/100|maximum|most/i);
  });

  it('returns the trimmed value on success', () => {
    const result = validateCategory('  Best pasta sauce  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('Best pasta sauce');
  });
});

describe('validatePlayerCount (Req 5.1, 5.2, 5.3)', () => {
  it('treats an empty field as classic mode (undefined value)', () => {
    const result = validatePlayerCount('');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeUndefined();
  });

  it('treats a whitespace-only field as classic mode (undefined value)', () => {
    const result = validatePlayerCount('   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeUndefined();
  });

  it('accepts 1 as the lower boundary for vote-based mode', () => {
    const result = validatePlayerCount('1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1);
  });

  it('accepts a large whole number', () => {
    const result = validatePlayerCount('1000000');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1000000);
  });

  it('accepts a value surrounded by whitespace', () => {
    const result = validatePlayerCount('  42  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('rejects 0', () => {
    const result = validatePlayerCount('0');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/positive whole number/i);
  });

  it('rejects a negative number', () => {
    const result = validatePlayerCount('-3');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/positive whole number/i);
  });

  it('rejects a decimal value', () => {
    const result = validatePlayerCount('2.5');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/positive whole number/i);
  });

  it('rejects a decimal that is mathematically an integer (e.g. "4.0")', () => {
    const result = validatePlayerCount('4.0');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-numeric value', () => {
    const result = validatePlayerCount('abc');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/positive whole number/i);
  });

  it('rejects numeric strings with extra characters', () => {
    expect(validatePlayerCount('12x').ok).toBe(false);
    expect(validatePlayerCount('+5').ok).toBe(false);
    expect(validatePlayerCount('1e3').ok).toBe(false);
    expect(validatePlayerCount('0x10').ok).toBe(false);
  });
});

describe('validateOptionName — duplicate detection across case/whitespace (Req 6.5)', () => {
  const existing: Option[] = [opt('Pizza'), opt('Pasta')];

  it('rejects an exact duplicate of an existing option', () => {
    const result = validateOptionName('Pizza', existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/already exists/i);
  });

  it('rejects a duplicate that differs only by case', () => {
    const result = validateOptionName('pizza', existing);
    expect(result.ok).toBe(false);
  });

  it('rejects a duplicate that differs only by edge whitespace', () => {
    const result = validateOptionName('  Pizza  ', existing);
    expect(result.ok).toBe(false);
  });

  it('rejects a duplicate differing by both case and whitespace', () => {
    const result = validateOptionName('  pIZZa ', existing);
    expect(result.ok).toBe(false);
  });

  it('accepts a name that is not a duplicate and returns it trimmed', () => {
    const result = validateOptionName('  Risotto  ', existing);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('Risotto');
  });

  it('also rejects a name duplicating a pending suggestion when provided', () => {
    const suggestions: Suggestion[] = [sug('Ravioli')];
    const result = validateOptionName('  ravioli ', existing, suggestions);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/suggestion/i);
  });

  it('rejects an empty option name', () => {
    const result = validateOptionName('   ', existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/required/i);
  });

  it('accepts exactly 100 characters (upper boundary)', () => {
    const result = validateOptionName('x'.repeat(MAX_NAME_LENGTH), existing);
    expect(result.ok).toBe(true);
  });

  it('rejects 101 characters after trimming (over boundary)', () => {
    const result = validateOptionName('x'.repeat(MAX_NAME_LENGTH + 1), existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/100|maximum|most/i);
  });
});
