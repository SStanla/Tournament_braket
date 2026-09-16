// UI layer — VoteMatchup body (Task 22.2).
//
// This component is the *body* rendered inside the PlayScreen shell's
// `renderMatchup` slot for vote-based play. It presents the matchup's two
// options with a single horizontal slider that splits the player count's votes
// between them (Req 16.1, 16.2). The slider has exactly `playerCount + 1`
// discrete positions — from "all votes to the left option" to "all votes to the
// right option" (Req 16.1) — and starts centered when the matchup is first
// shown: on the exact tie split for an even player count, or the nearest
// position to centre for an odd one (Req 16.4).
//
// Orientation: the left option is optionA, the right is optionB. The native
// range input's value is the number of votes given to the RIGHT option
// (optionB); moving the thumb toward an option gives it more votes and the
// other correspondingly fewer, always summing to the player count (Req 16.2,
// 16.3). Each side shows its current vote count in an outlined box, and the
// leading option's number and outline are highlighted green (Req 16.5).
//
// Recording:
//  - Dragging updates the provisional split live (SET_PROVISIONAL), recording
//    nothing (Req 14.1).
//  - The split stays provisional: the option with more votes becomes the winner
//    only when the user confirms with the shell's Next control (Req 14.1, 14.2),
//    exactly like classic matchups. Releasing the slider records nothing on its
//    own so play never advances past the matchup without pressing Next.
//  - A tie (only possible on an even player count) records no winner and shows
//    a random tie-break draw control (Req 16.7); that control appears ONLY on a
//    tie (Req 16.9, 16.10) and, until used, the shell's Next is blocked from
//    advancing past the matchup (Req 16.8, enforced by the domain's
//    `hasUnresolvedTie` gate). Using it dispatches RESOLVE_TIE for the 50/50
//    draw (Req 16.9).

import { useEffect } from 'react';
import type { Matchup } from '../domain/model';
import { hasUnresolvedTie } from '../domain/tournament';
import { useTournament } from '../app/TournamentContext';
import styles from './VoteMatchup.module.css';

/** Props for {@link VoteMatchup}. */
export interface VoteMatchupProps {
  /** The currently-visible matchup supplied by the PlayScreen slot. */
  matchup: Matchup;
}

/**
 * The centered starting position for a fresh matchup (Req 16.4). The slider
 * value is the votes given to the right option (optionB). For an even player
 * count `playerCount / 2` is the exact tie; for an odd one `Math.floor` lands
 * on the position nearest the centre (which can never tie, Req 16.10).
 */
function centeredVotesB(playerCount: number): number {
  return Math.floor(playerCount / 2);
}

/**
 * Vote-based matchup body: two outlined vote readouts around a single
 * horizontal slider. Nothing is recorded while dragging or on release — the
 * split stays provisional and is committed to a winner only when the user
 * presses the shell's Next (Req 14.1, 14.2). A tie surfaces the tie-break draw
 * control instead.
 */
export default function VoteMatchup({ matchup }: VoteMatchupProps) {
  const { state, dispatch } = useTournament();
  const playerCount = state.tournament?.playerCount ?? 0;

  const bothPresent = matchup.optionA !== undefined && matchup.optionB !== undefined;

  // Current split. The slider value is votes to the right option (optionB); the
  // left option (optionA) takes the remainder so the two always sum to the
  // player count (Req 16.2, 16.3). Before any interaction we render the centered
  // start (Req 16.4), which is also seeded as the provisional split on mount.
  const hasSplit = matchup.votesA !== undefined && matchup.votesB !== undefined;
  const votesB = hasSplit ? matchup.votesB! : centeredVotesB(playerCount);
  const votesA = hasSplit ? matchup.votesA! : playerCount - centeredVotesB(playerCount);

  // Seed the centered provisional split once the matchup is shown so the
  // displayed split is real state the shell/domain can act on (Req 16.4). Keyed
  // on the matchup id so navigating to a fresh, untouched matchup re-centers it.
  useEffect(() => {
    if (!bothPresent) return;
    if (matchup.votesA !== undefined && matchup.votesB !== undefined) return;
    dispatch({
      type: 'SET_PROVISIONAL',
      matchupId: matchup.id,
      choice: { votesA: playerCount - centeredVotesB(playerCount) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchup.id, bothPresent, playerCount]);

  const decided = matchup.winner !== undefined;
  const unresolvedTie = hasUnresolvedTie(matchup);
  const isTie = votesA === votesB;

  // Leader highlight (Req 16.5). No leader while tied. Once a winner has been
  // recorded (including via tie-break) the recorded winner is the leader.
  let leader: 'A' | 'B' | null = null;
  if (decided) {
    leader = matchup.winner!.id === matchup.optionA?.id ? 'A' : 'B';
  } else if (!isTie) {
    leader = votesA > votesB ? 'A' : 'B';
  }

  function handleChange(nextVotesB: number) {
    // Live provisional update while dragging; records nothing (Req 14.1).
    dispatch({
      type: 'SET_PROVISIONAL',
      matchupId: matchup.id,
      choice: { votesA: playerCount - nextVotesB },
    });
  }

  function drawTieBreak() {
    dispatch({ type: 'RESOLVE_TIE', matchupId: matchup.id });
  }

  const optionAName = matchup.optionA?.name ?? '—';
  const optionBName = matchup.optionB?.name ?? '—';

  return (
    <div className={styles.matchup}>
      <div className={styles.sides}>
        {renderSide(optionAName, votesA, leader === 'A', styles)}
        <span className={styles.vsSeparator}>vs</span>
        {renderSide(optionBName, votesB, leader === 'B', styles)}
      </div>

      <input
        type="range"
        className={styles.slider}
        min={0}
        max={playerCount}
        step={1}
        value={votesB}
        disabled={!bothPresent}
        aria-label={`Split ${playerCount} votes between ${optionAName} and ${optionBName}`}
        aria-valuetext={`${optionAName}: ${votesA} votes, ${optionBName}: ${votesB} votes`}
        onChange={(e) => handleChange(Number(e.target.value))}
      />

      {/*
        Tie-break draw control: shown ONLY while a tie is unresolved (Req 16.9).
        An odd player count can never tie, so this never appears there
        (Req 16.10). Until the draw is used the shell cannot advance past the
        matchup, since the domain does not treat an unresolved tie as decided
        (Req 16.8).
      */}
      {unresolvedTie && (
        <div className={styles.tieBreak}>
          <p className={styles.tieMessage} role="status">
            It's a tie. Use the draw to decide the winner.
          </p>
          <button
            type="button"
            className={styles.tieButton}
            onClick={drawTieBreak}
          >
            Random tie-break draw
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Render one option's readout: its name above an outlined box holding the
 * current vote count. When this side leads, both the number and its outline are
 * highlighted green via the `data-leader` hook (Req 16.5).
 */
function renderSide(
  name: string,
  votes: number,
  isLeader: boolean,
  styles: Record<string, string>,
) {
  return (
    <div className={styles.side}>
      <span className={styles.optionName}>{name}</span>
      <span
        className={styles.voteBox}
        data-leader={isLeader || undefined}
        aria-label={`${name}: ${votes} votes`}
      >
        {votes}
      </span>
    </div>
  );
}
