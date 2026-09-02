import { v4 as uuidv4 } from 'uuid';
import { Tournament, Bracket, Round, Matchup, Participant, StandingEntry } from '../types/index';
import {
  isValidCategoryName,
  isValidBracketSize,
  isValidParticipantName,
  isDuplicateParticipant,
  isValidPlayerCount,
} from './validation';

/**
 * Creates a new tournament with a unique identifier, validated category, bracket size,
 * and an optional Player_Count that selects the tournament mode (Req 11).
 *
 * @param category - The tournament category/topic (1-100 chars after trimming)
 * @param bracketSize - The bracket size (must be a power of 2 in [2, 2048])
 * @param playerCount - Optional total voter count. `null` (default) selects Classic_Mode;
 *   an integer >= 1 selects Vote_Based_Mode. Any other non-null value is rejected.
 * @returns A new Tournament object
 * @throws Error if category, bracket size, or player count is invalid
 */
export function createTournament(
  category: string,
  bracketSize: number,
  playerCount: number | null = null
): Tournament {
  if (!isValidCategoryName(category)) {
    throw new Error(
      'Invalid category name. Category must be a non-empty string between 1 and 100 characters after trimming.'
    );
  }

  if (!isValidBracketSize(bracketSize)) {
    throw new Error(
      'Invalid bracket size. Bracket size must be a power of 2 between 2 and 2048.'
    );
  }

  if (!isValidPlayerCount(playerCount)) {
    throw new Error(
      'Invalid player count. Player count must be a whole number of 1 or more, or left empty for a classic tournament.'
    );
  }

  return {
    id: uuidv4(),
    category: category.trim(),
    bracketSize,
    createdAt: Date.now(),
    playerCount,
  };
}

/**
 * Derives the tournament mode from its Player_Count. Mode is never stored as a
 * separate flag — `playerCount` is the single source of truth (Req 11).
 *
 * @param tournament - The tournament to inspect
 * @returns `'classic'` when `playerCount === null`, otherwise `'vote'`
 */
export function getMode(tournament: Tournament): 'classic' | 'vote' {
  return tournament.playerCount === null ? 'classic' : 'vote';
}

/**
 * Calculates the number of rounds needed for a given bracket size.
 *
 * @param bracketSize - A valid bracket size (power of 2)
 * @returns The number of rounds (log₂ of bracketSize)
 */
export function calculateRoundCount(bracketSize: number): number {
  return Math.log2(bracketSize);
}

/**
 * Shuffles participants using the Fisher-Yates algorithm.
 * Creates a copy — does not mutate the original array.
 *
 * @param participants - The array of participants to shuffle
 * @returns A new shuffled array of participants
 */
export function shuffleParticipants(participants: Participant[]): Participant[] {
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Assigns a display label to a round based on its position relative to the total rounds.
 *
 * @param roundNumber - The 1-based round number
 * @param totalRounds - Total number of rounds in the bracket
 * @returns The label string for the round
 */
function getRoundLabel(roundNumber: number, totalRounds: number): string {
  if (roundNumber === totalRounds) {
    return 'Final';
  }
  if (roundNumber === totalRounds - 1) {
    return 'Semifinal';
  }
  if (roundNumber === totalRounds - 2) {
    return 'Quarterfinal';
  }
  return `Round ${roundNumber}`;
}

/**
 * Generates a full single-elimination bracket structure.
 *
 * - Shuffles participants and assigns seed numbers
 * - Creates log₂(bracketSize) rounds
 * - Round 1 has bracketSize / 2 matchups, each subsequent round has half
 * - Each matchup links to the next-round matchup via nextMatchupId
 * - Participants are assigned to first-round matchup slots
 * - Champion is set to null initially
 * - For size >= 4, an extra third-place match is created with empty slots,
 *   a roundNumber past the Final, and nextMatchupId = null; for size === 2 it
 *   remains null. thirdPlace and fourthPlace start null.
 *
 * @param participants - Array of participants to place in the bracket
 * @param bracketSize - The bracket size (must be a power of 2)
 * @returns A complete Bracket object
 */
export function generateBracket(participants: Participant[], bracketSize: number): Bracket {
  const totalRounds = calculateRoundCount(bracketSize);

  // Shuffle participants and assign seed numbers
  const shuffled = shuffleParticipants(participants);
  const seededParticipants = shuffled.map((p, index) => ({
    ...p,
    seed: index + 1,
  }));

  // Pre-generate all matchup IDs for linking
  const matchupIds: string[][] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const matchupCount = bracketSize / Math.pow(2, round);
    const ids: string[] = [];
    for (let i = 0; i < matchupCount; i++) {
      ids.push(uuidv4());
    }
    matchupIds.push(ids);
  }

  // Build each round
  const rounds: Round[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const matchupCount = bracketSize / Math.pow(2, round);
    const matchups: Matchup[] = [];

    for (let position = 0; position < matchupCount; position++) {
      // Determine nextMatchupId (which matchup in the next round this feeds into)
      let nextMatchupId: string | null = null;
      if (round < totalRounds) {
        // Each pair of matchups in this round feeds into one matchup in the next round
        const nextPosition = Math.floor(position / 2);
        nextMatchupId = matchupIds[round][nextPosition]; // round index is 0-based in array
      }

      // Assign participants to first-round matchups
      let participant1: Participant | null = null;
      let participant2: Participant | null = null;
      if (round === 1) {
        const p1Index = position * 2;
        const p2Index = position * 2 + 1;
        participant1 = p1Index < seededParticipants.length ? seededParticipants[p1Index] : null;
        participant2 = p2Index < seededParticipants.length ? seededParticipants[p2Index] : null;
      }

      matchups.push({
        id: matchupIds[round - 1][position], // round-1 because array is 0-based
        roundNumber: round,
        position,
        participant1,
        participant2,
        winner: null,
        nextMatchupId,
        votes1: null,
        votes2: null,
      });
    }

    rounds.push({
      roundNumber: round,
      label: getRoundLabel(round, totalRounds),
      matchups,
    });
  }

  // Third-place match: created only for brackets of size >= 4.
  // Its two slots start empty (populated later from the Semifinal losers),
  // its roundNumber sits one past the Final, and it feeds nowhere (nextMatchupId = null).
  const thirdPlaceMatch: Matchup | null =
    bracketSize >= 4
      ? {
          id: uuidv4(),
          roundNumber: totalRounds + 1,
          position: 0,
          participant1: null,
          participant2: null,
          winner: null,
          nextMatchupId: null,
          votes1: null,
          votes2: null,
        }
      : null;

  return {
    tournamentId: uuidv4(),
    size: bracketSize,
    rounds,
    participants: seededParticipants,
    champion: null,
    currentRound: 1,
    thirdPlaceMatch,
    thirdPlace: null,
    fourthPlace: null,
  };
}

