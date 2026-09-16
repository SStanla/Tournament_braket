// Component tests for the App shell and screen router (Task 25).
//
// Covers the global chrome (logo + always-available "New tournament" control,
// Req 2.4, 24.7) and the phase-driven routing between screens (design.md
// "Screen Flow"). Routing is exercised end-to-end through the real UI: the app
// wraps its own TournamentProvider, so we drive it the way a user would rather
// than injecting state.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// The provider hydrates from sessionStorage on mount; clear it around each test
// so a tournament created in one test does not leak into the next.
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
});

describe('App header chrome', () => {
  it('renders the header with the logo and title', () => {
    render(<App />);
    expect(
      screen.getByRole('img', { name: /tournament bracket creator logo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /tournament bracket creator/i }),
    ).toBeInTheDocument();
  });

  it('always exposes a "New tournament" control (Req 2.4)', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /new tournament/i }),
    ).toBeInTheDocument();
  });
});

describe('App screen routing', () => {
  it('shows the CreateScreen before any tournament exists', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /create a tournament/i }),
    ).toBeInTheDocument();
  });

  it('routes to the FillScreen after a tournament is created (FILLING phase)', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/category/i), 'Best pasta sauce');
    await user.selectOptions(screen.getByLabelText(/bracket size/i), '4');
    await user.click(screen.getByRole('button', { name: /create tournament/i }));

    expect(
      screen.getByRole('heading', { name: /fill the bracket/i }),
    ).toBeInTheDocument();
  });

  it('resets to the CreateScreen when "New tournament" is invoked (Req 2.5)', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Create a tournament to leave the CREATE phase.
    await user.type(screen.getByLabelText(/category/i), 'Best movie');
    await user.click(screen.getByRole('button', { name: /create tournament/i }));
    expect(
      screen.getByRole('heading', { name: /fill the bracket/i }),
    ).toBeInTheDocument();

    // "New tournament" clears everything and returns to creation.
    await user.click(screen.getByRole('button', { name: /new tournament/i }));
    expect(
      screen.getByRole('heading', { name: /create a tournament/i }),
    ).toBeInTheDocument();
  });
});
