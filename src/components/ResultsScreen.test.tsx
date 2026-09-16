// Component tests for the ResultsScreen (Task 24).
//
// Covers the two behaviors called out by the task:
//  1. Standings-before-bracket ordering: the final standings section appears
//     in the document before the full bracket section (Req 22.1).
//  2. The full bracket is read-only — it renders no edit affordances
//     (buttons, links, inputs, textboxes, sliders, etc.) (Req 22.9).
// Plus the standings content (gold/silver always; bronze/4th for size >= 4,
// Req 22.2, 22.3, 22.4), the third-place match appearing in the tree with a
// dedicated label (Req 22.7), and the champion being clearly marked (Req 22.8).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ResultsScreen from './ResultsScreen';
import { TournamentProvider } from '../app/TournamentContext';
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

/** Decide a matchup (optionA wins) via the real provisional/confirm path. */
function decideA(state: AppState, matchupId: string): AppState {
  const t = state.tournament!;
  const matchup =
    t.rounds.flatMap((r) => r.matchups).find((m) => m.id === matchupId) ??
    (t.thirdPlaceMatch?.id === matchupId ? t.thirdPlaceMatch : undefined);
  const optionA = matchup!.optionA!;
  return run(state, [
    {
      type: 'SET_PROVISIONAL',
      matchupId,
      choice: { optionId: optionA.id },
    },
    { type: 'CONFIRM', matchupId },
  ]);
}

/**
 * Build a COMPLETE (RESULTS phase) size-4 classic tournament using the real
 * reducer + domain path, so the state under test is exactly what the app
 * produces. Both semifinals are decided (optionA wins), then the third-place
 * playoff, then the final.
 */
function completedSize4(seed = 7): AppState {
  let state = run(initialAppState, [
    { type: 'CREATE', input: { category: 'Test', size: 4, rngSeed: seed } },
    { type: 'ADD_OPTION', name: 'Alpha' },
    { type: 'ADD_OPTION', name: 'Bravo' },
    { type: 'ADD_OPTION', name: 'Charlie' },
    { type: 'ADD_OPTION', name: 'Delta' },
    { type: 'GENERATE' },
  ]);

  // Decide both semifinals (optionA wins each).
  for (const matchup of state.tournament!.rounds[0].matchups) {
    state = decideA(state, matchup.id);
  }

  // Decide the now-populated third-place playoff.
  state = decideA(state, state.tournament!.thirdPlaceMatch!.id);

  // Decide the final.
  const finalRound = state.tournament!.rounds[state.tournament!.rounds.length - 1];
  state = decideA(state, finalRound.matchups[0].id);

  return state;
}

/**
 * Build a COMPLETE size-2 classic tournament: a single final matchup decided
 * with optionA winning. Size 2 has no third-place playoff (Req 22.4).
 */
function completedSize2(seed = 3): AppState {
  let state = run(initialAppState, [
    { type: 'CREATE', input: { category: 'Test', size: 2, rngSeed: seed } },
    { type: 'ADD_OPTION', name: 'Uno' },
    { type: 'ADD_OPTION', name: 'Dos' },
    { type: 'GENERATE' },
  ]);
  const finalRound = state.tournament!.rounds[0];
  state = decideA(state, finalRound.matchups[0].id);
  return state;
}

function renderResults(initialState: AppState) {
  return render(
    <TournamentProvider initialState={initialState}>
      <ResultsScreen />
    </TournamentProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
});

describe('ResultsScreen ordering (Req 22.1)', () => {
  it('renders the final standings before the full bracket', () => {
    renderResults(completedSize4());

    const standingsHeading = screen.getByRole('heading', {
      name: /final standings/i,
    });
    const bracketHeading = screen.getByRole('heading', {
      name: /full bracket/i,
    });

    // Both sections are present.
    expect(standingsHeading).toBeInTheDocument();
    expect(bracketHeading).toBeInTheDocument();

    // Standings come first in document order (Req 22.1).
    const position = standingsHeading.compareDocumentPosition(bracketHeading);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reaches the RESULTS phase with computed standings for a completed tournament', () => {
    const state = completedSize4();
    expect(state.tournament!.phase).toBe('RESULTS');
    expect(state.tournament!.standings).toHaveLength(4);
  });
});

