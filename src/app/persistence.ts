// Application layer — sessionStorage persistence adapter (Task 14.2).
//
// A thin, framework-light adapter that serializes the tournament to
// `sessionStorage` after each change and hydrates it on load (design.md
// "Persistence Shape": the entire Tournament is serialized under a single key).
//
// `sessionStorage` matches the retention semantics exactly: it survives a page
// reload within the same tab (Req 23.1) and is discarded when the tab/window
// closes (Req 23.2); no long-term or cross-device storage is used (Req 23.3).
//
// Every access to `sessionStorage` is wrapped in try/catch because the API can
// be unavailable or throw (private-mode quota errors, disabled storage, a
// sandboxed frame). When that happens the adapter reports failure and the app
// continues in-memory with a non-blocking notice, without discarding the
// current state (Req 23.4).

import { useEffect, useRef } from 'react';
import type { Tournament } from '../domain/model';
import { initialAppState, type AppState } from './tournamentReducer';

/** The single sessionStorage key under which the tournament is persisted. */
export const STORAGE_KEY = 'tournament-bracket-creator:state';

/** Non-blocking notice shown when persistence is unavailable (Req 23.4). */
export const PERSISTENCE_DEGRADED_NOTICE =
  'Storage is unavailable, so your tournament might not be saved. You can keep going in this tab.';

/**
 * Return the session storage object, or `null` if it cannot be used.
 *
 * Merely referencing `window.sessionStorage` can throw in some environments
 * (e.g. a sandboxed iframe or when storage is disabled), so the access itself
 * is guarded. Returning `null` lets callers degrade gracefully (Req 23.4).
 */
function getSessionStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const storage = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/**
 * Probe whether `sessionStorage` is actually usable by performing a round-trip
 * write/read/remove with a throwaway key. This catches environments where the
 * object exists but every operation throws (e.g. quota is zero), so the app can
 * decide up front whether to show the degradation notice (Req 23.4).
 */
export function isStorageAvailable(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  try {
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist the given tournament (or clear the stored value when `null`) to
 * `sessionStorage`. Only the `tournament` slice of {@link AppState} is stored;
 * transient UI fields (`lastError`, `notice`) are intentionally not persisted.
 *
 * Returns `true` on success and `false` when storage was unavailable or threw,
 * so the caller can surface the non-blocking notice without losing state
 * (Req 23.4).
 */
export function saveState(tournament: Tournament | null): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  try {
    if (tournament === null) {
      storage.removeItem(STORAGE_KEY);
    } else {
      storage.setItem(STORAGE_KEY, JSON.stringify(tournament));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and rehydrate the persisted application state from `sessionStorage`.
 *
 * Returns the fresh {@link initialAppState} when there is nothing stored, when
 * storage is unavailable, or when the stored value cannot be parsed — in every
 * case hydration must not throw, so a corrupt or missing entry simply starts a
 * clean session (Req 23.1, 23.4). A successfully parsed tournament is restored
 * verbatim, reproducing exact state after a reload.
 */
export function loadState(): AppState {
  const storage = getSessionStorage();
  if (!storage) return { ...initialAppState };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { ...initialAppState };
    const tournament = JSON.parse(raw) as Tournament;
    // A stored `null` (explicitly persisted "no tournament") or any non-object
    // is treated as the CREATE screen.
    if (tournament === null || typeof tournament !== 'object') {
      return { ...initialAppState };
    }
    return { tournament };
  } catch {
    return { ...initialAppState };
  }
}

/**
 * React hook that keeps `sessionStorage` in sync with the current app state.
 *
 * After every change to `state.tournament` it serializes the new value. If a
 * write fails — or storage was unavailable to begin with — it invokes
 * `onDegraded` exactly once so the provider can surface the non-blocking
 * "data might not be saved" notice, while the app keeps running in-memory
 * (Req 23.4). Persisting only reacts to `tournament` changes, so transient
 * notices do not trigger redundant writes.
 */
export function usePersistence(
  tournament: Tournament | null,
  onDegraded: () => void,
): void {
  // Keep the latest callback in a ref so the effect can depend solely on
  // `tournament` (persisting only reacts to state changes, not to a new
  // callback identity on every render).
  const onDegradedRef = useRef(onDegraded);
  onDegradedRef.current = onDegraded;

  useEffect(() => {
    const ok = saveState(tournament);
    // Re-notify whenever a write fails. The provider's notice is idempotent, so
    // re-surfacing it after a successful transition (which clears transient
    // messages) keeps the "might not be saved" notice visible while storage
    // stays unavailable (Req 23.4), without spamming redundant updates.
    if (!ok) onDegradedRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament]);
}
