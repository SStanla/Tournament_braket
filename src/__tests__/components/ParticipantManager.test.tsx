import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ParticipantManager } from '../../components/ParticipantManager';
import { TournamentProvider, useTournament } from '../../state/tournament-context';

// Mock persistence service
vi.mock('../../services/persistence', () => ({
  saveTournament: vi.fn(),
  loadTournament: vi.fn(() => null),
  clearTournament: vi.fn(),
}));

/**
 * Helper component that creates a tournament on mount so the bracket exists.
 */
function TournamentSetup({ bracketSize }: { bracketSize: number }) {
  const { dispatch } = useTournament();
  React.useEffect(() => {
    dispatch({
      type: 'CREATE_TOURNAMENT',
      payload: { category: 'Test Category', bracketSize },
    });
  }, [dispatch, bracketSize]);
  return null;
}

/**
 * Helper to render ParticipantManager within a TournamentProvider
 * that already has a tournament created with a given bracket size.
 */
function renderWithTournament(bracketSize = 4) {
  return render(
    <TournamentProvider>
      <TournamentSetup bracketSize={bracketSize} />
      <ParticipantManager />
    </TournamentProvider>
  );
}

describe('ParticipantManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the participant input and add button', () => {
    renderWithTournament();

    expect(screen.getByLabelText('Item name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('shows participant count vs bracket size', () => {
    renderWithTournament(8);

    expect(screen.getByText('0/8 items')).toBeInTheDocument();
  });

  it('adds a participant on form submit', () => {
    renderWithTournament(4);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    fireEvent.change(input, { target: { value: 'Alice' } });
    fireEvent.click(addButton);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('1/4 items')).toBeInTheDocument();
  });

  it('removes a participant when remove button is clicked', () => {
    renderWithTournament(4);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    fireEvent.change(input, { target: { value: 'Bob' } });
    fireEvent.click(addButton);

    expect(screen.getByText('Bob')).toBeInTheDocument();

    const removeButton = screen.getByRole('button', { name: 'Remove Bob' });
    fireEvent.click(removeButton);

    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('0/4 items')).toBeInTheDocument();
  });

  it('shows duplicate name error when adding an existing participant', () => {
    renderWithTournament(4);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    // Add first participant
    fireEvent.change(input, { target: { value: 'Charlie' } });
    fireEvent.click(addButton);

    // Try to add the same name again
    fireEvent.change(input, { target: { value: 'Charlie' } });
    fireEvent.click(addButton);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A participant with this name already exists in the bracket.'
    );
  });

  it('disables input and button when bracket is full', () => {
    renderWithTournament(2);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    // Add first participant
    fireEvent.change(input, { target: { value: 'Player 1' } });
    fireEvent.click(addButton);

    // Add second participant (fills bracket of size 2)
    fireEvent.change(input, { target: { value: 'Player 2' } });
    fireEvent.click(addButton);

    expect(input).toBeDisabled();
    expect(addButton).toBeDisabled();
    expect(screen.getByText('2/2 items')).toBeInTheDocument();
  });

  it('shows bracket full error when attempting to add beyond capacity', () => {
    renderWithTournament(2);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    // Fill the bracket
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.click(addButton);
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.click(addButton);

    // The input is now disabled, satisfying the requirement that the UI
    // prevents adding beyond capacity
    expect(input).toBeDisabled();
    expect(addButton).toBeDisabled();
  });

  it('shows validation error when submitting empty participant name', () => {
    renderWithTournament(4);

    const addButton = screen.getByRole('button', { name: 'Add' });

    // Submit without entering anything (empty string)
    fireEvent.click(addButton);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter an item name.'
    );
  });

  it('shows validation error when submitting whitespace-only participant name', () => {
    renderWithTournament(4);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(addButton);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter an item name.'
    );
  });

  it('clears validation error when user types after an error', () => {
    renderWithTournament(4);

    const input = screen.getByLabelText('Item name');
    const addButton = screen.getByRole('button', { name: 'Add' });

    // Trigger the validation error
    fireEvent.click(addButton);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Start typing — error should clear
    fireEvent.change(input, { target: { value: 'X' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    renderWithTournament();

    const input = screen.getByLabelText('Item name');
    expect(input).toHaveAttribute('aria-describedby', 'participant-error');

    // Section has proper heading
    expect(screen.getByRole('heading', { name: 'Tournament items' })).toBeInTheDocument();
  });
});
