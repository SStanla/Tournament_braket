// Application layer — React context, provider, and hook exposing the tournament
// reducer to the UI (Task 14.1, design.md "State management": a single reducer
// wrapped in useReducer and exposed through a React context).
//
// The provider owns the reducer state and dispatch; every screen reads state
// and dispatches user-intent actions through the `useTournament` hook. This
// keeps the reducer the single mutation path (correctness properties enforced
// structurally).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  tournamentReducer,
  type AppState,
  type TournamentAction,
} from './tournamentReducer';
import {
  PERSISTENCE_DEGRADED_NOTICE,
  isStorageAvailable,
  loadState,
  usePersistence,
} from './persistence';

/** The value exposed by the tournament context: current state and dispatch. */
export interface TournamentContextValue {
  state: AppState;
  dispatch: Dispatch<TournamentAction>;
}

const TournamentContext = createContext<TournamentContextValue | undefined>(
  undefined,
);

/** Props for {@link TournamentProvider}. */
export interface TournamentProviderProps {
  children: ReactNode;
  /** Optional initial state, primarily for tests / hydration (Task 14.2). */
  initialState?: AppState;
}

/**
 * Provides the tournament reducer state and dispatch to its subtree via
 * `useReducer`. All tournament mutations happen through the reducer, so the
 * whole app shares one source of truth.
 *
 * On mount the initial state is hydrated from `sessionStorage` so a reload
 * restores the previous tournament (Req 23.1). When an explicit `initialState`
 * prop is supplied (tests / injected hydration) it takes precedence and no
 * read from storage happens. After mount {@link usePersistence} serializes each
 * change back to storage and, if storage is unavailable or throws, dispatches a
 * non-blocking degradation notice so the app keeps working in-memory with
 * nothing lost (Req 23.4).
 */
export function TournamentProvider({
  children,
  initialState,
}: TournamentProviderProps) {
  // Hydrate lazily from storage when no explicit initial state is provided, so
  // the potentially-throwing read runs at most once and outside render output.
  const [state, dispatch] = useReducer(
    tournamentReducer,
    initialState,
    (provided) => provided ?? loadState(),
  );

  // Dispatch the non-blocking notice that data might not be saved (Req 23.4).
  // Stable identity so it can be an effect dependency without re-running.
  const notifyDegraded = useCallback(() => {
    dispatch({
      type: 'PERSISTENCE_DEGRADED',
      message: PERSISTENCE_DEGRADED_NOTICE,
    });
  }, []);

  // Probe storage once on mount. If it is unusable we surface the notice up
  // front rather than waiting for the first failed write (Req 23.4). Skipped
  // when an explicit initial state was injected (tests / hydration).
  useEffect(() => {
    if (initialState === undefined && !isStorageAvailable()) {
      notifyDegraded();
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePersistence(state.tournament, notifyDegraded);

  const value = useMemo<TournamentContextValue>(
    () => ({ state, dispatch }),
    [state],
  );
  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
}

/**
 * Access the tournament state and dispatch. Must be called from within a
 * {@link TournamentProvider}; throws otherwise so misuse is caught early.
 */
export function useTournament(): TournamentContextValue {
  const context = useContext(TournamentContext);
  if (context === undefined) {
    throw new Error('useTournament must be used within a TournamentProvider');
  }
  return context;
}
