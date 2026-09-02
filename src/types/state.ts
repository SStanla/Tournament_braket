/**
 * State management types for the Tournament Bracket Creator.
 */

import type { Bracket, Tournament } from './index';
import type { Suggestion } from './suggestions';

/** State for the suggestion subsystem. */
export interface SuggestionState {
  suggestions: Suggestion[];
  isLoading: boolean;
  error: string | null;
}

/** UI-related state. */
export interface UIState {
  validationErrors: Record<string, string>;
  isCreating: boolean;
}

/** Global tournament application state. */
export interface TournamentState {
  tournament: Tournament | null;
  bracket: Bracket | null;
  suggestions: SuggestionState;
  ui: UIState;
}

/** All possible actions dispatched to the tournament reducer. */
export type TournamentAction =
  | { type: 'CREATE_TOURNAMENT'; payload: { category: string; bracketSize: number } }
  | { type: 'SET_BRACKET_SIZE'; payload: { size: number } }
  | { type: 'ADD_PARTICIPANT'; payload: { name: string } }
  | { type: 'REMOVE_PARTICIPANT'; payload: { id: string } }
  | { type: 'SET_SUGGESTIONS'; payload: { suggestions: Suggestion[] } }
  | { type: 'ACCEPT_SUGGESTION'; payload: { suggestionId: string } }
  | { type: 'REJECT_SUGGESTION'; payload: { suggestionId: string } }
  | { type: 'REPLACE_SUGGESTION'; payload: { suggestionId: string; newName: string } }
  | { type: 'SELECT_WINNER'; payload: { matchupId: string; winnerId: string } }
  | { type: 'CLEAR_DOWNSTREAM'; payload: { matchupId: string } };
