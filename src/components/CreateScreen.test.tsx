// Component tests for CreateScreen (Task 18).
//
// Covers the two behaviors called out by the task:
//  1. The bracket-size selector offers ONLY valid powers of two 2..2048
//     (Req 4.1, 4.2).
//  2. A player-count error preserves the other entered fields (Req 5.3).
// Plus the required-category block (Req 3.2) and the successful create →
// FILLING confirmation transition (Req 2.1, 2.2).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateScreen, { BRACKET_SIZES } from './CreateScreen';
import {
  TournamentProvider,
  useTournament,
} from '../app/TournamentContext';
import type { AppState } from '../app/tournamentReducer';

/** Render CreateScreen inside a provider, exposing the shared state for asserts. */
function renderCreateScreen() {
  let latest: AppState | null = null;
  function StateProbe() {
    latest = useTournament().state;
    return null;
  }
  render(
    <TournamentProvider>
      <CreateScreen />
      <StateProbe />
    </TournamentProvider>,
  );
  return {
    getState: () => latest as AppState,
  };
}

// The provider hydrates from sessionStorage on mount, so a tournament created
// in one test would otherwise leak into the next. Clear storage around each.
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
});

describe('CreateScreen bracket-size selector', () => {
  it('offers only the valid powers of two between 2 and 2048', () => {
    renderCreateScreen();
    const select = screen.getByLabelText(/bracket size/i);
    const optionValues = within(select)
      .getAllByRole('option')
      .map((option) => Number((option as HTMLOptionElement).value));

    expect(optionValues).toEqual([...BRACKET_SIZES]);
  });

  it('every offered value is a power of two within 2..2048', () => {
    renderCreateScreen();
    const select = screen.getByLabelText(/bracket size/i);
    const optionValues = within(select)
      .getAllByRole('option')
      .map((option) => Number((option as HTMLOptionElement).value));

    for (const value of optionValues) {
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(2048);
      // Power of two: exactly one bit set.
      expect(value & (value - 1)).toBe(0);
    }
  });
});

describe('CreateScreen player-count validation', () => {
  it('blocks creation and preserves the other fields when player count is invalid', async () => {
    const user = userEvent.setup();
    const { getState } = renderCreateScreen();

    const category = screen.getByLabelText(/category/i);
    const select = screen.getByLabelText(/bracket size/i);
    const playerCount = screen.getByLabelText(/player count/i);

    await user.type(category, 'Best pasta sauce');
    await user.selectOptions(select, '8');
    await user.type(playerCount, '3.5'); // decimal => invalid

    await user.click(screen.getByRole('button', { name: /create tournament/i }));

    // Creation is blocked: no tournament committed to the reducer (Req 5.3).
    expect(getState().tournament).toBeNull();

    // An inline error is shown for the player count field.
    expect(screen.getByRole('alert')).toHaveTextContent(/positive whole number/i);

    // The other entered fields are preserved (Req 5.3).
    expect((category as HTMLInputElement).value).toBe('Best pasta sauce');
    expect((select as HTMLSelectElement).value).toBe('8');
    expect((playerCount as HTMLInputElement).value).toBe('3.5');
  });

  it('creates a classic tournament when player count is left empty', async () => {
    const user = userEvent.setup();
    const { getState } = renderCreateScreen();

    await user.type(screen.getByLabelText(/category/i), 'Best movie');
    await user.click(screen.getByRole('button', { name: /create tournament/i }));

    const tournament = getState().tournament;
    expect(tournament).not.toBeNull();
    expect(tournament!.phase).toBe('FILLING');
    expect(tournament!.mode).toBe('classic');
    expect(tournament!.playerCount).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent(/tournament created/i);
  });

  it('creates a vote-based tournament with a valid player count', async () => {
    const user = userEvent.setup();
    const { getState } = renderCreateScreen();

    await user.type(screen.getByLabelText(/category/i), 'Best footballer');
    await user.selectOptions(screen.getByLabelText(/bracket size/i), '4');
    await user.type(screen.getByLabelText(/player count/i), '10');
    await user.click(screen.getByRole('button', { name: /create tournament/i }));

    const tournament = getState().tournament;
    expect(tournament).not.toBeNull();
    expect(tournament!.mode).toBe('voteBased');
    expect(tournament!.playerCount).toBe(10);
    expect(tournament!.size).toBe(4);
  });
});

describe('CreateScreen category validation', () => {
  it('blocks creation with a required message when the category is empty', async () => {
    const user = userEvent.setup();
    const { getState } = renderCreateScreen();

    await user.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(getState().tournament).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/category is required/i);
  });
});
