import { useEffect, useState } from 'react';
import type { Bracket, Matchup, Participant } from '../types/index';
import {
  getCurrentStageMatchups,
  getStageLabel,
  isTournamentComplete,
  isTie,
  canSelectWinner,
  canSelectThirdPlaceWinner,
} from '../services/bracket-manager';

/**
 * CurrentRoundView — the round-by-round in-play display for both modes.
 *
 * While the tournament is in progress (`!isTournamentComplete(bracket)`), this
 * component renders ONLY the matchup(s) returned by `getCurrentStageMatchups(bracket)`,
 * headed by the appropriate Stage_Label. Later-round matchups are never rendered
 * here (Req 14.1, 14.5), and for size >= 4 the Final is not rendered until the
 * Third_Place_Match winner exists (Req 10.9, 10.10, 14.6, 14.7).
 *
 * Within a round the matchups are presented ONE AT A TIME as successive
 * Matchup_Screens: exactly one `MatchupCard` is rendered, selected by local
 * `currentIndex` state over the `getCurrentStageMatchups` array, with a
 * "Matchup X of N" indicator and aria-labelled Prev/Next navigation that moves
 * `currentIndex` within `[0, N-1]` (Req 14.1-14.5). `currentIndex` is transient
 * local UI state — never persisted or held in the reducer (design Decision #14).
 * Navigating never decides a matchup; the next-round advance stays with the
 * reducer (`progressVoteRound`). Navigating away without releasing the slider
 * simply never dispatches `ENTER_VOTES`, so the matchup stays undecided (Req 12.8).
 *
 * - Classic_Mode: two click-to-pick buttons per matchup (Req 6.7); no vote UI
 *   at all (Req 11.6). Selecting routes to onSelectWinner (regular matchup) or
 *   onSelectThirdPlaceWinner (third-place match).
 * - Vote_Based_Mode: a single horizontal Vote_Slider positioned BELOW the options
 *   box with `Player_Count + 1` discrete positions (0..Player_Count). The slider is
 *   oriented intuitively: moving the thumb TOWARD an option gives that option MORE
 *   votes. Because option1 sits on the left and option2 on the right, the raw slider
 *   value maps to option2's Votes and option1's Votes are `playerCount − rawValue`,
 *   so sliding right raises the right option and sliding left raises the left one.
 *   The two totals always sum to Player_Count by construction (Req 12.1, 12.2). It
 *   starts centered (`Math.round(playerCount / 2)`, or the persisted votes). On the
 *   slider's release / change-commit the card AUTOMATICALLY records the result by
 *   dispatching onEnterVotes (or onEnterThirdPlaceVotes) — no confirm button
 *   (Req 12.5). An equal split (only possible when Player_Count is even) records
 *   no winner and instead shows the Tie_Break_Draw control (Req 12.6, 12.10).
 *
 * The two options are always rendered as two visually distinct elements separated
 * by a dedicated `.matchup-vs` separator with visible spacing on both sides, so
 * option names are never rendered adjacent (Req 5.10).
 *
 * Long names wrap (<= 40 visible chars) with the full name available via `title`
 * (Req 9.1, 9.3), and every interactive control carries an `aria-label`.
 *
 * Requirements: 5.4, 5.10, 6.7, 9.1, 9.3, 10.9, 10.10, 11.6, 12.1, 12.2, 12.3,
 * 12.4, 12.5, 12.6, 12.7, 12.8, 12.10, 12.11, 14.1, 14.2, 14.3, 14.4, 14.5,
 * 14.6, 14.7
 */

const MAX_DISPLAY_CHARS = 40;

function displayName(name: string): string {
  if (name.length <= MAX_DISPLAY_CHARS) return name;
  return name.slice(0, MAX_DISPLAY_CHARS - 1) + '…';
}

export interface CurrentRoundViewProps {
  bracket: Bracket;
  mode: 'classic' | 'vote';
  playerCount: number | null;
  onSelectWinner: (matchupId: string, winnerId: string) => void;
  onEnterVotes: (matchupId: string, votes1: number, votes2: number) => void;
  onResolveTie: (matchupId: string) => void;
  // Third-place match handlers (App wires these in task 5.1).
  onSelectThirdPlaceWinner: (winnerId: string) => void;
  onEnterThirdPlaceVotes: (votes1: number, votes2: number) => void;
  onResolveThirdPlaceTie: () => void;
}

interface MatchupCardProps {
  matchup: Matchup;
  mode: 'classic' | 'vote';
  playerCount: number | null;
  canDecide: boolean;
  isThirdPlace: boolean;
  onSelectWinner: (matchupId: string, winnerId: string) => void;
  onEnterVotes: (matchupId: string, votes1: number, votes2: number) => void;
  onResolveTie: (matchupId: string) => void;
  onSelectThirdPlaceWinner: (winnerId: string) => void;
  onEnterThirdPlaceVotes: (votes1: number, votes2: number) => void;
  onResolveThirdPlaceTie: () => void;
}