/**
 * Checks whether the bracket is full (participant count has reached bracket size).
 *
 * @param participantCount - Current number of participants in the bracket
 * @param bracketSize - Maximum number of participants allowed
 * @returns true if the bracket is at capacity
 */
export function isBracketFull(participantCount: number, bracketSize: number): boolean {
  return participantCount >= bracketSize;
}

/**
 * Adds a participant to the bracket. Validates the name, checks for duplicates,
 * and ensures the bracket is not full.
 *
 * @param bracket - The current bracket (not mutated)
 * @param name - The participant name to add
 * @returns A new Bracket with the participant added
 * @throws Error if the name is invalid, a duplicate, or the bracket is full
 */
export function addParticipant(bracket: Bracket, name: string): Bracket {
  if (!isValidParticipantName(name)) {
    throw new Error(
      'Invalid participant name. Name must be a non-empty string between 1 and 100 characters after trimming.'
    );
  }

  const trimmedName = name.trim();

  const existingNames = bracket.participants.map((p) => p.name);
  if (isDuplicateParticipant(trimmedName, existingNames)) {
    throw new Error('A participant with this name already exists in the bracket.');
  }

  if (isBracketFull(bracket.participants.length, bracket.size)) {
    throw new Error('The bracket is full. Remove a participant to add a new one.');
  }

  const newParticipant: Participant = {
    id: uuidv4(),
    name: trimmedName,
    source: 'manual',
    seed: 0,
  };

  return {
    ...bracket,
    participants: [...bracket.participants, newParticipant],
  };
}

/**
 * Removes a participant from the bracket by ID.
 *
 * @param bracket - The current bracket (not mutated)
 * @param participantId - The ID of the participant to remove
 * @returns A new Bracket without the specified participant
 * @throws Error if no participant with the given ID exists
 */
export function removeParticipant(bracket: Bracket, participantId: string): Bracket {
  const index = bracket.participants.findIndex((p) => p.id === participantId);
  if (index === -1) {
    throw new Error('Participant not found in the bracket.');
  }

  return {
    ...bracket,
    participants: bracket.participants.filter((p) => p.id !== participantId),
  };
}

/**
 * Clears all downstream selections that depend on a given matchup's winner.
 *
 * When a user changes a winner in a matchup, all subsequent matchups in the
 * dependency chain must have their propagated winners removed so the user
 * can re-select them.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @param matchupId - The ID of the matchup whose downstream should be cleared
 * @returns A new Bracket with downstream selections cleared
 */
