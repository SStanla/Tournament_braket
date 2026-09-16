// Component tests for the ClassicMatchup body (Task 22.1).
//
// Covers the classic-mode matchup requirements:
//  - The two options are presented as two selectable buttons (Req 15.1).
//  - Clicking an option highlights it as the provisional winner (Req 15.2).
//  - The highlighted option becomes the recorded winner only on Next, via the
//    shell's confirm-on-Next path (Req 15.3) — tested by wiring ClassicMatchup
//    inside the real PlayScreen shell.
//  - No vote-related control appears in classic mode (Req 15.4).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassicMatchup from './ClassicMatchup';
import PlayScreen from './PlayScreen';
import { TournamentProvider, useTournament } from '../app/TournamentContext';
import {
  initialAppState,
  tournamentReducer,
  type AppState,
  type TournamentAction,
} from '../app/tournamentReducer';

/** Apply a sequence of actions to build a specific starting state. */
function run(state: AppState, actions: TournamentAction[]): AppState {
  return actions.reduce(tournamentReducer, state);
}

/**
 * Build a generated (PLAYING) classic tournament of the given size via the real
 * reducer + domain path, so the state under test is exactly what the app
 * produces. Size 4 gives a two-matchup first round for advance assertions.
 */
function playingClassic(size: 2 | 4, seed = 7): AppState {
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'].slice(0, size);
  return run(initialAppState, [
    { type: 'CREATE', input: { category: 'Test', size, rngSeed: seed } },
    ...names.map((name) => ({ type: 'ADD_OPTION' as const, name })),
    { type: 'GENERATE' },
  ]);
}

/** Render ClassicMatchup inside PlayScreen with a probe exposing shared state. */
function renderInShell(initialState: AppState) {
  let latest: AppState | null = null;
  function StateProbe() {
    latest = useTournament().state;
    return null;
  }
  render(
    <TournamentProvider initialState={initialState}>
      <PlayScreen renderMatchup={(matchup) => <ClassicMatchup matchup={matchup} />} />
      <StateProbe />
    </TournamentProvider>,
  );
  return { getState: () => latest as AppState };
}

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
});

describe('ClassicMatchup', () => {
  it('presents the two options as two selectable buttons (Req 15.1)', () => {
    const state = playingClassic(4);
    const first = state.tournament!.rounds[0].matchups[0];
    renderInShell(state);

    const buttonA = screen.getByRole('button', { name: first.optionA!.name });
    const buttonB = screen.getByRole('button', { name: first.optionB!.name });
    expect(buttonA).toBeInTheDocument();
    expect(buttonB).toBeInTheDocument();
  });

  it('highlights the clicked option as the provisional winner (Req 15.2)', async () => {
    const user = userEvent.setup();
    const state = playingClassic(4);
    const first = state.tournament!.rounds[0].matchups[0];
    const { getState } = renderInShell(state);

    const buttonA = screen.getByRole('button', { name: first.optionA!.name });
    const buttonB = screen.getByRole('button', { name: first.optionB!.name });

    // Nothing selected initially.
    expect(buttonA).toHaveAttribute('aria-pressed', 'false');
    expect(buttonB).toHaveAttribute('aria-pressed', 'false');

    await user.click(buttonA);

    // The provisional winner is recorded on the matchup and reflected in the UI,
    // but no permanent winner is committed yet (Req 15.2, 14.1).
    expect(getState().tournament!.rounds[0].matchups[0].provisionalWinnerId).toBe(
      first.optionA!.id,
    );
    expect(getState().tournament!.rounds[0].matchups[0].winner).toBeUndefined();
    expect(buttonA).toHaveAttribute('aria-pressed', 'true');
    expect(buttonB).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves the highlight when a different option is selected (Req 15.2)', async () => {
    const user = userEvent.setup();
    const state = playingClassic(4);
    const first = state.tournament!.rounds[0].matchups[0];
    renderInShell(state);

    const buttonA = screen.getByRole('button', { name: first.optionA!.name });
    const buttonB = screen.getByRole('button', { name: first.optionB!.name });

    await user.click(buttonA);
    expect(buttonA).toHaveAttribute('aria-pressed', 'true');

    await user.click(buttonB);
    expect(buttonA).toHaveAttribute('aria-pressed', 'false');
    expect(buttonB).toHaveAttribute('aria-pressed', 'true');
  });

  it('records the highlighted option as the winner only on Next (Req 15.3)', async () => {
    const user = userEvent.setup();
    const state = playingClassic(4);
    const first = state.tournament!.rounds[0].matchups[0];
    const { getState } = renderInShell(state);

    await user.click(screen.getByRole('button', { name: first.optionA!.name }));

    // Not committed before confirming with Next.
    expect(getState().tournament!.rounds[0].matchups[0].winner).toBeUndefined();

    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // Now the highlighted option is recorded as the winner (Req 15.3).
    expect(getState().tournament!.rounds[0].matchups[0].winner?.id).toBe(
      first.optionA!.id,
    );
  });

  it('shows no vote-related control in classic mode (Req 15.4)', () => {
    renderInShell(playingClassic(4));

    // No slider (vote-based control) is present.
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    // No vote wording surfaces in the classic body.
    expect(screen.queryByText(/vote/i)).not.toBeInTheDocument();
  });

  it('renders a neutral placeholder for an empty slot without crashing', () => {
    const state = playingClassic(4);
    // Simulate a matchup with an empty second slot.
    const tournament = state.tournament!;
    const matchup = { ...tournament.rounds[0].matchups[0], optionB: undefined };
    render(
      <TournamentProvider initialState={state}>
        <ClassicMatchup matchup={matchup} />
      </TournamentProvider>,
    );
    // The present option still renders as a button.
    expect(
      screen.getByRole('button', { name: matchup.optionA!.name }),
    ).toBeInTheDocument();
  });
});
