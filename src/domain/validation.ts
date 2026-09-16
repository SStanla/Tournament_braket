// Pure domain validation utilities for the tournament bracket creator.
// No React imports and no I/O — only pure functions.
// Mirrors the "Domain Functions (pure) — Validation" section of the design document.

import type { Option, Suggestion } from './model';

/** Maximum length (after trimming) allowed for category and option names. */
export const MAX_NAME_LENGTH = 100;

/**
 * Discriminated result of a validation that yields a value.
 * `ok: true` carries the validated value; `ok: false` carries a message.
 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/**
 * Trim leading and trailing whitespace from a raw name.
 * (Req 6.4)
 */
export function normalizeName(raw: string): string {
  return raw.trim();
}

/**
 * Compare two names for equality, ignoring letter case and edge whitespace.
 * (Req 6.5, 9.9, Appendix A rule 9)
 */
export function namesEqual(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase() === normalizeName(b).toLocaleLowerCase();
}

/**
 * Validate a category as free text of 1..100 characters, counted after trimming.
 * - Empty or whitespace-only => required message (Req 3.2).
 * - Longer than 100 after trimming => maximum-length message (Req 3.3).
 * - Otherwise ok with the trimmed value (Req 3.1).
 */
export function validateCategory(raw: string): ValidationResult<string> {
  const value = normalizeName(raw);
  if (value.length === 0) {
    return { ok: false, message: 'Category is required.' };
  }
  if (value.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `Category must be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }
  return { ok: true, value };
}

/**
 * Validate the optional player count that determines the play mode.
 * - Empty (or whitespace-only) => classic mode, no value (Req 5.1).
 * - A whole number >= 1 => vote-based mode, value retained (Req 5.2).
 * - 0, negative, decimal, or non-numeric => error asking for a positive whole
 *   number (Req 5.3); the caller preserves other entered data.
 *
 * On success, `value` is present only in vote-based mode; when the field is left
 * empty, `ok` is true and `value` is undefined (classic mode).
 */
export function validatePlayerCount(raw: string): ValidationResult<number | undefined> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: undefined };
  }

  const requiredMessage = 'Player count must be a positive whole number.';

  // Reject anything that is not a plain base-10 integer (no decimals, signs,
  // exponents, or non-numeric characters).
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: requiredMessage };
  }

  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) {
    return { ok: false, message: requiredMessage };
  }

  return { ok: true, value };
}

/**
 * Validate an option name against length bounds and duplicate rules.
 * - Empty or whitespace-only => dedicated message (Req 6.3).
 * - Longer than 100 after trimming => maximum-length message (Req 6.2, 10.7).
 * - Duplicates an existing option or (when provided) an existing suggestion,
 *   comparison ignoring case and edge whitespace => dedicated message
 *   (Req 6.5, 10.7).
 * - Otherwise ok with the trimmed value (Req 6.4).
 *
 * @param existingOptions options already present in the tournament.
 * @param existingSuggestions optional suggestions to also guard against
 *   (used during suggestion replacement, Req 10.7).
 */
export function validateOptionName(
  raw: string,
  existingOptions: Option[],
  existingSuggestions?: Suggestion[],
): ValidationResult<string> {
  const value = normalizeName(raw);

  if (value.length === 0) {
    return { ok: false, message: 'Option name is required.' };
  }
  if (value.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `Option name must be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }

  const duplicatesOption = existingOptions.some((option) =>
    namesEqual(option.name, value),
  );
  if (duplicatesOption) {
    return { ok: false, message: 'That option already exists.' };
  }

  if (existingSuggestions) {
    const duplicatesSuggestion = existingSuggestions.some((suggestion) =>
      namesEqual(suggestion.name, value),
    );
    if (duplicatesSuggestion) {
      return { ok: false, message: 'That name duplicates an existing suggestion.' };
    }
  }

  return { ok: true, value };
}
