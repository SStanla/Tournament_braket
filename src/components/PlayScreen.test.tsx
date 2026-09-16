// Component tests for the PlayScreen shell and navigation (Task 21).
//
// Covers the three behaviors called out by the task:
//  1. One matchup at a time — exactly one matchup of the current round is
//     shown, never a future round's matchup (Req 13.1, 13.2).
//  2. The "Matchup X of N" position indicator, where N is the number of
//     matchups in the current round (Req 13.4).
//  3. Confirm-before-record on the last matchup: recording the last matchup of
//     a round happens only when the user confirms with Next, which then moves
//     to the next round (Req 14.2, 14.4).
// Plus the stage label (Req 13.3), Previous/Next controls (Req 13.5), and the
// spaced "vs" separator (Req 13.6).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayScreen from './PlayScreen';
import {
  TournamentProvider,
  useTournament,
} from '../app/TournamentContext';
import {
  initialAppState,
  tournamentReducer,
  type AppState,
  type TournamentAction,
} from '../app/tournamentReducer';
import type { Matchup } from '../domain/model';

/** Apply a sequence of actions to build a specific starting state. */
function run(state: AppState, actions: TournamentAction[]): AppState {
  return actions.reduce(tournamentReducer, state);
}

/**
 * Build a generated (PLAYING) classic tournament of the given size using the
 * real reducer + domain path, so the state under test is exactly what the app
 * produces. `size` 4 gives a two-matchup first round for the X-of-N assertions.
 */
function playingClassic(size: 2 | 4, seed = 7): AppState {
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'].slice(0, size);
  return run(initialAppState, [
    { type: 'CREATE', input: { category: 'Test', size, rngSeed: seed } },
    ...names.map((name) => ({ type: 'ADD_OPTION' as const, name })),
    { type: 'GENERATE' },
  ]);
}

/**
 * Render PlayScreen inside a provider with an injected initial state, exposing
 * the shared state so tests can assert reducer effects. A simple `renderMatchup`
 * slot renders each option as a selectable button and dispatches a provisional
 * winner, standing in for the Task 22 classic body.
 */
