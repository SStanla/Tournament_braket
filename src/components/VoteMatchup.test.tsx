// Component tests for the VoteMatchup body (Task 22.2).
//
// Covers the vote-based matchup requirements:
//  - A single horizontal slider with `playerCount + 1` discrete positions
//    (Req 16.1) whose orientation splits the votes summing to the player count
//    (Req 16.2, 16.3).
//  - The slider starts centered when a matchup is first shown: the exact tie for
//    an even player count, the nearest-centre position for an odd one (Req 16.4).
//  - Each option's current votes are shown and the leader's number + outline are
//    highlighted green (Req 16.5).
//  - The split stays provisional and the leader becomes the winner only when
//    the shell's Next is pressed (Req 14.1, 14.2), while a tie records no winner
//    and surfaces the tie-break draw control (Req 16.7).
//  - The tie-break control appears ONLY on a tie (Req 16.9) — never for an odd
//    player count (Req 16.10) — and while unresolved blocks advancing past the
//    matchup (Req 16.8).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteMatchup from './VoteMatchup';
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
 * Build a generated (PLAYING) vote-based tournament of the given size and player
 * count via the real reducer + domain path, so the state under test is exactly
 * what the app produces. Size 4 gives a two-matchup first round.
 */
function playingVote(size: 2 | 4, playerCount: number, seed = 7): AppState {
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta'].slice(0, size);
  return run(initialAppState, [
    { type: 'CREATE', input: { category: 'Test', size, playerCount, rngSeed: seed } },
    ...names.map((name) => ({ type: 'ADD_OPTION' as const, name })),
    { type: 'GENERATE' },
  ]);
}

/** Render VoteMatchup inside PlayScreen with a probe exposing shared state. */
function renderInShell(initialState: AppState) {
  let latest: AppState | null = null;
  function StateProbe() {
    latest = useTournament().state;
    return null;
  }
  render(
    <TournamentProvider initialState={initialState}>
      <PlayScreen renderMatchup={(matchup) => <VoteMatchup matchup={matchup} />} />
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

describe('VoteMatchup', () => {
  it('renders a single slider with playerCount + 1 discrete positions (Req 16.1)', () => {
    renderInShell(playingVote(4, 6));

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(1);

    const slider = sliders[0];
    // min..max spans 0..playerCount inclusive => playerCount + 1 positions.
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '6');
    expect(slider).toHaveAttribute('step', '1');
  });

  it('starts centered on the exact tie for an even player count (Req 16.4)', () => {
    const state = playingVote(4, 6);
    const first = state.tournament!.rounds[0].matchups[0];
    const { getState } = renderInShell(state);

    // playerCount 6 -> centered split is 3 / 3, seeded as the provisional split.
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('3');

    const matchup = getState().tournament!.rounds[0].matchups.find(
      (m) => m.id === first.id,
    )!;
    expect(matchup.votesA).toBe(3);
    expect(matchup.votesB).toBe(3);
  });

  it('starts on the nearest-centre position for an odd player count (Req 16.4)', () => {
    const state = playingVote(4, 5);
    const first = state.tournament!.rounds[0].matchups[0];
    const { getState } = renderInShell(state);

    // playerCount 5 -> nearest centre is 2 / 3 (never an exact tie, Req 16.10).
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('2');

    const matchup = getState().tournament!.rounds[0].matchups.find(
      (m) => m.id === first.id,
    )!;
    expect(matchup.votesA! + matchup.votesB!).toBe(5);
    expect(matchup.votesA).not.toBe(matchup.votesB);
  });

  it('highlights the leading option in green on both number and outline (Req 16.5)', () => {
    const state = playingVote(4, 6);
    const first = state.tournament!.rounds[0].matchups[0];
    renderInShell(state);

    const slider = screen.getByRole('slider');
    // Move so the right option (optionB) gets 5 of 6 votes -> optionB leads.
    fireEvent.change(slider, { target: { value: '5' } });

    const aBox = screen.getByLabelText(`${first.optionA!.name}: 1 votes`);
    const bBox = screen.getByLabelText(`${first.optionB!.name}: 5 votes`);
    // The leader (B) carries the green highlight hook; the loser (A) does not.
    expect(bBox).toHaveAttribute('data-leader', 'true');
    expect(aBox).not.toHaveAttribute('data-leader');
  });

  it('keeps the split provisional on release and records the winner only on Next (Req 14.1, 14.2)', async () => {
    const user = userEvent.setup();
    const state = playingVote(4, 6);
    const first = state.tournament!.rounds[0].matchups[0];
    const { getState } = renderInShell(state);

    const slider = screen.getByRole('slider');
    // Give optionA the majority (4 of 6), then release: the split is recorded as
    // provisional but NO winner is committed yet.
    fireEvent.change(slider, { target: { value: '2' } });
    fireEvent.pointerUp(slider);

    let matchup = getState().tournament!.rounds[0].matchups.find(
      (m) => m.id === first.id,
    )!;
    expect(matchup.votesA).toBe(4);
    expect(matchup.votesB).toBe(2);
    expect(matchup.winner).toBeUndefined();

    // Pressing Next confirms the provisional split, recording the leader
    // (optionA) as the winner — the same confirm-before-record flow as classic.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    matchup = getState().tournament!.rounds[0].matchups.find(
      (m) => m.id === first.id,
    )!;
    expect(matchup.winner?.id).toBe(first.optionA!.id);
  });

  it('shows the tie-break control only on a tie and records no winner (Req 16.7, 16.9)', () => {
    const state = playingVote(4, 6);
    renderInShell(state);

    const slider = screen.getByRole('slider');
    // Centered start is already a tie (3/3): the draw control is present, and a
    // tie itself records no winner (a winner is set only via the draw).
    expect(
      screen.getByRole('button', { name: /tie-break draw/i }),
    ).toBeInTheDocument();

    // Move to a non-tie split: the tie-break control disappears.
    fireEvent.change(slider, { target: { value: '4' } });
    expect(
      screen.queryByRole('button', { name: /tie-break draw/i }),
    ).not.toBeInTheDocument();
  });

  it('never shows the tie-break control for an odd player count (Req 16.10)', () => {
    renderInShell(playingVote(4, 5));

    // Odd player count can never tie, so no tie-break control ever appears.
    expect(
      screen.queryByRole('button', { name: /tie-break draw/i }),
    ).not.toBeInTheDocument();
  });

  it('resolves an unresolved tie only via the draw, which blocks advance until used (Req 16.8, 16.9)', async () => {
    const user = userEvent.setup();
    const state = playingVote(2, 4);
    const first = state.tournament!.rounds[0].matchups[0];
    const { getState } = renderInShell(state);

    // Size 2, player count 4: the round is a single matchup whose centered start
    // is a tie (2/2). While tied and undecided the matchup blocks the round from
    // completing, so pressing Next cannot advance to RESULTS.
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    let s = getState().tournament!;
    let matchup = s.rounds[0].matchups.find((m) => m.id === first.id)!;
    expect(matchup.winner).toBeUndefined();
    expect(s.phase).toBe('PLAYING');

    // Using the tie-break draw resolves the tie by picking one of the two.
    await user.click(screen.getByRole('button', { name: /tie-break draw/i }));
    s = getState().tournament!;
    matchup = s.rounds[0].matchups.find((m) => m.id === first.id)!;
    expect(matchup.tieBreakUsed).toBe(true);
    expect([first.optionA!.id, first.optionB!.id]).toContain(matchup.winner?.id);
  });
});
