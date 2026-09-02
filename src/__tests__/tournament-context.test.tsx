import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  tournamentReducer,
  initialState,
  TournamentState,
  TournamentAction,
  TournamentProvider,
  useTournament,
} from '../state/tournament-context';

// Mock persistence service
vi.mock('../services/persistence', () => ({
  saveTournament: vi.fn(),
  loadTournament: vi.fn(() => null),
  clearTournament: vi.fn(),
}));

describe('tournamentReducer', () => {
  describe('CREATE_TOURNAMENT', () => {
    it('creates a tournament with valid category and bracket size', () => {
      const action: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Best Movies', bracketSize: 8 },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.tournament).not.toBeNull();
      expect(newState.tournament!.category).toBe('Best Movies');
      expect(newState.tournament!.bracketSize).toBe(8);
      expect(newState.bracket).not.toBeNull();
      expect(newState.bracket!.size).toBe(8);
      expect(newState.ui.error).toBeNull();
    });

    it('sets error for invalid category', () => {
      const action: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: '   ', bracketSize: 8 },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.tournament).toBeNull();
      expect(newState.ui.error).toBeTruthy();
    });

    it('sets error for invalid bracket size', () => {
      const action: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 3 },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.tournament).toBeNull();
      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('SET_BRACKET_SIZE', () => {
    it('updates bracket size when tournament exists', () => {
      // First create a tournament
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 8 },
      };
      const stateWithTournament = tournamentReducer(initialState, createAction);

      const action: TournamentAction = {
        type: 'SET_BRACKET_SIZE',
        payload: { size: 16 },
      };
      const newState = tournamentReducer(stateWithTournament, action);

      expect(newState.tournament!.bracketSize).toBe(16);
      expect(newState.bracket!.size).toBe(16);
    });

    it('sets error when no tournament exists', () => {
      const action: TournamentAction = {
        type: 'SET_BRACKET_SIZE',
        payload: { size: 16 },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('ADD_PARTICIPANT', () => {
    let stateWithBracket: TournamentState;

    beforeEach(() => {
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      };
      stateWithBracket = tournamentReducer(initialState, createAction);
    });

    it('adds a participant to the bracket', () => {
      const action: TournamentAction = {
        type: 'ADD_PARTICIPANT',
        payload: { name: 'Alice' },
      };
      const newState = tournamentReducer(stateWithBracket, action);

      expect(newState.bracket!.participants).toHaveLength(1);
      expect(newState.bracket!.participants[0].name).toBe('Alice');
      expect(newState.ui.error).toBeNull();
    });

    it('sets error for duplicate participant', () => {
      const addFirst: TournamentAction = {
        type: 'ADD_PARTICIPANT',
        payload: { name: 'Alice' },
      };
      const stateWithAlice = tournamentReducer(stateWithBracket, addFirst);

      const addDuplicate: TournamentAction = {
        type: 'ADD_PARTICIPANT',
        payload: { name: 'Alice' },
      };
      const newState = tournamentReducer(stateWithAlice, addDuplicate);

      expect(newState.bracket!.participants).toHaveLength(1);
      expect(newState.ui.error).toBeTruthy();
    });

    it('sets error when no bracket exists', () => {
      const action: TournamentAction = {
        type: 'ADD_PARTICIPANT',
        payload: { name: 'Alice' },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('REMOVE_PARTICIPANT', () => {
    it('removes a participant from the bracket', () => {
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      };
      let state = tournamentReducer(initialState, createAction);

      const addAction: TournamentAction = {
        type: 'ADD_PARTICIPANT',
        payload: { name: 'Bob' },
      };
      state = tournamentReducer(state, addAction);
      const participantId = state.bracket!.participants[0].id;

      const removeAction: TournamentAction = {
        type: 'REMOVE_PARTICIPANT',
        payload: { id: participantId },
      };
      const newState = tournamentReducer(state, removeAction);

      expect(newState.bracket!.participants).toHaveLength(0);
      expect(newState.ui.error).toBeNull();
    });

    it('sets error for non-existent participant', () => {
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      };
      const state = tournamentReducer(initialState, createAction);

      const removeAction: TournamentAction = {
        type: 'REMOVE_PARTICIPANT',
        payload: { id: 'non-existent-id' },
      };
      const newState = tournamentReducer(state, removeAction);

      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('SET_SUGGESTIONS', () => {
    it('stores suggestions in state', () => {
      const suggestions = [
        { id: '1', name: 'Suggestion 1', source: 'ai' as const, status: 'pending' as const },
        { id: '2', name: 'Suggestion 2', source: 'fallback' as const, status: 'pending' as const },
      ];
      const action: TournamentAction = {
        type: 'SET_SUGGESTIONS',
        payload: { suggestions },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.suggestions.items).toHaveLength(2);
      expect(newState.suggestions.items[0].name).toBe('Suggestion 1');
      expect(newState.suggestions.loading).toBe(false);
      expect(newState.suggestions.error).toBeNull();
    });
  });

  describe('ACCEPT_SUGGESTION', () => {
    it('marks suggestion as accepted and adds as participant', () => {
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      };
      let state = tournamentReducer(initialState, createAction);

      const suggestions = [
        { id: 's1', name: 'Suggested Item', source: 'ai' as const, status: 'pending' as const },
      ];
      state = tournamentReducer(state, {
        type: 'SET_SUGGESTIONS',
        payload: { suggestions },
      });

      const acceptAction: TournamentAction = {
        type: 'ACCEPT_SUGGESTION',
        payload: { suggestionId: 's1' },
      };
      const newState = tournamentReducer(state, acceptAction);

      expect(newState.suggestions.items[0].status).toBe('accepted');
      expect(newState.bracket!.participants).toHaveLength(1);
      expect(newState.bracket!.participants[0].name).toBe('Suggested Item');
    });
  });

  describe('REJECT_SUGGESTION', () => {
    it('marks suggestion as rejected', () => {
      const suggestions = [
        { id: 's1', name: 'Rejected Item', source: 'ai' as const, status: 'pending' as const },
      ];
      let state: TournamentState = {
        ...initialState,
        suggestions: { items: suggestions, loading: false, error: null },
      };

      const action: TournamentAction = {
        type: 'REJECT_SUGGESTION',
        payload: { suggestionId: 's1' },
      };
      const newState = tournamentReducer(state, action);

      expect(newState.suggestions.items[0].status).toBe('rejected');
    });
  });

  describe('REPLACE_SUGGESTION', () => {
    it('replaces suggestion name, auto-accepts it, and adds it as a participant', () => {
      // Mirror the ACCEPT_SUGGESTION setup: a bracket with room plus suggestions.
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      };
      let state = tournamentReducer(initialState, createAction);

      const suggestions = [
        { id: 's1', name: 'Old Name', source: 'ai' as const, status: 'rejected' as const },
      ];
      state = tournamentReducer(state, {
        type: 'SET_SUGGESTIONS',
        payload: { suggestions },
      });

      const priorCount = state.bracket!.participants.length;

      const action: TournamentAction = {
        type: 'REPLACE_SUGGESTION',
        payload: { suggestionId: 's1', newName: 'New Name' },
      };
      const newState = tournamentReducer(state, action);

      expect(newState.suggestions.items[0].name).toBe('New Name');
      expect(newState.suggestions.items[0].status).toBe('accepted');
      // A valid replacement is one atomic accept — the name is added as a participant.
      expect(newState.bracket!.participants).toHaveLength(priorCount + 1);
      expect(
        newState.bracket!.participants.some((p) => p.name === 'New Name')
      ).toBe(true);
      expect(newState.ui.error).toBeNull();
    });

    it('leaves participants unchanged and sets an error for a duplicate replacement name', () => {
      const createAction: TournamentAction = {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      };
      let state = tournamentReducer(initialState, createAction);

      // Seed an existing participant that the replacement will collide with.
      state = tournamentReducer(state, {
        type: 'ADD_PARTICIPANT',
        payload: { name: 'Existing' },
      });

      const suggestions = [
        { id: 's1', name: 'Old Name', source: 'ai' as const, status: 'pending' as const },
      ];
      state = tournamentReducer(state, {
        type: 'SET_SUGGESTIONS',
        payload: { suggestions },
      });

      const priorParticipants = state.bracket!.participants;
      const priorSuggestions = state.suggestions.items;

      const newState = tournamentReducer(state, {
        type: 'REPLACE_SUGGESTION',
        payload: { suggestionId: 's1', newName: 'Existing' },
      });

      // Duplicate replacement leaves bracket + suggestions unchanged and surfaces an error.
      expect(newState.bracket!.participants).toBe(priorParticipants);
      expect(newState.suggestions.items).toBe(priorSuggestions);
      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('SELECT_WINNER', () => {
    it('sets error when no bracket exists', () => {
      const action: TournamentAction = {
        type: 'SELECT_WINNER',
        payload: { matchupId: 'm1', winnerId: 'p1' },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('CLEAR_DOWNSTREAM', () => {
    it('sets error when no bracket exists', () => {
      const action: TournamentAction = {
        type: 'CLEAR_DOWNSTREAM',
        payload: { matchupId: 'm1' },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.ui.error).toBeTruthy();
    });
  });

  describe('SELECT_THIRD_PLACE_WINNER', () => {
    // Builds a size-4 bracket via generateBracket and decides both Semifinals by
    // advancing real winners, so the third-place match is validly populated with
    // the two Semifinal losers. Returns the reducer state plus the ids needed.
    function makeStateWithDecidedSemifinals(): {
      state: TournamentState;
      thirdSlot1Id: string;
      thirdSlot2Id: string;
    } {
      let state = tournamentReducer(initialState, {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      });

      // Fill the four slots.
      for (const name of ['Alice', 'Bob', 'Charlie', 'Diana']) {
        state = tournamentReducer(state, { type: 'ADD_PARTICIPANT', payload: { name } });
      }

      // Generate the bracket structure (rounds + third-place match).
      state = tournamentReducer(state, { type: 'GENERATE_BRACKET' });

      // Decide both Semifinal matchups (round 1 for a size-4 bracket) by picking
      // participant1 of each as the winner.
      const semifinalRound = state.bracket!.rounds.find((r) => r.label === 'Semifinal')!;
      for (const matchup of semifinalRound.matchups) {
        state = tournamentReducer(state, {
          type: 'SELECT_WINNER',
          payload: { matchupId: matchup.id, winnerId: matchup.participant1!.id },
        });
      }

      const thirdMatch = state.bracket!.thirdPlaceMatch!;
      return {
        state,
        thirdSlot1Id: thirdMatch.participant1!.id,
        thirdSlot2Id: thirdMatch.participant2!.id,
      };
    }

    it('sets thirdPlace to the selected winner and fourthPlace to the other, clearing error', () => {
      const { state, thirdSlot1Id, thirdSlot2Id } = makeStateWithDecidedSemifinals();

      const newState = tournamentReducer(state, {
        type: 'SELECT_THIRD_PLACE_WINNER',
        payload: { winnerId: thirdSlot1Id },
      });

      expect(newState.bracket!.thirdPlace).not.toBeNull();
      expect(newState.bracket!.thirdPlace!.id).toBe(thirdSlot1Id);
      expect(newState.bracket!.fourthPlace).not.toBeNull();
      expect(newState.bracket!.fourthPlace!.id).toBe(thirdSlot2Id);
      expect(newState.bracket!.thirdPlaceMatch!.winner!.id).toBe(thirdSlot1Id);
      expect(newState.ui.error).toBeNull();
    });

    it('rejects selection when third-place slots are unoccupied, leaving bracket unchanged and recording an error', () => {
      // Create + generate a size-4 bracket but do NOT decide the Semifinals, so the
      // third-place match slots are still empty.
      let state = tournamentReducer(initialState, {
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Test', bracketSize: 4 },
      });
      for (const name of ['Alice', 'Bob', 'Charlie', 'Diana']) {
        state = tournamentReducer(state, { type: 'ADD_PARTICIPANT', payload: { name } });
      }
      state = tournamentReducer(state, { type: 'GENERATE_BRACKET' });

      const priorBracket = state.bracket;
      expect(priorBracket!.thirdPlaceMatch!.participant1).toBeNull();
      expect(priorBracket!.thirdPlaceMatch!.participant2).toBeNull();

      const newState = tournamentReducer(state, {
        type: 'SELECT_THIRD_PLACE_WINNER',
        payload: { winnerId: 'nonexistent' },
      });

      // Prior bracket retained unchanged on rejection.
      expect(newState.bracket).toBe(priorBracket);
      expect(newState.bracket!.thirdPlace).toBeNull();
      expect(newState.bracket!.fourthPlace).toBeNull();
      expect(newState.ui.error).toBeTruthy();
    });

    it('sets error when no bracket exists', () => {
      const newState = tournamentReducer(initialState, {
        type: 'SELECT_THIRD_PLACE_WINNER',
        payload: { winnerId: 'p1' },
      });

      expect(newState.ui.error).toBeTruthy();
    });

    it('refreshes/clears third place when a decided Semifinal winner is changed via SELECT_WINNER', () => {
      const { state, thirdSlot1Id } = makeStateWithDecidedSemifinals();

      // Record a third-place outcome first.
      const decided = tournamentReducer(state, {
        type: 'SELECT_THIRD_PLACE_WINNER',
        payload: { winnerId: thirdSlot1Id },
      });
      expect(decided.bracket!.thirdPlace).not.toBeNull();
      expect(decided.bracket!.fourthPlace).not.toBeNull();

      // Change the winner of the first Semifinal to the OTHER participant. This flows
      // through clearDownstream/advanceWinner, which refresh + clear third place.
      const semifinalRound = decided.bracket!.rounds.find((r) => r.label === 'Semifinal')!;
      const firstSemi = semifinalRound.matchups.find((m) => m.position === 0)!;
      const otherWinnerId =
        firstSemi.winner!.id === firstSemi.participant1!.id
          ? firstSemi.participant2!.id
          : firstSemi.participant1!.id;

      const changed = tournamentReducer(decided, {
        type: 'SELECT_WINNER',
        payload: { matchupId: firstSemi.id, winnerId: otherWinnerId },
      });

      // The recorded third/fourth placements are cleared and the match winner reset.
      expect(changed.bracket!.thirdPlace).toBeNull();
      expect(changed.bracket!.fourthPlace).toBeNull();
      expect(changed.bracket!.thirdPlaceMatch!.winner).toBeNull();
      expect(changed.ui.error).toBeNull();
    });
  });

  describe('LOAD_STATE', () => {
    it('loads persisted tournament and bracket', () => {
      const tournament = {
        id: 'test-id',
        category: 'Loaded Category',
        bracketSize: 8,
        createdAt: Date.now(),
      };
      const bracket = {
        tournamentId: 'test-id',
        size: 8,
        rounds: [],
        participants: [],
        champion: null,
      };

      const action: TournamentAction = {
        type: 'LOAD_STATE',
        payload: { tournament, bracket },
      };
      const newState = tournamentReducer(initialState, action);

      expect(newState.tournament).toEqual(tournament);
      expect(newState.bracket).toEqual(bracket);
    });
  });
});

describe('TournamentProvider and useTournament', () => {
  it('provides state and dispatch via context', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TournamentProvider>{children}</TournamentProvider>
    );

    const { result } = renderHook(() => useTournament(), { wrapper });

    expect(result.current.state).toBeDefined();
    expect(result.current.state.tournament).toBeNull();
    expect(result.current.dispatch).toBeInstanceOf(Function);
  });

  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => useTournament());
    }).toThrow('useTournament must be used within a TournamentProvider');
  });

  it('allows dispatching actions through context', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TournamentProvider>{children}</TournamentProvider>
    );

    const { result } = renderHook(() => useTournament(), { wrapper });

    act(() => {
      result.current.dispatch({
        type: 'CREATE_TOURNAMENT',
        payload: { category: 'Music', bracketSize: 8 },
      });
    });

    expect(result.current.state.tournament).not.toBeNull();
    expect(result.current.state.tournament!.category).toBe('Music');
  });
});
