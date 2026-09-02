/**
 * Core data models for the Tournament Bracket Creator.
 */

/** A single-elimination tournament on a custom category. */
export interface Tournament {
  /** UUID v4 identifier */
  id: string;
  /** Tournament category/topic, 1-100 characters, trimmed */
  category: string;
  /** Bracket size — must be a power of 2 in [2, 2048] */
  bracketSize: number;
  /** Unix timestamp of creation */
  createdAt: number;
  /**
   * Total number of voters (Player_Count). `null` selects Classic_Mode
   * (manual winner selection); a positive integer selects Vote_Based_Mode
   * where matchup winners are decided by per-option Votes. (Req 11)
   */
  playerCount: number | null;
}

/** The full bracket structure for a tournament. */
export interface Bracket {
  tournamentId: string;
  size: number;
  rounds: Round[];
  participants: Participant[];
  champion: Participant | null;
  /**
   * 1-based index of the round currently in play, driving the round-by-round
   * reveal. Starts at 1 when the bracket is generated and advances when the
   * Current_Round is fully decided. (Req 14)
   */
  currentRound: number;
  /**
   * The consolation matchup between the two losing semifinalists.
   * Populated for brackets of size >= 4; remains null for size === 2.
   */
  thirdPlaceMatch: Matchup | null;
  /**
   * The winner of the third-place match.
   * Populated for brackets of size >= 4; remains null for size === 2.
   */
  thirdPlace: Participant | null;
  /**
   * The loser of the third-place match.
   * Populated for brackets of size >= 4; remains null for size === 2.
   */
  fourthPlace: Participant | null;
}

/** A single round in the bracket. */
export interface Round {
  /** 1-based round number (1 = first round) */
  roundNumber: number;
  /** Display label: "Round 1", "Quarterfinal", "Semifinal", "Final" */
  label: string;
  matchups: Matchup[];
}

/** A head-to-head matchup between two participants. */
export interface Matchup {
  /** UUID v4 identifier */
  id: string;
  roundNumber: number;
  /** Position within the round (0-based) */
  position: number;
  participant1: Participant | null;
  participant2: Participant | null;
  winner: Participant | null;
  /** ID of the matchup in the next round this feeds into */
  nextMatchupId: string | null;
  /**
   * Votes for participant1 in Vote_Based_Mode. `null` in Classic_Mode and
   * until votes are entered. (Req 12)
   */
  votes1: number | null;
  /**
   * Votes for participant2 in Vote_Based_Mode. `null` in Classic_Mode and
   * until votes are entered. (Req 12)
   */
  votes2: number | null;
}

/** A single ranked entry in the Final_Standings (Req 15). */
export interface StandingEntry {
  /** 1-based placement rank (1 = first place). */
  place: number;
  /** The participant occupying this placement. */
  participant: Participant;
}

/** A participant/entry competing in the tournament. */
export interface Participant {
  /** UUID v4 identifier */
  id: string;
  /** Participant name, 1-100 characters */
  name: string;
  /** How the participant was added */
  source: 'manual' | 'suggestion';
  /** Position assigned during shuffle */
  seed: number;
}

// ---------------------------------------------------------------------------
// Validation Constants
// ---------------------------------------------------------------------------

/** All valid bracket sizes (powers of 2 from 2 to 2048). */
export const VALID_BRACKET_SIZES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const;

/** Valid bracket size type */
export type ValidBracketSize = (typeof VALID_BRACKET_SIZES)[number];

export const MIN_CATEGORY_LENGTH = 1;
export const MAX_CATEGORY_LENGTH = 100;

export const MIN_PARTICIPANT_NAME_LENGTH = 1;
export const MAX_PARTICIPANT_NAME_LENGTH = 100;

/** Timeout in milliseconds for the auto-suggest engine AI call. */
export const SUGGESTION_TIMEOUT_MS = 10_000;

/** Minimum Player_Count — must be an integer >= 1 for Vote_Based_Mode. (Req 11.4) */
export const MIN_PLAYER_COUNT = 1;
