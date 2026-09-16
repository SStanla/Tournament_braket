// Application layer — the single tournament reducer (Task 14.1).
//
// This module is the ONLY place domain transitions are invoked. Every user
// intent is expressed as an action; the reducer maps each action 1:1 to the
// corresponding pure domain function in `../domain/tournament`, keeping all
// rules and invariants funneled through the tested domain layer (design.md
// "Application Layer"; correctness properties enforced structurally).
//
// Domain functions that can fail return an `OptionResult`/`MatchupResult`
// discriminated union (`{ ok: true, tournament } | { ok: false, message }`).
// On failure the reducer keeps the current tournament unchanged and stores the
// message in a transient `lastError` field; on success it takes the new
// tournament. Successful transitions clear any prior error/notice.
//
// NEW_TOURNAMENT resets everything back to the CREATE phase, matching Req 2.4,
// 2.5 (a fresh initial state with no tournament).

import type { Suggestion, Tournament } from '../domain/model';
import {
  addOption,
  advanceIfRoundComplete,
  canGenerate,
  computeStandings,
  confirmMatchup,
  correctOutcome,
  createTournament,
  generateBracket,
  isComplete,
  removeOption,
  resolveTieBreak,
  setProvisionalVotes,
  setProvisionalWinner,
  type Correction,
  type CreateTournamentInput,
} from '../domain/tournament';
import { validateOptionName } from '../domain/validation';

/**
 * Top-level application state.
 *
 * `tournament` is `null` before any tournament exists (the CREATE phase before
 * creation, and after NEW_TOURNAMENT). Once created it holds the current
 * `Tournament` value, whose own `phase` field drives the screen flow
 * (FILLING -> PLAYING -> RESULTS).
 *
 * `lastError` and `notice` are transient UI messages. `lastError` carries the
 * message from the most recent rejected transition (e.g. a duplicate option or
 * an invalid vote split); `notice` carries a non-blocking informational message
 * (e.g. persistence degradation, wired by Task 14.2). Both are cleared by the
 * next successful transition.
 */
export interface AppState {
  /** The current tournament, or `null` when on the CREATE screen. */
  tournament: Tournament | null;
  /** Message from the most recent rejected transition, if any. */
  lastError?: string;
  /** Non-blocking informational notice, if any. */
  notice?: string;
}

/** The fresh initial state: no tournament, on the CREATE screen (Req 2.5). */
export const initialAppState: AppState = {
  tournament: null,
};

/**
 * User-intent actions. Each maps 1:1 to a user action in the UI and, in the
 * reducer, to a pure domain transition (design.md "Application Layer").
 *
 * Suggestion-review actions (REQUEST_SUGGESTIONS, ACCEPT_SUGGESTION,
 * REJECT_SUGGESTION, REPLACE_SUGGESTION, ACCEPT_ALL, REJECT_ALL) implement the
 * full review state machine (Req 10, 11). Regeneration is asynchronous and
 * happens *outside* this synchronous reducer: the UI/suggestion service resolves
 * a replacement name (via `regenerateOne` for reject, or `requestSuggestions`
 * for reject-all) and feeds the result back by dispatching a follow-up action.
 * REJECT_SUGGESTION therefore carries an optional already-resolved
 * `replacement`, and a fresh set from REJECT_ALL arrives via REQUEST_SUGGESTIONS.
 */