export function clearDownstream(bracket: Bracket, matchupId: string): Bracket {
  // Build a flat lookup of all matchups by ID for efficient traversal
  const matchupMap = new Map<string, Matchup>();
  for (const round of bracket.rounds) {
    for (const matchup of round.matchups) {
      matchupMap.set(matchup.id, matchup);
    }
  }

  // If the changed matchup is a Semifinal, third-place state must be refreshed/cleared
  // in the same transition as any downstream clearing. clearThirdPlaceOnSemifinalChange
  // no-ops when there is no third-place match or the Semifinal is malformed.
  const semifinalChanged = isSemifinalMatchup(bracket, matchupId);
  const applyThirdPlace = (b: Bracket): Bracket =>
    semifinalChanged ? clearThirdPlaceOnSemifinalChange(b) : b;

  // Find the starting matchup
  const startMatchup = matchupMap.get(matchupId);
  if (!startMatchup || !startMatchup.nextMatchupId) {
    // No downstream to clear
    return applyThirdPlace(bracket);
  }

  // Collect all matchup IDs that need clearing, along with which slot to clear
  // Each entry: [matchupId, slotToClear] where slotToClear is 'participant1' or 'participant2'
  const clearActions: Array<{ matchupId: string; slotToClear: 'participant1' | 'participant2' }> = [];

  let currentMatchup: Matchup | undefined = startMatchup;
  while (currentMatchup && currentMatchup.nextMatchupId) {
    const nextMatchupId = currentMatchup.nextMatchupId;
    // Determine which slot in the next matchup was filled by this matchup's winner
    // Even position → participant1, Odd position → participant2
    const slotToClear = currentMatchup.position % 2 === 0 ? 'participant1' : 'participant2';

    clearActions.push({ matchupId: nextMatchupId, slotToClear });

    // Move to the next matchup in the chain
    currentMatchup = matchupMap.get(nextMatchupId);
  }

  // If no actions to perform, return as-is (still refreshing third place for a Semifinal)
  if (clearActions.length === 0) {
    return applyThirdPlace(bracket);
  }

  // Build a set of matchup IDs that need modification for fast lookup
  const clearActionMap = new Map<string, 'participant1' | 'participant2'>();
  const matchupIdsToClear = new Set<string>();
  for (const action of clearActions) {
    clearActionMap.set(action.matchupId, action.slotToClear);
    matchupIdsToClear.add(action.matchupId);
  }

  // Create new rounds with cleared matchups (immutable)
  const newRounds = bracket.rounds.map((round) => ({
    ...round,
    matchups: round.matchups.map((matchup) => {
      if (!matchupIdsToClear.has(matchup.id)) {
        return matchup;
      }

      const slotToClear = clearActionMap.get(matchup.id)!;
      return {
        ...matchup,
        [slotToClear]: null,
        winner: null,
      };
    }),
  }));

  // Check if the final matchup is affected — if so, clear champion
  const finalRound = newRounds[newRounds.length - 1];
  const finalMatchup = finalRound?.matchups[0];
  const championCleared = finalMatchup && matchupIdsToClear.has(finalMatchup.id);

  return applyThirdPlace({
    ...bracket,
    rounds: newRounds,
    champion: championCleared ? null : bracket.champion,
  });
}

/**
 * Finds a matchup by ID across all rounds of a bracket.
 *
 * @param bracket - The bracket to search
 * @param matchupId - The ID of the matchup to find
 * @returns The matchup if found, or undefined
 */
function findMatchup(bracket: Bracket, matchupId: string): Matchup | undefined {
  for (const round of bracket.rounds) {
    const matchup = round.matchups.find((m) => m.id === matchupId);
    if (matchup) {
      return matchup;
    }
  }
  return undefined;
}

/**
 * Determines whether a matchup belongs to the Semifinal round.
 *
 * A matchup is a Semifinal when it lives in the round whose label is "Semifinal".
 * (For a size-4 bracket the Semifinal is round 1 — the first round.)
 *
 * @param bracket - The bracket to search
 * @param matchupId - The ID of the matchup to classify
 * @returns true if the matchup is found within the round labeled "Semifinal"
 */
function isSemifinalMatchup(bracket: Bracket, matchupId: string): boolean {
  const semifinalRound = bracket.rounds.find((round) => round.label === 'Semifinal');
  if (!semifinalRound) {
    return false;
  }
  return semifinalRound.matchups.some((m) => m.id === matchupId);
}

/**
 * Determines whether a winner can be selected for a given matchup.
 * Both participant slots must be occupied.
 *
 * @param bracket - The bracket containing the matchup
 * @param matchupId - The ID of the matchup to check
 * @returns true if both participant1 and participant2 are non-null
 */
export function canSelectWinner(bracket: Bracket, matchupId: string): boolean {
  const matchup = findMatchup(bracket, matchupId);
  if (!matchup) {
    return false;
  }
  return matchup.participant1 !== null && matchup.participant2 !== null;
}

/**
 * Selects a winner for a matchup and advances them to the next round.
 * Returns a new bracket (immutable — does not mutate the input).
 *
 * - Verifies both slots are occupied (throws if not)
 * - Verifies winnerId matches one of the participants (throws if not)
 * - Sets the winner on the current matchup
 * - If there is a next matchup, places the winner in the appropriate slot:
 *   - Even position → participant1 of next matchup
 *   - Odd position → participant2 of next matchup
 * - If this is the final-round matchup (no nextMatchupId), sets bracket.champion
 *
 * @param bracket - The current bracket (not mutated)
 * @param matchupId - The ID of the matchup to decide
 * @param winnerId - The ID of the winning participant
 * @returns A new Bracket with the winner recorded and advanced
 * @throws Error if winner cannot be selected or winnerId is invalid
 */
