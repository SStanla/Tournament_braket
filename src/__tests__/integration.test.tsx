import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import App from '../App';

/**
 * Integration tests for end-to-end tournament flows.
 *
 * Validates: Requirements 1.1, 3.1, 4.1, 5.1, 6.1, 6.3, 7.4
 */

beforeEach(() => {
  // Clear sessionStorage before each test so tests are isolated
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Integration: Full Tournament Flow', () => {
  it('creates tournament → adds participants → generates bracket → selects winners → champion', async () => {
    render(<App />);

    // Step 1: Create tournament
    const categoryInput = screen.getByLabelText(/category name/i);
    const bracketSizeSelect = screen.getByLabelText(/bracket size/i);

    fireEvent.change(categoryInput, { target: { value: 'Best Movies' } });
    fireEvent.change(bracketSizeSelect, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    // Should show confirmation and move to participant entry phase
    await waitFor(() => {
      expect(screen.getByText(/best movies/i)).toBeInTheDocument();
    });

    // Step 2: Add 4 participants
    const participantNames = ['The Godfather', 'Inception', 'Interstellar', 'Pulp Fiction'];

    for (const name of participantNames) {
      const input = screen.getByLabelText(/participant name/i);
      fireEvent.change(input, { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    }

    // Verify all participants are listed
    await waitFor(() => {
      expect(screen.getByText('4/4 participants')).toBeInTheDocument();
    });

    for (const name of participantNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }

    // Step 3: Generate bracket
    const generateBtn = screen.getByRole('button', { name: /generate bracket/i });
    expect(generateBtn).toBeInTheDocument();
    fireEvent.click(generateBtn);

    // NEW FLOW: during play the app renders CurrentRoundView (NOT the SVG),
    // showing only the current round headed by its Stage_Label. For a size-4
    // bracket the first round is the Semifinal (Req 5.4, 14.1).
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Semifinal$/i })).toBeInTheDocument();
    });

    // The full SVG bracket must NOT be visible while the tournament is in play.
    expect(
      screen.queryByRole('img', { name: /tournament bracket visualization/i })
    ).not.toBeInTheDocument();

    // Step 4: Win both Semifinal matchups.
    // NEW FLOW: single-matchup pagination shows exactly ONE Matchup_Screen at a
    // time (counter "Matchup 1 of 2"), with aria-labelled Prev/Next navigation.
    // Only the visible matchup exposes its "Select {name} as winner" buttons, so
    // we decide the first matchup, click "Next matchup", then decide the second.
    const semifinalMatchups = screen.getAllByLabelText(/^Matchup:/);
    expect(semifinalMatchups.length).toBe(1);
    expect(screen.getByText(/Matchup 1 of 2/i)).toBeInTheDocument();

    // Decide the first (visible) Semifinal matchup.
    fireEvent.click(
      within(semifinalMatchups[0]).getAllByRole('button', {
        name: /^Select .* as winner$/i,
      })[0]
    );

    // Navigate to the second Semifinal matchup and decide it too.
    fireEvent.click(screen.getByRole('button', { name: /next matchup/i }));
    await waitFor(() => {
      const [matchup] = screen.getAllByLabelText(/^Matchup:/);
      fireEvent.click(
        within(matchup).getAllByRole('button', {
          name: /^Select .* as winner$/i,
        })[0]
      );
    });

    // Step 4c: Both semifinals decided → for a size-4 bracket the final stage
    // now exposes the THIRD-PLACE match FIRST (before the Final), headed
    // "Third-place match" (Req 10.9, 14.6). dispatch + re-render is async.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /third-place match/i })
      ).toBeInTheDocument();
    });

    // The Final must NOT be shown yet while the third-place winner is undecided.
    expect(screen.queryByRole('heading', { name: /^Final$/i })).not.toBeInTheDocument();

    // Decide the third-place match by picking one of its participants. Re-query
    // after the transition rather than reusing stale nodes.
    await waitFor(() => {
      const thirdPlaceButtons = screen.getAllByRole('button', {
        name: /^Select .* as winner$/i,
      });
      expect(thirdPlaceButtons.length).toBe(2);
      fireEvent.click(thirdPlaceButtons[0]);
    });

    // Step 4d: Third place decided → CurrentRoundView now advances to the Final
    // (Req 10.10, 14.7), which has two participants.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Final$/i })).toBeInTheDocument();
    });

    // Decide the champion by picking a participant in the Final. Re-query after
    // the round transition rather than reusing stale nodes.
    await waitFor(() => {
      const finalButtons = screen.getAllByRole('button', {
        name: /^Select .* as winner$/i,
      });
      expect(finalButtons.length).toBe(2);
      fireEvent.click(finalButtons[0]);
    });

    // Step 5: Once complete, the Final_Standings are rendered (before the full
    // tree) and the full SVG bracket also appears (Req 5.5, 15.1). The standings
    // list is headed "Final standings" with a 🥇 first-place row.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /final standings/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('img', { name: /tournament bracket visualization/i })
      ).toBeInTheDocument();
    });

    // The first-place (🥇) placement indicator is present in the standings.
    expect(screen.getByLabelText(/1st place/i)).toBeInTheDocument();
  });
});

