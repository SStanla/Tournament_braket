// Pure domain lifecycle functions for the tournament bracket creator.
// No React imports and no I/O — only pure functions and type definitions.
// Mirrors the "Domain Functions (pure) — Bracket lifecycle" section of the
// design document.

import type { BracketSize, Matchup, Option, Round, Standing, Tournament } from './model';
import { createSeededRng, type SeededRng } from './rng';
import { validateOptionName } from './validation';

/**
 * Input required to create a new tournament.
 *
 * `category` and `size` are required; `playerCount` is optional and, when
 * present, must already be a validated whole number >= 1 (see
 * {@link validatePlayerCount}). The presence of a `playerCount` is the *only*
 * thing that drives the play mode (Req 5.4, 25.7); no other flag exists.
 *
 * `rngSeed` may be supplied for deterministic shuffles/tie-breaks in tests; when
 * omitted a fresh seed is generated.
 */
export interface CreateTournamentInput {
  /** Category as free text, expected trimmed to 1..100 chars (Req 3). */
  category: string;
  /** Chosen bracket size, a power of two in 2..2048 (Req 4). */
  size: BracketSize;
  /**
   * Optional player count. Absent => classic mode; a whole number >= 1 =>
   * vote-based mode (Req 5.1, 5.2). Callers should pass the value produced by
   * {@link validatePlayerCount}.
   */
  playerCount?: number;
  /** Optional explicit RNG seed for reproducible randomness (Req 12.1). */
  rngSeed?: number;
}

/**
 * Derive the play mode from a player count. The mode is `voteBased` exactly when
 * a valid whole number >= 1 is present, and `classic` otherwise. This is the
 * single source of truth for mode determination (Req 5.1, 5.2, 5.4, 25.7,
 * Appendix A rule 1).
 *
 * Non-integer or sub-1 values are treated as absent for the purpose of mode
 * derivation; validation is the caller's responsibility and should have already
 * rejected such values (Req 5.3).
 */
export function deriveMode(playerCount?: number): 'classic' | 'voteBased' {
  if (
    playerCount === undefined ||
    !Number.isInteger(playerCount) ||
    playerCount < 1
  ) {
    return 'classic';
  }
  return 'voteBased';
}

/**
 * Generate a fresh RNG seed. Kept internal so callers can rely on
 * {@link createTournament} to seed reproducibly when no seed is provided.
 */
function generateSeed(): number {
  // A 32-bit unsigned integer is sufficient for the mulberry32 RNG.
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/**
 * Create a new tournament from validated creation input.
 *
 * The result starts empty and ready for the filling phase:
 * - `phase` is `FILLING` and the user is moved there on success (Req 2.2).
 * - `options` and `suggestions` are empty; no matchups are generated yet
 *   (Req 2.3).
 * - `mode` is derived once from `playerCount` and is immutable thereafter
 *   (Req 5.1, 5.2, 5.4, 5.5, 25.7). When vote-based, `playerCount` is retained
 *   for the voting and re-seeding phases (Req 5.2).
 * - `rounds` is empty and the round/matchup cursors start at 0.
 * - An `rngSeed` is set so later shuffles and tie-breaks are reproducible
 *   (Req 12.1).
 *
 * The returned object is a fresh value; the caller's `input` is not mutated.
 */
export function createTournament(input: CreateTournamentInput): Tournament {
  const mode = deriveMode(input.playerCount);
  const rngSeed =
    input.rngSeed !== undefined ? input.rngSeed >>> 0 : generateSeed();

  const tournament: Tournament = {
    phase: 'FILLING',
    category: input.category,
    size: input.size,
    mode,
    options: [],
    suggestions: [],
    rounds: [],
    currentRoundIndex: 0,
    currentMatchupIndex: 0,
    rngSeed,
  };

  // Retain the player count only in vote-based mode; classic tournaments carry
  // no player count at all (Req 5.1).
  if (mode === 'voteBased') {
    tournament.playerCount = input.playerCount;
  }

  return tournament;
}

// ---------------------------------------------------------------------------
// Option add/remove with capacity rules (Req 6, 7) and generation gating (Req 8)
// ---------------------------------------------------------------------------

/**
 * Discriminated result of a mutation that either produces a new tournament or
 * fails with a user-facing message. `ok: true` carries the next tournament
 * value; `ok: false` carries the reason the mutation was rejected.
 */
export type OptionResult =
  | { ok: true; tournament: Tournament }
  | { ok: false; message: string };

/**
 * Generate a stable, unique option id for a tournament. Ids are of the form
 * `opt-<n>` where `n` is one greater than the highest existing numeric suffix,
 * so removing options never causes a future collision and the id space is
 * strictly increasing. Non-conforming ids (should not occur) are ignored when
 * computing the next suffix.
 */
function nextOptionId(options: readonly Option[]): string {
  let max = 0;
  for (const option of options) {
    const match = /^opt-(\d+)$/.exec(option.id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) {
        max = n;
      }
    }
  }
  return `opt-${max + 1}`;
}

/**
 * Whether the bracket has no remaining slots, i.e. the number of options has
 * reached the chosen size. When full, the option input is disabled and the
 * bracket is signalled as full (Req 6.7).
 */
export function isFull(tournament: Tournament): boolean {
  return tournament.options.length >= tournament.size;
}

/**
 * Add an option to the tournament, enforcing all filling-phase rules.
 *
 * The name is validated with {@link validateOptionName}, which trims edge
 * whitespace (Req 6.4), rejects empty/whitespace-only names (Req 6.3), rejects
 * names longer than 100 characters after trimming (Req 6.2), and rejects
 * duplicates ignoring case and edge whitespace (Req 6.5). Independently, the
 * bracket may not hold more options than the chosen size, so adding when full
 * is rejected (Req 6.6).
 *
 * The capacity check runs first: when the bracket is already full, no further
 * option is accepted regardless of the name. On success a *new* tournament is
 * returned with the trimmed name stored under a fresh stable id (Req 6.4); the
 * input tournament is never mutated.
 */
export function addOption(tournament: Tournament, rawName: string): OptionResult {
  if (isFull(tournament)) {
    return {
      ok: false,
      message: `The bracket is full (${tournament.size} / ${tournament.size}).`,
    };
  }

  const validation = validateOptionName(rawName, tournament.options);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const option: Option = { id: nextOptionId(tournament.options), name: validation.value };

  return {
    ok: true,
    tournament: {
      ...tournament,
      options: [...tournament.options, option],
    },
  };
}

/**
 * Remove the option with the given id, freeing its slot and updating the count
 * (Req 7.1, 7.2). Removal is always allowed, including when the bracket is full,
 * so the user can make room for a different entry (Req 7.3).
 *
 * A *new* tournament is returned; the input is never mutated. When no option
 * matches the id the options list is unchanged (structurally a fresh copy).
 */