export function advanceWinner(bracket: Bracket, matchupId: string, winnerId: string): Bracket {
  if (!canSelectWinner(bracket, matchupId)) {
    throw new Error('Both participants must be present before selecting a winner.');
  }

  const matchup = findMatchup(bracket, matchupId)!;

  // Verify winnerId matches one of the participants
  const winner =
    matchup.participant1?.id === winnerId
      ? matchup.participant1
      : matchup.participant2?.id === winnerId
        ? matchup.participant2
        : null;

  if (!winner) {
    throw new Error('Winner ID does not match either participant in this matchup.');
  }

  // Build new rounds with the winner set on the current matchup and advanced to next
  const newRounds = bracket.rounds.map((round) => ({
    ...round,
    matchups: round.matchups.map((m) => {
      // Set winner on the current matchup
      if (m.id === matchupId) {
        return { ...m, winner };
      }
      // Place winner in next-round matchup slot
      if (matchup.nextMatchupId && m.id === matchup.nextMatchupId) {
        if (matchup.position % 2 === 0) {
          return { ...m, participant1: winner };
        } else {
          return { ...m, participant2: winner };
        }
      }
      return m;
    }),
  }));

  // If this is the final matchup (no next matchup), set champion
  const newChampion = matchup.nextMatchupId === null ? winner : bracket.champion;

  const advanced: Bracket = {
    ...bracket,
    rounds: newRounds,
    champion: newChampion,
  };

  // If the decided matchup is a Semifinal, populate the third-place match from the
  // Semifinal losers as part of the same immutable transition. populateThirdPlace
  // no-ops when there is no third-place match or when a Semifinal still lacks a winner.
  if (isSemifinalMatchup(bracket, matchupId)) {
    return populateThirdPlace(advanced);
  }

  return advanced;
}

/**
 * Returns the tournament champion, or null if the final matchup hasn't been decided yet.
 *
 * @param bracket - The bracket to check
 * @returns The champion Participant, or null if undetermined
 */
export function getChampion(bracket: Bracket): Participant | null {
  // Check bracket.champion first (set by advanceWinner)
  if (bracket.champion) {
    return bracket.champion;
  }

  // Fallback: check the final round's single matchup for a winner
  if (bracket.rounds.length === 0) {
    return null;
  }

  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  if (finalRound.matchups.length === 0) {
    return null;
  }

  const finalMatchup = finalRound.matchups[0];
  return finalMatchup.winner ?? null;
}

/**
 * Populates the two slots of the third-place match with the losers of the two
 * Semifinal matchups, once both Semifinal matchups have a recorded winner.
 *
 * The Semifinal is the second-to-last round (label "Semifinal"), containing
 * exactly two matchups (positions 0 and 1). The "loser" of a Semifinal matchup
 * is the participant that is not the recorded winner.
 *
 * Behavior:
 * - If the bracket has no third-place match (size === 2), returns the bracket unchanged.
 * - If either Semifinal matchup lacks a winner (or the Semifinal is malformed),
 *   returns the bracket unchanged.
 * - Otherwise returns a new bracket with `thirdPlaceMatch.participant1` set to the
 *   loser of Semifinal 0 and `thirdPlaceMatch.participant2` set to the loser of
 *   Semifinal 1.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @returns A new Bracket with third-place slots populated, or the unchanged bracket
 */
export function populateThirdPlace(bracket: Bracket): Bracket {
  // No third-place match exists for size-2 brackets.
  if (!bracket.thirdPlaceMatch) {
    return bracket;
  }

  // The Semifinal is the round immediately preceding the Final.
  const semifinalRound = bracket.rounds.find((round) => round.label === 'Semifinal');
  if (!semifinalRound) {
    return bracket;
  }

  const semifinal0 = semifinalRound.matchups.find((m) => m.position === 0);
  const semifinal1 = semifinalRound.matchups.find((m) => m.position === 1);
  if (!semifinal0 || !semifinal1) {
    return bracket;
  }

  // Both Semifinal matchups must have a recorded winner.
  if (!semifinal0.winner || !semifinal1.winner) {
    return bracket;
  }

  // The loser is the participant that is not the winner.
  const loser0 =
    semifinal0.participant1?.id === semifinal0.winner.id
      ? semifinal0.participant2
      : semifinal0.participant1;
  const loser1 =
    semifinal1.participant1?.id === semifinal1.winner.id
      ? semifinal1.participant2
      : semifinal1.participant1;

  return {
    ...bracket,
    thirdPlaceMatch: {
      ...bracket.thirdPlaceMatch,
      participant1: loser0,
      participant2: loser1,
    },
  };
}

/**
 * Determines whether a winner can be selected for the third-place match.
 * Both third-place slots must be occupied.
 *
 * @param bracket - The bracket containing the third-place match
 * @returns true iff thirdPlaceMatch exists and both participant1 and participant2 are non-null
 */
export function canSelectThirdPlaceWinner(bracket: Bracket): boolean {
  const match = bracket.thirdPlaceMatch;
  if (!match) {
    return false;
  }
  return match.participant1 !== null && match.participant2 !== null;
}

/**
 * Selects the winner of the third-place match and records the placements.
 * Returns a new bracket (immutable — does not mutate the input).
 *
 * - Verifies both slots are occupied (throws if not), leaving state unchanged
 * - Verifies winnerId matches one of the two participants (throws if not),
 *   leaving state unchanged
 * - On success, sets `thirdPlace` to the selected participant, `fourthPlace` to
 *   the other participant, and records `thirdPlaceMatch.winner`
 *
 * @param bracket - The current bracket (not mutated)
 * @param winnerId - The ID of the winning (third-place) participant
 * @returns A new Bracket with third and fourth place recorded
 * @throws Error if the guard fails or winnerId matches neither slot
 */