describe('Integration: Suggestion Flow', () => {
  it('creates tournament → requests suggestions → accepts all → fills bracket', async () => {
    // Mock fetch to return AI suggestions
    const mockSuggestions = ['Suggestion A', 'Suggestion B', 'Suggestion C'];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify(mockSuggestions),
      }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);

    // Step 1: Create tournament with bracket size 4
    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best Songs' },
    });
    fireEvent.change(screen.getByLabelText(/bracket size/i), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    // Wait for tournament creation
    await waitFor(() => {
      expect(screen.getByText(/best songs/i)).toBeInTheDocument();
    });

    // Step 2: Add 1 participant manually
    const input = screen.getByLabelText(/participant name/i);
    fireEvent.change(input, { target: { value: 'Bohemian Rhapsody' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    });

    // Step 3: Click "Fill Remaining Slots" to trigger AI suggestions
    const fillButton = screen.getByRole('button', { name: /fill remaining/i });
    expect(fillButton).toBeInTheDocument();
    fireEvent.click(fillButton);

    // Wait for suggestions to appear
    await waitFor(() => {
      expect(screen.getByText('Suggestion A')).toBeInTheDocument();
      expect(screen.getByText('Suggestion B')).toBeInTheDocument();
      expect(screen.getByText('Suggestion C')).toBeInTheDocument();
    });

    // Step 4: Accept all suggestions via the dedicated "Accept all" button.
    // NOTE: a generic /^accept/i query would also match each per-suggestion
    // "Accept {name}" button, so target the "Accept all" control explicitly.
    const acceptAllButton = screen.getByRole('button', {
      name: /accept all suggested participants/i,
    });
    fireEvent.click(acceptAllButton);

    // Verify the bracket is now full (1 manual + 3 suggestions = 4)
    await waitFor(() => {
      expect(screen.getByText('4/4 participants')).toBeInTheDocument();
    });

    // Step 5: Generate bracket should be available
    const generateBtn = screen.getByRole('button', { name: /generate bracket/i });
    expect(generateBtn).toBeInTheDocument();
  });
});

describe('Integration: Session Persistence', () => {
  it('creates tournament and participants → unmounts → remounts → state restored', async () => {
    const { unmount } = render(<App />);

    // Create tournament
    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Best Frameworks' },
    });
    fireEvent.change(screen.getByLabelText(/bracket size/i), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }));

    await waitFor(() => {
      expect(screen.getByText(/best frameworks/i)).toBeInTheDocument();
    });

    // Add participants
    const names = ['React', 'Vue'];
    for (const name of names) {
      const input = screen.getByLabelText(/participant name/i);
      fireEvent.change(input, { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    }

    await waitFor(() => {
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('Vue')).toBeInTheDocument();
    });

    // Unmount the app (simulates browser tab close or navigation)
    unmount();

    // Remount the app — should restore state from sessionStorage
    render(<App />);

    // Verify tournament and participants are still present
    await waitFor(() => {
      expect(screen.getByText(/best frameworks/i)).toBeInTheDocument();
    });
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
    expect(screen.getByText('2/4 participants')).toBeInTheDocument();
  });
});
