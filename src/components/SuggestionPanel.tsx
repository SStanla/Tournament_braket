import { useState, useCallback } from 'react';
import { useTournament } from '../state/tournament-context';
import { generateSuggestionsWithFallback } from '../services/auto-suggest';
import type { Suggestion } from '../types/suggestions';

/**
 * SuggestionPanel component handles the auto-suggestion workflow.
 *
 * - Shows "Fill Remaining Slots" button when participant count < bracket size
 * - Calls generateSuggestionsWithFallback on click
 * - Displays loading state during generation
 * - Renders each suggestion with accept/reject/replace actions
 * - Displays error message on failure with manual entry fallback
 *
 * Validates: Requirements 4.1, 4.4, 4.5, 4.6
 */
export function SuggestionPanel() {
  const { state, dispatch } = useTournament();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceInputs, setReplaceInputs] = useState<Record<string, string>>({});

  const bracket = state.bracket;
  const tournament = state.tournament;
  const suggestions = state.suggestions.items;
  const participants = bracket?.participants ?? [];
  const bracketSize = bracket?.size ?? 0;
  const remainingSlots = bracketSize - participants.length;
  const showSuggestButton = remainingSlots > 0 && !loading;

  const allHandled = suggestions.length > 0 && suggestions.every(
    (s) => s.status === 'accepted' || s.status === 'rejected'
  );

  const hasPendingSuggestions = suggestions.some((s) => s.status === 'pending');

  const handleSuggest = useCallback(async () => {
    if (!tournament || !bracket) return;

    setLoading(true);
    setError(null);

    try {
      const result = await generateSuggestionsWithFallback({
        category: tournament.category,
        existingParticipants: participants.map((p) => p.name),
        count: remainingSlots,
      });

      if (result.error && result.suggestions.length === 0) {
        setError(result.error);
      } else {
        dispatch({ type: 'SET_SUGGESTIONS', payload: { suggestions: result.suggestions } });
        if (result.error) {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while generating suggestions.'
      );
    } finally {
      setLoading(false);
    }
  }, [tournament, bracket, participants, remainingSlots, dispatch]);

  function handleAccept(suggestionId: string) {
    dispatch({ type: 'ACCEPT_SUGGESTION', payload: { suggestionId } });
  }

  function handleReject(suggestionId: string) {
    dispatch({ type: 'REJECT_SUGGESTION', payload: { suggestionId } });
  }

  function handleAcceptAll() {
    dispatch({ type: 'ACCEPT_ALL_SUGGESTIONS' });
  }

  function handleReplaceInputChange(suggestionId: string, value: string) {
    setReplaceInputs((prev) => ({ ...prev, [suggestionId]: value }));
  }

  function handleReplace(suggestionId: string) {
    const newName = replaceInputs[suggestionId]?.trim();
    if (!newName) return;
    dispatch({ type: 'REPLACE_SUGGESTION', payload: { suggestionId, newName } });
    setReplaceInputs((prev) => {
      const copy = { ...prev };
      delete copy[suggestionId];
      return copy;
    });
  }

  function getStatusLabel(status: Suggestion['status']): string {
    switch (status) {
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      case 'pending':
      default:
        return 'Pending';
    }
  }

  // Don't render if no tournament or bracket exists
  if (!tournament || !bracket) return null;

  // Don't render if bracket is already full and there are no suggestions to display
  if (remainingSlots <= 0 && suggestions.length === 0) return null;

  return (
    <section aria-labelledby="suggestion-panel-heading">
      <h2 id="suggestion-panel-heading">Auto-Suggestions</h2>

      {showSuggestButton && suggestions.length === 0 && (
        <p>
          {remainingSlots} slot{remainingSlots !== 1 ? 's' : ''} remaining.
          Let the system suggest participants to fill your bracket.
        </p>
      )}

      {showSuggestButton && suggestions.length === 0 && (
        <button
          type="button"
          className="btn"
          onClick={handleSuggest}
          aria-label="Fill remaining bracket slots with suggestions"
        >
          Fill Remaining Slots
        </button>
      )}

      {loading && (
        <p aria-live="polite" role="status">
          Generating suggestions...
        </p>
      )}

      {error && (
        <div className="error" role="alert" aria-live="assertive">
          <p>{error}</p>
          <p>You can enter the remaining participants manually.</p>
        </div>
      )}

      {hasPendingSuggestions && (
        <div className="suggestion-actions">
          <button
            type="button"
            className="btn"
            onClick={handleAcceptAll}
            aria-label="Accept all suggested participants"
          >
            Accept all
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="suggestion-list" aria-label="Suggestion list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} data-status={suggestion.status}>
              <span>{suggestion.name}</span>
              <span aria-label={`Status: ${getStatusLabel(suggestion.status)}`}>
                {' '}({getStatusLabel(suggestion.status)})
              </span>

              {suggestion.status === 'pending' && (
                <span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleAccept(suggestion.id)}
                    aria-label={`Accept ${suggestion.name}`}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleReject(suggestion.id)}
                    aria-label={`Reject ${suggestion.name}`}
                  >
                    Reject
                  </button>
                  <input
                    type="text"
                    value={replaceInputs[suggestion.id] ?? ''}
                    onChange={(e) => handleReplaceInputChange(suggestion.id, e.target.value)}
                    placeholder="Replace with..."
                    aria-label={`Replacement name for ${suggestion.name}`}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleReplace(suggestion.id)}
                    disabled={!replaceInputs[suggestion.id]?.trim()}
                    aria-label={`Replace ${suggestion.name}`}
                  >
                    Replace
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {allHandled && (
        <p aria-live="polite" role="status">
          All suggestions have been reviewed.
        </p>
      )}
    </section>
  );
}
