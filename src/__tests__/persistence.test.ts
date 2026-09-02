import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveTournament,
  loadTournament,
  clearTournament,
  _resetFallbackState,
  _forceMemoryFallback,
  isUsingMemoryFallback,
} from '../services/persistence';
import type { Tournament, Bracket } from '../types/index';

function createMockTournament(): Tournament {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    category: 'Best pizza toppings',
    bracketSize: 4,
    createdAt: Date.now(),
  };
}

function createMockBracket(): Bracket {
  return {
    tournamentId: '123e4567-e89b-12d3-a456-426614174000',
    size: 4,
    rounds: [
      {
        roundNumber: 1,
        label: 'Semifinal',
        matchups: [
          {
            id: 'matchup-1',
            roundNumber: 1,
            position: 0,
            participant1: { id: 'p1', name: 'Pepperoni', source: 'manual', seed: 0 },
            participant2: { id: 'p2', name: 'Mushroom', source: 'manual', seed: 1 },
            winner: null,
            nextMatchupId: 'matchup-3',
          },
          {
            id: 'matchup-2',
            roundNumber: 1,
            position: 1,
            participant1: { id: 'p3', name: 'Olives', source: 'suggestion', seed: 2 },
            participant2: { id: 'p4', name: 'Basil', source: 'suggestion', seed: 3 },
            winner: null,
            nextMatchupId: 'matchup-3',
          },
        ],
      },
      {
        roundNumber: 2,
        label: 'Final',
        matchups: [
          {
            id: 'matchup-3',
            roundNumber: 2,
            position: 0,
            participant1: null,
            participant2: null,
            winner: null,
            nextMatchupId: null,
          },
        ],
      },
    ],
    participants: [
      { id: 'p1', name: 'Pepperoni', source: 'manual', seed: 0 },
      { id: 'p2', name: 'Mushroom', source: 'manual', seed: 1 },
      { id: 'p3', name: 'Olives', source: 'suggestion', seed: 2 },
      { id: 'p4', name: 'Basil', source: 'suggestion', seed: 3 },
    ],
    champion: null,
  };
}

describe('persistence service', () => {
  beforeEach(() => {
    sessionStorage.clear();
    _resetFallbackState();
  });

  describe('saveTournament', () => {
    it('saves tournament and bracket to sessionStorage', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      saveTournament(tournament, bracket);

      const stored = sessionStorage.getItem('tournament-bracket-state');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.tournament.id).toBe(tournament.id);
      expect(parsed.bracket.tournamentId).toBe(bracket.tournamentId);
    });

    it('falls back to memory when sessionStorage throws', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      // Simulate storage full error
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      saveTournament(tournament, bracket);

      expect(isUsingMemoryFallback()).toBe(true);

      // Should still be loadable via memory fallback
      const loaded = loadTournament();
      expect(loaded).not.toBeNull();
      expect(loaded!.tournament.id).toBe(tournament.id);

      setItemSpy.mockRestore();
    });

    it('uses memory fallback for subsequent saves once activated', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      _forceMemoryFallback();
      saveTournament(tournament, bracket);

      // sessionStorage should NOT have been written
      expect(sessionStorage.getItem('tournament-bracket-state')).toBeNull();
      expect(isUsingMemoryFallback()).toBe(true);
    });
  });

  describe('loadTournament', () => {
    it('returns null when no data is stored', () => {
      expect(loadTournament()).toBeNull();
    });

    it('loads and parses valid stored data', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      saveTournament(tournament, bracket);
      const loaded = loadTournament();

      expect(loaded).not.toBeNull();
      expect(loaded!.tournament).toEqual(tournament);
      expect(loaded!.bracket).toEqual(bracket);
    });

    it('returns null and clears invalid JSON', () => {
      sessionStorage.setItem('tournament-bracket-state', 'not-json{{{');
      const loaded = loadTournament();
      expect(loaded).toBeNull();
      expect(sessionStorage.getItem('tournament-bracket-state')).toBeNull();
    });

    it('returns null and clears data with invalid structure', () => {
      sessionStorage.setItem(
        'tournament-bracket-state',
        JSON.stringify({ tournament: { id: 123 }, bracket: {} })
      );
      const loaded = loadTournament();
      expect(loaded).toBeNull();
      expect(sessionStorage.getItem('tournament-bracket-state')).toBeNull();
    });

    it('returns memory fallback data when in fallback mode', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      _forceMemoryFallback();
      saveTournament(tournament, bracket);

      const loaded = loadTournament();
      expect(loaded).not.toBeNull();
      expect(loaded!.tournament.category).toBe('Best pizza toppings');
    });
  });

  describe('clearTournament', () => {
    it('removes data from sessionStorage', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      saveTournament(tournament, bracket);
      expect(sessionStorage.getItem('tournament-bracket-state')).not.toBeNull();

      clearTournament();
      expect(sessionStorage.getItem('tournament-bracket-state')).toBeNull();
    });

    it('clears memory fallback data', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      _forceMemoryFallback();
      saveTournament(tournament, bracket);
      expect(loadTournament()).not.toBeNull();

      clearTournament();
      expect(loadTournament()).toBeNull();
    });

    it('handles sessionStorage errors gracefully', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      expect(() => clearTournament()).not.toThrow();

      removeItemSpy.mockRestore();
    });
  });

  describe('round-trip integrity', () => {
    it('preserves all tournament fields through save/load cycle', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      saveTournament(tournament, bracket);
      const loaded = loadTournament();

      expect(loaded!.tournament).toEqual(tournament);
    });

    it('preserves all bracket fields through save/load cycle', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      saveTournament(tournament, bracket);
      const loaded = loadTournament();

      expect(loaded!.bracket).toEqual(bracket);
    });

    it('preserves participant source field through round-trip', () => {
      const tournament = createMockTournament();
      const bracket = createMockBracket();

      saveTournament(tournament, bracket);
      const loaded = loadTournament();

      expect(loaded!.bracket.participants[0].source).toBe('manual');
      expect(loaded!.bracket.participants[2].source).toBe('suggestion');
    });
  });
});
