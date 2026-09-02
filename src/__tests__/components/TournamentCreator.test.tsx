import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { TournamentCreator } from '../../components/TournamentCreator';
import { TournamentProvider, useTournament } from '../../state/tournament-context';

function renderWithProvider() {
  return render(
    <TournamentProvider>
      <TournamentCreator />
    </TournamentProvider>
  );
}

/**
 * A tiny probe that surfaces the resulting `tournament.playerCount` from the
 * real reducer state so tests can assert the mode dispatched by the creator
 * (null → Classic_Mode, positive integer → Vote_Based_Mode) without mocking.
 */
function PlayerCountProbe() {
  const { state } = useTournament();
  if (!state.tournament) return null;
  const pc = state.tournament.playerCount;
  return <div data-testid="player-count-probe">{pc === null ? 'null' : String(pc)}</div>;
}

function renderWithProbe() {
  return render(
    <TournamentProvider>
      <TournamentCreator />
      <PlayerCountProbe />
    </TournamentProvider>
  );
}

describe('TournamentCreator', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test so provider starts fresh
    sessionStorage.clear();
  });

  it('renders the form with category input, bracket size select, and submit button', () => {
    renderWithProvider();

    expect(screen.getByLabelText(/category name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bracket size/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create tournament/i })).toBeInTheDocument();
  });

  it('shows only valid power-of-2 bracket sizes in the select', () => {
    renderWithProvider();

    const select = screen.getByLabelText(/bracket size/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((opt) => Number(opt.value));

    const expected = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    expect(options).toEqual(expected);
  });

  it('displays validation error when submitting empty category', () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(
      screen.getByText('Please enter a category name for your tournament.')
    ).toBeInTheDocument();
  });

  it('displays validation error when submitting whitespace-only category', () => {
    renderWithProvider();

    const input = screen.getByLabelText(/category name/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(
      screen.getByText('Please enter a category name for your tournament.')
    ).toBeInTheDocument();
  });

  it('displays validation error when category exceeds 100 characters', () => {
    renderWithProvider();

    const longName = 'a'.repeat(101);
    const input = screen.getByLabelText(/category name/i);
    // We need to bypass maxLength for testing the validation logic
    fireEvent.change(input, { target: { value: longName } });
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(
      screen.getByText('Category name must be 100 characters or fewer.')
    ).toBeInTheDocument();
  });

  it('clears validation error when user types after an error', () => {
    renderWithProvider();

    // Trigger error
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));
    expect(
      screen.getByText('Please enter a category name for your tournament.')
    ).toBeInTheDocument();

    // Start typing
    const input = screen.getByLabelText(/category name/i);
    fireEvent.change(input, { target: { value: 'B' } });

    expect(
      screen.queryByText('Please enter a category name for your tournament.')
    ).not.toBeInTheDocument();
  });

  it('creates tournament and shows confirmation on valid submission', () => {
    renderWithProvider();

    const input = screen.getByLabelText(/category name/i);
    fireEvent.change(input, { target: { value: 'Best pizza toppings' } });

    const select = screen.getByLabelText(/bracket size/i);
    fireEvent.change(select, { target: { value: '8' } });

    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    // Confirmation should appear
    expect(screen.getByText(/tournament created/i)).toBeInTheDocument();
    expect(screen.getByText(/best pizza toppings/i)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it('has proper accessibility attributes on the form', () => {
    renderWithProvider();

    const input = screen.getByLabelText(/category name/i);
    expect(input).toHaveAttribute('aria-required', 'true');

    const form = input.closest('form');
    expect(form).toHaveAttribute('aria-labelledby', 'tournament-creator-heading');
  });

  it('sets aria-invalid on input when there is an error', () => {
    renderWithProvider();

    const input = screen.getByLabelText(/category name/i);

    // Before error
    expect(input).toHaveAttribute('aria-invalid', 'false');

    // Trigger error
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('displays the error with role="alert" for assistive technologies', () => {
    renderWithProvider();

    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please enter a category name for your tournament.');
  });

  it('defaults bracket size to 4', () => {
    renderWithProvider();

    const select = screen.getByLabelText(/bracket size/i) as HTMLSelectElement;
    expect(select.value).toBe('4');
  });

  // -------------------------------------------------------------------------
  // Optional Player_Count input (Req 11.1–11.4)
  // -------------------------------------------------------------------------

  it('renders the optional number-of-players input', () => {
    renderWithProvider();
    expect(screen.getByLabelText(/number of players/i)).toBeInTheDocument();
  });

  it('may be left empty — submitting empty creates a Classic_Mode tournament (playerCount null)', () => {
    renderWithProbe();

    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best pizza toppings' },
    });
    // Leave the player-count input empty.
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    // Tournament was created (Classic_Mode).
    expect(screen.getByText(/tournament created/i)).toBeInTheDocument();
    expect(screen.getByTestId('player-count-probe')).toHaveTextContent('null');
  });

  it('a positive integer creates a Vote_Based_Mode tournament (playerCount = that number)', () => {
    renderWithProbe();

    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best pizza toppings' },
    });
    fireEvent.change(screen.getByLabelText(/number of players/i), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(screen.getByText(/tournament created/i)).toBeInTheDocument();
    expect(screen.getByTestId('player-count-probe')).toHaveTextContent('10');
  });

  // The Player_Count input carries native constraints (min=1, step=1), so an
  // out-of-range/fractional value is blocked by the browser before the form's
  // JS handler runs. We submit the form directly (bypassing native constraint
  // validation) to exercise the component's own validation backstop and assert
  // the message + that no tournament is dispatched.
  const VALIDATION_MESSAGE =
    'Player count must be a whole number of 1 or more, or left empty for a classic tournament.';

  function submitForm() {
    const form = screen.getByLabelText(/category name/i).closest('form') as HTMLFormElement;
    fireEvent.submit(form);
  }

  it('rejects a player count of 0 — shows the validation message and does not create the tournament', () => {
    renderWithProbe();

    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best pizza toppings' },
    });
    fireEvent.change(screen.getByLabelText(/number of players/i), {
      target: { value: '0' },
    });
    submitForm();

    expect(screen.getByText(VALIDATION_MESSAGE)).toBeInTheDocument();
    // Not dispatched → no confirmation, no tournament in state.
    expect(screen.queryByText(/tournament created/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-count-probe')).not.toBeInTheDocument();
  });

  it('rejects a fractional player count (2.5) — shows the validation message and does not create the tournament', () => {
    renderWithProbe();

    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best pizza toppings' },
    });
    fireEvent.change(screen.getByLabelText(/number of players/i), {
      target: { value: '2.5' },
    });
    submitForm();

    expect(screen.getByText(VALIDATION_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/tournament created/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-count-probe')).not.toBeInTheDocument();
  });

  it('rejects a negative player count — shows the validation message and does not create the tournament', () => {
    renderWithProbe();

    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best pizza toppings' },
    });
    fireEvent.change(screen.getByLabelText(/number of players/i), {
      target: { value: '-3' },
    });
    submitForm();

    expect(screen.getByText(VALIDATION_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/tournament created/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-count-probe')).not.toBeInTheDocument();
  });
});
