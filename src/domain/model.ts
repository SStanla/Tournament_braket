// Pure domain model types for the tournament bracket creator.
// This module contains no React imports and no I/O — only type definitions.
// It mirrors the "Domain Model (types)" section of the design document.

/** Valid bracket sizes: powers of two from 2 up to 2048. */
export type BracketSize = 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048;

/** The screen/state-machine phase the tournament is currently in. */
export type Phase = 'CREATE' | 'FILLING' | 'PLAYING' | 'RESULTS';

/** A single competing option in the bracket. */
export interface Option {
  /** Stable id. */
  id: string;
  /** Stored trimmed, 1..100 chars. */
  name: string;
}

/** Suggestion lifecycle used during review (Req 10, 11). */
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'replaced';

/** An AI/local suggestion presented for review before entering the tournament. */
export interface Suggestion {
  id: string;
  name: string;
  status: SuggestionStatus;
}

/** A single matchup between two options within a round. */
export interface Matchup {
  id: string;
  /** 0 = first round. */
  roundIndex: number;
  /** Position within the round. */
  slotIndex: number;
  /** May be undefined until populated. */
  optionA?: Option;
  optionB?: Option;
  /** Undefined until decided. */
  winner?: Option;
  /**
   * Transient provisional selection made before confirmation (Req 14.1). Holds
   * the id of the option the user has tentatively chosen (classic mode) but not
   * yet committed with "Next". Nothing is recorded as the winner until
   * {@link confirmMatchup} runs. Cleared once committed. Vote-based mode reuses
   * the same confirm path via its provisional vote fields.
   */
  provisionalWinnerId?: string;
  // vote-based only:
  /** votesA + votesB === playerCount when decided. */
  votesA?: number;
  votesB?: number;
  /** True when a tie was resolved by draw. */
  tieBreakUsed?: boolean;
  /** True when this is the dedicated third-place match. */
  isThirdPlace?: boolean;
}

/** A round in the bracket, containing its matchups. */
export interface Round {
  index: number;
  /** Options contested in this round. */
  optionCount: number;
  /** "Final" | "Semifinal" | "Quarterfinal" | "Round of N". */
  stageLabel: string;
  matchups: Matchup[];
}

/** The full tournament state. */
export interface Tournament {
  phase: Phase;
  /** 1..100 trimmed. */
  category: string;
  size: BracketSize;
  /** Present => vote-based mode. */
  playerCount?: number;
  /** Derived from playerCount at creation. */
  mode: 'classic' | 'voteBased';
  options: Option[];
  suggestions: Suggestion[];
  rounds: Round[];
  /** Present iff size >= 4. */
  thirdPlaceMatch?: Matchup;
  champion?: Option;
  /** Computed at completion. */
  standings?: Standing[];
  currentRoundIndex: number;
  /** Within current round view. */
  currentMatchupIndex: number;
  /** For reproducible shuffles/tie-breaks. */
  rngSeed: number;
}

/** A final standing entry with place and optional medal. */
export interface Standing {
  place: 1 | 2 | 3 | 4;
  option: Option;
  medal?: 'gold' | 'silver' | 'bronze';
}
