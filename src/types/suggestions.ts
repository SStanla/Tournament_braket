/**
 * Types for the Auto-Suggest Engine.
 */

/** Parameters for generating participant suggestions. */
export interface SuggestionParams {
  category: string;
  existingParticipants: string[];
  count: number;
  /** Timeout in milliseconds; defaults to 10000ms */
  timeout?: number;
}

/** Result of a suggestion generation request. */
export interface SuggestionResult {
  suggestions: Suggestion[];
  source: 'ai' | 'fallback' | 'manual';
  error?: string;
}

/** A single suggestion for a bracket participant. */
export interface Suggestion {
  id: string;
  name: string;
  source: 'ai' | 'fallback';
  status: 'pending' | 'accepted' | 'rejected';
}

/** Parameters for generating a replacement after a suggestion is rejected. */
export interface ReplacementParams {
  category: string;
  existingParticipants: string[];
  rejectedNames: string[];
}
