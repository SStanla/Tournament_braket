// UI layer — SuggestionReview (Task 20).
//
// Presents the pending suggestions for review before any of them enters the
// tournament (Req 10.1). Each item offers Accept / Reject / Replace, plus batch
// "Accept all" and "Reject all" controls. Reject and Reject-all trigger the
// asynchronous suggestion service to regenerate replacement(s), following the
// established pattern: the service resolves name(s), and the component dispatches
// the follow-up reducer action with the resolved result. Replace never triggers
// regeneration (Req 10.6, 11.2).
//
// All suggestion rules live in the reducer + pure domain validators; this
// component only wires them to controls, drives the async regeneration, and
// surfaces messages inline (design.md "UI Components — SuggestionReview").

import { useState, type FormEvent } from 'react';
import type { Suggestion, Tournament } from '../domain/model';
import { validateOptionName } from '../domain/validation';
import { useTournament } from '../app/TournamentContext';
import {
  regenerateOne,
  requestSuggestions,
  type SuggestionServiceDeps,
} from '../services/suggestionService';
import { allSuggestionsHandled } from '../app/tournamentReducer';
import styles from './SuggestionReview.module.css';

/**
 * Optional dependency injection for the suggestion service, mirroring the
 * service's own `SuggestionServiceDeps`. Tests pass a fake so regeneration is
 * deterministic and offline; production leaves it undefined and the service
 * uses its real cascade (AI proxy then curated lists).
 */
export interface SuggestionReviewProps {
  serviceOverrides?: Partial<SuggestionServiceDeps>;
}

/** The names a fresh/regenerated suggestion must avoid: current options + still-pending suggestions. */
function takenNames(tournament: Tournament): {
  optionNames: string[];
  pendingSuggestionNames: string[];
} {
  return {
    optionNames: tournament.options.map((o) => o.name),
    pendingSuggestionNames: tournament.suggestions
      .filter((s) => s.status === 'pending')
      .map((s) => s.name),
  };
}

/**
 * Generate a stable, unique suggestion id in the `sug-<n>` scheme. A strictly
 * increasing suffix over the existing suggestion ids means rejected/replaced
 * entries (which we keep for their audit trail) never collide with a freshly
 * installed replacement.
 */