describe('ResultsScreen bracket is read-only (Req 22.9)', () => {
  it('renders no edit affordances inside the full bracket', () => {
    renderResults(completedSize4());

    const bracketHeading = screen.getByRole('heading', {
      name: /full bracket/i,
    });
    // The bracket section is the closest enclosing <section>.
    const bracketSection = bracketHeading.closest('section') as HTMLElement;
    expect(bracketSection).not.toBeNull();

    const scope = within(bracketSection);
    // No interactive/edit controls of any kind in the read-only tree.
    expect(scope.queryAllByRole('button')).toHaveLength(0);
    expect(scope.queryAllByRole('link')).toHaveLength(0);
    expect(scope.queryAllByRole('textbox')).toHaveLength(0);
    expect(scope.queryAllByRole('slider')).toHaveLength(0);
    expect(scope.queryAllByRole('checkbox')).toHaveLength(0);
    expect(scope.queryAllByRole('combobox')).toHaveLength(0);
    expect(scope.queryAllByRole('spinbutton')).toHaveLength(0);
    // Raw <input>/<select>/<textarea> tags either.
    expect(bracketSection.querySelectorAll('input, select, textarea, button'))
      .toHaveLength(0);
  });

  it('renders no interactive controls anywhere on the results screen', () => {
    const { container } = renderResults(completedSize4());
    expect(
      container.querySelectorAll('button, input, select, textarea, a[href]'),
    ).toHaveLength(0);
  });
});

describe('ResultsScreen standings content', () => {
  it('shows gold, silver, bronze and a 4th-place text indicator for size >= 4 (Req 22.2, 22.3)', () => {
    const state = completedSize4();
    const standings = state.tournament!.standings!;
    renderResults(state);

    const standingsSection = screen
      .getByRole('heading', { name: /final standings/i })
      .closest('section') as HTMLElement;
    const scope = within(standingsSection);

    // Champion (gold) and runner-up (silver) named.
    expect(scope.getByText(standings[0].option.name)).toBeInTheDocument();
    expect(scope.getByText(standings[1].option.name)).toBeInTheDocument();
    // Bronze (3rd) and plain 4th present.
    expect(scope.getByText(standings[2].option.name)).toBeInTheDocument();
    expect(scope.getByText(standings[3].option.name)).toBeInTheDocument();

    // Medals are labelled; 4th place carries no medal badge.
    expect(scope.getByLabelText(/gold medal/i)).toBeInTheDocument();
    expect(scope.getByLabelText(/silver medal/i)).toBeInTheDocument();
    expect(scope.getByLabelText(/bronze medal/i)).toBeInTheDocument();
    expect(scope.getByText(/4th place/i)).toBeInTheDocument();
  });

  it('shows only 1st and 2nd place for size 2 (Req 22.4)', () => {
    const state = completedSize2();
    renderResults(state);

    const standingsSection = screen
      .getByRole('heading', { name: /final standings/i })
      .closest('section') as HTMLElement;
    const scope = within(standingsSection);

    expect(scope.getByText(/1st place/i)).toBeInTheDocument();
    expect(scope.getByText(/2nd place/i)).toBeInTheDocument();
    expect(scope.queryByText(/3rd place/i)).not.toBeInTheDocument();
    expect(scope.queryByText(/4th place/i)).not.toBeInTheDocument();
    expect(scope.queryByLabelText(/bronze medal/i)).not.toBeInTheDocument();
  });
});

describe('ResultsScreen bracket content', () => {
  it('includes the third-place match with a dedicated label for size >= 4 (Req 22.7)', () => {
    renderResults(completedSize4());
    expect(
      screen.getByRole('heading', { name: /third-place match/i }),
    ).toBeInTheDocument();
  });

  it('omits the third-place match for size 2 (Req 22.7)', () => {
    renderResults(completedSize2());
    expect(
      screen.queryByRole('heading', { name: /third-place match/i }),
    ).not.toBeInTheDocument();
  });

  it('clearly marks the champion in the bracket (Req 22.8)', () => {
    const state = completedSize4();
    const champion = state.tournament!.champion!;
    renderResults(state);

    const bracketSection = screen
      .getByRole('heading', { name: /full bracket/i })
      .closest('section') as HTMLElement;
    const scope = within(bracketSection);

    // The champion tag is present and sits alongside the champion's name.
    expect(scope.getByText(/^champion$/i)).toBeInTheDocument();
    expect(scope.getAllByText(champion.name).length).toBeGreaterThan(0);
  });

  it('shows every round stage label from first to final (Req 22.6)', () => {
    renderResults(completedSize4());
    // Size 4 => rounds are Semifinal then Final.
    expect(
      screen.getByRole('heading', { name: /semifinal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^final$/i }),
    ).toBeInTheDocument();
  });
});
