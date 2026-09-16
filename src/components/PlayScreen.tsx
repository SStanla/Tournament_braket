// UI layer — PlayScreen shell and navigation (Task 21).
//
// This component owns the *shell* of the play phase: the progressive-reveal
// frame that shows exactly one matchup of the current round at a time
// (Req 13.1, 13.2), the round's stage label at the top (Req 13.3), the
// "Matchup X of N" position indicator (Req 13.4), the Previous/Next navigation
// controls (Req 13.5), the spaced "vs" separator so the two names never appear
// adjacent (Req 13.6), and fully readable long names (Req 13.7).
//
// The actual matchup body — classic buttons or the vote slider — is a separate
// concern (Task 22). This shell therefore renders it through a `renderMatchup`
// slot, passing the currently-visible matchup. When no slot is supplied a
// neutral placeholder is shown so the shell stands alone.
//
// Confirm-before-record on Next: nothing is recorded until the user confirms
// with Next (Req 14.1). When the visible matchup carries a provisional choice,
// Next first dispatches CONFIRM to record it (Req 14.2) and then NEXT to move
// on. Because the reducer only advances the round once every matchup is decided
// (Req 18.5), the last decided matchup of a round stays visible with its winner
// highlighted until the user confirms Next (Req 14.4).

import type { ReactNode } from 'react';
import type { Matchup, Tournament } from '../domain/model';
import {
  hasUnresolvedTie,
  isMatchupDecided,
} from '../domain/tournament';
import { useTournament } from '../app/TournamentContext';
import styles from './PlayScreen.module.css';

/** The dedicated label shown for the third-place playoff (Req 19.2). */
const THIRD_PLACE_LABEL = 'Third-place match';

/**
 * What the shell is currently presenting: the matchup itself plus the label to
 * show above it and its 1-based position within the current stage. The
 * third-place playoff carries its own dedicated label and is presented as a
 * standalone stage (Req 19.2).
 */
interface Presentation {
  matchup: Matchup;
  stageLabel: string;
  position: number;
  total: number;
  atFirst: boolean;
}

/**
 * Decide what to present in the final stage of a size >= 4 tournament (Req 19.2).
 *
 * The title final is the single matchup of the last round; the third-place
 * playoff is held on the tournament separately. When both semifinal losers have
 * been populated into the playoff and it is not yet decided, it must be
 * presented FIRST with its dedicated label; only once it is decided is the
 * final for the title presented. Completion still requires both, which the
 * domain's `isComplete` enforces (Req 21.2), so this only governs ordering.
 *
 * Returns `undefined` when the final-stage third-place ordering does not apply
 * (size 2, no playoff, the playoff is not yet playable, or we are not on the
 * final round), letting the caller fall back to the normal per-round cursor.
 */
function finalStagePresentation(
  tournament: Tournament,
): Presentation | undefined {
  const playoff = tournament.thirdPlaceMatch;
  if (tournament.size < 4 || !playoff) {
    return undefined;
  }

  const finalRoundIndex = tournament.rounds.length - 1;
  // The playoff is only offered while we are in the final stage.
  if (tournament.currentRoundIndex !== finalRoundIndex) {
    return undefined;
  }

  // The playoff becomes playable once both semifinal losers populate it. Until
  // then there is nothing to present ahead of the final.
  const playoffPlayable =
    playoff.optionA !== undefined && playoff.optionB !== undefined;
  if (!playoffPlayable) {
    return undefined;
  }

  // Present the third-place match first, until it is decided (Req 19.2).
  if (!isMatchupDecided(playoff)) {
    return {
      matchup: playoff,
      stageLabel: THIRD_PLACE_LABEL,
      position: 1,
      total: 1,
      atFirst: true,
    };
  }

  // Playoff decided: fall through to the normal final presentation.
  return undefined;
}

/** Props for {@link PlayScreen}. */
export interface PlayScreenProps {
  /**
   * Render slot for the matchup body (Task 22 supplies the Classic/Vote view).
   * Receives the currently-visible matchup so the body can render its two
   * options and controls. When omitted, a neutral placeholder is shown.
   */
  renderMatchup?: (matchup: Matchup) => ReactNode;
}

/**
 * Whether the visible matchup has an unconfirmed provisional choice that should
 * be recorded when the user presses Next (Req 14.1, 14.2). In classic mode this
 * is a provisional winner id; in vote-based mode it is a provisional vote split
 * (votesA/votesB present) that has not yet been committed to a winner. A split
 * that ties is left uncommitted and needs a tie-break, so it is not treated as
 * a confirmable choice here.
 */
