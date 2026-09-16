// UI layer — ResultsScreen (Task 24).
//
// Shown once the tournament is complete (phase RESULTS). It presents, in order
// (Req 22.1):
//   1. The final standings, from first place down (Req 22.2, 22.3, 22.4), with
//      long names kept fully readable (Req 22.5).
//   2. The full bracket as a read-only tree of every round from first to final,
//      each occupied slot's name, each round's stage label, and connecting
//      lines to the next round (Req 22.6). For size >= 4 the third-place match
//      is included as a distinct, dedicated-labelled matchup (Req 22.7) and the
//      champion / 3rd / 4th are clearly marked (Req 22.8).
//
// The tree is strictly read-only: it renders no buttons, links, inputs, or any
// other edit affordance. Corrections happen during round-by-round play, never
// from this final view (Req 22.9).

import type { Matchup, Option, Standing, Tournament } from '../domain/model';
import { thirdPlaceResult } from '../domain/tournament';
import { useTournament } from '../app/TournamentContext';
import styles from './ResultsScreen.module.css';

/** The dedicated label shown for the third-place playoff in the tree (Req 22.7). */
const THIRD_PLACE_LABEL = 'Third-place match';

/** Human-readable medal names for the standings, in English (Req 24.8). */
const MEDAL_LABEL: Record<NonNullable<Standing['medal']>, string> = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
};

/** Ordinal place labels for the four possible standings positions. */
const PLACE_LABEL: Record<Standing['place'], string> = {
  1: '1st place',
  2: '2nd place',
  3: '3rd place',
  4: '4th place',
};

/**
 * A single standings row. Champion and medalists carry a medal badge; 4th place
 * is a plain text indicator with no medal (Req 22.3). Names use wrapping styles
 * so long entries stay fully readable (Req 22.5).
 */
function StandingRow({ standing }: { standing: Standing }) {
  return (
    <li
      className={styles.standingRow}
      data-place={standing.place}
      data-medal={standing.medal ?? 'none'}
    >
      <span className={styles.standingPlace}>{PLACE_LABEL[standing.place]}</span>
      {standing.medal ? (
        <span
          className={styles.medal}
          data-medal={standing.medal}
          aria-label={`${MEDAL_LABEL[standing.medal]} medal`}
        >
          {MEDAL_LABEL[standing.medal]}
        </span>
      ) : null}
      <span className={styles.standingName}>{standing.option.name}</span>
    </li>
  );
}

/** The name to render in an occupied slot, or an em dash placeholder. */
function slotName(option?: Option): string {
  return option?.name ?? '—';
}

/**
 * A single read-only matchup cell in the bracket tree: its two slots stacked
 * with a connector to the next round. The winner slot is marked so it reads
 * clearly which option advanced. No interactive elements are rendered — this is
 * a display-only view (Req 22.9).
 */
function MatchupCell({
  matchup,
  championId,
  isFinal,
}: {
  matchup: Matchup;
  championId?: string;
  /** True for the final-round matchup, where the champion tag is shown. */
  isFinal: boolean;
}) {
  const winnerId = matchup.winner?.id;
  return (
    <div className={styles.matchupCell}>
      <SlotLine
        option={matchup.optionA}
        isWinner={winnerId !== undefined && matchup.optionA?.id === winnerId}
        isChampion={championId !== undefined && matchup.optionA?.id === championId}
        showChampionTag={isFinal}
      />
      <SlotLine
        option={matchup.optionB}
        isWinner={winnerId !== undefined && matchup.optionB?.id === winnerId}
        isChampion={championId !== undefined && matchup.optionB?.id === championId}
        showChampionTag={isFinal}
      />
    </div>
  );
}

/** One option slot within a matchup cell. Read-only text, no controls. */
function SlotLine({
  option,
  isWinner,
  isChampion,
  showChampionTag,
}: {
  option?: Option;
  isWinner: boolean;
  isChampion: boolean;
  /** Whether to render the visible "Champion" tag (final round only). */
  showChampionTag: boolean;
}) {
  return (
    <div
      className={styles.slot}
      data-winner={isWinner ? 'true' : undefined}
      data-champion={isChampion ? 'true' : undefined}
    >
      <span className={styles.slotName}>{slotName(option)}</span>
      {isChampion && showChampionTag ? (
        <span className={styles.championTag}>Champion</span>
      ) : null}
    </div>
  );
}

