import type { Bracket } from '../types/index';
import { getFinalStandings } from '../services/bracket-manager';

/**
 * FinalStandings — the ranked placements shown once the tournament is complete
 * (Req 15). Rendered by App before the full bracket tree at completion.
 *
 * It derives the ordered standings from `getFinalStandings(bracket)` (ascending
 * place) and renders each entry as a row showing a placement indicator and the
 * placed option's name:
 *  - place 1 → 🥇 (gold), place 2 → 🥈 (silver), place 3 → 🥉 (bronze),
 *    place 4 → a plain "4th" indicator (no medal). (Req 15.1, 15.2, 15.3, 15.4)
 *  - For size-2 brackets `getFinalStandings` yields only places 1 and 2, so only
 *    those two rows are rendered.
 *
 * Long names wrap and expose their full text via a `title` attribute (mirroring
 * CurrentRoundView's readability pattern, ~40 visible chars) so complete names
 * stay accessible (Req 9.2). The section is headed "Final standings" with an
 * aria-label and the rows are an ordered list (`<ol>`) reflecting placement.
 *
 * When the tournament is not complete (`getFinalStandings` returns `[]`) the
 * component renders nothing.
 *
 * Requirements: 9.2, 15.1, 15.2, 15.3, 15.4
 */

const MAX_DISPLAY_CHARS = 40;

function displayName(name: string): string {
  if (name.length <= MAX_DISPLAY_CHARS) return name;
  return name.slice(0, MAX_DISPLAY_CHARS - 1) + '…';
}

/**
 * Maps a 1-based placement to its indicator. The top three places get a medal
 * emoji; any other place gets a plain ordinal label (e.g. "4th").
 */
function placeIndicator(place: number): { symbol: string; label: string } {
  switch (place) {
    case 1:
      return { symbol: '🥇', label: '1st place' };
    case 2:
      return { symbol: '🥈', label: '2nd place' };
    case 3:
      return { symbol: '🥉', label: '3rd place' };
    default:
      return { symbol: `${place}th`, label: `${place}th place` };
  }
}

export interface FinalStandingsProps {
  bracket: Bracket;
}

export function FinalStandings({ bracket }: FinalStandingsProps) {
  const standings = getFinalStandings(bracket);

  // Not complete (or no standings to show) — render nothing.
  if (standings.length === 0) return null;

  return (
    <section aria-labelledby="final-standings-heading" className="final-standings card">
      <h2 id="final-standings-heading">Final standings</h2>
      <ol className="final-standings-list" aria-label="Final standings">
        {standings.map(({ place, participant }) => {
          const { symbol, label } = placeIndicator(place);
          return (
            <li key={participant.id} className="final-standings-row">
              <span className="final-standings-place" aria-label={label} title={label}>
                {symbol}
              </span>
              <span className="final-standings-name" title={participant.name}>
                {displayName(participant.name)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default FinalStandings;