export function advanceThirdPlaceWinner(bracket: Bracket, winnerId: string): Bracket {
  if (!canSelectThirdPlaceWinner(bracket)) {
    throw new Error('Both Semifinal outcomes must be decided before selecting a third-place winner.');
  }

  const match = bracket.thirdPlaceMatch!;

  // Determine the selected (third place) and other (fourth place) participants.
  let thirdPlace: Participant;
  let fourthPlace: Participant;
  if (match.participant1!.id === winnerId) {
    thirdPlace = match.participant1!;
    fourthPlace = match.participant2!;
  } else if (match.participant2!.id === winnerId) {
    thirdPlace = match.participant2!;
    fourthPlace = match.participant1!;
  } else {
    throw new Error('Winner ID does not match either participant in the third-place match.');
  }

  return {
    ...bracket,
    thirdPlaceMatch: {
      ...match,
      winner: thirdPlace,
    },
    thirdPlace,
    fourthPlace,
  };
}

/**
 * Refreshes the third-place match after a Semifinal winner has changed and clears
 * any recorded third-place outcome.
 *
 * When a Semifinal winner is changed (typically as part of `clearDownstream`
 * triggered from a Semifinal matchup), the third-place match may now reference a
 * stale loser, and any previously decided third/fourth placement is no longer
 * valid. This function recomputes each third-place slot from the current
 * Semifinal state — placing the current loser of each Semifinal matchup (or
 * `null` if that matchup no longer has a recorded winner) — and always clears
 * `thirdPlaceMatch.winner`, `thirdPlace`, and `fourthPlace`.
 *
 * Behavior:
 * - If the bracket has no third-place match (size === 2), returns the bracket unchanged.
 * - If the Semifinal round is missing or malformed, returns the bracket unchanged.
 * - Otherwise returns a new bracket with each third-place slot set to the current
 *   Semifinal loser (or `null` when that Semifinal lacks a winner) and the recorded
 *   third-place winner, `thirdPlace`, and `fourthPlace` cleared.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @returns A new Bracket with the third-place slot refreshed and placements cleared,
 *   or the unchanged bracket when no third-place match exists / Semifinal is malformed
 */
export function clearThirdPlaceOnSemifinalChange(bracket: Bracket): Bracket {
  // No third-place match exists for size-2 brackets.
  if (!bracket.thirdPlaceMatch) {
    return bracket;
  }

  // The Semifinal is the round immediately preceding the Final.
  const semifinalRound = bracket.rounds.find((round) => round.label === 'Semifinal');
  if (!semifinalRound) {
    return bracket;
  }

  const semifinal0 = semifinalRound.matchups.find((m) => m.position === 0);
  const semifinal1 = semifinalRound.matchups.find((m) => m.position === 1);
  if (!semifinal0 || !semifinal1) {
    return bracket;
  }

  // Derive the current loser of a Semifinal matchup, or null if it has no winner.
  // The loser is the participant that is not the recorded winner.
  const loserOf = (matchup: Matchup): Participant | null => {
    if (!matchup.winner) {
      return null;
    }
    return matchup.participant1?.id === matchup.winner.id
      ? matchup.participant2
      : matchup.participant1;
  };

  return {
    ...bracket,
    thirdPlaceMatch: {
      ...bracket.thirdPlaceMatch,
      participant1: loserOf(semifinal0),
      participant2: loserOf(semifinal1),
      winner: null,
    },
    thirdPlace: null,
    fourthPlace: null,
  };
}

// ---------------------------------------------------------------------------
// Vote_Based_Mode progression (Req 11.5, 12, 13, 14, 10.8)
// ---------------------------------------------------------------------------

/**
 * Records the per-option Votes for a matchup and derives its winner (Req 12, 11.5).
 *
 * Vote_Based_Mode only: the two vote totals must sum to the tournament's Player_Count.
 * Because bracket-manager functions operate on the Bracket (which does not carry the
 * Player_Count), the count is supplied explicitly by the caller (the reducer, which
 * holds the Tournament).
 *
 * Behavior:
 * - Throws (state unchanged) if the matchup is not found.
 * - Throws (state unchanged) if either participant slot is unoccupied (Req 6.3).
 * - Throws (state unchanged) if either vote total is negative or non-integer.
 * - Throws (state unchanged) if `votes1 + votes2 !== playerCount` (Req 11.5, 12.6).
 * - On success, sets `votes1`/`votes2` and the derived winner: participant1 when
 *   `votes1 > votes2`, participant2 when `votes2 > votes1`, or `null` on a tie
 *   (winner deferred to a Tie_Break_Draw — Req 12.4). Does not advance or re-seed.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @param matchupId - The ID of the matchup to decide
 * @param votes1 - Votes for participant1 (non-negative integer)
 * @param votes2 - Votes for participant2 (non-negative integer)
 * @param playerCount - The tournament Player_Count the votes must sum to
 * @returns A new Bracket with the votes recorded and winner derived
 * @throws Error if the guard fails
 */