export type TournamentAction =
  // --- Creation & lifecycle -------------------------------------------------
  /** Create a new tournament from validated creation input (Req 2.2, 2.3). */
  | { type: 'CREATE'; input: CreateTournamentInput }
  /** Reset everything and return to the CREATE screen (Req 2.4, 2.5). */
  | { type: 'NEW_TOURNAMENT' }
  // --- Filling phase --------------------------------------------------------
  /** Add an option by (raw) name (Req 6). */
  | { type: 'ADD_OPTION'; name: string }
  /** Remove the option with the given id (Req 7). */
  | { type: 'REMOVE_OPTION'; id: string }
  // --- Suggestion review (Req 10, 11) ---------------------------------------
  /**
   * Install the pending suggestions produced by the async suggestion service
   * (Req 10.1). Also used to deliver the fresh set requested after REJECT_ALL
   * (Req 10.12): new pending suggestions are appended, preserving any prior
   * rejected/replaced entries for their audit trail.
   */
  | { type: 'REQUEST_SUGGESTIONS'; suggestions: Suggestion[] }
  /** Accept a single suggestion, turning it into a tournament option (Req 10.2). */
  | { type: 'ACCEPT_SUGGESTION'; id: string }
  /**
   * Reject a single suggestion (Req 10.3, 11.1). Regeneration is asynchronous
   * and resolved by the caller; the already-resolved unique replacement (if any)
   * is passed in `replacement` and installed as a new pending suggestion for the
   * freed slot. When omitted, no unique replacement was available and the slot is
   * left empty for manual fill (Req 10.4).
   */
  | { type: 'REJECT_SUGGESTION'; id: string; replacement?: Suggestion }
  /**
   * Replace a suggestion with a typed name and, in a single action, accept it as
   * an option (Req 10.5). Never triggers regeneration (Req 10.6, 11.2, 25.5); an
   * invalid name is rejected and changes nothing (Req 10.7).
   */
  | { type: 'REPLACE_SUGGESTION'; id: string; name: string }
  /**
   * Accept every currently-pending suggestion, adding each as an option and
   * skipping any that would overflow capacity or duplicate, without blocking the
   * others (Req 10.8, 10.9, 10.10).
   */
  | { type: 'ACCEPT_ALL' }
  /**
   * Reject every currently-pending suggestion (Req 10.11). The caller then
   * requests a fresh AI-based set and delivers it via REQUEST_SUGGESTIONS
   * (Req 10.12).
   */
  | { type: 'REJECT_ALL' }
  // --- Generation & play ----------------------------------------------------
  /** Generate the bracket and move to PLAYING (Req 12). */
  | { type: 'GENERATE' }
  /** Set the provisional choice for a matchup (classic winner or vote split). */
  | { type: 'SET_PROVISIONAL'; matchupId: string; choice: Correction }
  /** Confirm the visible matchup's provisional choice (Req 14.2). */
  | { type: 'CONFIRM'; matchupId: string }
  /** Move to the previous matchup within the current round (Req 13.5). */
  | { type: 'PREVIOUS' }
  /** Move to the next matchup, advancing the round when complete (Req 14.2, 18.5). */
  | { type: 'NEXT' }
  /** Resolve a tied vote-based matchup with the 50/50 draw (Req 16.9). */
  | { type: 'RESOLVE_TIE'; matchupId: string }
  /** Correct an already-decided matchup, cascading downstream (Req 20). */
  | { type: 'CORRECT'; matchupId: string; correction: Correction }
  // --- Persistence ----------------------------------------------------------
  /**
   * Surface a non-blocking notice that persistence is unavailable so data might
   * not be saved (Req 23.4). Dispatched by the persistence adapter, not by a
   * user intent; it only sets `notice` and never touches the tournament, so the
   * current state is preserved.
   */
  | { type: 'PERSISTENCE_DEGRADED'; message: string };

/**
 * Whether every suggestion has been handled, i.e. none remain `pending`
 * (Req 10.13). This is the selector the SuggestionReview UI uses to show the
 * "all handled" indication. An empty suggestion list counts as handled (there is
 * nothing left to review).
 */
export function allSuggestionsHandled(tournament: Tournament): boolean {
  return tournament.suggestions.every((s) => s.status !== 'pending');
}

/**
 * Generate a stable, unique option id for the reducer when turning a suggestion
 * into an option. Mirrors the domain's `opt-<n>` scheme (see
 * `domain/tournament`'s internal `nextOptionId`) so ids stay consistent whether
 * an option is added via ADD_OPTION or accepted from a suggestion; using a
 * strictly-increasing suffix means removing options never causes a collision.
 */