function hasUnconfirmedChoice(matchup: Matchup): boolean {
  if (matchup.provisionalWinnerId !== undefined) return true;
  const hasVoteSplit =
    matchup.votesA !== undefined && matchup.votesB !== undefined;
  return hasVoteSplit && !isMatchupDecided(matchup) && !hasUnresolvedTie(matchup);
}

/**
 * The play-phase shell. Reads the current round and matchup cursors from the
 * shared tournament state and renders the progressive-reveal frame plus
 * navigation. The matchup body itself is delegated to `renderMatchup`.
 */
export default function PlayScreen({ renderMatchup }: PlayScreenProps) {
  const { state, dispatch } = useTournament();
  const tournament = state.tournament;

  // The shell only renders during play with a generated bracket. Guard so a
  // misrouted render (no tournament / wrong phase) fails soft rather than
  // throwing.
  if (!tournament || tournament.rounds.length === 0) {
    return null;
  }

  const round = tournament.rounds[tournament.currentRoundIndex];
  if (!round || round.matchups.length === 0) {
    return null;
  }

  // Final-stage ordering: for size >= 4, the third-place playoff is presented
  // before the title final and, until it is decided, takes over the shell with
  // its own dedicated label (Req 19.2). When it does not apply we fall back to
  // the normal per-round cursor.
  const finalStage = finalStagePresentation(tournament);

  // Clamp the matchup cursor defensively so an out-of-range index never indexes
  // undefined; the reducer keeps it in range, this is belt-and-suspenders.
  const matchupIndex = Math.min(
    Math.max(tournament.currentMatchupIndex, 0),
    round.matchups.length - 1,
  );

  const matchup = finalStage ? finalStage.matchup : round.matchups[matchupIndex];

  // Stage label and "Matchup X of N": X is 1-based, N is the count of matchups
  // in THIS stage — never future rounds (Req 13.3, 13.4, 13.2). The third-place
  // playoff is a single-matchup stage with its own dedicated label (Req 19.2).
  const stageLabel = finalStage ? finalStage.stageLabel : round.stageLabel;
  const position = finalStage ? finalStage.position : matchupIndex + 1;
  const total = finalStage ? finalStage.total : round.matchups.length;

  const atFirst = finalStage ? finalStage.atFirst : matchupIndex === 0;

  function handlePrevious() {
    // Move back within the current round to review or change a matchup
    // (Req 13.5, 14.3). The reducer clamps at the first matchup.
    dispatch({ type: 'PREVIOUS' });
  }

  function handleNext() {
    // Confirm-before-record: if the visible matchup has an unconfirmed
    // provisional choice, record it first (Req 14.1, 14.2) and then advance
    // (Req 14.2). Confirming the last matchup of a round is what lets NEXT
    // advance the round (Req 14.4, 18.5).
    if (hasUnconfirmedChoice(matchup)) {
      dispatch({ type: 'CONFIRM', matchupId: matchup.id });
    }
    // The third-place playoff is a standalone final-stage step, not part of the
    // round's matchup sequence, so it never advances the round cursor. Once it
    // is confirmed the shell re-renders and presents the title final (Req 19.2).
    if (!finalStage) {
      dispatch({ type: 'NEXT' });
    }
  }

  const optionAName = matchup.optionA?.name ?? '—';
  const optionBName = matchup.optionB?.name ?? '—';

  return (
    <section className={styles.screen} aria-labelledby="play-stage-label">
      <header className={styles.header}>
        <h2 id="play-stage-label" className={styles.stageLabel}>
          {stageLabel}
        </h2>
        <p className={styles.position} aria-live="polite">
          Matchup {position} of {total}
        </p>
      </header>

      {/*
        The two options are always presented as two distinct elements around a
        spaced "vs" separator so the names never appear adjacent (Req 13.6).
        Long names wrap and stay fully readable rather than being truncated
        (Req 13.7). The matchup body (buttons / slider) is rendered inside the
        options region by the Task 22 slot.
      */}
      <div className={styles.matchup}>
        {renderMatchup ? (
          renderMatchup(matchup)
        ) : (
          <div className={styles.versus}>
            <span className={styles.optionName}>{optionAName}</span>
            <span className={styles.vsSeparator} aria-hidden={false}>
              vs
            </span>
            <span className={styles.optionName}>{optionBName}</span>
          </div>
        )}
      </div>

      <nav className={styles.nav} aria-label="Matchup navigation">
        <button
          type="button"
          className={styles.navButton}
          onClick={handlePrevious}
          disabled={atFirst}
        >
          Previous
        </button>
        <button
          type="button"
          className={styles.navButton}
          onClick={handleNext}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