export function removeOption(tournament: Tournament, optionId: string): Tournament {
  return {
    ...tournament,
    options: tournament.options.filter((option) => option.id !== optionId),
  };
}

/**
 * Whether the bracket may be generated: the number of options must exactly
 * equal the chosen size (Req 8.1). This gates the "generate the bracket"
 * command so no incomplete bracket can ever be generated (Req 8.2, 25.4).
 */
export function canGenerate(tournament: Tournament): boolean {
  return tournament.options.length === tournament.size;
}

// ---------------------------------------------------------------------------
// Bracket generation (Req 12)
// ---------------------------------------------------------------------------

/**
 * Derive a round's human-readable stage label from the number of options it
 * contests (Req 12.6). The three named stages are fixed regardless of the
 * overall bracket size, so an 8-option round is always the "Quarterfinal",
 * a 4-option round the "Semifinal", and the 2-option round the "Final".
 * Every other size falls back to the generic "Round of N" form (for example
 * "Round of 16"). All labels are English (Req 24.8).
 */
export function stageLabelFor(optionCount: number): string {
  switch (optionCount) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinal';
    case 8:
      return 'Quarterfinal';
    default:
      return `Round of ${optionCount}`;
  }
}

/**
 * Generate the bracket for a full tournament and move it into play.
 *
 * Preconditions: the caller must have confirmed {@link canGenerate} (options
 * exactly equal the chosen size); this guards against generating an incomplete
 * bracket (Req 8.1, 25.4). If the precondition does not hold this throws, since
 * a partially populated bracket would violate the structure invariants.
 *
 * Behaviour (Req 12):
 * - The options are shuffled with a seeded RNG so pairings are random yet
 *   reproducible for a given seed (Req 12.1). By default the RNG is built from
 *   the tournament's own `rngSeed`, keeping generation deterministic; a caller
 *   may inject an RNG (e.g. in tests).
 * - The first round has half as many matchups as options, and each subsequent
 *   round halves again, down to a single-matchup final; the number of rounds is
 *   log2(size) (Req 12.2, 12.3).
 * - The first round's matchups are populated from the shuffled options in order
 *   (pairs of two), so every slot is filled and no option appears twice
 *   (Req 12.1). Later rounds start with empty option slots, to be filled as
 *   winners advance.
 * - Each round carries a stage label derived from its option count (Req 12.6).
 * - When the size is 4 or more an initially-empty third-place match is prepared;
 *   size 2 has none (Req 12.4, 12.5).
 * - The phase moves to `PLAYING` and the play cursors reset to the first
 *   matchup of the first round.
 *
 * A new tournament value is returned; the input is not mutated.
 */
export function generateBracket(
  tournament: Tournament,
  rng: SeededRng = createSeededRng(tournament.rngSeed),
): Tournament {
  if (!canGenerate(tournament)) {
    throw new Error(
      `Cannot generate a bracket: ${tournament.options.length} option(s) do not match the chosen size of ${tournament.size}.`,
    );
  }

  const size = tournament.size;
  const shuffled = rng.shuffle(tournament.options);

  // Number of rounds is log2(size); the round option counts halve each time
  // from `size` down to 2 (Req 12.2, 12.3).
  const roundCount = Math.log2(size);
  const rounds: Round[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    // Options contested in this round: size, size/2, ... down to 2.
    const optionCount = size >> roundIndex;
    const matchupCount = optionCount / 2;
    const matchups: Matchup[] = [];

    for (let slotIndex = 0; slotIndex < matchupCount; slotIndex += 1) {
      const matchup: Matchup = {
        id: `m-r${roundIndex}-s${slotIndex}`,
        roundIndex,
        slotIndex,
      };

      // Only the first round is seeded from the shuffled options; later rounds
      // start empty and are filled as winners advance (Req 12.1, 12.3).
      if (roundIndex === 0) {
        matchup.optionA = shuffled[slotIndex * 2];
        matchup.optionB = shuffled[slotIndex * 2 + 1];
      }

      matchups.push(matchup);
    }

    rounds.push({
      index: roundIndex,
      optionCount,
      stageLabel: stageLabelFor(optionCount),
      matchups,
    });
  }

  const next: Tournament = {
    ...tournament,
    phase: 'PLAYING',
    rounds,
    currentRoundIndex: 0,
    currentMatchupIndex: 0,
  };

  // Prepare an initially-empty third-place match only for size >= 4; size 2 has
  // none (Req 12.4, 12.5).
  if (size >= 4) {
    next.thirdPlaceMatch = {
      id: 'm-third-place',
      // The third-place match sits alongside the final round (two contestants).
      roundIndex: roundCount - 1,
      slotIndex: 1,
      isThirdPlace: true,
    };
  }

  return next;
}

// ---------------------------------------------------------------------------
// Classic matchup resolution (Req 14.1, 14.2, 15.1–15.5, 18.1, 18.2)
// ---------------------------------------------------------------------------

/**
 * Result of a matchup mutation that either produces a new tournament or fails
 * with a user-facing message. Mirrors {@link OptionResult} for gameplay
 * transitions.
 */
export type MatchupResult =
  | { ok: true; tournament: Tournament }
  | { ok: false; message: string };

/**
 * Locate a matchup by id anywhere in the bracket, returning its round index and
 * slot index alongside the matchup, or `undefined` when no matchup matches. The
 * third-place match is included in the search (Req 19), identified by its
 * dedicated id.
 */
function findMatchup(
  tournament: Tournament,
  matchupId: string,
): { matchup: Matchup; roundIndex: number; slotIndex: number; isThirdPlace: boolean } | undefined {
  for (const round of tournament.rounds) {
    for (const matchup of round.matchups) {
      if (matchup.id === matchupId) {
        return {
          matchup,
          roundIndex: matchup.roundIndex,
          slotIndex: matchup.slotIndex,
          isThirdPlace: false,
        };
      }
    }
  }
  if (tournament.thirdPlaceMatch && tournament.thirdPlaceMatch.id === matchupId) {
    return {
      matchup: tournament.thirdPlaceMatch,
      roundIndex: tournament.thirdPlaceMatch.roundIndex,
      slotIndex: tournament.thirdPlaceMatch.slotIndex,
      isThirdPlace: true,
    };
  }
  return undefined;
}

/**
 * Whether a matchup can be decided: both of its options must be present
 * (Req 18.1). A matchup with a missing option (e.g. a later round awaiting a
 * winner) is not yet decidable.
 */
function isDecidable(matchup: Matchup): boolean {
  return matchup.optionA !== undefined && matchup.optionB !== undefined;
}

/**
 * Deep-copy the mutable bracket structure of a tournament so gameplay
 * transitions never mutate the caller's value. Rounds, their matchup arrays,
 * and each matchup object are cloned; the third-place match is cloned when
 * present. Options themselves are shared by reference (they are immutable
 * value-like records).
 */