export function enterVotes(
  bracket: Bracket,
  matchupId: string,
  votes1: number,
  votes2: number,
  playerCount: number
): Bracket {
  const matchup = findMatchup(bracket, matchupId);
  if (!matchup) {
    throw new Error('Matchup not found in the bracket.');
  }

  if (matchup.participant1 === null || matchup.participant2 === null) {
    throw new Error('Both participants must be present before deciding a winner.');
  }

  if (
    !Number.isInteger(votes1) ||
    !Number.isInteger(votes2) ||
    votes1 < 0 ||
    votes2 < 0
  ) {
    throw new Error('The entered votes must add up to the player count.');
  }

  if (votes1 + votes2 !== playerCount) {
    throw new Error('The entered votes must add up to the player count.');
  }

  const winner: Participant | null =
    votes1 > votes2
      ? matchup.participant1
      : votes2 > votes1
        ? matchup.participant2
        : null;

  const newRounds = bracket.rounds.map((round) => ({
    ...round,
    matchups: round.matchups.map((m) =>
      m.id === matchupId ? { ...m, votes1, votes2, winner } : m
    ),
  }));

  return {
    ...bracket,
    rounds: newRounds,
  };
}

/**
 * Determines whether a matchup is currently tied on Votes (Req 12.4, 12.8).
 *
 * @param matchup - The matchup to inspect
 * @returns true iff both vote totals are present and equal
 */
export function isTie(matchup: Matchup): boolean {
  return matchup.votes1 !== null && matchup.votes2 !== null && matchup.votes1 === matchup.votes2;
}

/**
 * Randomly resolves a tied matchup, selecting one option as the winner with equal
 * probability (Req 12.5). This is the ONLY source of randomness in vote-mode
 * progression; `rng` is injectable so tests can assert the among-two and
 * equal-probability behavior deterministically.
 *
 * The matchup may live in any round OR be the third-place match — this lookup
 * covers third-place ties (Req 10.8) as well as regular matchups.
 *
 * Behavior:
 * - Throws (state unchanged) if the matchup is not found.
 * - Throws (state unchanged) if the matchup is not currently tied (Req 12.8).
 * - On success, sets `winner` to participant1 when `rng() < 0.5`, else participant2.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @param matchupId - The ID of the tied matchup to resolve
 * @param rng - Injectable random source in [0, 1); defaults to Math.random
 * @returns A new Bracket with the winner recorded
 * @throws Error if the guard fails
 */
export function resolveTieRandomly(
  bracket: Bracket,
  matchupId: string,
  rng: () => number = Math.random
): Bracket {
  // Search the rounds first, then fall back to the third-place match (Req 10.8).
  const matchup =
    findMatchup(bracket, matchupId) ??
    (bracket.thirdPlaceMatch && bracket.thirdPlaceMatch.id === matchupId
      ? bracket.thirdPlaceMatch
      : undefined);

  if (!matchup) {
    throw new Error('Matchup not found in the bracket.');
  }

  if (!isTie(matchup)) {
    throw new Error('Only a tied matchup can be resolved by a random draw.');
  }

  const winner = rng() < 0.5 ? matchup.participant1 : matchup.participant2;

  // Third-place match tie: record the winner and derive placements.
  if (bracket.thirdPlaceMatch && bracket.thirdPlaceMatch.id === matchupId) {
    const thirdPlace = winner;
    const fourthPlace =
      winner && bracket.thirdPlaceMatch.participant1?.id === winner.id
        ? bracket.thirdPlaceMatch.participant2
        : bracket.thirdPlaceMatch.participant1;
    return {
      ...bracket,
      thirdPlaceMatch: {
        ...bracket.thirdPlaceMatch,
        winner,
      },
      thirdPlace,
      fourthPlace,
    };
  }

  const newRounds = bracket.rounds.map((round) => ({
    ...round,
    matchups: round.matchups.map((m) => (m.id === matchupId ? { ...m, winner } : m)),
  }));

  return {
    ...bracket,
    rounds: newRounds,
  };
}

/**
 * Re-seeds the round following the Current_Round in Vote_Based_Mode (Req 13.2-13.4).
 *
 * When every matchup in the Current_Round has a recorded winner and a later round
 * exists, this rebuilds that later round's matchups from the current-round winners
 * ranked by the Votes each received in the matchup it just won — pairing the
 * highest-ranked winner against the lowest-ranked, and so on. The sort key
 * (winningVotes desc, then seed asc, then id asc) is a total order, so the pairing
 * is exactly one complete deterministic permutation (Req 13.4).
 *
 * This function operates on `bracket.currentRound` and does not itself check the
 * mode — the reducer only calls it in vote mode. It returns the bracket unchanged
 * when the current round is not fully decided, when the current round is the final
 * round, or when `currentRound` is out of range.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @returns A new Bracket with the next round materialized, or the unchanged bracket
 */
