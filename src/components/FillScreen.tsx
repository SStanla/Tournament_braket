// UI layer — FillScreen (Task 19).
//
// The filling phase: the user adds and removes options until the bracket is
// exactly full, optionally pulling in AI/curated suggestions, then generates
// the bracket. This component only wires user intents to the reducer and the
// suggestion service; all rules live in the pure domain layer (design.md "UI
// Components — FillScreen").
//
// Responsibilities of this task:
//   - Show the "X / size" count indicator (Req 6.1).
//   - Add-option input that is disabled with a visible "full" signal once the
//     option count equals the size (Req 6.7).
//   - Option list with a remove button per option (Req 7.1); removal is allowed
//     even when full, so the input never blocks it (Req 7.3).
//   - A "Suggest options" action available while slots remain (Req 9.1).
//   - A "Generate bracket" action shown ONLY when the bracket is exactly full
//     (Req 8.1).
//
// The per-item Accept/Reject/Replace suggestion review UI is Task 20; here we
// only request suggestions and hand the pending set to the reducer.

import { useCallback, useState, type FormEvent } from 'react';
import { canGenerate } from '../domain/tournament';
import type { Suggestion } from '../domain/model';
import { useTournament } from '../app/TournamentContext';
import { requestSuggestions } from '../services/suggestionService';
import styles from './FillScreen.module.css';

/**
 * Turn the raw suggestion strings produced by the cascade into pending
 * {@link Suggestion} objects for the reducer. Ids are unique within the batch
 * and namespaced (`sug-<timestamp>-<index>`) so they don't collide with option
 * ids or with a later batch appended after a reject-all.
 */
function toPendingSuggestions(names: string[]): Suggestion[] {
  const stamp = Date.now();
  return names.map((name, index) => ({
    id: `sug-${stamp}-${index}`,
    name,
    status: 'pending' as const,
  }));
}

/**
 * The filling screen. Reads the current tournament from context; only rendered
 * by the screen router while the tournament is in the FILLING phase, so a
 * tournament is always present.
 */
export default function FillScreen() {
  const { state, dispatch } = useTournament();
  const tournament = state.tournament;

  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  const optionCount = tournament?.options.length ?? 0;
  const size = tournament?.size ?? 0;
  const isFull = tournament ? canGenerate(tournament) : false;
  const slotsRemaining = size - optionCount;

  const handleSuggest = useCallback(async () => {
    if (!tournament || slotsRemaining <= 0) return;
    setSuggesting(true);
    try {
      const existingNames = tournament.options.map((o) => o.name);
      const { suggestions } = await requestSuggestions(
        tournament.category,
        existingNames,
        slotsRemaining,
      );
      if (suggestions.length > 0) {
        dispatch({
          type: 'REQUEST_SUGGESTIONS',
          suggestions: toPendingSuggestions(suggestions),
        });
      }
    } finally {
      setSuggesting(false);
    }
  }, [tournament, slotsRemaining, dispatch]);

  // A tournament is always present in the FILLING phase; guard defensively so
  // the component is safe to render in isolation.
  if (!tournament) return null;

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Let the reducer enforce the trim/empty/duplicate/capacity rules; it
    // surfaces any rejection via state.lastError (Req 6.2, 6.3, 6.5, 6.6). Only
    // clear the draft when a name with content was submitted, so an accidental
    // empty submit doesn't wipe what the user typed while the error explains it.
    dispatch({ type: 'ADD_OPTION', name: draft });
    if (draft.trim().length > 0) {
      setDraft('');
    }
  }

  const addErrorId = 'fill-add-error';
  const showAddError = state.lastError !== undefined;

  return (
    <section className={styles.screen} aria-labelledby="fill-title">
      <h2 id="fill-title" className={styles.title}>
        Fill the bracket
      </h2>
      <p className={styles.category}>{tournament.category}</p>

      {/* "X / size" count indicator (Req 6.1). */}
      <p className={styles.count}>
        <span className={styles.countValue} aria-hidden="true">
          {optionCount} / {size}
        </span>
        <span>
          {optionCount} of {size} options added
        </span>
      </p>

      {isFull && (
        <p className={styles.fullSignal} role="status">
          The bracket is full. Remove an option to make room, or generate the
          bracket.
        </p>
      )}

      <div className={styles.section}>
        <form className={styles.addForm} onSubmit={handleAdd} noValidate>
          <input
            className={
              showAddError ? `${styles.input} ${styles.inputError}` : styles.input
            }
            type="text"
            aria-label="Add an option"
            placeholder="e.g. Marinara"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // Disabled once full, so no more than `size` options can be added
            // (Req 6.6, 6.7).
            disabled={isFull}
            aria-invalid={showAddError ? true : undefined}
            aria-describedby={showAddError ? addErrorId : undefined}
          />
          <button className={styles.button} type="submit" disabled={isFull}>
            Add
          </button>
        </form>
        {showAddError && (
          <p id={addErrorId} className={styles.error} role="alert">
            {state.lastError}
          </p>
        )}

        {/* "Suggest options" is available only while slots remain (Req 9.1). */}
        <button
          type="button"
          className={styles.secondary}
          onClick={handleSuggest}
          disabled={isFull || suggesting}
        >
          {suggesting ? 'Suggesting…' : 'Suggest options'}
        </button>
      </div>

      <div className={styles.section}>
        {optionCount === 0 ? (
          <p className={styles.empty}>No options yet. Add your first one above.</p>
        ) : (
          <ul className={styles.optionList} aria-label="Options">
            {tournament.options.map((option) => (
              <li key={option.id} className={styles.optionItem}>
                <span className={styles.optionName}>{option.name}</span>
                {/* Remove is always available, even when full (Req 7.1, 7.3). */}
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() =>
                    dispatch({ type: 'REMOVE_OPTION', id: option.id })
                  }
                  aria-label={`Remove ${option.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* "Generate bracket" appears ONLY when the bracket is exactly full
          (Req 8.1); an incomplete bracket can never be generated (Req 8.2). */}
      {isFull && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.generate}
            onClick={() => dispatch({ type: 'GENERATE' })}
          >
            Generate bracket
          </button>
        </div>
      )}
    </section>
  );
}