function cloneForPlay(tournament: Tournament): Tournament {
  const rounds: Round[] = tournament.rounds.map((round) => ({
    ...round,
    matchups: round.matchups.map((matchup) => ({ ...matchup })),
  }));
  const next: Tournament = { ...tournament, rounds };
  if (tournament.thirdPlaceMatch) {
    next.thirdPlaceMatch = { ...tournament.thirdPlaceMatch };
  }
  return next;
}

/**
 * Set the provisional (tentative) winner of a matchup in classic mode without
 * recording anything permanent (Req 14.1, 15.2).
 *
 * The chosen option must be one of the matchup's two present options, and the
 * matchup must be decidable — both options present (Req 18.1). On success a new
 * tournament is returned whose target matchup carries `provisionalWinnerId`
 * set to the chosen option; crucially the matchup's `winner` is left untouched,
 * so nothing is committed until {@link confirmMatchup} runs (Req 14.1, 15.3).
 * The provisional choice may be changed freely by calling this again (Req 15.2),
 * letting the user adjust before confirming.
 *
 * Rejections (unknown matchup, undecidable matchup, or an option not part of
 * the matchup) return a user-facing message and change nothing.
 */
export function setProvisionalWinner(
  tournament: Tournament,
  matchupId: string,
  optionId: string,
): MatchupResult {
  const found = findMatchup(tournament, matchupId);
  if (!found) {
    return { ok: false, message: `No matchup with id "${matchupId}".` };
  }

  const { matchup } = found;
  if (!isDecidable(matchup)) {
    return {
      ok: false,
      message: 'This matchup cannot be decided yet: both options must be present.',
    };
  }

  if (matchup.optionA!.id !== optionId && matchup.optionB!.id !== optionId) {
    return {
      ok: false,
      message: 'The chosen option is not part of this matchup.',
    };
  }

  const next = cloneForPlay(tournament);
  const target = findMatchup(next, matchupId)!.matchup;
  target.provisionalWinnerId = optionId;

  return { ok: true, tournament: next };
}

/**
 * Provisional representation for vote-based mode (Req 16.1–16.3, 14.1).
 *
 * A tentative vote split is stored directly on the matchup's `votesA`/`votesB`
 * fields, while `winner` is left untouched — nothing is committed until
 * {@link confirmMatchup} runs. This mirrors the classic-mode provisional
 * convention where `provisionalWinnerId` is set but `winner` is not.
 *
 * Set the provisional votes for option A of a vote-based matchup and derive the
 * votes for option B as `playerCount - votesA` so the two always sum to exactly
 * the player count (Req 16.1, 16.2, 16.3). Nothing is recorded as the winner
 * (Req 14.1); the leader is only committed on confirm.
 *
 * Rejections (all leave the tournament unchanged, returning a user-facing
 * message):
 * - a tournament that is not in vote-based mode / has no player count;
 * - an unknown matchup id;
 * - a matchup that is not yet decidable (an option missing, Req 18.1);
 * - a `votesA` that is not a whole number, is negative, or exceeds the player
 *   count — any of these would make the sum differ from the player count
 *   (Req 16.3, 16.11).
 *
 * A new tournament value is returned; the input is never mutated.
 */
export function setProvisionalVotes(
  tournament: Tournament,
  matchupId: string,
  votesA: number,
): MatchupResult {
  if (tournament.mode !== 'voteBased' || tournament.playerCount === undefined) {
    return {
      ok: false,
      message: 'Vote splits are only available in vote-based mode.',
    };
  }

  const playerCount = tournament.playerCount;

  const found = findMatchup(tournament, matchupId);
  if (!found) {
    return { ok: false, message: `No matchup with id "${matchupId}".` };
  }

  const { matchup } = found;
  if (!isDecidable(matchup)) {
    return {
      ok: false,
      message: 'This matchup cannot be decided yet: both options must be present.',
    };
  }

  // Reject any split whose sum would differ from the player count: votesA must
  // be a whole number in [0, playerCount] so that votesB = playerCount - votesA
  // is itself a valid non-negative count and the two sum exactly (Req 16.3,
  // 16.11).
  if (!Number.isInteger(votesA) || votesA < 0 || votesA > playerCount) {
    return {
      ok: false,
      message: `Votes for option A must be a whole number between 0 and ${playerCount}.`,
    };
  }

  const next = cloneForPlay(tournament);
  const target = findMatchup(next, matchupId)!.matchup;
  target.votesA = votesA;
  target.votesB = playerCount - votesA;
  // Leave `winner` untouched: nothing is committed until confirm (Req 14.1).

  return { ok: true, tournament: next };
}

/**
 * Advance a decided winner into the correct fixed slot of the next round, with
 * no re-seeding (classic mode, Req 15.5, 18.2). A matchup at round `r`, slot `s`
 * feeds the next round's slot `floor(s / 2)`, occupying `optionA` when `s` is
 * even and `optionB` when `s` is odd. This keeps pairings fixed exactly as
 * generated. The final round has no next round, and the third-place match feeds
 * nowhere, so both are no-ops here. Mutates the passed (already-cloned)
 * tournament in place.
 */
function advanceWinnerFixed(
  next: Tournament,
  roundIndex: number,
  slotIndex: number,
  isThirdPlace: boolean,
  winner: Option,
): void {
  if (isThirdPlace) {
    return;
  }
  const nextRoundIndex = roundIndex + 1;
  if (nextRoundIndex >= next.rounds.length) {
    return; // final round: no onward slot.
  }
  const targetSlot = Math.floor(slotIndex / 2);
  const targetMatchup = next.rounds[nextRoundIndex].matchups[targetSlot];
  if (slotIndex % 2 === 0) {
    targetMatchup.optionA = winner;
  } else {
    targetMatchup.optionB = winner;
  }
}

/**
 * Commit a vote-based matchup by its provisional split (Req 16.3, 16.6, 16.7).
 *
 * Preconditions checked by the caller ({@link confirmMatchup}): the matchup
 * exists and is decidable. Here we require a provisional split to have been set
 * (both `votesA` and `votesB` present) and enforce the vote-sum invariant
 * `votesA + votesB === playerCount` (Req 16.3, 16.11); a split that violates it
 * is rejected and nothing is recorded.
 *
 * When the split is a non-tie the leading option (more votes) is committed as
 * the winner and advanced into the fixed next-round slot exactly like classic,
 * setting the champion when the final is decided (Req 16.6, 18.2). When the
 * split is a tie (`votesA === votesB`, only possible on an even player count)
 * no winner is committed and no advance occurs — the tie is left for the
 * tie-break to resolve (Req 16.7); the provisional votes are retained so the
 * tie-break control has the split to work from.
 *
 * The input tournament is never mutated.
 */