function nextOptionId(options: readonly { id: string }[]): string {
  let max = 0;
  for (const option of options) {
    const match = /^opt-(\d+)$/.exec(option.id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return `opt-${max + 1}`;
}

/**
 * Apply the completion transition, reconciling `phase`/`standings` with whether
 * the domain currently reports the tournament complete (Req 20.1, 20.2, 21,
 * 22.1). This must be correct in both directions so a CORRECT that re-decides —
 * or un-decides — a final settles the state properly:
 *
 * - Complete: move to RESULTS and (re)compute standings. This holds whether the
 *   current phase is PLAYING (a final just decided) or already RESULTS (a
 *   correction re-completed the tournament) — in the latter case standings are
 *   recomputed rather than left stale/undefined.
 * - Not complete but in RESULTS: a correction made the tournament incomplete
 *   again, so return to PLAYING and clear standings so the user can replay.
 * - Otherwise (PLAYING and not complete): unchanged.
 *
 * Pure; returns a new value only when it changes something.
 */
function withCompletion(tournament: Tournament): Tournament {
  if (isComplete(tournament)) {
    return {
      ...tournament,
      phase: 'RESULTS',
      standings: computeStandings(tournament),
    };
  }
  if (tournament.phase === 'RESULTS') {
    return {
      ...tournament,
      phase: 'PLAYING',
      standings: undefined,
    };
  }
  return tournament;
}

/**
 * Clamp/normalize the play cursor after a navigation intent. NEXT and PREVIOUS
 * move within the *current* round only (Req 13.5); NEXT past the last matchup
 * of a round triggers {@link advanceIfRoundComplete}, which advances to the
 * next round when every matchup is decided (Req 18.5). After any advance the
 * completion transition is applied so a decided final moves to RESULTS.
 */
function navigate(tournament: Tournament, direction: 'PREVIOUS' | 'NEXT'): Tournament {
  const round = tournament.rounds[tournament.currentRoundIndex];
  if (!round) return tournament;

  if (direction === 'PREVIOUS') {
    const index = Math.max(0, tournament.currentMatchupIndex - 1);
    if (index === tournament.currentMatchupIndex) return tournament;
    return { ...tournament, currentMatchupIndex: index };
  }

  // NEXT: within the round, step forward; at the end, try to advance the round.
  const lastIndex = round.matchups.length - 1;
  if (tournament.currentMatchupIndex < lastIndex) {
    return {
      ...tournament,
      currentMatchupIndex: tournament.currentMatchupIndex + 1,
    };
  }

  // On the last matchup: attempt to advance to the next round (only succeeds
  // when the round is complete, Req 18.5). Then apply the completion check.
  const advanced = advanceIfRoundComplete(tournament);
  return withCompletion(advanced);
}

/**
 * The single tournament reducer. Every mutation of tournament state flows
 * through here and delegates to a pure domain transition. Failing transitions
 * leave the tournament unchanged and record `lastError`; succeeding ones take
 * the new tournament, clear transient messages, and apply the completion
 * transition where relevant.
 */
export function tournamentReducer(
  state: AppState,
  action: TournamentAction,
): AppState {
  switch (action.type) {
    // --- Creation & lifecycle -----------------------------------------------
    case 'CREATE': {
      // createTournament always succeeds for validated input; it moves the new
      // tournament into the FILLING phase (Req 2.2, 2.3).
      const tournament = createTournament(action.input);
      return { tournament };
    }

    case 'NEW_TOURNAMENT':
      // Clear everything and return to the CREATE screen (Req 2.4, 2.5).
      return { ...initialAppState };

    // --- Filling phase ------------------------------------------------------
    case 'ADD_OPTION': {
      if (!state.tournament) return state;
      const result = addOption(state.tournament, action.name);
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }
      return { tournament: result.tournament };
    }

    case 'REMOVE_OPTION': {
      if (!state.tournament) return state;
      const tournament = removeOption(state.tournament, action.id);
      return { tournament };
    }

    // --- Suggestion review (Req 10, 11) -------------------------------------
    case 'REQUEST_SUGGESTIONS': {
      if (!state.tournament) return state;
      // Install the pending suggestions produced by the async service (Req 10.1).
      // Nothing is added to the tournament automatically; each stays `pending`
      // until the user acts (Property 11). This also delivers the fresh set
      // requested after REJECT_ALL (Req 10.12): the new pending suggestions are
      // appended so the earlier rejected entries are preserved for their trail,
      // while the review UI simply shows whatever is still pending.
      return {
        tournament: {
          ...state.tournament,
          suggestions: [...state.tournament.suggestions, ...action.suggestions],
        },
        // A fresh review is a successful transition: clear any prior error.
      };
    }

    case 'ACCEPT_SUGGESTION': {
      if (!state.tournament) return state;
      const tournament = state.tournament;
      const suggestion = tournament.suggestions.find((s) => s.id === action.id);
      // Only a still-pending suggestion can be accepted; an unknown or
      // already-handled one is a no-op (Req 10.1, 10.9).
      if (!suggestion || suggestion.status !== 'pending') return state;

      // Turn the suggestion into an option, enforcing capacity + duplicate rules
      // via the same domain path as manual entry (Req 10.2). A rejection here
      // (full bracket or duplicate) surfaces as lastError and changes nothing.
      const result = addOption(tournament, suggestion.name);
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }

      const suggestions = tournament.suggestions.map((s) =>
        s.id === action.id ? { ...s, status: 'accepted' as const } : s,
      );
      return { tournament: { ...result.tournament, suggestions } };
    }

    case 'REJECT_SUGGESTION': {
      if (!state.tournament) return state;
      const tournament = state.tournament;
      const suggestion = tournament.suggestions.find((s) => s.id === action.id);
      if (!suggestion || suggestion.status !== 'pending') return state;

      // Discard the rejected suggestion (Req 10.3). Regeneration for the freed
      // slot is asynchronous and already resolved by the caller: when a unique
      // replacement was produced it arrives in `action.replacement` and is
      // installed as a new pending suggestion (Req 10.3, 11.1); when none was
      // available the slot is simply left for manual fill (Req 10.4).
      let suggestions = tournament.suggestions.map((s) =>
        s.id === action.id ? { ...s, status: 'rejected' as const } : s,
      );
      if (action.replacement) {
        suggestions = [...suggestions, action.replacement];
      }
      return { tournament: { ...tournament, suggestions } };
    }

    case 'REPLACE_SUGGESTION': {
      if (!state.tournament) return state;
      const tournament = state.tournament;
      const suggestion = tournament.suggestions.find((s) => s.id === action.id);
      if (!suggestion || suggestion.status !== 'pending') return state;

      // Validate the typed name like an option name, guarding against duplicate
      // options AND other suggestions (Req 10.7). The suggestion being replaced
      // is excluded from the duplicate check so replacing it with (effectively)
      // itself, or a case variant, is not spuriously rejected.
      const otherSuggestions = tournament.suggestions.filter(
        (s) => s.id !== action.id && s.status === 'pending',
      );
      const validation = validateOptionName(
        action.name,
        tournament.options,
        otherSuggestions,
      );
      if (!validation.ok) {
        // Invalid replacement: reject with a message and change nothing
        // (Req 10.7). No regeneration is triggered (Req 10.6, 11.2, 25.5).
        return { ...state, lastError: validation.message, notice: undefined };
      }

      // Capacity is independent of name validity; a full bracket cannot take the
      // replacement either. addOption enforces both, so route through it.
      const result = addOption(tournament, validation.value);
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }

      // Rename + accept in a single action (Req 10.5): store the typed name on
      // the suggestion and mark it `replaced`. No regeneration (Req 10.6, 11.2).
      const suggestions = tournament.suggestions.map((s) =>
        s.id === action.id
          ? { ...s, name: validation.value, status: 'replaced' as const }
          : s,
      );
      return { tournament: { ...result.tournament, suggestions } };
    }

    case 'ACCEPT_ALL': {
      if (!state.tournament) return state;
      const tournament = state.tournament;

      // Accept the suggestions that are pending *at this moment* (Req 10.8);
      // already rejected/replaced ones are left untouched (Req 10.9). Build the
      // new options and status updates in one pass, skipping any suggestion that
      // would overflow capacity or duplicate an option (or an earlier acceptance
      // in this same batch) without blocking the rest (Req 10.10).
      const options = [...tournament.options];
      const acceptedIds = new Set<string>();

      for (const s of tournament.suggestions) {
        if (s.status !== 'pending') continue;
        // Skip when full — capacity is a hard cap (Req 6.6, 10.10).
        if (options.length >= tournament.size) continue;
        // Skip duplicates against current options (including earlier accepts in
        // this batch), comparison via the shared option-name validation.
        const validation = validateOptionName(s.name, options);
        if (!validation.ok) continue;
        options.push({ id: nextOptionId(options), name: validation.value });
        acceptedIds.add(s.id);
      }

      // If nothing could be accepted (all skipped), still mark none — leave the
      // suggestions pending so the user sees why (they remain reviewable).
      if (acceptedIds.size === 0) return state;

      const suggestions = tournament.suggestions.map((s) =>
        acceptedIds.has(s.id) ? { ...s, status: 'accepted' as const } : s,
      );
      return { tournament: { ...tournament, options, suggestions } };
    }

    case 'REJECT_ALL': {
      if (!state.tournament) return state;
      const tournament = state.tournament;

      // Reject every suggestion pending at this moment (Req 10.11); previously
      // handled ones are untouched. The fresh AI-based set (Req 10.12) is
      // requested asynchronously by the caller and delivered via a follow-up
      // REQUEST_SUGGESTIONS, keeping this reducer synchronous.
      if (!tournament.suggestions.some((s) => s.status === 'pending')) {
        return state;
      }
      const suggestions = tournament.suggestions.map((s) =>
        s.status === 'pending' ? { ...s, status: 'rejected' as const } : s,
      );
      return { tournament: { ...tournament, suggestions } };
    }

    // --- Generation & play --------------------------------------------------
    case 'GENERATE': {
      if (!state.tournament) return state;
      // Gate on canGenerate so an incomplete bracket is never generated
      // (Req 8.1, 8.2, 25.4). generateBracket itself throws on a partial
      // bracket, so guarding here keeps the reducer total.
      if (!canGenerate(state.tournament)) {
        return {
          ...state,
          lastError: 'The bracket can only be generated when it is exactly full.',
          notice: undefined,
        };
      }
      const tournament = generateBracket(state.tournament);
      return { tournament };
    }

    case 'SET_PROVISIONAL': {
      if (!state.tournament) return state;
      // A classic provisional carries an optionId; a vote provisional carries
      // votesA. Route to the matching domain transition (Req 14.1, 15.2, 16.1).
      const { matchupId, choice } = action;
      const result =
        'optionId' in choice
          ? setProvisionalWinner(state.tournament, matchupId, choice.optionId)
          : setProvisionalVotes(state.tournament, matchupId, choice.votesA);
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }
      return { tournament: result.tournament };
    }

    case 'CONFIRM': {
      if (!state.tournament) return state;
      const result = confirmMatchup(state.tournament, action.matchupId);
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }
      return { tournament: withCompletion(result.tournament) };
    }

    case 'PREVIOUS': {
      if (!state.tournament) return state;
      const tournament = navigate(state.tournament, 'PREVIOUS');
      if (tournament === state.tournament) return state;
      return { tournament };
    }

    case 'NEXT': {
      if (!state.tournament) return state;
      const tournament = navigate(state.tournament, 'NEXT');
      if (tournament === state.tournament) return state;
      return { tournament };
    }

    case 'RESOLVE_TIE': {
      if (!state.tournament) return state;
      const result = resolveTieBreak(state.tournament, action.matchupId);
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }
      return { tournament: withCompletion(result.tournament) };
    }

    case 'CORRECT': {
      if (!state.tournament) return state;
      const result = correctOutcome(
        state.tournament,
        action.matchupId,
        action.correction,
      );
      if (!result.ok) {
        return { ...state, lastError: result.message, notice: undefined };
      }
      return { tournament: withCompletion(result.tournament) };
    }

    // --- Persistence --------------------------------------------------------
    case 'PERSISTENCE_DEGRADED':
      // Attach the non-blocking notice without altering the tournament, so the
      // app keeps working in-memory with nothing lost (Req 23.4). Idempotent if
      // the same notice is already showing.
      if (state.notice === action.message) return state;
      return { ...state, notice: action.message };

    default:
      // Exhaustiveness guard: every action is handled above.
      return state;
  }
}
