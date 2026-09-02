import {
  MIN_CATEGORY_LENGTH,
  MAX_CATEGORY_LENGTH,
  MIN_PARTICIPANT_NAME_LENGTH,
  MAX_PARTICIPANT_NAME_LENGTH,
  VALID_BRACKET_SIZES,
  MIN_PLAYER_COUNT,
} from '../types/index';

/**
 * Validates a category name.
 * Accepts trimmed strings with length between 1 and 100 characters inclusive.
 * Rejects empty strings, whitespace-only strings, and strings exceeding 100 chars after trimming.
 */
export function isValidCategoryName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= MIN_CATEGORY_LENGTH && trimmed.length <= MAX_CATEGORY_LENGTH;
}

/**
 * Validates a participant name.
 * Accepts trimmed strings with length between 1 and 100 characters inclusive.
 * Rejects empty strings, whitespace-only strings, and strings exceeding 100 chars after trimming.
 */
export function isValidParticipantName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= MIN_PARTICIPANT_NAME_LENGTH && trimmed.length <= MAX_PARTICIPANT_NAME_LENGTH;
}

/**
 * Checks if a participant name already exists in the list.
 * Comparison is case-insensitive and ignores leading/trailing whitespace:
 * both the submitted name and each existing entry are normalized via
 * `trim()` and `toLocaleLowerCase()` before comparison.
 * Returns true if the name is a duplicate.
 */
export function isDuplicateParticipant(name: string, existing: string[]): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return existing.some((entry) => entry.trim().toLocaleLowerCase() === normalized);
}

/**
 * Checks whether the given size is a valid bracket size.
 * Valid sizes are powers of 2 in the range [2, 2048].
 */
export function isValidBracketSize(size: number): boolean {
  return (VALID_BRACKET_SIZES as readonly number[]).includes(size);
}

/**
 * Validates an optional Player_Count supplied at tournament creation.
 * A `null` value represents an empty input and activates Classic_Mode, so it is valid.
 * A non-null value is valid only when it is an integer greater than or equal to
 * MIN_PLAYER_COUNT, which activates Vote_Based_Mode.
 * Returns false for 0, negatives, fractions, NaN, Infinity, and any non-integer value.
 */
export function isValidPlayerCount(value: number | null): boolean {
  if (value === null) {
    return true;
  }
  return Number.isInteger(value) && value >= MIN_PLAYER_COUNT;
}
