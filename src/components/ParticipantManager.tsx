import React, { useState } from 'react';
import { useTournament } from '../state/tournament-context';

/**
 * ParticipantManager component handles adding, displaying, and removing
 * participants from the tournament bracket.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */
export function ParticipantManager() {
  const { state, dispatch } = useTournament();
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const bracket = state.bracket;
  const participants = bracket?.participants ?? [];
  const bracketSize = bracket?.size ?? 0;
  const isFull = participants.length >= bracketSize;

  const displayError = localError || state.ui.error;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setLocalError('Please enter a participant name.');
      return;
    }
    setLocalError(null);
    dispatch({ type: 'ADD_PARTICIPANT', payload: { name } });
    // Clear the input only if there's no error after dispatch
    // Since dispatch is synchronous in useReducer, the error state will
    // be updated. We optimistically clear and let the error display handle it.
    setName('');
  }

  function handleRemove(id: string) {
    dispatch({ type: 'REMOVE_PARTICIPANT', payload: { id } });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
    if (localError) {
      setLocalError(null);
    }
  }

  return (
    <section aria-labelledby="participant-manager-heading">
      <h2 id="participant-manager-heading">Participants</h2>

      <p>
        {participants.length}/{bracketSize} participants
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="participant-name-input">Participant name</label>
        <input
          id="participant-name-input"
          type="text"
          value={name}
          onChange={handleChange}
          disabled={isFull}
          aria-describedby="participant-error"
          placeholder={isFull ? 'Bracket is full' : 'Enter participant name'}
        />
        <button type="submit" className="btn" disabled={isFull}>
          Add
        </button>
      </form>

      {displayError && (
        <p id="participant-error" className="error" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}

      {participants.length > 0 && (
        <ul className="participant-list" aria-label="Participant list">
          {participants.map((participant) => (
            <li key={participant.id}>
              <span>{participant.name}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleRemove(participant.id)}
                aria-label={`Remove ${participant.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