/**
 * The full bracket tree: one column per round (first → final) with each round's
 * stage label and its matchups, connected left-to-right toward the final
 * (Req 22.6). For size >= 4 the third-place playoff is appended as its own
 * distinct, dedicated-labelled column and 3rd/4th are marked (Req 22.7, 22.8).
 */
function BracketTree({ tournament }: { tournament: Tournament }) {
  const championId = tournament.champion?.id;
  const { third, fourth } = tournament.size >= 4
    ? thirdPlaceResult(tournament)
    : { third: undefined, fourth: undefined };

  return (
    <div className={styles.tree} role="group" aria-label="Full bracket">
      {tournament.rounds.map((round, roundIndex) => {
        const isFinal = roundIndex === tournament.rounds.length - 1;
        return (
          <div className={styles.round} key={round.index}>
            <h4 className={styles.stageLabel}>{round.stageLabel}</h4>
            <div className={styles.roundMatchups}>
              {round.matchups.map((matchup) => (
                <MatchupCell
                  key={matchup.id}
                  matchup={matchup}
                  championId={championId}
                  isFinal={isFinal}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Third-place playoff: a distinct, dedicated-labelled column for
          size >= 4, with 3rd/4th clearly marked (Req 22.7, 22.8). */}
      {tournament.size >= 4 && tournament.thirdPlaceMatch ? (
        <div
          className={`${styles.round} ${styles.thirdPlaceRound}`}
          data-third-place="true"
        >
          <h4 className={styles.stageLabel}>{THIRD_PLACE_LABEL}</h4>
          <div className={styles.roundMatchups}>
            <div className={`${styles.matchupCell} ${styles.thirdPlaceCell}`}>
              <ThirdPlaceSlot option={tournament.thirdPlaceMatch.optionA} thirdId={third?.id} fourthId={fourth?.id} />
              <ThirdPlaceSlot option={tournament.thirdPlaceMatch.optionB} thirdId={third?.id} fourthId={fourth?.id} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A slot in the third-place cell, tagged 3rd or 4th as decided (Req 22.8). */
function ThirdPlaceSlot({
  option,
  thirdId,
  fourthId,
}: {
  option?: Option;
  thirdId?: string;
  fourthId?: string;
}) {
  const isThird = option !== undefined && option.id === thirdId;
  const isFourth = option !== undefined && option.id === fourthId;
  return (
    <div
      className={styles.slot}
      data-third={isThird ? 'true' : undefined}
      data-fourth={isFourth ? 'true' : undefined}
    >
      <span className={styles.slotName}>{slotName(option)}</span>
      {isThird ? <span className={styles.placeTag}>3rd</span> : null}
      {isFourth ? <span className={styles.placeTag}>4th</span> : null}
    </div>
  );
}

/**
 * The results screen. Reads the completed tournament from the shared context
 * and renders standings first, then the read-only bracket tree (Req 22.1).
 * Fails soft (renders nothing) if invoked without a completed tournament.
 */
export default function ResultsScreen() {
  const { state } = useTournament();
  const tournament = state.tournament;

  if (!tournament || tournament.phase !== 'RESULTS') {
    return null;
  }

  const standings = tournament.standings ?? [];

  return (
    <section className={styles.screen} aria-labelledby="results-heading">
      <h2 id="results-heading" className={styles.heading}>
        Final results
      </h2>

      {/* Standings first (Req 22.1). Ordered from first place down (Req 22.2). */}
      <section className={styles.standingsSection} aria-labelledby="standings-heading">
        <h3 id="standings-heading" className={styles.sectionTitle}>
          Final standings
        </h3>
        <ol className={styles.standingsList}>
          {standings.map((standing) => (
            <StandingRow key={standing.place} standing={standing} />
          ))}
        </ol>
      </section>

      {/* Full bracket after the standings (Req 22.1, 22.6). Read-only. */}
      <section className={styles.bracketSection} aria-labelledby="bracket-heading">
        <h3 id="bracket-heading" className={styles.sectionTitle}>
          Full bracket
        </h3>
        <BracketTree tournament={tournament} />
      </section>
    </section>
  );
}
