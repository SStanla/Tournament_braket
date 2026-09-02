import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { Tournament, Bracket } from '../types/index';
import type { Suggestion } from '../types/suggestions';
import {
  createTournament,
  addParticipant,
  removeParticipant,
  advanceWinner,
  advanceThirdPlaceWinner,
  clearDownstream,
  generateBracket,
  getMode,
  enterVotes,
  resolveTieRandomly,
  reseedNextRound,
  getCurrentRound,
  enterThirdPlaceVotes,
  populateThirdPlace,
} from '../services/bracket-manager';
import { isValidPlayerCount } from '../services/validation';
import { saveTournament, loadTournament, clearTournament } from '../services/persistence';
import {
  acceptSuggestion,
  rejectSuggestion,
  replaceSuggestion,
  acceptAllPending,
} from '../services/suggestion-review';

// ---------------------------------------------------------------------------
// State Types
// ---------------------------------------------------------------------------

export interface SuggestionState {
  items: Suggestion[];
  loading: boolean;
  error: string | null;
}

export interface UIState {
  error: string | null;
}

export interface TournamentState {
  tournament: Tournament | null;
  bracket: Bracket | null;
  suggestions: SuggestionState;
  ui: UIState;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type TournamentAction =
  | {
      type: 'CREATE_TOURNAMENT';
      payload: { category: string; bracketSize: number; playerCount: number | null };
    }
  | { type: 'SET_BRACKET_SIZE'; payload: { size: number } }
  | { type: 'SET_PLAYER_COUNT'; payload: { playerCount: number | null } }
  | { type: 'ADD_PARTICIPANT'; payload: { name: string } }
  | { type: 'REMOVE_PARTICIPANT'; payload: { id: string } }
  | { type: 'SET_SUGGESTIONS'; payload: { suggestions: Suggestion[] } }
  | { type: 'ACCEPT_SUGGESTION'; payload: { suggestionId: string } }
  | { type: 'ACCEPT_ALL_SUGGESTIONS' }
  | { type: 'REJECT_SUGGESTION'; payload: { suggestionId: string } }
  | { type: 'REPLACE_SUGGESTION'; payload: { suggestionId: string; newName: string } }
  | { type: 'SELECT_WINNER'; payload: { matchupId: string; winnerId: string } }
  | { type: 'ENTER_VOTES'; payload: { matchupId: string; votes1: number; votes2: number } }
  | { type: 'RESOLVE_TIE'; payload: { matchupId: string } }
  | { type: 'ENTER_THIRD_PLACE_VOTES'; payload: { votes1: number; votes2: number } }
  | { type: 'RESOLVE_THIRD_PLACE_TIE' }
  | { type: 'SELECT_THIRD_PLACE_WINNER'; payload: { winnerId: string } }
  | { type: 'CLEAR_DOWNSTREAM'; payload: { matchupId: string } }
  | { type: 'GENERATE_BRACKET' }
  | { type: 'RESET_TOURNAMENT' }
  | { type: 'LOAD_STATE'; payload: { tournament: Tournament; bracket: Bracket } };

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

export const initialState: TournamentState = {
  tournament: null,
  bracket: null,
  suggestions: {
    items: [],
    loading: false,
    error: null,
  },
  ui: {
    error: null,
  },
};

// ---------------------------------------------------------------------------
// Vote-mode progression helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when every playable matchup of the given 1-based round has a
 * recorded winner. A "playable" matchup is one with both participant slots
 * occupied — this keeps the check correct even for a round that has not yet been
 * fully materialized (its slots would still be null).
 */
function isRoundFullyDecided(bracket: Bracket, roundNumber: number): boolean {
  const round = bracket.rounds[roundNumber - 1];
  if (!round || round.matchups.length === 0) {
    return false;
  }
  return round.matchups.every(
    (m) => m.participant1 !== null && m.participant2 !== null && m.winner !== null
  );
}

/**
 * Applies the vote-mode "round complete → reseed + advance" flow.
 *
 * When the bracket's current round is now fully decided and is not the final
 * round, the next round is materialized via `reseedNextRound` and `currentRound`
 * is advanced. When the current round is the final round (champion decided), the
 * bracket is returned unchanged. (Req 13.2, 14.3)
 *
 * When the round that was just completed is the Semifinal (its participant count
 * is 4, i.e. it has 2 matchups: `matchups.length * 2 === 4`), the Third_Place_Match
 * slots are also filled from the two semifinal losers by applying
 * `populateThirdPlace`. This makes vote-mode third-place population behave
 * identically to classic mode, where `advanceWinner` already populates it.
 * `populateThirdPlace` is a pure no-op unless both semifinals have a recorded
 * winner, so it is safe to apply on the round-completion transition. (Req 10.2)
 *
 * `currentRound` never advances past the final round: for size >= 4 the completed
 * Semifinal advances `currentRound` to the Final, and the final round decided
 * branch above prevents any further advancement, so the third-place step is never
 * skipped by over-advancing. (Req 10.9, 10.11)
 */
function progressVoteRound(bracket: Bracket): Bracket {
  const totalRounds = bracket.rounds.length;
  const cur = bracket.currentRound;

  if (!isRoundFullyDecided(bracket, cur)) {
    return bracket;
  }

  // Final round decided → champion is set; nothing to advance.
  if (cur >= totalRounds) {
    return bracket;
  }

  // Was the round we just completed the Semifinal? (2 matchups → 4 participants)
  const completedRound = bracket.rounds[cur - 1];
  const completedWasSemifinal =
    completedRound !== undefined && completedRound.matchups.length * 2 === 4;

  const reseeded = reseedNextRound(bracket);
  // Cap currentRound at the final round so the transition never advances past the
  // Final (which would skip the Third_Place_Match step). (Req 10.9, 10.11)
  const nextRound = Math.min(cur + 1, totalRounds);
  const advanced: Bracket = { ...reseeded, currentRound: nextRound };

  // On the Semifinal → Final transition, fill the Third_Place_Match from the two
  // semifinal losers exactly as classic mode does. (Req 10.2)
  return completedWasSemifinal ? populateThirdPlace(advanced) : advanced;
}

/**
 * Handles a vote-mode change of outcome for a matchup that may live in a round
 * BEFORE the current materialized round (re-deciding an earlier matchup). Any
 * later rounds that were materialized from the old winners are discarded (their
 * matchup slots blanked) and `currentRound` is reset back to the changed round so
 * `getCurrentRound` reports it and the normal reseed-on-complete flow rebuilds the
 * downstream rounds from the updated winners. (Req 6.5, 13.6)
 *
 * When the changed matchup is not in an earlier round, the bracket is returned
 * unchanged.
 */
function truncateAfterChangedRound(bracket: Bracket, matchupId: string): Bracket {
  // Locate the round that contains the changed matchup.
  let changedRoundNumber: number | null = null;
  for (const round of bracket.rounds) {
    if (round.matchups.some((m) => m.id === matchupId)) {
      changedRoundNumber = round.roundNumber;
      break;
    }
  }

  if (changedRoundNumber === null || changedRoundNumber >= bracket.currentRound) {
    // Not an earlier-round change — nothing to truncate.
    return bracket;
  }

  // Blank out every round after the changed round so getCurrentRound returns the
  // changed round and reseedNextRound rebuilds them from the updated winners.
  const newRounds = bracket.rounds.map((round) => {
    if (round.roundNumber <= changedRoundNumber!) {
      return round;
    }
    return {
      ...round,
      matchups: round.matchups.map((m) => ({
        ...m,
        participant1: null,
        participant2: null,
        winner: null,
        votes1: null,
        votes2: null,
      })),
    };
  });

  return {
    ...bracket,
    rounds: newRounds,
    champion: null,
    currentRound: changedRoundNumber,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function tournamentReducer(
  state: TournamentState,
  action: TournamentAction
): TournamentState {
  switch (action.type) {
    case 'CREATE_TOURNAMENT': {
      try {
        const tournament = createTournament(
          action.payload.category,
          action.payload.bracketSize,
          action.payload.playerCount
        );
        const bracket: Bracket = {
          tournamentId: tournament.id,
          size: tournament.bracketSize,
          rounds: [],
          participants: [],
          champion: null,
          currentRound: 1,
          thirdPlaceMatch: null,
          thirdPlace: null,
          fourthPlace: null,
        };
        return {
          ...state,
          tournament,
          bracket,
          suggestions: { items: [], loading: false, error: null },
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to create tournament' },
        };
      }
    }

    case 'SET_BRACKET_SIZE': {
      if (!state.tournament) {
        return {
          ...state,
          ui: { error: 'No tournament exists. Create a tournament first.' },
        };
      }
      try {
        const updatedTournament: Tournament = {
          ...state.tournament,
          bracketSize: action.payload.size,
        };
        const bracket: Bracket = {
          tournamentId: updatedTournament.id,
          size: action.payload.size,
          rounds: [],
          participants: state.bracket?.participants ?? [],
          champion: null,
          currentRound: 1,
          thirdPlaceMatch: null,
          thirdPlace: null,
          fourthPlace: null,
        };
        return {
          ...state,
          tournament: updatedTournament,
          bracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to set bracket size' },
        };
      }
    }

    case 'SET_PLAYER_COUNT': {
      if (!state.tournament) {
        return {
          ...state,
          ui: { error: 'No tournament exists. Create a tournament first.' },
        };
      }
      // Reuse createTournament's validation rule for Player_Count (Req 11.4).
      if (!isValidPlayerCount(action.payload.playerCount)) {
        return {
          ...state,
          ui: {
            error:
              'Player count must be a whole number of 1 or more, or left empty for a classic tournament.',
          },
        };
      }
      return {
        ...state,
        tournament: {
          ...state.tournament,
          playerCount: action.payload.playerCount,
        },
        ui: { error: null },
      };
    }

    case 'ADD_PARTICIPANT': {
      if (!state.bracket) {
        return {
          ...state,
          ui: { error: 'No bracket exists. Create a tournament first.' },
        };
      }
      try {
        const updatedBracket = addParticipant(state.bracket, action.payload.name);
        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to add participant' },
        };
      }
    }

    case 'REMOVE_PARTICIPANT': {
      if (!state.bracket) {
        return {
          ...state,
          ui: { error: 'No bracket exists. Create a tournament first.' },
        };
      }
      try {
        const updatedBracket = removeParticipant(state.bracket, action.payload.id);
        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to remove participant' },
        };
      }
    }

    case 'SET_SUGGESTIONS': {
      return {
        ...state,
        suggestions: {
          items: action.payload.suggestions,
          loading: false,
          error: null,
        },
        ui: { error: null },
      };
    }

    case 'ACCEPT_SUGGESTION': {
      const updatedSuggestions = acceptSuggestion(
        state.suggestions.items,
        action.payload.suggestionId
      );
      // Also add the accepted suggestion as a participant
      const accepted = updatedSuggestions.find(
        (s) => s.id === action.payload.suggestionId
      );
      let updatedBracket = state.bracket;
      if (accepted && state.bracket) {
        try {
          updatedBracket = addParticipant(state.bracket, accepted.name);
        } catch {
          // If adding fails (duplicate, full), still update suggestion status
        }
      }
      return {
        ...state,
        bracket: updatedBracket,
        suggestions: { ...state.suggestions, items: updatedSuggestions },
        ui: { error: null },
      };
    }

    case 'ACCEPT_ALL_SUGGESTIONS': {
      // Identify the suggestions that are pending at the moment of activation —
      // only these transition to 'accepted' and get added as participants. (Req 4.10)
      const pendingIds = new Set(
        state.suggestions.items
          .filter((s) => s.status === 'pending')
          .map((s) => s.id)
      );
      const updatedSuggestions = acceptAllPending(state.suggestions.items);

      // Add each newly-accepted suggestion as a participant, tolerating individual
      // failures (bracket full, duplicate) just like ACCEPT_SUGGESTION. (Req 4.9)
      let updatedBracket = state.bracket;
      if (updatedBracket) {
        for (const suggestion of updatedSuggestions) {
          if (pendingIds.has(suggestion.id) && suggestion.status === 'accepted') {
            try {
              updatedBracket = addParticipant(updatedBracket, suggestion.name);
            } catch {
              // Skip failures (full/duplicate) — suggestion status still updates.
            }
          }
        }
      }

      return {
        ...state,
        bracket: updatedBracket,
        suggestions: { ...state.suggestions, items: updatedSuggestions },
        ui: { error: null },
      };
    }

    case 'REJECT_SUGGESTION': {
      const updatedSuggestions = rejectSuggestion(
        state.suggestions.items,
        action.payload.suggestionId
      );
      return {
        ...state,
        suggestions: { ...state.suggestions, items: updatedSuggestions },
        ui: { error: null },
      };
    }

    case 'REPLACE_SUGGESTION': {
      const updatedSuggestions = replaceSuggestion(
        state.suggestions.items,
        action.payload.suggestionId,
        action.payload.newName
      );
      // Also add the replaced suggestion as a participant, mirroring
      // ACCEPT_SUGGESTION. A valid replacement is one atomic action. (Req 4.11)
      const replaced = updatedSuggestions.find(
        (s) => s.id === action.payload.suggestionId
      );
      if (replaced && state.bracket) {
        try {
          const updatedBracket = addParticipant(state.bracket, replaced.name);
          return {
            ...state,
            bracket: updatedBracket,
            suggestions: { ...state.suggestions, items: updatedSuggestions },
            ui: { error: null },
          };
        } catch (error) {
          // Duplicate/invalid replacement: leave bracket and suggestion list
          // unchanged and surface a validation message. (Req 4.12)
          return {
            ...state,
            ui: {
              error:
                error instanceof Error
                  ? error.message
                  : "That replacement name can't be used.",
            },
          };
        }
      }
      return {
        ...state,
        suggestions: { ...state.suggestions, items: updatedSuggestions },
        ui: { error: null },
      };
    }

    case 'SELECT_WINNER': {
      if (!state.bracket || !state.tournament) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      // Manual winner selection is Classic_Mode only. In Vote_Based_Mode the
      // winner is derived from entered Votes. (Req 6.2, 11.6)
      if (getMode(state.tournament) === 'vote') {
        return {
          ...state,
          ui: { error: 'This tournament uses votes. Enter votes to decide the matchup.' },
        };
      }
      try {
        // Check if the matchup already has a winner — if so, clear downstream first
        let bracket = state.bracket;
        const matchup = bracket.rounds
          .flatMap((r) => r.matchups)
          .find((m) => m.id === action.payload.matchupId);

        if (matchup?.winner && matchup.winner.id !== action.payload.winnerId) {
          bracket = clearDownstream(bracket, action.payload.matchupId);
        }

        let updatedBracket = advanceWinner(
          bracket,
          action.payload.matchupId,
          action.payload.winnerId
        );

        // Advance the round-by-round view when the classic current round is fully
        // decided and a later round exists. Classic pairings are fixed, so no
        // re-seeding — only currentRound advances. (Req 14.3)
        const cur = getCurrentRound(updatedBracket);
        if (cur > updatedBracket.currentRound) {
          updatedBracket = { ...updatedBracket, currentRound: cur };
        }

        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to select winner' },
        };
      }
    }

    case 'ENTER_VOTES': {
      if (!state.bracket || !state.tournament) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      // Vote entry is Vote_Based_Mode only. (Req 6.2, 11.6, 12)
      if (getMode(state.tournament) !== 'vote') {
        return {
          ...state,
          ui: { error: 'This tournament is manual. Select a winner instead of entering votes.' },
        };
      }
      try {
        let bracket = enterVotes(
          state.bracket,
          action.payload.matchupId,
          action.payload.votes1,
          action.payload.votes2,
          state.tournament.playerCount!
        );

        // Re-deciding an earlier matchup discards later materialized rounds and
        // resets currentRound to the changed round. (Req 6.5, 13.6)
        bracket = truncateAfterChangedRound(bracket, action.payload.matchupId);

        // Round complete → reseed the next round and advance currentRound. (Req 13.2, 14.3)
        bracket = progressVoteRound(bracket);

        return {
          ...state,
          bracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to enter votes' },
        };
      }
    }

    case 'RESOLVE_TIE': {
      if (!state.bracket || !state.tournament) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      if (getMode(state.tournament) !== 'vote') {
        return {
          ...state,
          ui: { error: 'This tournament is manual. Select a winner instead of entering votes.' },
        };
      }
      try {
        let bracket = resolveTieRandomly(state.bracket, action.payload.matchupId);

        // Same earlier-change + round-complete flow as ENTER_VOTES. (Req 6.5, 13.6, 14.3)
        bracket = truncateAfterChangedRound(bracket, action.payload.matchupId);
        bracket = progressVoteRound(bracket);

        return {
          ...state,
          bracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to resolve tie' },
        };
      }
    }

    case 'SELECT_THIRD_PLACE_WINNER': {
      if (!state.bracket) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      try {
        const updatedBracket = advanceThirdPlaceWinner(
          state.bracket,
          action.payload.winnerId
        );
        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: {
            error:
              error instanceof Error
                ? error.message
                : 'Failed to select third-place winner',
          },
        };
      }
    }

