// Tests for the TournamentProvider / useTournament hook (Task 14.1). Verifies
// the context exposes reducer state and dispatch, and that dispatching a
// user-intent action updates the shared state.

import { describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { TournamentProvider, useTournament } from './TournamentContext';

describe('TournamentProvider / useTournament', () => {
  it('starts with no tournament (CREATE screen) and updates on CREATE dispatch', () => {
    const { result } = renderHook(() => useTournament(), {
      wrapper: TournamentProvider,
    });

    expect(result.current.state.tournament).toBeNull();

    act(() => {
      result.current.dispatch({
        type: 'CREATE',
        input: { category: 'Best pasta', size: 2, rngSeed: 1 },
      });
    });

    expect(result.current.state.tournament).not.toBeNull();
    expect(result.current.state.tournament!.phase).toBe('FILLING');
  });

  it('NEW_TOURNAMENT resets shared state back to the CREATE screen', () => {
    const { result } = renderHook(() => useTournament(), {
      wrapper: TournamentProvider,
    });

    act(() => {
      result.current.dispatch({
        type: 'CREATE',
        input: { category: 'X', size: 2, rngSeed: 1 },
      });
    });
    expect(result.current.state.tournament).not.toBeNull();

    act(() => {
      result.current.dispatch({ type: 'NEW_TOURNAMENT' });
    });
    expect(result.current.state.tournament).toBeNull();
  });

  it('throws when useTournament is used outside a provider', () => {
    function Consumer() {
      useTournament();
      return null;
    }
    // Suppress the expected React error boundary logging noise.
    const spy = () => render(<Consumer />);
    expect(spy).toThrow(/must be used within a TournamentProvider/);
    // Ensure nothing rendered.
    expect(screen.queryByText(/./)).toBeNull();
  });
});