export function reseedNextRound(bracket: Bracket): Bracket {
  const totalRounds = bracket.rounds.length;
  const cur = bracket.currentRound;

  // Guard against out-of-range current round.
  if (cur < 1 || cur > totalRounds) {
    return bracket;
  }

  // The Final has no following round to seed.
  if (cur === totalRounds) {
    return bracket;
  }

  const round = bracket.rounds[cur - 1];

  // Every matchup in the current round must have a recorded winner.
  const fullyDecided = round.matchups.every((m) => m.winner !== null);
  if (!fullyDecided) {
    return bracket;
  }

  // Tag each winner with the Votes it received in the matchup it just won.
  const winners = round.matchups.map((m) => ({
    participant: m.winner!,
    winningVotes: (m.winner!.id === m.participant1?.id ? m.votes1 : m.votes2) ?? 0,
  }));

  // Rank by winningVotes desc, then seed asc, then id asc (total order — Req 13.4).
  winners.sort((a, b) => {
    if (b.winningVotes !== a.winningVotes) {
      return b.winningVotes - a.winningVotes;
    }
    if (a.participant.seed !== b.participant.seed) {
      return a.participant.seed - b.participant.seed;
    }
    return a.participant.id < b.participant.id ? -1 : a.participant.id > b.participant.id ? 1 : 0;
  });

  // Pair highest vs lowest into N/2 new matchups for the next round.
  const nextRoundNumber = cur + 1;
  const n = winners.length;
  const nextMatchups: Matchup[] = [];
  for (let i = 0; i < n / 2; i++) {
    nextMatchups.push({
      id: uuidv4(),
      roundNumber: nextRoundNumber,
      position: i,
      participant1: winners[i].participant,
      participant2: winners[n - 1 - i].participant,
      winner: null,
      nextMatchupId: null,
      votes1: null,
      votes2: null,
    });
  }

  const newRounds = bracket.rounds.map((r, index) =>
    index === cur ? { ...r, matchups: nextMatchups } : r
  );

  return {
    ...bracket,
    rounds: newRounds,
  };
}

// ---------------------------------------------------------------------------
// Round-by-round reveal selectors (Req 14)
// ---------------------------------------------------------------------------

/**
 * Returns the 1-based index of the round currently in play (Req 14).
 *
 * Iterating rounds ascending, this returns the first round that is not fully
 * decided — i.e. a round containing a matchup with both slots filled but no
 * recorded winner. When every round is fully decided, it returns the final round
 * (which stays "current" until the champion is displayed).
 *
 * @param bracket - The bracket to inspect
 * @returns The 1-based round number currently in play
 */
export function getCurrentRound(bracket: Bracket): number {
  const totalRounds = bracket.rounds.length;
  for (const round of bracket.rounds) {
    const undecided = round.matchups.some(
      (m) => m.participant1 !== null && m.participant2 !== null && m.winner === null
    );
    if (undecided) {
      return round.roundNumber;
    }
  }
  return totalRounds;
}

/**
 * Derives the Stage_Label for a round from the number of participants it contains
 * (Req 14). `roundParticipantCount` is `2 * matchupCount` for the round.
 *
 * @param roundParticipantCount - Number of participants remaining in the round
 * @returns "Final" | "Semifinal" | "Quarterfinal" | "Round of N"
 */
export function getStageLabel(roundParticipantCount: number): string {
  switch (roundParticipantCount) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinal';
    case 8:
      return 'Quarterfinal';
    default:
      return `Round of ${roundParticipantCount}`;
  }
}

/**
 * Returns the matchup(s) currently exposed for decision, centralizing the
 * final-stage sequencing rule so the reducer and UI agree (Req 10.9, 10.10, 14.6,
 * 14.7, 14.8).
 *
 * - Returns `[]` when the tournament is complete (the completion view is shown
 *   instead).
 * - For size-2 brackets, or whenever the Current_Round is not the final round,
 *   returns the whole Current_Round's matchups (Req 14.1, 14.5).
 * - For size >= 4 at the final stage: while the Third_Place_Match winner is still
 *   undecided, returns only the Third_Place_Match (Req 10.9, 14.6); once it is
 *   decided, returns the Final (Req 10.10, 14.7).
 *
 * Guards against an out-of-range Current_Round or a missing round by returning `[]`.
 *
 * This is a pure selector — it does not mutate the input bracket.
 *
 * @param bracket - The bracket to inspect
 * @returns The matchup(s) exposed for decision now
 */
export function getCurrentStageMatchups(bracket: Bracket): Matchup[] {
  if (isTournamentComplete(bracket)) {
    return [];
  }

  const cur = getCurrentRound(bracket);
  const finalRoundNumber = bracket.rounds.length;

  // Not the final stage — expose the whole current round.
  if (bracket.size === 2 || cur < finalRoundNumber) {
    const round = bracket.rounds[cur - 1];
    return round ? round.matchups : [];
  }

  // size >= 4 AND we are at the final stage: third place first, then the Final.
  if (bracket.thirdPlaceMatch && bracket.thirdPlaceMatch.winner === null) {
    return [bracket.thirdPlaceMatch];
  }

  const finalRound = bracket.rounds[finalRoundNumber - 1];
  return finalRound ? finalRound.matchups : [];
}

/**
 * Determines whether the tournament is complete.
 *
 * For size-2 brackets (no Third_Place_Match) completion requires only that the
 * Final winner is decided. For size >= 4 brackets, completion requires BOTH the
 * Final winner AND the third-place winner — the champion and final placements are
 * established only after both have been decided (Req 6.4, 10.11).
 *
 * @param bracket - The bracket to inspect
 * @returns true iff the Final winner is decided AND (for size >= 4) the third-place
 *   winner is decided
 */
