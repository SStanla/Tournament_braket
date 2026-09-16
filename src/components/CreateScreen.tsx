// UI layer — CreateScreen (Task 18).
//
// The tournament creation form: a required category, a bracket-size selector
// that offers ONLY valid powers of two (2..2048, Req 4.1, 4.2), and an optional
// player-count input whose inline validation preserves the other entered fields
// on error (Req 5.3). On a fully valid submit it dispatches CREATE, which moves
// the tournament into the FILLING phase, and shows a brief confirmation
// (Req 2.1, 2.2).
//
// All rule logic lives in the pure domain validators (validateCategory,
// validatePlayerCount); this component only wires them to inputs and surfaces
// messages inline (design.md "UI Components — CreateScreen").

import { useState, type FormEvent } from 'react';
import type { BracketSize } from '../domain/model';
import { validateCategory, validatePlayerCount } from '../domain/validation';
import { useTournament } from '../app/TournamentContext';
import styles from './CreateScreen.module.css';

/**
 * The only bracket sizes the selector offers: powers of two from 2 to 2048
 * (Req 4.1). Rendering exactly this list is what structurally prevents picking
 * a non-power-of-two value (Req 4.2) — the control cannot express one.
 */
export const BRACKET_SIZES: readonly BracketSize[] = [
  2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
];

/**
 * Tournament creation form. Holds its own draft field state so that a
 * validation error on one field never discards what the user typed in another
 * (Req 5.3); state is committed to the reducer only when every field is valid.
 */
export default function CreateScreen() {
  const { dispatch } = useTournament();

  const [category, setCategory] = useState('');
  const [size, setSize] = useState<BracketSize>(BRACKET_SIZES[0]);
  const [playerCount, setPlayerCount] = useState('');

  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [playerCountError, setPlayerCountError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmed(false);

    // Validate every field first so all inline messages appear together and no
    // valid field is cleared when another is invalid (Req 5.3).
    const categoryResult = validateCategory(category);
    const playerCountResult = validatePlayerCount(playerCount);

    setCategoryError(categoryResult.ok ? null : categoryResult.message);
    setPlayerCountError(playerCountResult.ok ? null : playerCountResult.message);

    if (!categoryResult.ok || !playerCountResult.ok) {
      // Block creation; the entered fields remain in state, untouched.
      return;
    }

    dispatch({
      type: 'CREATE',
      input: {
        category: categoryResult.value,
        size,
        playerCount: playerCountResult.value,
      },
    });

    // Show a brief confirmation; the reducer has moved the tournament into the
    // FILLING phase, and the parent screen router will render the fill screen
    // (Req 2.2). Keeping the confirmation lets the transition read as intended.
    setConfirmed(true);
  }

  const categoryErrorId = 'create-category-error';
  const playerCountErrorId = 'create-player-count-error';

  return (
    <section className={styles.screen} aria-labelledby="create-title">
      <h2 id="create-title" className={styles.title}>
        Create a tournament
      </h2>
      <p className={styles.intro}>
        Pick a topic and a bracket size. Add a player count to play by voting.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="create-category">
            Category
          </label>
          <input
            id="create-category"
            className={
              categoryError ? `${styles.input} ${styles.inputError}` : styles.input
            }
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-invalid={categoryError ? true : undefined}
            aria-describedby={categoryError ? categoryErrorId : undefined}
            placeholder="e.g. Best pasta sauce"
          />
          {categoryError && (
            <p id={categoryErrorId} className={styles.error} role="alert">
              {categoryError}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="create-size">
            Bracket size
          </label>
          <select
            id="create-size"
            className={styles.select}
            value={size}
            onChange={(event) =>
              setSize(Number(event.target.value) as BracketSize)
            }
          >
            {BRACKET_SIZES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="create-player-count">
            Player count <span className={styles.hint}>(optional)</span>
          </label>
          <p className={styles.hint}>
            Leave empty for classic mode. Enter a whole number of voters for
            vote-based mode.
          </p>
          <input
            id="create-player-count"
            className={
              playerCountError
                ? `${styles.input} ${styles.inputError}`
                : styles.input
            }
            type="text"
            inputMode="numeric"
            value={playerCount}
            onChange={(event) => setPlayerCount(event.target.value)}
            aria-invalid={playerCountError ? true : undefined}
            aria-describedby={playerCountError ? playerCountErrorId : undefined}
            placeholder="e.g. 10"
          />
          {playerCountError && (
            <p id={playerCountErrorId} className={styles.error} role="alert">
              {playerCountError}
            </p>
          )}
        </div>

        <button className={styles.submit} type="submit">
          Create tournament
        </button>

        {confirmed && (
          <p className={styles.confirmation} role="status">
            Tournament created. Add your options next.
          </p>
        )}
      </form>
    </section>
  );
}