function confirmVoteMatchup(
  tournament: Tournament,
  matchupId: string,
): MatchupResult {
  const { matchup, roundIndex, slotIndex, isThirdPlace } = findMatchup(
    tournament,
    matchupId,
  )!;

  const { votesA, votesB } = matchup;
  if (votesA === undefined || votesB === undefined) {
    return {
      ok: false,
      message: 'No vote split has been set for this matchup.',
    };
  }

  // Enforce the vote-sum invariant: the split must sum to exactly the player
  // count (Req 16.3, 16.6, 16.11).
  if (
    tournament.playerCount === undefined ||
    votesA + votesB !== tournament.playerCount
  ) {
    return {
      ok: false,
      message: 'The vote split must sum to exactly the player count.',
    };
  }

  const next = cloneForPlay(tournament);
  const target = findMatchup(next, matchupId)!.matchup;

  // A tie commits no winner and is left for the tie-break (Req 16.7). The
  // provisional split is retained so the tie-break has the votes to work from.
  if (votesA === votesB) {
    return { ok: true, tournament: next };
  }

  const winner = votesA > votesB ? matchup.optionA! : matchup.optionB!;
  target.winner = winner;
  target.provisionalWinnerId = undefined;

  advanceWinnerFixed(next, roundIndex, slotIndex, isThirdPlace, winner);

  const isFinalRound = !isThirdPlace && roundIndex === next.rounds.length - 1;
  if (isFinalRound) {
    next.champion = winner;
  }

  // Auto-populate the third-place match once both semifinals are decided
  // (Req 19.1), identically in classic and vote-based mode.
  return { ok: true, tournament: populateThirdPlace(next) };
}

/**
 * Commit a matchup's provisional choice as its recorded winner and advance that
 * winner into the next round (Req 14.2, 15.3, 18.2).
 *
 * In classic mode the committed winner is the option previously marked via
 * {@link setProvisionalWinner}; confirming without a provisional selection is
 * rejected, since nothing has been chosen to record (Req 14.1). The matchup
 * must be decidable — both options present (Req 18.1).
 *
 * On success a new tournament is returned in which:
 * - the target matchup's `winner` is set and its transient
 *   `provisionalWinnerId` is cleared;
 * - the winner is advanced into the predetermined next-round slot with no
 *   re-seeding, so pairings stay fixed as generated (Req 15.5, 18.2);
 * - when the final round's single matchup is decided, that winner is also set
 *   as the tournament champion (Req 18.2 onward). The third-place match never
 *   advances anyone onward.
 *
 * In vote-based mode the committed winner is the leader of the provisional vote
 * split set via {@link setProvisionalVotes}: the option with more votes wins
 * and is advanced exactly like classic (Req 16.6). The vote-sum invariant is
 * enforced — a split whose `votesA + votesB` differs from the player count is
 * rejected (Req 16.3, 16.6). A tie (`votesA === votesB`, only possible on an
 * even player count) commits no winner and is left for the tie-break to resolve
 * (Req 16.7); confirming a tie here succeeds but records nothing and does not
 * advance. (Task 9.2 adds {@link resolveTieBreak} and the block-advance
 * behaviour; this function leaves the tie unresolved as the seam.)
 *
 * The input tournament is never mutated.
 */
export function confirmMatchup(
  tournament: Tournament,
  matchupId: string,
): MatchupResult {
  const found = findMatchup(tournament, matchupId);
  if (!found) {
    return { ok: false, message: `No matchup with id "${matchupId}".` };
  }

  const { matchup, roundIndex, slotIndex, isThirdPlace } = found;
  if (!isDecidable(matchup)) {
    return {
      ok: false,
      message: 'This matchup cannot be decided yet: both options must be present.',
    };
  }

  // Vote-based mode commits the leader of the provisional split (Req 16.6).
  if (tournament.mode === 'voteBased') {
    return confirmVoteMatchup(tournament, matchupId);
  }

  const provisionalId = matchup.provisionalWinnerId;
  if (provisionalId === undefined) {
    return {
      ok: false,
      message: 'No provisional winner has been selected for this matchup.',
    };
  }

  const winner =
    matchup.optionA!.id === provisionalId
      ? matchup.optionA!
      : matchup.optionB!.id === provisionalId
        ? matchup.optionB!
        : undefined;

  if (!winner) {
    return {
      ok: false,
      message: 'The provisional winner is no longer part of this matchup.',
    };
  }

  const next = cloneForPlay(tournament);
  const target = findMatchup(next, matchupId)!.matchup;
  target.winner = winner;
  target.provisionalWinnerId = undefined;

  advanceWinnerFixed(next, roundIndex, slotIndex, isThirdPlace, winner);

  // When the final round's matchup is decided, its winner is the champion.
  const isFinalRound = !isThirdPlace && roundIndex === next.rounds.length - 1;
  if (isFinalRound) {
    next.champion = winner;
  }

  // Auto-populate the third-place match once both semifinals are decided
  // (Req 19.1), identically in classic and vote-based mode.
  return { ok: true, tournament: populateThirdPlace(next) };
}

// ---------------------------------------------------------------------------
// Tie detection, block-advance, and tie-break draw (Req 16.7–16.10)
// ---------------------------------------------------------------------------

/**
 * Whether a matchup's vote split is an exact tie (`votesA === votesB`, both
 * present). A tie is only possible when the player count is even, since with an
 * odd player count the two provisional votes always sum to an odd number and so
 * can never be equal (Req 16.10). This is the low-level parity check used by
 * {@link hasUnresolvedTie}.
 */
export function isTie(matchup: Matchup): boolean {
  return (
    matchup.votesA !== undefined &&
    matchup.votesB !== undefined &&
    matchup.votesA === matchup.votesB
  );
}

/**
 * Whether a matchup is a tie that still needs resolving: the split is a tie
 * (both votes present and equal) and no winner has yet been committed
 * (Req 16.7). Once {@link resolveTieBreak} runs and sets a winner this returns
 * `false` even though the tied votes are retained. Used by
 * {@link isMatchupDecided} so an unresolved tie is never treated as decided.
 */
export function hasUnresolvedTie(matchup: Matchup): boolean {
  return isTie(matchup) && matchup.winner === undefined;
}

/**
 * Whether a matchup counts as decided for the purpose of advancing the round
 * (Req 16.8, 18.5). A matchup is decided exactly when it has a committed
 * `winner`. A matchup carrying an unresolved tie is explicitly *not* decided,
 * so round advancement stays blocked until the tie-break draw is used
 * (Req 16.8).
 *
 * Task 10's `advanceIfRoundComplete` MUST gate on this helper (and its
 * inverse {@link isTieUnresolved}) so a round with any unresolved tie can never
 * be considered complete. In classic mode a matchup simply has no votes, so
 * `hasUnresolvedTie` is false and only the presence of a `winner` matters.
 */
export function isMatchupDecided(matchup: Matchup): boolean {
  return matchup.winner !== undefined && !hasUnresolvedTie(matchup);
}