    case 'ENTER_THIRD_PLACE_VOTES': {
      if (!state.bracket || !state.tournament) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      if (getMode(state.tournament) !== 'vote') {
        return {
          ...state,
          ui: { error: 'This tournament is manual. Select a winner instead of entering votes.' },
        };
      }
      try {
        const updatedBracket = enterThirdPlaceVotes(
          state.bracket,
          action.payload.votes1,
          action.payload.votes2,
          state.tournament.playerCount!
        );
        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: {
            error:
              error instanceof Error ? error.message : 'Failed to enter third-place votes',
          },
        };
      }
    }

    case 'RESOLVE_THIRD_PLACE_TIE': {
      if (!state.bracket || !state.tournament) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      if (!state.bracket.thirdPlaceMatch) {
        return {
          ...state,
          ui: { error: 'There is no third-place match to resolve.' },
        };
      }
      try {
        const updatedBracket = resolveTieRandomly(
          state.bracket,
          state.bracket.thirdPlaceMatch.id
        );
        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: {
            error:
              error instanceof Error ? error.message : 'Failed to resolve third-place tie',
          },
        };
      }
    }

    case 'CLEAR_DOWNSTREAM': {
      if (!state.bracket) {
        return {
          ...state,
          ui: { error: 'No bracket exists.' },
        };
      }
      try {
        const updatedBracket = clearDownstream(
          state.bracket,
          action.payload.matchupId
        );
        return {
          ...state,
          bracket: updatedBracket,
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to clear downstream' },
        };
      }
    }

    case 'GENERATE_BRACKET': {
      if (!state.tournament || !state.bracket) {
        return {
          ...state,
          ui: { error: 'No tournament exists. Create a tournament first.' },
        };
      }
      if (state.bracket.participants.length !== state.bracket.size) {
        return {
          ...state,
          ui: {
            error: `Cannot generate bracket. Need exactly ${state.bracket.size} participants (currently have ${state.bracket.participants.length}).`,
          },
        };
      }
      try {
        const generatedBracket = generateBracket(
          state.bracket.participants,
          state.bracket.size
        );
        return {
          ...state,
          bracket: {
            ...generatedBracket,
            tournamentId: state.tournament.id,
          },
          ui: { error: null },
        };
      } catch (error) {
        return {
          ...state,
          ui: { error: error instanceof Error ? error.message : 'Failed to generate bracket' },
        };
      }
    }

    case 'RESET_TOURNAMENT': {
      return { ...initialState };
    }

    case 'LOAD_STATE': {
      return {
        ...state,
        tournament: action.payload.tournament,
        bracket: action.payload.bracket,
        ui: { error: null },
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TournamentContextValue {
  state: TournamentState;
  dispatch: React.Dispatch<TournamentAction>;
}

const TournamentContext = createContext<TournamentContextValue | undefined>(
  undefined
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface TournamentProviderProps {
  children: React.ReactNode;
}

export function TournamentProvider({ children }: TournamentProviderProps) {
  const [state, dispatch] = useReducer(tournamentReducer, initialState, () => {
    // Try to load persisted state on initialization
    const persisted = loadTournament();
    if (persisted) {
      return {
        ...initialState,
        tournament: persisted.tournament,
        bracket: persisted.bracket,
      };
    }
    return initialState;
  });

  // Persist state to sessionStorage on every state change
  useEffect(() => {
    if (state.tournament && state.bracket) {
      saveTournament(state.tournament, state.bracket);
    } else {
      clearTournament();
    }
  }, [state.tournament, state.bracket]);

  return (
    <TournamentContext.Provider value={{ state, dispatch }}>
      {children}
    </TournamentContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for consuming the tournament context.
 * Must be used within a TournamentProvider.
 */
export function useTournament(): TournamentContextValue {
  const context = useContext(TournamentContext);
  if (context === undefined) {
    throw new Error('useTournament must be used within a TournamentProvider');
  }
  return context;
}