function renderPlayScreen(initialState: AppState) {
  let latest: AppState | null = null;
  function StateProbe() {
    latest = useTournament().state;
    return null;
  }
  function Body({ matchup }: { matchup: Matchup }) {
    const { dispatch } = useTournament();
    return (
      <div>
        {[matchup.optionA, matchup.optionB].map((option) =>
          option ? (
            <button
              key={option.id}
              type="button"
              aria-pressed={matchup.provisionalWinnerId === option.id}
              onClick={() =>
                dispatch({
                  type: 'SET_PROVISIONAL',
                  matchupId: matchup.id,
                  choice: { optionId: option.id },
                })
              }
            >
              {option.name}
            </button>
          ) : null,
        )}
      </div>
    );
  }
  render(
    <TournamentProvider initialState={initialState}>
      <PlayScreen renderMatchup={(matchup) => <Body matchup={matchup} />} />
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

describe('PlayScreen shell', () => {
  it('shows the current round stage label at the top (Req 13.3)', () => {
    renderPlayScreen(playingClassic(4));
    // A size-4 first round contests 4 options => "Semifinal".
    expect(
      screen.getByRole('heading', { name: /semifinal/i }),
    ).toBeInTheDocument();
  });

  it('shows exactly one matchup of the current round at a time (Req 13.1, 13.2)', () => {
    const state = playingClassic(4);
    const round = state.tournament!.rounds[0];
    const firstMatchup = round.matchups[0];
    renderPlayScreen(state);

    // The first matchup's two options are visible.
    expect(
      screen.getByRole('button', { name: firstMatchup.optionA!.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: firstMatchup.optionB!.name }),
    ).toBeInTheDocument();

    // The second (still-current-round) matchup is NOT shown yet, and no
    // future-round option leaks in: only two option buttons are rendered.
    const secondMatchup = round.matchups[1];
    expect(
      screen.queryByRole('button', { name: secondMatchup.optionA!.name }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: secondMatchup.optionB!.name }),
    ).not.toBeInTheDocument();
  });

  it('shows "Matchup X of N" for the current round (Req 13.4)', async () => {
    const user = userEvent.setup();
    renderPlayScreen(playingClassic(4)); // 2 matchups in round 0

    expect(screen.getByText(/matchup 1 of 2/i)).toBeInTheDocument();

    // Next (no provisional choice) simply moves within the round to matchup 2.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/matchup 2 of 2/i)).toBeInTheDocument();
  });

  it('renders the two options around a spaced "vs" separator by default (Req 13.6)', () => {
    // No renderMatchup slot => the shell's own default versus layout is used.
    render(
      <TournamentProvider initialState={playingClassic(4)}>
        <PlayScreen />
      </TournamentProvider>,
    );
    expect(screen.getByText(/^vs$/i)).toBeInTheDocument();
  });

  it('disables Previous on the first matchup and enables it after moving (Req 13.5)', async () => {
    const user = userEvent.setup();
    renderPlayScreen(playingClassic(4));

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
  });
});

describe('PlayScreen confirm-before-record on the last matchup', () => {
  it('records the last matchup only on Next, then advances the round (Req 14.2, 14.4)', async () => {
    const user = userEvent.setup();
    const { getState } = renderPlayScreen(playingClassic(4));

    // Decide matchup 1, move to matchup 2 (the last of round 0).
    const round0 = getState().tournament!.rounds[0];
    await user.click(
      screen.getByRole('button', { name: round0.matchups[0].optionA!.name }),
    );
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // Now on the last matchup of the round. Pick a provisional winner.
    expect(screen.getByText(/matchup 2 of 2/i)).toBeInTheDocument();
    const lastMatchup = getState().tournament!.rounds[0].matchups[1];
    await user.click(
      screen.getByRole('button', { name: lastMatchup.optionA!.name }),
    );

    // Nothing is recorded yet: still in round 0, matchup 2, no winner (Req 14.1).
    expect(getState().tournament!.currentRoundIndex).toBe(0);
    expect(
      getState().tournament!.rounds[0].matchups[1].winner,
    ).toBeUndefined();

    // Confirm with Next: the choice is recorded AND the round advances (Req 14.4).
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(
      getState().tournament!.rounds[0].matchups[1].winner?.id,
    ).toBe(lastMatchup.optionA!.id);
    expect(getState().tournament!.currentRoundIndex).toBe(1);
    expect(getState().tournament!.currentMatchupIndex).toBe(0);
  });

  it('does not advance the round while an earlier matchup is undecided (Req 18.5)', async () => {
    const user = userEvent.setup();
    const { getState } = renderPlayScreen(playingClassic(4));

    // Skip matchup 1 undecided; go to matchup 2 and decide only it.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/matchup 2 of 2/i)).toBeInTheDocument();

    const lastMatchup = getState().tournament!.rounds[0].matchups[1];
    await user.click(
      screen.getByRole('button', { name: lastMatchup.optionA!.name }),
    );
    // Confirm the last matchup, but matchup 1 is still undecided.
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // The last matchup is recorded, but the round does NOT advance (Req 18.5).
    expect(
      getState().tournament!.rounds[0].matchups[1].winner?.id,
    ).toBe(lastMatchup.optionA!.id);
    expect(getState().tournament!.currentRoundIndex).toBe(0);
  });
});

describe('PlayScreen final-stage ordering (Req 19.2)', () => {
  /**
   * Drive a size-4 classic tournament through both semifinals so the third-place
   * playoff is populated and the play cursor reaches the final round. Each
   * semifinal is decided (option A wins) and confirmed via the reducer/domain
   * path, exactly as the UI would, so the resulting state is the real one.
   */
  function atFinalStage(seed = 7): AppState {
    let state = playingClassic(4, seed);

    // Decide both semifinals of round 0: pick optionA and confirm each.
    const round0 = state.tournament!.rounds[0];
    for (const matchup of round0.matchups) {
      state = run(state, [
        {
          type: 'SET_PROVISIONAL',
          matchupId: matchup.id,
          choice: { optionId: matchup.optionA!.id },
        },
        { type: 'CONFIRM', matchupId: matchup.id },
      ]);
    }

    // Move the cursor to the last matchup of the round, then NEXT: NEXT only
    // advances the round from the last matchup once the round is complete
    // (Req 18.5). Round 0 has two matchups, so one NEXT reaches the last, and a
    // second NEXT advances to the final round.
    state = run(state, [{ type: 'NEXT' }, { type: 'NEXT' }]);

    return state;
  }

  it('populates the playoff and lands on the final round after both semifinals', () => {
    const state = atFinalStage();
    const t = state.tournament!;
    // We are on the final round (the last round of the bracket).
    expect(t.currentRoundIndex).toBe(t.rounds.length - 1);
    // The third-place playoff is populated with the two semifinal losers.
    expect(t.thirdPlaceMatch?.optionA).toBeDefined();
    expect(t.thirdPlaceMatch?.optionB).toBeDefined();
    // Neither the playoff nor the final is decided yet.
    expect(t.thirdPlaceMatch?.winner).toBeUndefined();
    expect(t.rounds[t.rounds.length - 1].matchups[0].winner).toBeUndefined();
  });

  it('presents the third-place match (dedicated label) before the final (Req 19.2)', () => {
    const state = atFinalStage();
    const t = state.tournament!;
    const playoff = t.thirdPlaceMatch!;
    const finalMatchup = t.rounds[t.rounds.length - 1].matchups[0];

    renderPlayScreen(state);

    // The dedicated third-place label is shown, NOT the "Final" label.
    expect(
      screen.getByRole('heading', { name: /third-place match/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /^final$/i }),
    ).not.toBeInTheDocument();

    // The playoff's two contestants are the ones on screen — not the finalists.
    expect(
      screen.getByRole('button', { name: playoff.optionA!.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: playoff.optionB!.name }),
    ).toBeInTheDocument();

    // The final's contestants are NOT presented yet (the finalists differ from
    // the playoff's semifinal losers).
    for (const finalist of [finalMatchup.optionA, finalMatchup.optionB]) {
      if (
        finalist &&
        finalist.id !== playoff.optionA!.id &&
        finalist.id !== playoff.optionB!.id
      ) {
        expect(
          screen.queryByRole('button', { name: finalist.name }),
        ).not.toBeInTheDocument();
      }
    }
  });

  it('presents the final only after the third-place match is decided (Req 19.2)', async () => {
    const user = userEvent.setup();
    const { getState } = renderPlayScreen(atFinalStage());

    const playoff = getState().tournament!.thirdPlaceMatch!;

    // Decide the third-place playoff (pick optionA) and confirm with Next.
    await user.click(
      screen.getByRole('button', { name: playoff.optionA!.name }),
    );
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // The playoff is now decided...
    expect(getState().tournament!.thirdPlaceMatch!.winner?.id).toBe(
      playoff.optionA!.id,
    );

    // ...and the shell now presents the title final, not the playoff.
    expect(
      screen.getByRole('heading', { name: /^final$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /third-place match/i }),
    ).not.toBeInTheDocument();

    const finalMatchup =
      getState().tournament!.rounds[
        getState().tournament!.rounds.length - 1
      ].matchups[0];
    expect(
      screen.getByRole('button', { name: finalMatchup.optionA!.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: finalMatchup.optionB!.name }),
    ).toBeInTheDocument();
  });
});
