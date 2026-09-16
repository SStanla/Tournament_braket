// UI layer — ClassicMatchup body (Task 22.1).
//
// This component is the *body* rendered inside the PlayScreen shell's
// `renderMatchup` slot for classic-mode play. It presents a matchup's two
// options as two selectable buttons (Req 15.1); clicking one marks it as the
// provisional winner and highlights it (Req 15.2); it shows NO vote-related
// control (Req 15.4). Nothing is committed here — the highlighted option is
// recorded as the winner only when the user confirms with the shell's Next
// button, which dispatches CONFIRM (Req 15.3, wired in PlayScreen).
//
// Selection is expressed by dispatching SET_PROVISIONAL with a classic
// `{ optionId }` choice; the highlight is driven purely by the matchup's
// `provisionalWinnerId`, so a re-selection simply moves the provisional winner.
// The two option buttons are two distinct elements separated by a spaced "vs"
// separator so the names never appear adjacent (Req 13.6).

import type { Matchup, Option } from '../domain/model';
import { useTournament } from '../app/TournamentContext';
import styles from './ClassicMatchup.module.css';

/** Props for {@link ClassicMatchup}. */
export interface ClassicMatchupProps {
  /** The currently-visible matchup supplied by the PlayScreen slot. */
  matchup: Matchup;
}

/**
 * Classic-mode matchup body: two selectable option buttons with a provisional
 * highlight and no vote controls. Commit happens via the shell's Next button.
 */
export default function ClassicMatchup({ matchup }: ClassicMatchupProps) {
  const { dispatch } = useTournament();

  function selectOption(optionId: string) {
    // Mark the clicked option as the provisional winner (Req 15.2). This records
    // nothing permanent — the winner is committed only on confirm (Req 15.3).
    dispatch({
      type: 'SET_PROVISIONAL',
      matchupId: matchup.id,
      choice: { optionId },
    });
  }

  return (
    <div className={styles.matchup}>
      {renderSlot(matchup, matchup.optionA, 'slot-a', styles, selectOption)}
      <span className={styles.vsSeparator}>vs</span>
      {renderSlot(matchup, matchup.optionB, 'slot-b', styles, selectOption)}
    </div>
  );
}

/**
 * Render one side of the matchup: a selectable button for a present option, or
 * a neutral placeholder when the slot is not yet populated. Kept as a helper so
 * the two sides sit around the "vs" separator as distinct elements (Req 13.6).
 */
function renderSlot(
  matchup: Matchup,
  option: Option | undefined,
  slotKey: string,
  styles: Record<string, string>,
  onSelect: (optionId: string) => void,
) {
  if (!option) {
    return (
      <span key={slotKey} className={styles.placeholder} aria-hidden="true">
        —
      </span>
    );
  }
  const selected = matchup.provisionalWinnerId === option.id;
  return (
    <button
      key={option.id}
      type="button"
      className={styles.option}
      // Highlight the provisional winner; aria-pressed exposes the selected
      // state to assistive technology (Req 15.2).
      aria-pressed={selected}
      data-selected={selected || undefined}
      onClick={() => onSelect(option.id)}
    >
      {option.name}
    </button>
  );
}