/**
 * Convenience inverse used by round advancement: `true` when the matchup is a
 * tie awaiting the tie-break draw and thus blocks advancing past it (Req 16.8).
 * Exposed for Task 10's `advanceIfRoundComplete`.
 */
export function isTieUnresolved(matchup: Matchup): boolean {
  return hasUnresolvedTie(matchup);
}

/**
 * Simple deterministic 32-bit string hash (FNV-1a-style) used to derive a
 * per-matchup tie-break seed so that distinct matchups in the same tournament
 * draw independently yet reproducibly under a fixed `rngSeed`.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // 32-bit FNV prime multiply via imul for overflow-safe behaviour.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Resolve a tied vote-based matchup with a seeded 50/50 draw (Req 16.9).
 *
 * Preconditions: the tournament is vote-based and the matchup exists, carries a
 * tie (`votesA === votesB`, both present, only possible on an even player
 * count), and has no committed winner yet — i.e. {@link hasUnresolvedTie} holds.
 * Any of these failing returns a user-facing message and changes nothing; in
 * particular an odd player count can never tie so a tie-break is never valid
 * there (Req 16.10).
 *
 * The draw is deterministic given the tournament's `rngSeed`: by default a
 * per-matchup RNG is built from `rngSeed` combined with a hash of the matchup
 * id, so each tied matchup draws independently yet reproducibly and repeated
 * runs on the same seed pick the same winner. A caller may inject its own RNG
 * (e.g. in tests) to fully control the outcome. A single `nextBoolean()` draw
 * selects option A (false) or option B (true) with equal probability
 * (Req 16.9).
 *
 * On success a new tournament is returned in which the target matchup's
 * `winner` is set, `tieBreakUsed` is flagged true, and the winner is advanced
 * into the fixed next-round slot exactly like a normal confirm; the champion is
 * set when the final is resolved this way (Req 16.9, 18.2). The tied votes are
 * retained. The input tournament is never mutated.
 */
export function resolveTieBreak(
  tournament: Tournament,
  matchupId: string,
  rng?: SeededRng,
): MatchupResult {
  if (tournament.mode !== 'voteBased') {
    return {
      ok: false,
      message: 'Tie-breaks are only available in vote-based mode.',
    };
  }

  const found = findMatchup(tournament, matchupId);
  if (!found) {
    return { ok: false, message: `No matchup with id "${matchupId}".` };
  }

  const { matchup, roundIndex, slotIndex, isThirdPlace } = found;
  if (!hasUnresolvedTie(matchup)) {
    return {
      ok: false,
      message: 'This matchup has no unresolved tie to break.',
    };
  }

  // Derive a per-matchup seed so distinct ties draw independently yet stay
  // reproducible under the tournament seed (Req 16.9).
  const drawRng =
    rng ??
    createSeededRng((tournament.rngSeed ^ hashString(matchupId)) >>> 0);

  // false => option A, true => option B, each with 50/50 probability.
  const winner = drawRng.nextBoolean() ? matchup.optionB! : matchup.optionA!;

  const next = cloneForPlay(tournament);
  const target = findMatchup(next, matchupId)!.matchup;
  target.winner = winner;
  target.tieBreakUsed = true;
  target.provisionalWinnerId = undefined;

  advanceWinnerFixed(next, roundIndex, slotIndex, isThirdPlace, winner);

  const isFinalRound = !isThirdPlace && roundIndex === next.rounds.length - 1;
  if (isFinalRound) {
    next.champion = winner;
  }

  // Auto-populate the third-place match once both semifinals are decided
  // (Req 19.1), identically in classic and vote-based mode.
  return { ok: true, tournament: populateThirdPlace(next) };
}

// ---------------------------------------------------------------------------
// Third-place match population and 3rd/4th resolution (Req 19)
// ---------------------------------------------------------------------------

/**
 * The loser of a decided matchup: the option that is not the committed winner.
 * Returns `undefined` when the matchup is not decided or is missing an option,
 * so callers can treat an unresolved matchup as having no loser yet.
 */
function loserOf(matchup: Matchup): Option | undefined {
  if (!isMatchupDecided(matchup) || matchup.optionA === undefined || matchup.optionB === undefined) {
    return undefined;
  }
  return matchup.winner!.id === matchup.optionA.id ? matchup.optionB : matchup.optionA;
}

/**
 * The semifinal round of a generated bracket: the round contesting exactly four
 * options (`optionCount === 4`), i.e. the second-to-last round. Returns
 * `undefined` for size 2 (no such round exists) or an ungenerated bracket. The
 * two losers of this round's two matchups play the third-place match (Req 19.1).
 */
function semifinalRound(tournament: Tournament): Round | undefined {
  if (tournament.rounds.length < 2) {
    return undefined;
  }
  return tournament.rounds[tournament.rounds.length - 2];
}

/**
 * Populate the third-place match with the two semifinal losers once both
 * semifinals are decided (Req 19.1).
 *
 * Behaviour:
 * - When the size is less than 4 or there is no third-place match (size 2, or
 *   an ungenerated bracket) the tournament is returned unchanged (Req 19.5).
 * - When both semifinal matchups are decided (via {@link isMatchupDecided}) the
 *   third-place match's `optionA`/`optionB` are filled with their two losers,
 *   making it playable, identically in classic and vote-based mode (Req 19.1).
 * - When either semifinal is not yet decided the third-place match's options
 *   are left empty.
 * - The function is idempotent and never overwrites an already-decided
 *   third-place match: once its `winner` is committed the match is left intact
 *   so re-population cannot clobber a played playoff.
 *
 * A new tournament value is returned; the input is never mutated.
 */
export function populateThirdPlace(tournament: Tournament): Tournament {
  if (tournament.size < 4 || tournament.thirdPlaceMatch === undefined) {
    return tournament;
  }

  // Never disturb an already-decided playoff (idempotent, non-clobbering).
  if (isMatchupDecided(tournament.thirdPlaceMatch)) {
    return tournament;
  }

  const semis = semifinalRound(tournament);
  if (!semis || semis.matchups.length < 2) {
    return tournament;
  }

  const [semiA, semiB] = semis.matchups;
  if (!isMatchupDecided(semiA) || !isMatchupDecided(semiB)) {
    // Semifinals not both decided: leave the playoff options empty.
    return tournament;
  }

  const loserA = loserOf(semiA);
  const loserB = loserOf(semiB);
  if (!loserA || !loserB) {
    return tournament;
  }

  const next = cloneForPlay(tournament);
  next.thirdPlaceMatch = {
    ...next.thirdPlaceMatch!,
    optionA: loserA,
    optionB: loserB,
  };
  return next;
}

/**
 * The third- and fourth-place options derived from the decided third-place
 * match (Req 19.3): its committed winner takes third and the other option takes
 * fourth. Returns an empty object when the size is 2 (no playoff, Req 19.5),
 * when there is no third-place match, or when the playoff is not yet decided.
 * This is a pure read of the current bracket state and mutates nothing.
 */
