// Component tests for FillScreen (Task 19).
//
// Covers the behaviors called out by the task:
//  - "X / size" count indicator updates as options are added/removed (Req 6.1).
//  - The add-option input is disabled with a visible "full" signal once the
//    count equals the size (Req 6.7).
//  - The option list renders a remove button per option, and removal frees a
//    slot even when full (Req 7.1, 7.3).
//  - "Suggest options" is available while slots remain and requests suggestions
//    for the missing count (Req 9.1).
//  - "Generate bracket" is shown ONLY when the bracket is exactly full (Req 8.1).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the suggestion service so no network is touched; the cascade itself is
// covered by its own tests (Task 16.3).
const requestSuggestions = vi.fn();
vi.mock('../services/suggestionService', () => ({
  requestSuggestions: (...args: unknown[]) => requestSuggestions(...args),
}));

import FillScreen from './FillScreen';
import {
  TournamentProvider,
  useTournament,
} from '../app/TournamentContext';
import type { AppState } from '../app/tournamentReducer';
import type { BracketSize } from '../domain/model';

/**
 * Render FillScreen inside a provider whose tournament is already in the
 * FILLING phase at the given size, exposing the shared state for assertions.
 */
function renderFillScreen(size: BracketSize = 8, category = 'Best pasta sauce') {
  let latest: AppState | null = null;
  function StateProbe() {
    latest = useTournament().state;
    return null;
  }
  function Bootstrap() {
    const { state, dispatch } = useTournament();
    // Create the tournament once, on first render, so FillScreen has a
    // FILLING-phase tournament to work with.
    if (state.tournament === null) {
      dispatch({ type: 'CREATE', input: { category, size } });
      return null;
    }
    return <FillScreen />;
  }
  render(
    <TournamentProvider>
      <Bootstrap />
      <StateProbe />
    </TournamentProvider>,
  );
  return { getState: () => latest as AppState };
}

// The provider hydrates from sessionStorage on mount; clear it around each test
// so a tournament from one test doesn't leak into the next.
beforeEach(() => {
  sessionStorage.clear();
  requestSuggestions.mockReset();
});
afterEach(() => {
  sessionStorage.clear();
});

describe('FillScreen count indicator', () => {
  it('shows "X / size" and updates as options are added', async () => {
    const user = userEvent.setup();
    renderFillScreen(8);

    expect(screen.getByText('0 / 8')).toBeInTheDocument();

    const input = screen.getByLabelText(/add an option/i);
    await user.type(input, 'Marinara');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByText('1 / 8')).toBeInTheDocument();
  });
});

describe('FillScreen add-option input and full signal', () => {
  it('disables the input and signals full once the count equals the size', async () => {
    const user = userEvent.setup();
    renderFillScreen(2); // size 2 so two options fill the bracket

    const input = screen.getByLabelText(/add an option/i);
    await user.type(input, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(input, 'Beta');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Full: count reads 2 / 2, the input and Add button are disabled, and a
    // full signal is shown (Req 6.7).
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText(/add an option/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    expect(screen.getByText(/bracket is full/i)).toBeInTheDocument();
  });

  it('rejects a duplicate option with an inline message and no count change', async () => {
    const user = userEvent.setup();
    renderFillScreen(8);

    const input = screen.getByLabelText(/add an option/i);
    await user.type(input, 'Marinara');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(input, ' marinara '); // case/whitespace duplicate
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('1 / 8')).toBeInTheDocument();
  });
});

describe('FillScreen option list and removal', () => {
  it('renders a remove button per option and removal frees a slot', async () => {
    const user = userEvent.setup();
    renderFillScreen(2);

    const input = screen.getByLabelText(/add an option/i);
    await user.type(input, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(input, 'Beta');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    const list = screen.getByRole('list', { name: /options/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    // Removal is allowed even when full (Req 7.3): remove one and the slot frees.
    await user.click(screen.getByRole('button', { name: /remove alpha/i }));

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByLabelText(/add an option/i)).toBeEnabled();
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('FillScreen suggest options', () => {
  it('requests suggestions for the missing slots while slots remain', async () => {
    const user = userEvent.setup();
    requestSuggestions.mockResolvedValue({
      suggestions: ['Pesto', 'Alfredo'],
      manualFillNeeded: false,
    });
    renderFillScreen(8);

    await user.click(screen.getByRole('button', { name: /suggest options/i }));

    expect(requestSuggestions).toHaveBeenCalledWith(
      'Best pasta sauce',
      [],
      8, // all 8 slots remain
    );
  });
});

describe('FillScreen generate bracket', () => {
  it('shows "Generate bracket" only when the bracket is exactly full', async () => {
    const user = userEvent.setup();
    renderFillScreen(2);

    // Not full yet: no generate control (Req 8.1).
    expect(
      screen.queryByRole('button', { name: /generate bracket/i }),
    ).not.toBeInTheDocument();

    const input = screen.getByLabelText(/add an option/i);
    await user.type(input, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(input, 'Beta');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    // Full: the generate control appears (Req 8.1).
    expect(
      screen.getByRole('button', { name: /generate bracket/i }),
    ).toBeInTheDocument();
  });

  it('generates the bracket and moves the tournament to PLAYING', async () => {
    const user = userEvent.setup();
    const { getState } = renderFillScreen(2);

    const input = screen.getByLabelText(/add an option/i);
    await user.type(input, 'Alpha');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(input, 'Beta');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await user.click(
      screen.getByRole('button', { name: /generate bracket/i }),
    );

    expect(getState().tournament?.phase).toBe('PLAYING');
  });
});
