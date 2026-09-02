import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { BracketVisualizer } from './BracketVisualizer';
import type { Bracket, Round, Matchup, Participant } from '../types/index';

// ---------------------------------------------------------------------------
// Mock the tournament context
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
let mockState: { bracket: Bracket | null };

vi.mock('../state/tournament-context', () => ({
  useTournament: () => ({
    state: mockState,
    dispatch: mockDispatch,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers to build test data
// ---------------------------------------------------------------------------

function makeParticipant(id: string, name: string, seed = 1): Participant {
  return { id, name, source: 'manual', seed };
}

function makeBracketSize4(): Bracket {
  const p1 = makeParticipant('p1', 'Alice', 1);
  const p2 = makeParticipant('p2', 'Bob', 2);
  const p3 = makeParticipant('p3', 'Charlie', 3);
  const p4 = makeParticipant('p4', 'Diana', 4);

  const matchup1: Matchup = {
    id: 'm1',
    roundNumber: 1,
    position: 0,
    participant1: p1,
    participant2: p2,
    winner: null,
    nextMatchupId: 'm3',
  };

  const matchup2: Matchup = {
    id: 'm2',
    roundNumber: 1,
    position: 1,
    participant1: p3,
    participant2: p4,
    winner: null,
    nextMatchupId: 'm3',
  };

  const matchup3: Matchup = {
    id: 'm3',
    roundNumber: 2,
    position: 0,
    participant1: null,
    participant2: null,
    winner: null,
    nextMatchupId: null,
  };

  const round1: Round = {
    roundNumber: 1,
    label: 'Semifinal',
    matchups: [matchup1, matchup2],
  };

  const round2: Round = {
    roundNumber: 2,
    label: 'Final',
    matchups: [matchup3],
  };

  return {
    tournamentId: 't1',
    size: 4,
    rounds: [round1, round2],
    participants: [p1, p2, p3, p4],
    champion: null,
    thirdPlaceMatch: {
      id: 'tp1',
      roundNumber: 3,
      position: 0,
      participant1: null,
      participant2: null,
      winner: null,
      nextMatchupId: null,
    },
    thirdPlace: null,
    fourthPlace: null,
  };
}

function makeBracketSize2(): Bracket {
  const p1 = makeParticipant('p1', 'Alice', 1);
  const p2 = makeParticipant('p2', 'Bob', 2);

  const matchup1: Matchup = {
    id: 'm1',
    roundNumber: 1,
    position: 0,
    participant1: p1,
    participant2: p2,
    winner: null,
    nextMatchupId: null,
  };

  const round1: Round = {
    roundNumber: 1,
    label: 'Final',
    matchups: [matchup1],
  };

  return {
    tournamentId: 't1',
    size: 2,
    rounds: [round1],
    participants: [p1, p2],
    champion: null,
    // Size-2 brackets have no third-place match.
    thirdPlaceMatch: null,
    thirdPlace: null,
    fourthPlace: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BracketVisualizer', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it('renders empty state when no bracket exists', () => {
    mockState = { bracket: null };
    render(<BracketVisualizer />);
    expect(screen.getByText(/no bracket to display/i)).toBeInTheDocument();
  });

  it('renders empty state when bracket has no rounds', () => {
    mockState = {
      bracket: {
        tournamentId: 't1',
        size: 4,
        rounds: [],
        participants: [],
        champion: null,
        thirdPlaceMatch: null,
        thirdPlace: null,
        fourthPlace: null,
      },
    };
    render(<BracketVisualizer />);
    expect(screen.getByText(/no bracket to display/i)).toBeInTheDocument();
  });

  it('renders SVG with role="img" and aria-label', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', 'Tournament bracket visualization');
  });

  it('displays round labels', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);
    expect(screen.getByText('Semifinal')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('displays participant names', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);
    // Names now render in a wrapping <div><span>…</span></div> inside a
    // <foreignObject>; each slot also renders an SVG <title> with the same full
    // name for hover/focus accessibility. Scope to the visible <span>.
    expect(screen.getByText('Alice', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Bob', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Charlie', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Diana', { selector: 'span' })).toBeInTheDocument();
  });

  it('displays TBD for empty matchup slots', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);
    // The final matchup has both slots empty
    const tbdElements = screen.getAllByText('TBD');
    expect(tbdElements.length).toBeGreaterThanOrEqual(2);
  });

  it('dispatches SELECT_WINNER when a participant is clicked in a full matchup', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);

    // Click on Alice (participant1 in matchup1 where both slots are occupied).
    // The click bubbles up to the parent <g role="button"> which owns the handler.
    fireEvent.click(screen.getByText('Alice', { selector: 'span' }));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SELECT_WINNER',
      payload: { matchupId: 'm1', winnerId: 'p1' },
    });
  });

  it('does not dispatch when clicking a slot in a matchup with empty participants', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);

    // Click TBD in the final matchup (both slots empty → canSelectWinner is false)
    const tbdElements = screen.getAllByText('TBD');
    fireEvent.click(tbdElements[0]);

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('highlights the champion with a trophy and banner', () => {
    const bracket = makeBracketSize4();
    const champion = makeParticipant('p1', 'Alice', 1);
    // Put Alice in the final matchup and set her as winner and champion
    bracket.rounds[1].matchups[0].participant1 = champion;
    bracket.rounds[1].matchups[0].participant2 = makeParticipant('p3', 'Charlie', 3);
    bracket.rounds[1].matchups[0].winner = champion;
    bracket.champion = champion;

    mockState = { bracket };
    render(<BracketVisualizer />);

    // Champion banner should be visible
    expect(screen.getByText(/champion.*alice/i)).toBeInTheDocument();
  });

  it('renders matchup nodes with aria-labels', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);
    expect(screen.getByLabelText('Matchup: Alice vs Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Matchup: Charlie vs Diana')).toBeInTheDocument();
    expect(screen.getByLabelText('Matchup: TBD vs TBD')).toBeInTheDocument();
  });

  it('renders correct number of rounds (log₂ of bracket size) and matchups per round', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);

    // Bracket size 4 → log₂(4) = 2 rounds
    // Round 1: 2 matchups, Round 2: 1 matchup
    const allMatchups = screen.getAllByLabelText(/^Matchup:/);
    expect(allMatchups).toHaveLength(3); // 2 + 1 = 3 total matchups

    // Verify round labels count (2 rounds)
    expect(screen.getByText('Semifinal')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('renders connecting lines between rounds', () => {
    mockState = { bracket: makeBracketSize4() };
    const { container } = render(<BracketVisualizer />);

    // Connecting lines are rendered as <path> elements with stroke
    const paths = container.querySelectorAll('path[stroke="#9ca3af"]');
    // Two first-round matchups each connect to the final → 2 connecting lines
    expect(paths).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Third-place rendering (Req 5.7, 6.3, 10.4, 10.6)
  // -------------------------------------------------------------------------

  it('renders the Third-Place Match node and label for size >= 4', () => {
    mockState = { bracket: makeBracketSize4() };
    render(<BracketVisualizer />);

    // The "Third-Place Match" label appears once for size-4 brackets.
    expect(screen.getByText('Third-Place Match')).toBeInTheDocument();
    // And the match node itself is present with its aria-label (both slots empty here).
    expect(screen.getByLabelText('Third-Place Match: TBD vs TBD')).toBeInTheDocument();
  });

  it('does not render the Third-Place Match for size === 2', () => {
    mockState = { bracket: makeBracketSize2() };
    render(<BracketVisualizer />);

    // Size-2 brackets have no consolation match, so no label is rendered.
    expect(screen.queryByText('Third-Place Match')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Third-Place Match:/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Readable long names (Req 9.2, 9.3) — full name in <title>, visible text truncated
  // -------------------------------------------------------------------------

  it('exposes a long participant name in full via an SVG <title> even when the visible text is truncated', () => {
    const longName =
      'The Extraordinarily Long Participant Name That Definitely Overflows Its Slot'; // 76 chars
    expect(longName.length).toBeGreaterThan(60);

    const bracket = makeBracketSize4();
    // Give participant1 of matchup1 the long name.
    const longParticipant = makeParticipant('p1', longName, 1);
    bracket.rounds[0].matchups[0].participant1 = longParticipant;
    bracket.participants[0] = longParticipant;

    mockState = { bracket };
    const { container } = render(<BracketVisualizer />);

    // The full name is present verbatim inside a <title> element (on-demand full view).
    const titles = Array.from(container.querySelectorAll('title'));
    const fullTitle = titles.find((t) => t.textContent === longName);
    expect(fullTitle).toBeDefined();

    // The visible name (rendered in a wrapping <span> inside a foreignObject) is
    // truncated with an ellipsis for names beyond the 40-char display maximum.
    const spans = Array.from(container.querySelectorAll('span'));
    const exactVisible = spans.find((s) => s.textContent === longName);
    expect(exactVisible).toBeUndefined();
    const truncatedVisible = spans.find(
      (s) => s.textContent?.startsWith('The Extraordinarily') && s.textContent.includes('…')
    );
    expect(truncatedVisible).toBeDefined();
  });

  it('renders a ~35-char name in full (wrapped) in the visible cell, and truncates >40-char names in the visible content while keeping the full name in <title> (Req 5.8, 9.2, 9.3)', () => {
    const midName = 'Alexandria Bartholomew Cunningham II'; // 36 chars, <= 40
    expect(midName.length).toBeGreaterThan(30);
    expect(midName.length).toBeLessThanOrEqual(40);

    const longName = 'Maximilian Wolfgang Alexander Montgomery III'; // 44 chars, > 40
    expect(longName.length).toBeGreaterThan(40);

    const bracket = makeBracketSize4();
    const midParticipant = makeParticipant('p1', midName, 1);
    const longParticipant = makeParticipant('p2', longName, 2);
    bracket.rounds[0].matchups[0].participant1 = midParticipant;
    bracket.rounds[0].matchups[0].participant2 = longParticipant;
    bracket.participants[0] = midParticipant;
    bracket.participants[1] = longParticipant;

    mockState = { bracket };
    const { container } = render(<BracketVisualizer />);

    const spans = Array.from(container.querySelectorAll('span'));

    // The ~35-char name is shown IN FULL in the visible cell content (not truncated).
    const midVisible = spans.find((s) => s.textContent === midName);
    expect(midVisible).toBeDefined();
    expect(midVisible?.textContent).not.toContain('…');

    // The >40-char name is truncated with an ellipsis in the visible content...
    const longExactVisible = spans.find((s) => s.textContent === longName);
    expect(longExactVisible).toBeUndefined();
    const longTruncatedVisible = spans.find(
      (s) => s.textContent?.startsWith('Maximilian Wolfgang') && s.textContent.includes('…')
    );
    expect(longTruncatedVisible).toBeDefined();

    // ...while the full name remains available via the <title> fallback.
    const titles = Array.from(container.querySelectorAll('title'));
    expect(titles.some((t) => t.textContent === longName)).toBe(true);
  });

  it('displays 3rd and 4th place placement labels once the third-place match is decided', () => {
    const bracket = makeBracketSize4();
    const third = makeParticipant('p3', 'Charlie', 3);
    const fourth = makeParticipant('p4', 'Diana', 4);
    bracket.thirdPlaceMatch = {
      ...bracket.thirdPlaceMatch!,
      participant1: third,
      participant2: fourth,
      winner: third,
    };
    bracket.thirdPlace = third;
    bracket.fourthPlace = fourth;

    mockState = { bracket };
    render(<BracketVisualizer />);

    // Placement banner shows both the 3rd- and 4th-place designations with names.
    expect(screen.getByText(/3rd place: charlie/i)).toBeInTheDocument();
    expect(screen.getByText(/4th place: diana/i)).toBeInTheDocument();
  });
});
