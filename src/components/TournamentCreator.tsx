import React, { useState } from 'react';
import { useTournament } from '../state/tournament-context';
import { VALID_BRACKET_SIZES, MAX_CATEGORY_LENGTH } from '../types/index';
import { isValidPlayerCount } from '../services/validation';

/**
 * TournamentCreator component - renders a form for creating a new tournament.
 *
 * Features:
 * - Category name text input with validation (1-100 chars, non-empty after trimming)
 * - Bracket size dropdown with only valid power-of-2 options
 * - Optional Player_Count input: empty -> Classic_Mode; positive integer -> Vote_Based_Mode
 * - Inline validation error display
 * - Success confirmation when tournament is created
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 11.1, 11.2, 11.3, 11.4
 */
export function TournamentCreator() {
  const { state, dispatch } = useTournament();
  const [category, setCategory] = useState('');
  const [bracketSize, setBracketSize] = useState<number>(VALID_BRACKET_SIZES[1]); // default 4
  const [playerCountInput, setPlayerCountInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const trimmed = category.trim();
    if (trimmed.length === 0) {
      setValidationError('Please enter a category name for your tournament.');
      return;
    }
    if (trimmed.length > MAX_CATEGORY_LENGTH) {
      setValidationError('Category name must be 100 characters or fewer.');
      return;
    }

    // Optional Player_Count (Req 11.1-11.4).
    // Empty/whitespace -> null (Classic_Mode). Otherwise parse and validate;
    // an invalid non-empty value is rejected without dispatching (input retained).
    const trimmedPlayerCount = playerCountInput.trim();
    let playerCount: number | null = null;
    if (trimmedPlayerCount.length > 0) {
      playerCount = Number(trimmedPlayerCount);
      if (!isValidPlayerCount(playerCount)) {
        setValidationError(
          'Player count must be a whole number of 1 or more, or left empty for a classic tournament.'
        );
        return;
      }
    }

    // Clear local validation error and dispatch
    setValidationError(null);
    dispatch({
      type: 'CREATE_TOURNAMENT',
      payload: { category: trimmed, bracketSize, playerCount },
    });
  };

  // Show the combined error: local validation error or reducer ui.error
  const displayError = validationError || state.ui.error;

  // If tournament was created successfully, show confirmation
  if (state.tournament) {
    return (
      <div aria-live="polite" role="status">
        <h2>Tournament Created</h2>
        <p>
          Your tournament <strong>{state.tournament.category}</strong> has been
          created with a bracket size of <strong>{state.tournament.bracketSize}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="tournament-creator-heading">
      <h2 id="tournament-creator-heading">Create a Tournament</h2>

      <div>
        <label htmlFor="category-input">Category Name</label>
        <input
          id="category-input"
          type="text"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            // Clear validation error when user types
            if (validationError) {
              setValidationError(null);
            }
          }}
          maxLength={MAX_CATEGORY_LENGTH}
          aria-required="true"
          aria-invalid={!!displayError}
          aria-describedby={displayError ? 'category-error' : undefined}
          placeholder="e.g., Best pasta al sugo"
        />
      </div>

      <div>
        <label htmlFor="bracket-size-select">Bracket Size</label>
        <select
          id="bracket-size-select"
          value={bracketSize}
          onChange={(e) => setBracketSize(Number(e.target.value))}
          aria-describedby="bracket-size-description"
        >
          {VALID_BRACKET_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span id="bracket-size-description" className="sr-only">
          Select the number of participants for your tournament bracket. Must be a power of 2.
        </span>
      </div>

      <div>
        <label htmlFor="player-count-input">Number of players (optional)</label>
        <input
          id="player-count-input"
          type="number"
          min={1}
          step={1}
          value={playerCountInput}
          onChange={(e) => {
            setPlayerCountInput(e.target.value);
            // Clear validation error when user types
            if (validationError) {
              setValidationError(null);
            }
          }}
          aria-required="false"
          aria-invalid={!!displayError}
          aria-describedby="player-count-description"
          placeholder="e.g., 10"
        />
        <span id="player-count-description" className="helper-text">
          Leave empty for a classic tournament (pick winners manually). Enter a
          number to decide matchups by votes.
        </span>
      </div>

      {displayError && (
        <p id="category-error" className="error" role="alert" aria-live="assertive" style={{ color: 'red' }}>
          {displayError}
        </p>
      )}

      <button type="submit" className="btn">Create Tournament</button>
    </form>
  );
}
