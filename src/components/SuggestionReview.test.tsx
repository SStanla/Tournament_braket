// Component tests for SuggestionReview (Task 20).
//
// Covers the behaviors called out by the task and its requirements:
//  - Per-item Accept turns a suggestion into an option (Req 10.2) and nothing is
//    added automatically before review (Req 10.1).
//  - The inline Replace field is validated exactly like an option name: an
//    invalid entry shows a message and changes nothing (Req 10.7); a valid entry
//    renames + accepts in one action (Req 10.5).
//  - "Accept all" adds every pending suggestion (Req 10.8); "Reject all" is
//    available and rejects the pending set (Req 10.11).
//  - The all-handled indication appears once nothing is left to review (Req 10.13).
//  - The manual-fill note appears when the last produced set could not fill
//    every slot (Req 9.8).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the suggestion service so no network is touched and regeneration is
// deterministic. The cascade itself is covered by its own tests (Task 16.3).
const regenerateOne = vi.fn();
const requestSuggestions = vi.fn();
vi.mock('../services/suggestionService', () => ({
  regenerateOne: (...args: unknown[]) => regenerateOne(...args),
  requestSuggestions: (...args: unknown[]) => requestSuggestions(...args),
}));

import SuggestionReview from './SuggestionReview';
import { TournamentProvider } from '../app/TournamentContext';
import type { AppState } from '../app/tournamentReducer';
import type {
  BracketSize,
  Option,
  Suggestion,
  Tournament,
} from '../domain/model';

/** Build a FILLING-phase tournament fixture with the given options + suggestions. */
function makeTournament(
  options: string[],
  suggestions: Suggestion[],
  size: BracketSize = 8,
  category = 'Best pasta sauce',
): Tournament {
  const opts: Option[] = options.map((name, i) => ({ id: `opt-${i}`, name }));
  return {
    phase: 'FILLING',
    category,
    size,
    mode: 'classic',
    options: opts,
    suggestions,
    rounds: [],
    currentRoundIndex: 0,
    currentMatchupIndex: 0,
    rngSeed: 1,
  };
}

function pending(id: string, name: string): Suggestion {
  return { id, name, status: 'pending' };
}

/** Render SuggestionReview seeded with an explicit tournament state. */
function renderReview(tournament: Tournament) {
  const initialState: AppState = { tournament };
  return render(
    <TournamentProvider initialState={initialState}>
      <SuggestionReview />
    </TournamentProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  regenerateOne.mockReset();
  requestSuggestions.mockReset();
});
afterEach(() => {
  sessionStorage.clear();
});

describe('SuggestionReview per-item accept', () => {
  it('renders each pending suggestion and accepting one turns it into an option', async () => {
    const user = userEvent.setup();
    renderReview(
      makeTournament([], [pending('sug-1', 'Marinara'), pending('sug-2', 'Pesto')]),
    );

    // Both pending suggestions are presented for review (Req 10.1).
    expect(screen.getByText('Marinara')).toBeInTheDocument();
    expect(screen.getByText('Pesto')).toBeInTheDocument();

    const marinaraItem = screen.getByText('Marinara').closest('li') as HTMLElement;
    await user.click(within(marinaraItem).getByRole('button', { name: /^accept$/i }));

    // Marinara is accepted and removed from the pending list; Pesto remains.
    await waitFor(() => {
      expect(screen.queryByText('Marinara')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Pesto')).toBeInTheDocument();
  });
});

describe('SuggestionReview inline replace validation', () => {
  it('rejects an invalid (duplicate) replacement with a message and changes nothing', async () => {
    const user = userEvent.setup();
    // "Alfredo" is already an option, so replacing a suggestion with it is a duplicate.
    renderReview(makeTournament(['Alfredo'], [pending('sug-1', 'Marinara')]));

    const item = screen.getByText('Marinara').closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: /^replace$/i }));

    const input = screen.getByLabelText(/replacement name/i);
    await user.clear(input);
    await user.type(input, 'alfredo'); // case-insensitive duplicate of existing option
    await user.click(screen.getByRole('button', { name: /confirm replacement/i }));

    // An inline error is shown and the suggestion is unchanged (still pending).
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText(/replacement name/i)).toBeInTheDocument();
  });

  it('accepts a valid replacement by renaming and adding it as an option in one action', async () => {
    const user = userEvent.setup();
    renderReview(makeTournament([], [pending('sug-1', 'Marinara')]));

    const item = screen.getByText('Marinara').closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: /^replace$/i }));

    const input = screen.getByLabelText(/replacement name/i);
    await user.clear(input);
    await user.type(input, 'Arrabbiata');
    await user.click(screen.getByRole('button', { name: /confirm replacement/i }));

    // The replacement was accepted: nothing pending remains and no regeneration ran.
    await waitFor(() => {
      expect(screen.getByText(/all suggestions handled/i)).toBeInTheDocument();
    });
    expect(regenerateOne).not.toHaveBeenCalled();
  });
});

describe('SuggestionReview batch controls', () => {
  it('Accept all adds every pending suggestion and shows the all-handled indication', async () => {
    const user = userEvent.setup();
    renderReview(
      makeTournament([], [pending('sug-1', 'Marinara'), pending('sug-2', 'Pesto')]),
    );

    await user.click(screen.getByRole('button', { name: /accept all/i }));

    await waitFor(() => {
      expect(screen.getByText(/all suggestions handled/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Marinara')).not.toBeInTheDocument();
    expect(screen.queryByText('Pesto')).not.toBeInTheDocument();
  });

  it('offers a Reject all control while suggestions are pending', () => {
    renderReview(makeTournament([], [pending('sug-1', 'Marinara')]));
    expect(
      screen.getByRole('button', { name: /reject all/i }),
    ).toBeInTheDocument();
  });
});

describe('SuggestionReview all-handled indication', () => {
  it('shows the all-handled message when no suggestion is pending', () => {
    renderReview(
      makeTournament(['Marinara'], [{ id: 'sug-1', name: 'Marinara', status: 'accepted' }]),
    );
    expect(screen.getByText(/all suggestions handled/i)).toBeInTheDocument();
  });
});

describe('SuggestionReview manual-fill note', () => {
  it('shows a manual-fill note after Reject all cannot fill every slot', async () => {
    const user = userEvent.setup();
    // size 4, one option present => 3 slots missing. Reject all rejects the one
    // pending suggestion and requests a fresh set; the service returns fewer than
    // needed and flags manual fill (Req 9.8).
    regenerateOne.mockResolvedValue(null);
    requestSuggestions.mockResolvedValue({
      suggestions: [],
      manualFillNeeded: true,
    });
    renderReview(makeTournament(['Alfredo'], [pending('sug-1', 'Marinara')], 4));

    await user.click(screen.getByRole('button', { name: /reject all/i }));

    await waitFor(() => {
      expect(screen.getByText(/fill the remaining/i)).toBeInTheDocument();
    });
  });
});
