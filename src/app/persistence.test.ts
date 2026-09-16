// Tests for the sessionStorage persistence adapter (Task 14.2).
//
// Covers rehydration after a simulated reload (Req 23.1) and graceful
// degradation when sessionStorage is unavailable or throws (Req 23.4). The
// jsdom environment provides a real `sessionStorage`; individual tests stub or
// spy on it to simulate failure without affecting the others.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERSISTENCE_DEGRADED_NOTICE,
  STORAGE_KEY,
  isStorageAvailable,
  loadState,
  saveState,
} from './persistence';
import { createTournament } from '../domain/tournament';
import type { Tournament } from '../domain/model';

function makeTournament(): Tournament {
  const base = createTournament({ category: 'Best pasta', size: 4, rngSeed: 7 });
  // Add a couple of options so the round-trip carries real nested data.
  return {
    ...base,
    options: [
      { id: 'a', name: 'Fusilli' },
      { id: 'b', name: 'Penne' },
    ],
  };
}

describe('persistence adapter', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('save/load round-trip (rehydration after reload)', () => {
    it('restores the exact tournament after a simulated reload (Req 23.1)', () => {
      const tournament = makeTournament();

      // Save (as happens after each change), then "reload" by reading fresh.
      const ok = saveState(tournament);
      expect(ok).toBe(true);

      const hydrated = loadState();
      expect(hydrated.tournament).toEqual(tournament);
    });

    it('persists under a single sessionStorage key (design "Persistence Shape")', () => {
      const tournament = makeTournament();
      saveState(tournament);
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(tournament),
      );
    });

    it('returns the fresh CREATE state when nothing is stored', () => {
      const hydrated = loadState();
      expect(hydrated.tournament).toBeNull();
    });

    it('clears the stored value when saving a null tournament', () => {
      saveState(makeTournament());
      expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

      const ok = saveState(null);
      expect(ok).toBe(true);
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(loadState().tournament).toBeNull();
    });

    it('falls back to the CREATE state when stored JSON is corrupt', () => {
      sessionStorage.setItem(STORAGE_KEY, '{not valid json');
      const hydrated = loadState();
      expect(hydrated.tournament).toBeNull();
    });
  });

  describe('graceful degradation when storage throws (Req 23.4)', () => {
    it('saveState returns false when setItem throws, without throwing', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      let ok: boolean | undefined;
      expect(() => {
        ok = saveState(makeTournament());
      }).not.toThrow();
      expect(ok).toBe(false);
    });

    it('loadState returns the CREATE state when getItem throws, without throwing', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });

      let hydrated;
      expect(() => {
        hydrated = loadState();
      }).not.toThrow();
      expect(hydrated!.tournament).toBeNull();
    });

    it('isStorageAvailable returns false when a probe write throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(isStorageAvailable()).toBe(false);
    });

    it('isStorageAvailable returns true when storage works', () => {
      expect(isStorageAvailable()).toBe(true);
    });

    it('exposes a non-blocking degradation notice message', () => {
      expect(PERSISTENCE_DEGRADED_NOTICE).toMatch(/might not be saved/i);
    });
  });
});