export function thirdPlaceResult(
  tournament: Tournament,
): { third?: Option; fourth?: Option } {
  const match = tournament.thirdPlaceMatch;
  if (tournament.size < 4 || match === undefined || !isMatchupDecided(match)) {
    return {};
  }
  const fourth = loserOf(match);
  return { third: match.winner, fourth };
}

// ---------------------------------------------------------------------------
// Round advancement and vote-based re-seeding (Req 17, 18.4, 18.5)
// ---------------------------------------------------------------------------

/**
 * A winner of a just-completed round paired with the number of votes it
 * received in the matchup it won. `votesReceived` is the winner's own tally
 * (`votesA` when the winner is `optionA`, otherwise `votesB`) — see
 * {@link reseedNextRound} (Req 17.3).
 */
export interface WinnerWithVotes {
  option: Option;
  votesReceived: number;
}

/**
 * Rank the winners of a just-completed round and return them in the seating
 * order for the next round's strongest-vs-weakest pairing (Req 17.3, 17.4).
 *
 * The returned array is sorted by `votesReceived` descending (most-voted
 * first). When two winners received the same number of votes the ordering is
 * broken deterministically using a seed-derived key drawn from the injected
 * `rng`, so that repeated runs under a fixed tournament seed always yield the
 * same single complete ordering (Req 17.4). The sort is otherwise stable.
 *
 * Callers pair the result strongest-vs-weakest: index `i` against index
 * `n - 1 - i` (Req 17.3). This function is pure and does not mutate its input;
 * it only draws from the supplied RNG.
 */
export function reseedNextRound(
  winnersWithVotes: readonly WinnerWithVotes[],
  rng: SeededRng,
): Option[] {
  // Assign each winner a stable, seed-derived tie-break key up front. Drawing
  // one key per winner (in input order) keeps the ordering fully determined by
  // the seed while remaining independent of the votes themselves.
  const keyed = winnersWithVotes.map((w, index) => ({
    option: w.option,
    votesReceived: w.votesReceived,
    index,
    tieKey: rng.nextFloat(),
  }));

  keyed.sort((a, b) => {
    // Primary: most-voted first (Req 17.3).
    if (a.votesReceived !== b.votesReceived) {
      return b.votesReceived - a.votesReceived;
    }
    // Equal votes: break deterministically by the seed-derived key so exactly
    // one complete ordering results (Req 17.4).
    if (a.tieKey !== b.tieKey) {
      return a.tieKey - b.tieKey;
    }
    // Final fallback keeps the sort a total order even if two keys collide.
    return a.index - b.index;
  });

  return keyed.map((entry) => entry.option);
}

/**
 * The votes a decided matchup's winner received in that matchup: `votesA` when
 * the winner is `optionA`, otherwise `votesB`. Returns 0 when either the votes
 * or the winner are absent (should not happen for a decided vote-based
 * matchup). Used to feed {@link reseedNextRound} (Req 17.3).
 */
function winnerVotesReceived(matchup: Matchup): number {
  if (matchup.winner === undefined) {
    return 0;
  }
  const winnerIsA =
    matchup.optionA !== undefined && matchup.winner.id === matchup.optionA.id;
  const received = winnerIsA ? matchup.votesA : matchup.votesB;
  return received ?? 0;
}

/**
 * Whether every matchup in a round is decided for the purpose of advancing
 * (Req 18.5). A round is complete only when each of its matchups has a
 * committed winner and none carries an unresolved tie ({@link isMatchupDecided}
 * is false for an unresolved tie, so a tie keeps the round incomplete —
 * Req 16.8). An empty round is not considered complete.
 */
function isRoundComplete(round: Round): boolean {
  if (round.matchups.length === 0) {
    return false;
  }
  return round.matchups.every((matchup) => isMatchupDecided(matchup));
}

/**
 * Advance to the next round when — and only when — every matchup in the current
 * round is decided (Req 18.5). Matchups may be decided in any order within the
 * round; advancement is gated purely on completeness, never on order (Req 18.4).
 *
 * When the current round is not complete (any matchup missing a winner or
 * blocked by an unresolved tie) the tournament is returned unchanged (Req 18.5).
 *
 * When the current round is complete and a next round exists:
 * - In **vote-based mode** the next round is (re)built by ranking this round's
 *   winners by the votes they received (desc) and pairing them
 *   strongest-vs-weakest via {@link reseedNextRound}, overwriting any
 *   per-confirm fixed placement so the re-seeded pairing is authoritative
 *   (Req 17.2, 17.3, 17.4). The first round is never re-seeded — it keeps the
 *   generation-time random pairings — because re-seeding only ever fills the
 *   round *after* a completed one (Req 17.1, 17.5).
 * - In **classic mode** the fixed advancement done by {@link confirmMatchup} is
 *   left untouched: no re-seeding ever occurs (Req 17.6, 15.5).
 *
 * In both modes the play cursors move to the first matchup of the next round
 * (`currentRoundIndex + 1`, `currentMatchupIndex = 0`). When the current round
 * is the final round there is no next round, so the cursors are left as-is
 * (the round is complete but nothing follows).
 *
 * The input tournament is never mutated; a new value is returned.
 */
export function advanceIfRoundComplete(tournament: Tournament): Tournament {
  const roundIndex = tournament.currentRoundIndex;
  const round = tournament.rounds[roundIndex];
  if (round === undefined) {
    return tournament;
  }

  // Gate strictly on round completeness (Req 18.5); an unresolved tie keeps the
  // round incomplete via isMatchupDecided (Req 16.8).
  if (!isRoundComplete(round)) {
    return tournament;
  }

  const nextRoundIndex = roundIndex + 1;
  if (nextRoundIndex >= tournament.rounds.length) {
    // Final round complete: nothing follows, so leave the cursors in place.
    return tournament;
  }

  const next = cloneForPlay(tournament);

  // Vote-based mode re-seeds the next round strongest-vs-weakest, overwriting
  // any fixed per-confirm placement (Req 17.2, 17.3). Classic mode keeps the
  // fixed pairings exactly as confirmed (Req 17.6).
  if (tournament.mode === 'voteBased') {
    const winnersWithVotes: WinnerWithVotes[] = round.matchups.map((matchup) => ({
      option: matchup.winner!,
      votesReceived: winnerVotesReceived(matchup),
    }));

    // Derive a per-round RNG so each re-seed is reproducible under the
    // tournament seed yet independent between rounds (Req 17.4).
    const rng = createSeededRng(
      (tournament.rngSeed ^ hashString(`reseed-r${roundIndex}`)) >>> 0,
    );
    const seeded = reseedNextRound(winnersWithVotes, rng);

    const nextRound = next.rounds[nextRoundIndex];
    // Pair strongest-vs-weakest: index i against index n-1-i (Req 17.3). Each
    // consecutive pair fills one next-round matchup's optionA/optionB.
    for (let slot = 0; slot < nextRound.matchups.length; slot += 1) {
      const strongest = seeded[slot];
      const weakest = seeded[seeded.length - 1 - slot];
      nextRound.matchups[slot] = {
        ...nextRound.matchups[slot],
        optionA: strongest,
        optionB: weakest,
        // A re-seeded slot is a fresh pairing: clear any stale outcome/votes
        // left by earlier per-confirm placement so it is played cleanly.
        winner: undefined,
        provisionalWinnerId: undefined,
        votesA: undefined,
        votesB: undefined,
        tieBreakUsed: undefined,
      };
    }
  }

  next.currentRoundIndex = nextRoundIndex;
  next.currentMatchupIndex = 0;
  return next;
}