function nextSuggestionId(suggestions: readonly Suggestion[]): string {
  let max = 0;
  for (const s of suggestions) {
    const match = /^sug-(\d+)$/.exec(s.id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return `sug-${max + 1}`;
}

/**
 * Suggestion review panel. Renders each pending suggestion with its controls,
 * the batch controls, a manual-fill note when the last produced set could not
 * fill every slot (Req 9.8), and an all-handled indication when nothing is left
 * to review (Req 10.13).
 */
export default function SuggestionReview({
  serviceOverrides,
}: SuggestionReviewProps) {
  const { state, dispatch } = useTournament();
  const tournament = state.tournament;

  // The suggestion under active replacement, and its draft text + inline error.
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceDraft, setReplaceDraft] = useState('');
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // Whether the most recent produced set left slots for manual filling (Req 9.8).
  const [manualFillNeeded, setManualFillNeeded] = useState(false);
  // Guards the async controls from overlapping regeneration requests.
  const [busy, setBusy] = useState(false);

  if (!tournament) return null;

  const pending = tournament.suggestions.filter((s) => s.status === 'pending');
  const handledAll = allSuggestionsHandled(tournament);
  const missingSlots = tournament.size - tournament.options.length;

  /**
   * Reject one suggestion (Req 10.3, 11.1). Ask the service for a unique
   * replacement for the freed slot, then dispatch REJECT_SUGGESTION with the
   * resolved replacement wrapped as a new pending suggestion — or with none when
   * the service could not produce one, leaving the slot for manual fill (Req 10.4).
   */
  async function handleReject(id: string) {
    if (!tournament || busy) return;
    setBusy(true);
    try {
      const { optionNames, pendingSuggestionNames } = takenNames(tournament);
      // The rejected suggestion is itself still pending here; exclude its own
      // name so a fresh, distinct replacement is what we require.
      const rejected = tournament.suggestions.find((s) => s.id === id);
      const avoidSuggestionNames = pendingSuggestionNames.filter(
        (n) => !(rejected && n === rejected.name),
      );

      const replacementName = await regenerateOne(
        tournament.category,
        optionNames,
        avoidSuggestionNames,
        serviceOverrides,
      );

      if (replacementName) {
        const replacement: Suggestion = {
          id: nextSuggestionId(tournament.suggestions),
          name: replacementName,
          status: 'pending',
        };
        dispatch({ type: 'REJECT_SUGGESTION', id, replacement });
        setManualFillNeeded(false);
      } else {
        // No unique replacement available: leave the slot for manual fill.
        dispatch({ type: 'REJECT_SUGGESTION', id });
        setManualFillNeeded(true);
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reject every pending suggestion (Req 10.11) and request a fresh AI-based set
   * for the still-missing slots (Req 10.12). The reducer first marks them
   * rejected; we then deliver the new pending set via REQUEST_SUGGESTIONS.
   */
  async function handleRejectAll() {
    if (!tournament || busy || pending.length === 0) return;
    setBusy(true);
    try {
      dispatch({ type: 'REJECT_ALL' });

      // After rejection the freed slots are the full remaining capacity; none of
      // the just-rejected names should be reused.
      const optionNames = tournament.options.map((o) => o.name);
      const want = tournament.size - tournament.options.length;
      if (want > 0) {
        const result = await requestSuggestions(
          tournament.category,
          optionNames,
          want,
          serviceOverrides,
        );
        const fresh: Suggestion[] = result.suggestions.map((name, i) => ({
          id: `sug-fresh-${Date.now()}-${i}`,
          name,
          status: 'pending',
        }));
        if (fresh.length > 0) {
          dispatch({ type: 'REQUEST_SUGGESTIONS', suggestions: fresh });
        }
        setManualFillNeeded(result.manualFillNeeded);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleAcceptAll() {
    if (!tournament) return;
    dispatch({ type: 'ACCEPT_ALL' });
  }

  function beginReplace(suggestion: Suggestion) {
    setReplacingId(suggestion.id);
    setReplaceDraft(suggestion.name);
    setReplaceError(null);
  }

  function cancelReplace() {
    setReplacingId(null);
    setReplaceDraft('');
    setReplaceError(null);
  }

  /**
   * Submit a replacement (Req 10.5, 10.7). Validate the typed name exactly like
   * an option name — against current options and the *other* pending suggestions
   * — surfacing an inline message on failure and changing nothing. On success
   * the reducer renames + accepts in a single action; no regeneration (Req 10.6).
   */
  function handleReplaceSubmit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!tournament) return;

    const others = tournament.suggestions.filter(
      (s) => s.id !== id && s.status === 'pending',
    );
    const validation = validateOptionName(
      replaceDraft,
      tournament.options,
      others,
    );
    if (!validation.ok) {
      setReplaceError(validation.message);
      return;
    }

    dispatch({ type: 'REPLACE_SUGGESTION', id, name: replaceDraft });
    cancelReplace();
  }

  return (
    <section className={styles.panel} aria-labelledby="suggestions-title">
      <h3 id="suggestions-title" className={styles.title}>
        Review suggestions
      </h3>

      {state.lastError && (
        <p className={styles.error} role="alert">
          {state.lastError}
        </p>
      )}

      {pending.length > 0 && (
        <div className={styles.batchControls}>
          <button
            type="button"
            className={styles.batchButton}
            onClick={handleAcceptAll}
            disabled={busy}
          >
            Accept all
          </button>
          <button
            type="button"
            className={styles.batchButton}
            onClick={handleRejectAll}
            disabled={busy}
          >
            Reject all
          </button>
        </div>
      )}

      {pending.length > 0 ? (
        <ul className={styles.list}>
          {pending.map((suggestion) => (
            <li key={suggestion.id} className={styles.item}>
              {replacingId === suggestion.id ? (
                <form
                  className={styles.replaceForm}
                  onSubmit={(event) => handleReplaceSubmit(event, suggestion.id)}
                  noValidate
                >
                  <label
                    className={styles.replaceLabel}
                    htmlFor={`replace-${suggestion.id}`}
                  >
                    Replacement name
                  </label>
                  <input
                    id={`replace-${suggestion.id}`}
                    className={
                      replaceError
                        ? `${styles.replaceInput} ${styles.inputError}`
                        : styles.replaceInput
                    }
                    type="text"
                    value={replaceDraft}
                    onChange={(event) => {
                      setReplaceDraft(event.target.value);
                      setReplaceError(null);
                    }}
                    aria-invalid={replaceError ? true : undefined}
                    aria-describedby={
                      replaceError ? `replace-error-${suggestion.id}` : undefined
                    }
                    autoFocus
                  />
                  {replaceError && (
                    <p
                      id={`replace-error-${suggestion.id}`}
                      className={styles.error}
                      role="alert"
                    >
                      {replaceError}
                    </p>
                  )}
                  <div className={styles.replaceActions}>
                    <button type="submit" className={styles.primaryButton}>
                      Confirm replacement
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={cancelReplace}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <span className={styles.name}>{suggestion.name}</span>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() =>
                        dispatch({ type: 'ACCEPT_SUGGESTION', id: suggestion.id })
                      }
                      disabled={busy}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleReject(suggestion.id)}
                      disabled={busy}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => beginReplace(suggestion)}
                      disabled={busy}
                    >
                      Replace
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        handledAll && (
          <p className={styles.allHandled} role="status">
            All suggestions handled.
          </p>
        )
      )}

      {manualFillNeeded && missingSlots > 0 && (
        <p className={styles.manualFill} role="status">
          Not enough suggestions could be produced. Please fill the remaining{' '}
          {missingSlots === 1 ? 'slot' : `${missingSlots} slots`} by hand.
        </p>
      )}
    </section>
  );
}