function ClassicMatchupControls({
  matchup,
  canDecide,
  isThirdPlace,
  onSelectWinner,
  onSelectThirdPlaceWinner,
}: {
  matchup: Matchup;
  canDecide: boolean;
  isThirdPlace: boolean;
  onSelectWinner: (matchupId: string, winnerId: string) => void;
  onSelectThirdPlaceWinner: (winnerId: string) => void;
}) {
  const pick = (winnerId: string) => {
    if (isThirdPlace) {
      onSelectThirdPlaceWinner(winnerId);
    } else {
      onSelectWinner(matchup.id, winnerId);
    }
  };

  const renderPick = (participant: Participant | null) => {
    if (!participant) {
      return (
        <span className="matchup-option matchup-option-empty" title="Empty slot">
          TBD
        </span>
      );
    }
    const isWinner = matchup.winner?.id === participant.id;
    return (
      <button
        type="button"
        className={isWinner ? 'btn matchup-option' : 'btn btn-secondary matchup-option'}
        disabled={!canDecide}
        onClick={() => pick(participant.id)}
        aria-label={`Select ${participant.name} as winner`}
        title={participant.name}
      >
        {displayName(participant.name)}
      </button>
    );
  };

  return (
    <div className="matchup-picks">
      {renderPick(matchup.participant1)}
      <span className="matchup-vs" aria-hidden="true">vs</span>
      {renderPick(matchup.participant2)}
    </div>
  );
}

function VoteMatchupControls({
  matchup,
  playerCount,
  canDecide,
  isThirdPlace,
  onEnterVotes,
  onResolveTie,
  onEnterThirdPlaceVotes,
  onResolveThirdPlaceTie,
}: {
  matchup: Matchup;
  playerCount: number;
  canDecide: boolean;
  isThirdPlace: boolean;
  onEnterVotes: (matchupId: string, votes1: number, votes2: number) => void;
  onResolveTie: (matchupId: string) => void;
  onEnterThirdPlaceVotes: (votes1: number, votes2: number) => void;
  onResolveThirdPlaceTie: () => void;
}) {
  // The slider is oriented so moving the thumb toward an option gives that option
  // MORE votes. option2 is drawn on the right, so the RAW slider value is option2's
  // Votes and option1 gets `playerCount − rawValue`. Sliding right → right option up,
  // sliding left → left option up. Seeded from persisted votes2 when present, else
  // the discrete center default.
  const [sliderValue, setSliderValue] = useState<number>(
    typeof matchup.votes2 === 'number' ? matchup.votes2 : Math.round(playerCount / 2)
  );

  const p1 = matchup.participant1;
  const p2 = matchup.participant2;

  const p1Name = p1?.name ?? 'Participant 1';
  const p2Name = p2?.name ?? 'Participant 2';

  // Derived per-option totals; they always sum to playerCount by construction.
  const votes2 = sliderValue;
  const votes1 = playerCount - sliderValue;

  // The tie-break draw is offered only for a matchup that is PERSISTED as tied
  // (equal votes recorded, winner still null) — determined from bracket state,
  // not the local slider (Req 12.10).
  const persistedTie = isTie(matchup) && matchup.winner === null;

  // Release-to-confirm: on the slider's commit gesture, auto-record. The committed
  // value is read from the live slider position (passed in by the event handler) so
  // the last pair of a round records reliably even if a re-render hasn't flushed the
  // latest state yet. An equal split (only possible when playerCount is even) records
  // no winner — the Tie_Break_Draw control below handles that case (Req 12.6, 12.10).
  const commit = (raw: number) => {
    if (!canDecide) return;
    const v2 = raw;
    const v1 = playerCount - raw;
    if (v1 === v2) return;
    if (isThirdPlace) {
      onEnterThirdPlaceVotes(v1, v2);
    } else {
      onEnterVotes(matchup.id, v1, v2);
    }
  };

  const breakTie = () => {
    if (isThirdPlace) {
      onResolveThirdPlaceTie();
    } else {
      onResolveTie(matchup.id);
    }
  };

  const renderOption = (participant: Participant | null, votes: number) => (
    <div className="matchup-option vote-option" title={participant?.name ?? 'Empty slot'}>
      <span className="vote-option-name">
        {participant ? displayName(participant.name) : 'TBD'}
      </span>
      <span className="vote-option-count" aria-live="polite">
        {votes}
      </span>
    </div>
  );

  return (
    <div className="matchup-vote">
      <div className="matchup-options">
        {renderOption(p1, votes1)}
        <span className="matchup-vs" aria-hidden="true">vs</span>
        {renderOption(p2, votes2)}
      </div>

      <input
        type="range"
        className="vote-slider"
        min={0}
        max={playerCount}
        step={1}
        value={sliderValue}
        disabled={!canDecide}
        aria-label={`Vote split for ${p1Name} versus ${p2Name}`}
        onChange={(e) => setSliderValue(Number(e.target.value))}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onBlur={(e) => commit(Number((e.target as HTMLInputElement).value))}
      />

      {canDecide && persistedTie && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={breakTie}
          aria-label="Break the tie with a random draw"
        >
          Tie-break draw
        </button>
      )}
    </div>
  );
}