// ---------------------------------------------------------------------------
// Correction cascade (Req 20)
// ---------------------------------------------------------------------------

/**
 * The correction to apply to an already-decided matchup: in classic mode the
 * id of the option to install as the new winner (`{ optionId }`); in vote-based
 * mode the new provisional vote count for option A (`{ votesA }`), from which
 * option B's count is derived as `playerCount - votesA` and the leader is
 * committed (Req 20.1). A corrected vote split that ties commits no winner and
 * is left needing a tie-break, mirroring {@link confirmMatchup}.
 */
export type Correction = { optionId: string } | { votesA: number };

/**
 * Clear a matchup's outcome and any option slots derived from an earlier round,
 * returning the matchup to an unplayed state. Rounds after the first are fed by
 * winners advancing, so their options are derived and must be cleared too;
 * the first round keeps its generation-time options. Mutates in place.
 */
function clearMatchupOutcome(matchup: Matchup, clearOptions: boolean): void {
  matchup.winner = undefined;
  matchup.provisionalWinnerId = undefined;
  matchup.votesA = undefined;
  matchup.votesB = undefined;
  matchup.tieBreakUsed = undefined;
  if (clearOptions) {
    matchup.optionA = undefined;
    matchup.optionB = undefined;
  }
}

/**
 * Re-commit an edited matchup with a new choice, in place on an already-cloned
 * tournament. Returns the committed winner, or `undefined` when the correction
 * commits no winner (a corrected vote split that ties, left for a tie-break).
 * Throws on an invalid correction (unknown option / out-of-range votes) so the
 * caller can surface a message.
 */
function recommitEdited(
  next: Tournament,
  matchup: Matchup,
  correction: Correction,
): Option | undefined {
  // Clear any stale outcome on the edited matchup before re-committing; its own
  // options are retained (they are its contestants, not derived from a winner).
  clearMatchupOutcome(matchup, false);

  if (next.mode === 'voteBased') {
    if (!('votesA' in correction)) {
      throw new Error('A vote split is required to correct a vote-based matchup.');
    }
    const playerCount = next.playerCount;
    if (playerCount === undefined) {
      throw new Error('Vote splits are only available in vote-based mode.');
    }
    const votesA = correction.votesA;
    if (!Number.isInteger(votesA) || votesA < 0 || votesA > playerCount) {
      throw new Error(
        `Votes for option A must be a whole number between 0 and ${playerCount}.`,
      );
    }
    matchup.votesA = votesA;
    matchup.votesB = playerCount - votesA;
    if (votesA === playerCount - votesA) {
      // Tie: leave needing a tie-break, no winner committed (Req 16.7).
      return undefined;
    }
    const winner = votesA > matchup.votesB! ? matchup.optionA! : matchup.optionB!;
    matchup.winner = winner;
    return winner;
  }

  // Classic: install the chosen option as the winner.
  if (!('optionId' in correction)) {
    throw new Error('An option id is required to correct a classic matchup.');
  }
  const { optionId } = correction;
  const winner =
    matchup.optionA?.id === optionId
      ? matchup.optionA
      : matchup.optionB?.id === optionId
        ? matchup.optionB
        : undefined;
  if (!winner) {
    throw new Error('The chosen option is not part of this matchup.');
  }
  matchup.winner = winner;
  return winner;
}

/**
 * Re-commit a decided matchup with a new outcome and cascade the correction
 * through every dependent part of the bracket (Req 20).
 *
 * The target matchup must exist and be a normal (non-third-place) bracket
 * matchup that is already decidable (both options present). The `correction`
 * supplies the new choice: an `optionId` in classic mode or a `votesA` split in
 * vote-based mode.
 *
 * Cascade behaviour:
 * - The edited matchup is re-committed with the new winner (Req 20.1). A
 *   corrected vote split that ties commits no winner and is left needing a
 *   tie-break, as on confirm (Req 16.7).
 * - Every downstream matchup in rounds *after* the edited one is cleared —
 *   winners, votes, provisional selections, tie-break flags, and their derived
 *   option slots — so they must be decided again (Req 20.1). The champion is
 *   cleared as well since it can only be derived from a now-cleared final
 *   (Req 20.2).
 * - The immediately following round is re-derived from the edited round when
 *   that round is now complete: classic mode re-advances winners into their
 *   fixed slots; vote-based mode re-seeds strongest-vs-weakest from the new
 *   winners and their votes (Req 20.3). Later rounds stay cleared until the
 *   user replays each intermediate round, at which point their own re-seed
 *   recomputes.
 * - When the edited matchup is in the semifinal round, the third-place match is
 *   reset to the current semifinal losers (or emptied until both semifinals are
 *   decided again) and any assigned 3rd/4th is cleared, requiring the playoff
 *   to be played again (Req 20.4).
 *
 * The input tournament is never mutated; a new value is returned. An invalid
 * correction (unknown matchup, third-place target, undecidable matchup, unknown
 * option, or out-of-range votes) returns a user-facing message and changes
 * nothing.
 */
