import type { Tournament, Bracket } from '../types/index';

const STORAGE_KEY = 'tournament-bracket-state';

/**
 * In-memory fallback when sessionStorage is unavailable or full.
 */
let memoryFallback: { tournament: Tournament; bracket: Bracket } | null = null;
let useMemoryFallback = false;

/**
 * Check if sessionStorage is available and working.
 */
function isSessionStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    sessionStorage.setItem(testKey, 'test');
    sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize and save tournament and bracket state to sessionStorage.
 * Falls back to in-memory storage on error.
 */
export function saveTournament(tournament: Tournament, bracket: Bracket): void {
  const data = { tournament, bracket };

  if (useMemoryFallback || !isSessionStorageAvailable()) {
    useMemoryFallback = true;
    memoryFallback = data;
    return;
  }

  try {
    const serialized = JSON.stringify(data);
    sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    // Handle QuotaExceededError or other storage failures
    console.warn('sessionStorage save failed, using in-memory fallback:', error);
    useMemoryFallback = true;
    memoryFallback = data;
  }
}

/**
 * Load tournament and bracket state from sessionStorage.
 * Returns null if no data exists or deserialization fails.
 */
export function loadTournament(): { tournament: Tournament; bracket: Bracket } | null {
  if (useMemoryFallback) {
    return memoryFallback;
  }

  try {
    const serialized = sessionStorage.getItem(STORAGE_KEY);
    if (serialized === null) {
      return null;
    }

    const data = JSON.parse(serialized);

    // Basic structure validation
    if (
      data &&
      typeof data === 'object' &&
      data.tournament &&
      typeof data.tournament.id === 'string' &&
      typeof data.tournament.category === 'string' &&
      typeof data.tournament.bracketSize === 'number' &&
      data.bracket &&
      typeof data.bracket.tournamentId === 'string' &&
      typeof data.bracket.size === 'number' &&
      Array.isArray(data.bracket.rounds) &&
      Array.isArray(data.bracket.participants)
    ) {
      return data as { tournament: Tournament; bracket: Bracket };
    }

    // Invalid structure — remove corrupted data
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch (error) {
    // Parse error or storage access error
    console.warn('sessionStorage load failed:', error);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore removal failure
    }
    return null;
  }
}

/**
 * Clear tournament data from sessionStorage.
 */
export function clearTournament(): void {
  memoryFallback = null;

  if (useMemoryFallback) {
    return;
  }

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('sessionStorage clear failed:', error);
  }
}

/**
 * Reset the fallback state (useful for testing).
 */
export function _resetFallbackState(): void {
  memoryFallback = null;
  useMemoryFallback = false;
}

/**
 * Force the service into memory-fallback mode (useful for testing).
 */
export function _forceMemoryFallback(): void {
  useMemoryFallback = true;
}

/**
 * Check if the service is currently using the in-memory fallback.
 */
export function isUsingMemoryFallback(): boolean {
  return useMemoryFallback;
}
