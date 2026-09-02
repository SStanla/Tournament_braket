/**
 * Suggestion Review Workflow
 *
 * Pure functions for managing suggestion state transitions:
 * accept, reject, and replace individual suggestions.
 *
 * These functions operate immutably — they return new arrays
 * rather than mutating the input.
 */

import type { Suggestion } from '../types/suggestions';

/**
 * Accept a suggestion by ID.
 * Sets the suggestion's status to 'accepted'.
 *
 * @param suggestions - Current array of suggestions
 * @param suggestionId - ID of the suggestion to accept
 * @returns A new array with the target suggestion's status set to 'accepted'
 */
export function acceptSuggestion(
  suggestions: Suggestion[],
  suggestionId: string
): Suggestion[] {
  return suggestions.map((s) =>
    s.id === suggestionId ? { ...s, status: 'accepted' as const } : s
  );
}

/**
 * Reject a suggestion by ID.
 * Sets the suggestion's status to 'rejected'.
 *
 * @param suggestions - Current array of suggestions
 * @param suggestionId - ID of the suggestion to reject
 * @returns A new array with the target suggestion's status set to 'rejected'
 */
export function rejectSuggestion(
  suggestions: Suggestion[],
  suggestionId: string
): Suggestion[] {
  return suggestions.map((s) =>
    s.id === suggestionId ? { ...s, status: 'rejected' as const } : s
  );
}

/**
 * Replace a suggestion's name by ID.
 * A valid replacement is an atomic accept: the target entry's name is set to
 * `newName` AND its status is set to 'accepted' (auto-accepted). Every other
 * entry is left unchanged.
 *
 * @param suggestions - Current array of suggestions
 * @param suggestionId - ID of the suggestion to replace
 * @param newName - The new name for the suggestion
 * @returns A new array with the target suggestion's name replaced and status set to 'accepted'
 */
export function replaceSuggestion(
  suggestions: Suggestion[],
  suggestionId: string,
  newName: string
): Suggestion[] {
  return suggestions.map((s) =>
    s.id === suggestionId ? { ...s, name: newName, status: 'accepted' as const } : s
  );
}
/**
 * Accept all currently-pending suggestions in one action.
 * Every suggestion whose status is 'pending' becomes 'accepted';
 * suggestions already 'accepted' or 'rejected' are left unchanged.
 *
 * @param suggestions - Current array of suggestions
 * @returns A new array in which each previously-'pending' suggestion is 'accepted'
 */
export function acceptAllPending(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.map((s) =>
    s.status === 'pending' ? { ...s, status: 'accepted' as const } : s
  );
}
