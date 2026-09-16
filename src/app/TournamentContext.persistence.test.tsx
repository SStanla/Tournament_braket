// Integration tests for persistence wired into TournamentProvider (Task 14.2).
//
// Verifies that the provider hydrates from sessionStorage on mount (simulated
// reload, Req 23.1), persists changes back to storage, and surfaces the
// non-blocking degradation notice when storage is unavailable, all while
// keeping the current state (Req 23.4).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TournamentProvider, useTournament } from './TournamentContext';
import { PERSISTENCE_DEGRADED_NOTICE, STORAGE_KEY } from './persistence';

describe('TournamentProvider persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('persists a created tournament to sessionStorage', async () => {
    const { result } = renderHook(() => useTournament(), {
      wrapper: TournamentProvider,
    });

    act(() => {
      result.current.dispatch({
        type: 'CREATE',
        input: { category: 'Best pasta', size: 2, rngSeed: 1 },
      });
    });

    await waitFor(() => {
      expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(stored.category).toBe('Best pasta');
    expect(stored.phase).toBe('FILLING');
  });

  it('rehydrates prior state after a simulated reload (Req 23.1)', async () => {
    // First "session": create a tournament and let it persist.
    const first = renderHook(() => useTournament(), {
      wrapper: TournamentProvider,
    });
    act(() => {
      first.result.current.dispatch({
        type: 'CREATE',
        input: { category: 'Cities', size: 4, rngSeed: 3 },
      });
    });
    await waitFor(() => {
      expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
    first.unmount(); // simulate the page unloading

    // Second "session": a fresh provider mounts and should hydrate from storage.
    const second = renderHook(() => useTournament(), {
      wrapper: TournamentProvider,
    });
    expect(second.result.current.state.tournament).not.toBeNull();
    expect(second.result.current.state.tournament!.category).toBe('Cities');
    expect(second.result.current.state.tournament!.size).toBe(4);
  });

  it('surfaces a non-blocking notice and keeps state when storage is unavailable (Req 23.4)', async () => {
    // Storage exists but every write throws (e.g. private mode with zero quota).
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const { result } = renderHook(() => useTournament(), {
      wrapper: TournamentProvider,
    });

    // The startup probe fails, so the notice should appear.
    await waitFor(() => {
      expect(result.current.state.notice).toBe(PERSISTENCE_DEGRADED_NOTICE);
    });

    // The app keeps working in-memory: a create still updates state and nothing
    // is lost even though persistence failed.
    act(() => {
      result.current.dispatch({
        type: 'CREATE',
        input: { category: 'Kept in memory', size: 2, rngSeed: 1 },
      });
    });
    expect(result.current.state.tournament).not.toBeNull();
    expect(result.current.state.tournament!.category).toBe('Kept in memory');
  });
});
