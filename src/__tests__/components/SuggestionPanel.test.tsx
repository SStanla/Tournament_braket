import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionPanel } from '../../components/SuggestionPanel';
import type { Bracket, Participant, Tournament } from '../../types/index';
import type { Suggestion } from '../../types/suggestions';

// ---------------------------------------------------------------------------
// Mock the tournament context (mirrors BracketVisualizer.test.tsx)
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
let mockState: {
  tournament: Tournament | null;
  bracket: Bracket | null;
  suggestions: { items: Suggestion[]; loading: boolean; error: string | null };
  ui: { error: string | null };
};

vi.mock('../../state/tournament-context', () => ({
  useTournament: () => ({
    state: mockState,
    dispatch: mockDispatch,
  }),
}));

// The panel's suggest flow calls into auto-suggest; not exercised here but
// mocked so the import resolves without a real network/AI call.
vi.mock('../../services/auto-suggest', () => ({
  generateSuggestionsWithFallback: vi.fn(async () => ({ suggestions: [], source: 'fallback' })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipant(id: string, name: string, seed = 1): Participant {
  return { id, name, source: 'manual', seed };
}

function makeTournament(): Tournament {
  return {
    id: 't1',
    category: 'Best pizza toppings',
    bracketSize: 4,
    createdAt: Date.now(),
    playerCount: null,
  };
}

function makeBracket(participants: Participant[]): Bracket {
  return {
    tournamentId: 't1',
    size: 4,
    rounds: [],
    participants,
    champion: null,
    currentRound: 1,
    thirdPlaceMatch: null,
    thirdPlace: null,
    fourthPlace: null,
  };
}

function makeSuggestion(id: string, name: string, status: Suggestion['status']): Suggestion {
  return { id, name, source: 'fallback', status };
}

function setState(suggestions: Suggestion[], participants: Participant[] = []) {
  mockState = {
    tournament: makeTournament(),
    bracket: makeBracket(participants),
    suggestions: { items: suggestions, loading: false, error: null },
    ui: { error: null },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuggestionPanel', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it('renders the suggestion list with each suggestion name and status', () => {
    setState([
      makeSuggestion('s1', 'Margherita', 'pending'),
      makeSuggestion('s2', 'Pepperoni', 'accepted'),
    ]);
    render(<SuggestionPanel />);

    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Pending')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Accepted')).toBeInTheDocument();
  });

  it('shows the "Accept all" control while suggestions are pending', () => {
    setState([
      makeSuggestion('s1', 'Margherita', 'pending'),
      makeSuggestion('s2', 'Pepperoni', 'rejected'),
    ]);
    render(<SuggestionPanel />);

    expect(
      screen.getByRole('button', { name: 'Accept all suggested participants' })
    ).toBeInTheDocument();
  });

  it('dispatches ACCEPT_ALL_SUGGESTIONS when the "Accept all" control is clicked', () => {
    setState([
      makeSuggestion('s1', 'Margherita', 'pending'),
      makeSuggestion('s2', 'Pepperoni', 'pending'),
    ]);
    render(<SuggestionPanel />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Accept all suggested participants' })
    );

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'ACCEPT_ALL_SUGGESTIONS' });
  });

  it('does not show the "Accept all" control when no suggestions are pending', () => {
    setState([
      makeSuggestion('s1', 'Margherita', 'accepted'),
      makeSuggestion('s2', 'Pepperoni', 'rejected'),
    ]);
    render(<SuggestionPanel />);

    expect(
      screen.queryByRole('button', { name: 'Accept all suggested participants' })
    ).not.toBeInTheDocument();
  });
});