export function correctOutcome(
  tournament: Tournament,
  matchupId: string,
  correction: Correction,
): MatchupResult {
  const found = findMatchup(tournament, matchupId);
  if (!found) {
    return { ok: false, message: `No matchup with id "${matchupId}".` };
  }
  if (found.isThirdPlace) {
    return {
      ok: false,
      message: 'The third-place match is not corrected through the cascade.',
    };
  }
  if (!isDecidable(found.matchup)) {
    return {
      ok: false,
      message: 'This matchup cannot be decided yet: both options must be present.',
    };
  }

  const editedRoundIndex = found.roundIndex;
  const next = cloneForPlay(tournament);
  const edited = findMatchup(next, matchupId)!.matchup;

  let winner: Option | undefined;
  try {
    winner = recommitEdited(next, edited, correction);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Invalid correction.',
    };
  }

  // Clear every downstream matchup in rounds after the edited one. Their option
  // slots are derived from winners advancing, so clear those too (Req 20.1).
  for (let r = editedRoundIndex + 1; r < next.rounds.length; r += 1) {
    for (const matchup of next.rounds[r].matchups) {
      clearMatchupOutcome(matchup, true);
    }
  }

  // The champion can only come from the (now-cleared) final, so clear it too
  // (Req 20.2). Also drop any previously-computed standings.
  next.champion = undefined;
  next.standings = undefined;

  // Re-derive the immediate next round from the edited round when that round is
  // now complete. Vote-based re-seeds; classic re-advances fixed slots.
  const editedRound = next.rounds[editedRoundIndex];
  const nextRoundIndex = editedRoundIndex + 1;
  if (nextRoundIndex < next.rounds.length && isRoundComplete(editedRound)) {
    if (next.mode === 'voteBased') {
      const winnersWithVotes: WinnerWithVotes[] = editedRound.matchups.map(
        (matchup) => ({
          option: matchup.winner!,
          votesReceived: winnerVotesReceived(matchup),
        }),
      );
      const rng = createSeededRng(
        (next.rngSeed ^ hashString(`reseed-r${editedRoundIndex}`)) >>> 0,
      );
      const seeded = reseedNextRound(winnersWithVotes, rng);
      const nextRound = next.rounds[nextRoundIndex];
      for (let slot = 0; slot < nextRound.matchups.length; slot += 1) {
        nextRound.matchups[slot] = {
          ...nextRound.matchups[slot],
          optionA: seeded[slot],
          optionB: seeded[seeded.length - 1 - slot],
          winner: undefined,
          provisionalWinnerId: undefined,
          votesA: undefined,
          votesB: undefined,
          tieBreakUsed: undefined,
        };
      }
    } else {
      // Classic: re-advance each winner of the edited round into its fixed slot.
      for (const matchup of editedRound.matchups) {
        advanceWinnerFixed(
          next,
          matchup.roundIndex,
          matchup.slotIndex,
          false,
          matchup.winner!,
        );
      }
    }
  } else if (winner !== undefined && next.mode === 'classic') {
    // The edited round is not yet complete (e.g. a mid-round correction). Still
    // re-advance the edited winner into its fixed next-round slot so the fixed
    // pairing reflects the new winner (Req 20.1). Vote-based defers to re-seed
    // once the round completes again.
    advanceWinnerFixed(next, editedRoundIndex, found.slotIndex, false, winner);
  }

  // A semifinal correction resets the third-place match to the current losers
  // and clears any assigned 3rd/4th, requiring the playoff to be replayed
  // (Req 20.4). Detect the semifinal round by its four-option count. The reset
  // is also required when the semifinal round is *downstream* of the edit
  // (a change in an earlier round cleared the semifinals), so any playoff
  // derived from the old losers cannot survive.
  const semifinalRoundIndex = next.rounds.length - 2; // -1 for size 2 (no semis)
  const semifinalAffected =
    next.size >= 4 && semifinalRoundIndex >= editedRoundIndex;
  if (semifinalAffected && next.thirdPlaceMatch) {
    // Reset the playoff: clear its outcome and options, then repopulate from
    // the (possibly still-incomplete) semifinals.
    next.thirdPlaceMatch = {
      ...next.thirdPlaceMatch,
      optionA: undefined,
      optionB: undefined,
      winner: undefined,
      provisionalWinnerId: undefined,
      votesA: undefined,
      votesB: undefined,
      tieBreakUsed: undefined,
    };
  }

  // Repopulate the third-place match from the current semifinal state, which is
  // a no-op unless both semifinals are decided (Req 19.1, 20.4).
  return { ok: true, tournament: populateThirdPlace(next) };
}

// ---------------------------------------------------------------------------
// Completion and standings (Req 21, 22)
// ---------------------------------------------------------------------------

/**
 * The final round of a generated bracket: the last round, which contests
 * exactly two options in a single matchup. Returns `undefined` for an
 * ungenerated bracket (no rounds).
 */
function finalRound(tournament: Tournament): Round | undefined {
  if (tournament.rounds.length === 0) {
    return undefined;
  }
  return tournament.rounds[tournament.rounds.length - 1];
}

/**
 * Whether the tournament is complete, i.e. every deciding matchup is done
 * (Req 21).
 *
 * - For size 2 the tournament is complete as soon as the single final matchup
 *   is decided; there is no third-place match to wait on (Req 21.1).
 * - For size 4 or more the tournament is complete only when *both* the final
 *   and the third-place match are decided (Req 21.2). A decided final with an
 *   undecided (or unpopulated) third-place match is not complete.
 *
 * "Decided" here means {@link isMatchupDecided}: a committed winner with no
 * unresolved tie. An ungenerated bracket (no final round) is never complete.
 * This is a pure read of the current bracket state and mutates nothing.
 */
export function isComplete(tournament: Tournament): boolean {
  const final = finalRound(tournament);
  if (!final || final.matchups.length === 0) {
    return false;
  }
  const finalMatchup = final.matchups[0];
  if (!isMatchupDecided(finalMatchup)) {
    return false;
  }

  // Size 2: the final alone completes the tournament (Req 21.1).
  if (tournament.size < 4) {
    return true;
  }

  // Size >= 4: the third-place match must also be decided (Req 21.2).
  return (
    tournament.thirdPlaceMatch !== undefined &&
    isMatchupDecided(tournament.thirdPlaceMatch)
  );
}

/**
 * Compute the final standings from first place down (Req 22.2, 22.3, 22.4).
 *
 * Returns an empty array while the tournament is not yet complete
 * ({@link isComplete} is false), so callers can treat `[]` as "no standings
 * yet". When complete:
 *
 * - 1st place is the champion — the final's committed winner — with a gold
 *   medal, and 2nd place is the defeated finalist — the final's loser — with a
 *   silver medal (Req 22.2).
 * - For size 4 or more, 3rd place is the third-place match's winner with a
 *   bronze medal, and 4th place is that match's loser with no medal (Req 22.3).
 * - For size 2 only 1st and 2nd are returned (Req 22.4).
 *
 * The array is ordered from 1st down. This is a pure read of the current
 * bracket state and mutates nothing.
 */
export function computeStandings(tournament: Tournament): Standing[] {
  if (!isComplete(tournament)) {
    return [];
  }

  const final = finalRound(tournament)!;
  const finalMatchup = final.matchups[0];
  const champion = finalMatchup.winner!;
  const runnerUp = loserOf(finalMatchup)!;

  const standings: Standing[] = [
    { place: 1, option: champion, medal: 'gold' },
    { place: 2, option: runnerUp, medal: 'silver' },
  ];

  // Size 2 has no playoff, so only 1st and 2nd are reported (Req 22.4).
  if (tournament.size < 4) {
    return standings;
  }

  // Size >= 4: derive 3rd (bronze) and 4th (no medal) from the decided
  // third-place match (Req 22.3). isComplete guarantees it is decided.
  const { third, fourth } = thirdPlaceResult(tournament);
  standings.push({ place: 3, option: third!, medal: 'bronze' });
  standings.push({ place: 4, option: fourth! });

  return standings;
}