function MatchupCard({
  matchup,
  mode,
  playerCount,
  canDecide,
  isThirdPlace,
  onSelectWinner,
  onEnterVotes,
  onResolveTie,
  onSelectThirdPlaceWinner,
  onEnterThirdPlaceVotes,
  onResolveThirdPlaceTie,
}: MatchupCardProps) {
  return (
    <li
      className="matchup-card card"
      aria-label={`Matchup: ${matchup.participant1?.name ?? 'TBD'} versus ${matchup.participant2?.name ?? 'TBD'}`}
    >
      {mode === 'classic' || playerCount === null ? (
        <ClassicMatchupControls
          matchup={matchup}
          canDecide={canDecide}
          isThirdPlace={isThirdPlace}
          onSelectWinner={onSelectWinner}
          onSelectThirdPlaceWinner={onSelectThirdPlaceWinner}
        />
      ) : (
        <VoteMatchupControls
          matchup={matchup}
          playerCount={playerCount}
          canDecide={canDecide}
          isThirdPlace={isThirdPlace}
          onEnterVotes={onEnterVotes}
          onResolveTie={onResolveTie}
          onEnterThirdPlaceVotes={onEnterThirdPlaceVotes}
          onResolveThirdPlaceTie={onResolveThirdPlaceTie}
        />
      )}
    </li>
  );
}

export function CurrentRoundView({
  bracket,
  mode,
  playerCount,
  onSelectWinner,
  onEnterVotes,
  onResolveTie,
  onSelectThirdPlaceWinner,
  onEnterThirdPlaceVotes,
  onResolveThirdPlaceTie,
}: CurrentRoundViewProps) {
  // Which Matchup_Screen is shown is transient local UI state (design Decision #14).
  const [currentIndex, setCurrentIndex] = useState(0);

  // Clamp currentIndex into range as the matchups array changes (matchups get
  // decided, the array shrinks, or the round advances). The render-time safeIndex
  // guards against indexing out of bounds before this effect runs.
  const matchups = isTournamentComplete(bracket) ? [] : getCurrentStageMatchups(bracket);
  const matchupCount = matchups.length;

  useEffect(() => {
    if (matchupCount === 0) return;
    const last = matchupCount - 1;
    if (currentIndex > last) setCurrentIndex(last);
  }, [matchupCount, currentIndex]);

  // Once the champion is decided the full tree is shown elsewhere; render nothing here.
  if (isTournamentComplete(bracket)) return null;

  // The stage sequencing (whole current round, or third-place-then-final for the
  // final stage of size >= 4) is centralized in getCurrentStageMatchups (Req 10.9,
  // 10.10, 14.6, 14.7).
  if (matchupCount === 0) return null;

  const safeIndex = Math.min(currentIndex, matchupCount - 1);
  const visibleMatchup = matchups[safeIndex];

  // The exposed matchup is the third-place match when it is exactly the bracket's
  // third-place match. getCurrentStageMatchups returns [thirdPlaceMatch] in that case.
  const thirdPlaceMatch = bracket.thirdPlaceMatch;
  const isThirdPlaceStage =
    thirdPlaceMatch !== null &&
    matchupCount === 1 &&
    matchups[0].id === thirdPlaceMatch.id;

  // Heading: "Third-place match" for the third-place stage; otherwise the Stage_Label
  // derived from the exposed round's participant count (2 * matchupCount).
  const heading = isThirdPlaceStage
    ? 'Third-place match'
    : getStageLabel(matchupCount * 2);

  const isThirdPlace =
    thirdPlaceMatch !== null && visibleMatchup.id === thirdPlaceMatch.id;
  const canDecide = isThirdPlace
    ? canSelectThirdPlaceWinner(bracket)
    : canSelectWinner(bracket, visibleMatchup.id);

  return (
    <section aria-labelledby="current-round-heading" className="current-round-view">
      <h2 id="current-round-heading">{heading}</h2>

      <p className="matchup-counter" aria-live="polite">
        Matchup {safeIndex + 1} of {matchupCount}
      </p>

      <ul className="matchup-list" aria-label={`${heading} matchups`}>
        <MatchupCard
          key={visibleMatchup.id}
          matchup={visibleMatchup}
          mode={mode}
          playerCount={playerCount}
          canDecide={canDecide}
          isThirdPlace={isThirdPlace}
          onSelectWinner={onSelectWinner}
          onEnterVotes={onEnterVotes}
          onResolveTie={onResolveTie}
          onSelectThirdPlaceWinner={onSelectThirdPlaceWinner}
          onEnterThirdPlaceVotes={onEnterThirdPlaceVotes}
          onResolveThirdPlaceTie={onResolveThirdPlaceTie}
        />
      </ul>

      <div className="matchup-nav">
        <button
          type="button"
          className="btn btn-secondary matchup-nav-btn"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={safeIndex === 0}
          aria-label="Previous matchup"
        >
          Prev
        </button>
        <button
          type="button"
          className="btn btn-secondary matchup-nav-btn"
          onClick={() => setCurrentIndex((i) => Math.min(matchupCount - 1, i + 1))}
          disabled={safeIndex === matchupCount - 1}
          aria-label="Next matchup"
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default CurrentRoundView;