export function isTournamentComplete(bracket: Bracket): boolean {
  const finalDecided = getChampion(bracket) !== null;
  if (bracket.size === 2 || bracket.thirdPlaceMatch === null) {
    return finalDecided;
  }
  return finalDecided && bracket.thirdPlace !== null;
}

// ---------------------------------------------------------------------------
// Third-place playoff — Vote_Based_Mode (Req 10.8)
// ---------------------------------------------------------------------------

/**
 * Records the per-option Votes for the third-place match and derives its outcome
 * in Vote_Based_Mode, applying the same vote-sum invariant and tie behavior as any
 * other matchup (Req 10.8, 11.5, 12).
 *
 * Behavior:
 * - Throws (state unchanged) if there is no third-place match or either slot is
 *   unoccupied (Req 10.5).
 * - Throws (state unchanged) if either vote total is negative or non-integer, or if
 *   `votes1 + votes2 !== playerCount` (Req 11.5, 12.6).
 * - On unequal votes, sets the match's `votes1`/`votes2`, its `winner`, and records
 *   `thirdPlace` (higher-voted) and `fourthPlace` (the other).
 * - On a tie, sets `votes1`/`votes2` but leaves `winner`, `thirdPlace`, and
 *   `fourthPlace` null, pending a Tie_Break_Draw via `resolveTieRandomly`.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The current bracket (not mutated)
 * @param votes1 - Votes for the third-place match participant1
 * @param votes2 - Votes for the third-place match participant2
 * @param playerCount - The tournament Player_Count the votes must sum to
 * @returns A new Bracket with the third-place votes recorded and outcome derived
 * @throws Error if the guard fails
 */
export function enterThirdPlaceVotes(
  bracket: Bracket,
  votes1: number,
  votes2: number,
  playerCount: number
): Bracket {
  const match = bracket.thirdPlaceMatch;
  if (!match || match.participant1 === null || match.participant2 === null) {
    throw new Error('Both Semifinal outcomes must be decided before deciding third place.');
  }

  if (
    !Number.isInteger(votes1) ||
    !Number.isInteger(votes2) ||
    votes1 < 0 ||
    votes2 < 0
  ) {
    throw new Error('The entered votes must add up to the player count.');
  }

  if (votes1 + votes2 !== playerCount) {
    throw new Error('The entered votes must add up to the player count.');
  }

  if (votes1 === votes2) {
    // Tie — defer the outcome to a Tie_Break_Draw (Req 10.8, 12.4).
    return {
      ...bracket,
      thirdPlaceMatch: {
        ...match,
        votes1,
        votes2,
        winner: null,
      },
      thirdPlace: null,
      fourthPlace: null,
    };
  }

  const thirdPlace = votes1 > votes2 ? match.participant1 : match.participant2;
  const fourthPlace = votes1 > votes2 ? match.participant2 : match.participant1;

  return {
    ...bracket,
    thirdPlaceMatch: {
      ...match,
      votes1,
      votes2,
      winner: thirdPlace,
    },
    thirdPlace,
    fourthPlace,
  };
}

// ---------------------------------------------------------------------------
// Final standings (Req 15)
// ---------------------------------------------------------------------------

/**
 * Derives the Final_Standings — the ranked placements shown when the tournament
 * ends (Req 15.2, 15.3, 15.4).
 *
 * - Place 1 is the Final winner (champion); place 2 is the Final loser (runner-up).
 * - For size-2 brackets (no Third_Place_Match), returns only places 1 and 2.
 * - For size >= 4, additionally returns place 3 (`bracket.thirdPlace`) and place 4
 *   (`bracket.fourthPlace`).
 * - Returns `[]` when the Final winner has not been decided (tournament not
 *   complete). Any entry whose participant is null is filtered out defensively;
 *   callers are expected to render standings only once `isTournamentComplete`.
 *
 * This is a pure function — it does not mutate the input bracket.
 *
 * @param bracket - The bracket to inspect
 * @returns Ordered standings entries (1..2 for size 2, 1..4 for size >= 4)
 */
export function getFinalStandings(bracket: Bracket): StandingEntry[] {
  if (bracket.rounds.length === 0) {
    return [];
  }

  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  const finalMatchup = finalRound.matchups[0];
  if (!finalMatchup) {
    return [];
  }

  const champion = finalMatchup.winner;
  if (champion === null) {
    return [];
  }

  const runnerUp =
    finalMatchup.participant1 && finalMatchup.participant1.id === champion.id
      ? finalMatchup.participant2
      : finalMatchup.participant1;

  const entries: Array<{ place: number; participant: Participant | null }> =
    bracket.size === 2 || bracket.thirdPlaceMatch === null
      ? [
          { place: 1, participant: champion },
          { place: 2, participant: runnerUp },
        ]
      : [
          { place: 1, participant: champion },
          { place: 2, participant: runnerUp },
          { place: 3, participant: bracket.thirdPlace },
          { place: 4, participant: bracket.fourthPlace },
        ];

  return entries.filter(
    (e): e is StandingEntry => e.participant !== null
  );
}
