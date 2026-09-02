import React from 'react';
import { useTournament } from '../state/tournament-context';
import { canSelectWinner, canSelectThirdPlaceWinner } from '../services/bracket-manager';
import type { Bracket, Matchup, Participant } from '../types/index';

// ---------------------------------------------------------------------------
// Layout Constants
// ---------------------------------------------------------------------------

const MATCHUP_WIDTH = 180;
const MATCHUP_PADDING_X = 60;
const MATCHUP_PADDING_Y = 20;
const ROUND_LABEL_HEIGHT = 30;
const PADDING_TOP = 50;
const PADDING_LEFT = 20;

// ---------------------------------------------------------------------------
// Name display / wrapping constants
// ---------------------------------------------------------------------------

// Longest name we render in full (wrapping across lines). Beyond this we
// truncate with an ellipsis and rely on the <title> fallback.
const MAX_DISPLAY_CHARS = 40;
// Estimated characters that fit on one line inside a ~180px cell at 12px font.
// Kept conservative so wrapped text never overflows the cell horizontally.
const CHARS_PER_LINE = 22;
// Line box height for 12px text at ~1.3 line-height.
const LINE_HEIGHT = 16;
// Vertical padding applied inside a slot (top + bottom combined).
const SLOT_PADDING_Y = 8;
// Minimum slot height so short/empty names still get a comfortably sized cell.
const BASE_SLOT_HEIGHT = 35;

// ---------------------------------------------------------------------------
// Helper: truncate long names to the display maximum
// ---------------------------------------------------------------------------

function truncateName(name: string, maxLen: number = MAX_DISPLAY_CHARS): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}

// ---------------------------------------------------------------------------
// Helper: estimate wrapped-line count and per-slot / per-matchup heights
// ---------------------------------------------------------------------------

/** Estimate how many wrapped lines a name occupies inside a cell. */
function estimateLineCount(name: string | undefined | null): number {
  if (!name) return 1;
  const displayLen = Math.min(name.length, MAX_DISPLAY_CHARS);
  return Math.max(1, Math.ceil(displayLen / CHARS_PER_LINE));
}

/** Height for a single slot given the participant it displays. */
function slotHeightFor(participant: Participant | null): number {
  const lines = estimateLineCount(participant?.name);
  return Math.max(BASE_SLOT_HEIGHT, lines * LINE_HEIGHT + SLOT_PADDING_Y);
}

/** Total height of a matchup cell = its two slot heights. */
function matchupHeightFor(matchup: Matchup): number {
  return slotHeightFor(matchup.participant1) + slotHeightFor(matchup.participant2);
}

// ---------------------------------------------------------------------------
// Helper: compute layout positions
// ---------------------------------------------------------------------------

interface MatchupPosition {
  matchup: Matchup;
  x: number;
  y: number;
  height: number;
  round: number;
}

function computeLayout(bracket: Bracket): {
  positions: MatchupPosition[];
  totalWidth: number;
  totalHeight: number;
} {
  const totalRounds = bracket.rounds.length;
  if (totalRounds === 0) {
    return { positions: [], totalWidth: 0, totalHeight: 0 };
  }

  const totalWidth =
    PADDING_LEFT +
    totalRounds * (MATCHUP_WIDTH + MATCHUP_PADDING_X) -
    MATCHUP_PADDING_X +
    PADDING_LEFT;

  const contentTop = PADDING_TOP + ROUND_LABEL_HEIGHT;
  const positions: MatchupPosition[] = [];
  const posByRound: MatchupPosition[][] = [];

  // --- Round 0: stack matchups vertically using their variable heights. ---
  const firstRound = bracket.rounds[0];
  const firstPositions: MatchupPosition[] = [];
  let cursorY = contentTop;
  for (let pos = 0; pos < firstRound.matchups.length; pos++) {
    const matchup = firstRound.matchups[pos];
    const height = matchupHeightFor(matchup);
    firstPositions.push({
      matchup,
      x: PADDING_LEFT,
      y: cursorY,
      height,
      round: 0,
    });
    cursorY += height + MATCHUP_PADDING_Y;
  }
  positions.push(...firstPositions);
  posByRound[0] = firstPositions;

  // --- Later rounds: center each matchup between its two feeder matchups. ---
  for (let roundIdx = 1; roundIdx < totalRounds; roundIdx++) {
    const round = bracket.rounds[roundIdx];
    const roundColumnX = PADDING_LEFT + roundIdx * (MATCHUP_WIDTH + MATCHUP_PADDING_X);
    const prev = posByRound[roundIdx - 1];
    const thisPositions: MatchupPosition[] = [];

    for (let pos = 0; pos < round.matchups.length; pos++) {
      const matchup = round.matchups[pos];
      const height = matchupHeightFor(matchup);
      const feederA = prev[pos * 2];
      const feederB = prev[pos * 2 + 1];

      let centerY: number;
      if (feederA && feederB) {
        const aCenter = feederA.y + feederA.height / 2;
        const bCenter = feederB.y + feederB.height / 2;
        centerY = (aCenter + bCenter) / 2;
      } else if (feederA) {
        centerY = feederA.y + feederA.height / 2;
      } else {
        centerY = contentTop + height / 2;
      }

      thisPositions.push({
        matchup,
        x: roundColumnX,
        y: centerY - height / 2,
        height,
        round: roundIdx,
      });
    }

    positions.push(...thisPositions);
    posByRound[roundIdx] = thisPositions;
  }

  // Overall content height = furthest bottom edge of any matchup + bottom padding.
  const maxBottom = positions.reduce((acc, p) => Math.max(acc, p.y + p.height), contentTop);
  const totalHeight = maxBottom + MATCHUP_PADDING_Y;

  return { positions, totalWidth, totalHeight };
}

// ---------------------------------------------------------------------------
// Helper: render a wrapping name inside a foreignObject (Req 5.8, 9.2, 9.3)
// ---------------------------------------------------------------------------

interface WrappedNameProps {
  x: number;
  slotY: number;
  slotHeight: number;
  text: string;
  color: string;
  bold: boolean;
  trophy?: boolean;
}

/**
 * Renders participant text inside an HTML <div> via a <foreignObject> so long
 * names wrap onto multiple lines and stay fully readable without hover — the
 * key fix for mobile readability (Req 5.8, 9.2, 9.3).
 */
function WrappedName({ x, slotY, slotHeight, text, color, bold, trophy }: WrappedNameProps) {
  return (
    <foreignObject x={x} y={slotY} width={MATCHUP_WIDTH} height={slotHeight}>
      <div
        style={{
          boxSizing: 'border-box',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          fontSize: '12px',
          lineHeight: 1.3,
          fontFamily: 'inherit',
          fontWeight: bold ? 'bold' : 'normal',
          color,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {trophy ? <span style={{ marginRight: '4px' }}>🏆</span> : null}
        <span>{text}</span>
      </div>
    </foreignObject>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: MatchupNode
// ---------------------------------------------------------------------------

interface MatchupNodeProps {
  matchup: Matchup;
  x: number;
  y: number;
  canSelect: boolean;
  onSelectWinner: (matchupId: string, winnerId: string) => void;
  isChampionMatchup: boolean;
  champion: Participant | null;
}

function MatchupNode({
  matchup,
  x,
  y,
  canSelect,
  onSelectWinner,
  isChampionMatchup,
  champion,
}: MatchupNodeProps) {
  const slot1Height = slotHeightFor(matchup.participant1);

  const handleClick = (participant: Participant | null) => {
    if (!participant || !canSelect) return;
    onSelectWinner(matchup.id, participant.id);
  };

  const isWinner = (participant: Participant | null): boolean => {
    if (!participant || !matchup.winner) return false;
    return matchup.winner.id === participant.id;
  };

  const isChampion = (participant: Participant | null): boolean => {
    if (!participant || !champion || !isChampionMatchup) return false;
    return champion.id === participant.id;
  };

  const renderSlot = (
    participant: Participant | null,
    slotY: number,
    slotHeight: number,
    slotLabel: string
  ) => {
    const winner = isWinner(participant);
    const champ = isChampion(participant);
    const clickable = canSelect && participant !== null;

    return (
      <g
        onClick={() => handleClick(participant)}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
        aria-label={slotLabel}
        role="button"
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={(e) => {
          if (clickable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleClick(participant);
          }
        }}
      >
        {/* Full participant name available on hover/focus for extreme (>40 char) names (Req 9.2, 9.3) */}
        {participant && <title>{participant.name}</title>}
        <rect
          x={x}
          y={slotY}
          width={MATCHUP_WIDTH}
          height={slotHeight}
          fill={champ ? '#fef3c7' : winner ? '#d1fae5' : '#f9fafb'}
          stroke={champ ? '#f59e0b' : winner ? '#10b981' : '#d1d5db'}
          strokeWidth={champ ? 2 : 1}
          rx={2}
          ry={2}
        />
        <WrappedName
          x={x}
          slotY={slotY}
          slotHeight={slotHeight}
          text={participant ? truncateName(participant.name) : 'TBD'}
          color={participant ? '#111827' : '#9ca3af'}
          bold={winner || champ}
          trophy={champ}
        />
      </g>
    );
  };

  const slot1Label = matchup.participant1
    ? `Select ${matchup.participant1.name} as winner`
    : 'Empty slot';
  const slot2Label = matchup.participant2
    ? `Select ${matchup.participant2.name} as winner`
    : 'Empty slot';

  return (
    <g
      aria-label={`Matchup: ${matchup.participant1?.name ?? 'TBD'} vs ${matchup.participant2?.name ?? 'TBD'}`}
    >
      {renderSlot(matchup.participant1, y, slot1Height, slot1Label)}
      {renderSlot(
        matchup.participant2,
        y + slot1Height,
        slotHeightFor(matchup.participant2),
        slot2Label
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ThirdPlaceMatchNode
// ---------------------------------------------------------------------------

interface ThirdPlaceMatchNodeProps {
  matchup: Matchup;
  x: number;
  y: number;
  canSelect: boolean;
  thirdPlace: Participant | null;
  onSelectThirdPlace: (winnerId: string) => void;
}

/**
 * Renders the Third-Place Match — a distinct consolation matchup contested by
 * the two Semifinal losers (Req 5.7, 10.4). Slots are selectable only when both
 * are occupied; clicking a participant dispatches SELECT_THIRD_PLACE_WINNER.
 */
function ThirdPlaceMatchNode({
  matchup,
  x,
  y,
  canSelect,
  thirdPlace,
  onSelectThirdPlace,
}: ThirdPlaceMatchNodeProps) {
  const slot1Height = slotHeightFor(matchup.participant1);

  const handleClick = (participant: Participant | null) => {
    if (!participant || !canSelect) return;
    onSelectThirdPlace(participant.id);
  };

  const isThirdPlace = (participant: Participant | null): boolean => {
    if (!participant || !thirdPlace) return false;
    return thirdPlace.id === participant.id;
  };

  const renderSlot = (
    participant: Participant | null,
    slotY: number,
    slotHeight: number,
    slotLabel: string
  ) => {
    const third = isThirdPlace(participant);
    const decided = matchup.winner !== null;
    const clickable = canSelect && participant !== null;

    return (
      <g
        onClick={() => handleClick(participant)}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
        aria-label={slotLabel}
        role="button"
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={(e) => {
          if (clickable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleClick(participant);
          }
        }}
      >
        {/* Full participant name available on hover/focus for extreme (>40 char) names (Req 9.2, 9.3) */}
        {participant && <title>{participant.name}</title>}
        <rect
          x={x}
          y={slotY}
          width={MATCHUP_WIDTH}
          height={slotHeight}
          fill={third ? '#dbeafe' : decided ? '#f3f4f6' : '#f9fafb'}
          stroke={third ? '#2563eb' : '#d1d5db'}
          strokeWidth={third ? 2 : 1}
          rx={2}
          ry={2}
        />
        <WrappedName
          x={x}
          slotY={slotY}
          slotHeight={slotHeight}
          text={participant ? truncateName(participant.name) : 'TBD'}
          color={participant ? '#111827' : '#9ca3af'}
          bold={third}
        />
      </g>
    );
  };

  const slot1Label = matchup.participant1
    ? `Select ${matchup.participant1.name} as third place`
    : 'Empty slot';
  const slot2Label = matchup.participant2
    ? `Select ${matchup.participant2.name} as third place`
    : 'Empty slot';

  return (
    <g
      aria-label={`Third-Place Match: ${matchup.participant1?.name ?? 'TBD'} vs ${matchup.participant2?.name ?? 'TBD'}`}
    >
      {/* Label identifying this as the 3rd/4th place match (Req 5.7) */}
      <text
        x={x + MATCHUP_WIDTH / 2}
        y={y - 8}
        fontSize={13}
        fontWeight="bold"
        fill="#2563eb"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        Third-Place Match
      </text>
      {renderSlot(matchup.participant1, y, slot1Height, slot1Label)}
      {renderSlot(
        matchup.participant2,
        y + slot1Height,
        slotHeightFor(matchup.participant2),
        slot2Label
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ConnectingLines
// ---------------------------------------------------------------------------

interface ConnectingLinesProps {
  positions: MatchupPosition[];
}

function ConnectingLines({ positions }: ConnectingLinesProps) {
  const lines: React.ReactElement[] = [];

  // Build a map from matchup id to its position
  const posMap = new Map<string, MatchupPosition>();
  for (const pos of positions) {
    posMap.set(pos.matchup.id, pos);
  }

  for (const pos of positions) {
    const { matchup, x, y, height } = pos;
    if (matchup.nextMatchupId) {
      const nextPos = posMap.get(matchup.nextMatchupId);
      if (nextPos) {
        const startX = x + MATCHUP_WIDTH;
        const startY = y + height / 2;
        const endX = nextPos.x;
        const endY = nextPos.y + nextPos.height / 2;
        const midX = (startX + endX) / 2;

        lines.push(
          <path
            key={`line-${matchup.id}`}
            d={`M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={1.5}
          />
        );
      }
    }
  }

  return <>{lines}</>;
}

// ---------------------------------------------------------------------------
// Main Component: BracketVisualizer
// ---------------------------------------------------------------------------

export function BracketVisualizer() {
  const { state, dispatch } = useTournament();
  const { bracket } = state;

  if (!bracket || bracket.rounds.length === 0) {
    return (
      <div className="bracket-visualizer-empty" role="status">
        <p>No bracket to display. Generate a bracket to see the visualization.</p>
      </div>
    );
  }

  const { positions, totalWidth, totalHeight } = computeLayout(bracket);

  const handleSelectWinner = (matchupId: string, winnerId: string) => {
    dispatch({ type: 'SELECT_WINNER', payload: { matchupId, winnerId } });
  };

  const handleSelectThirdPlace = (winnerId: string) => {
    dispatch({ type: 'SELECT_THIRD_PLACE_WINNER', payload: { winnerId } });
  };

  // Determine which matchup is the final
  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  const finalMatchupId = finalRound?.matchups[0]?.id ?? null;

  // Position the Third-Place Match beneath the Final (only for size >= 4).
  const finalPosition = positions.find((p) => p.matchup.id === finalMatchupId);
  const hasThirdPlace = bracket.thirdPlaceMatch !== null && finalPosition !== undefined;
  const thirdPlaceX = finalPosition?.x ?? PADDING_LEFT;
  const thirdPlaceHeight = bracket.thirdPlaceMatch
    ? matchupHeightFor(bracket.thirdPlaceMatch)
    : 0;
  const thirdPlaceY = finalPosition
    ? finalPosition.y + finalPosition.height + MATCHUP_PADDING_Y + ROUND_LABEL_HEIGHT
    : 0;
  // Extend the SVG height so the third-place node (with its label) is fully visible.
  const svgHeight = hasThirdPlace
    ? Math.max(totalHeight, thirdPlaceY + thirdPlaceHeight + MATCHUP_PADDING_Y)
    : totalHeight;

  return (
    <div
      className="bracket-visualizer"
      style={{ overflowX: 'auto', overflowY: 'auto', maxWidth: '100%' }}
    >
      {bracket.champion && (
        <div
          className="champion-banner"
          role="alert"
          aria-live="polite"
          style={{
            textAlign: 'center',
            padding: '12px',
            background: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '8px',
            marginBottom: '12px',
            fontWeight: 'bold',
            fontSize: '16px',
          }}
        >
          🏆 Champion: {bracket.champion.name} 🏆
        </div>
      )}
      {bracket.thirdPlace && bracket.fourthPlace && (
        <div
          className="placement-banner"
          role="status"
          aria-live="polite"
          style={{
            textAlign: 'center',
            padding: '10px',
            background: '#dbeafe',
            border: '2px solid #2563eb',
            borderRadius: '8px',
            marginBottom: '12px',
            color: '#1e3a8a',
            fontWeight: 'bold',
            fontSize: '15px',
          }}
        >
          <span>🥉 3rd Place: {bracket.thirdPlace.name}</span>
          <span style={{ margin: '0 12px' }}>•</span>
          <span>4th Place: {bracket.fourthPlace.name}</span>
        </div>
      )}
      <svg
        role="img"
        aria-label="Tournament bracket visualization"
        width={totalWidth}
        height={svgHeight}
        style={{ minWidth: totalWidth, minHeight: svgHeight }}
      >
        {/* Round Labels */}
        {bracket.rounds.map((round, idx) => {
          const roundX = PADDING_LEFT + idx * (MATCHUP_WIDTH + MATCHUP_PADDING_X);
          return (
            <text
              key={`label-${round.roundNumber}`}
              x={roundX + MATCHUP_WIDTH / 2}
              y={PADDING_TOP / 2 + 5}
              fontSize={13}
              fontWeight="bold"
              fill="#374151"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {round.label}
            </text>
          );
        })}

        {/* Connecting Lines */}
        <ConnectingLines positions={positions} />

        {/* Matchup Nodes */}
        {positions.map((pos) => (
          <MatchupNode
            key={pos.matchup.id}
            matchup={pos.matchup}
            x={pos.x}
            y={pos.y}
            canSelect={canSelectWinner(bracket, pos.matchup.id)}
            onSelectWinner={handleSelectWinner}
            isChampionMatchup={pos.matchup.id === finalMatchupId}
            champion={bracket.champion}
          />
        ))}

        {/* Third-Place Match (size >= 4 only) */}
        {hasThirdPlace && bracket.thirdPlaceMatch && (
          <ThirdPlaceMatchNode
            matchup={bracket.thirdPlaceMatch}
            x={thirdPlaceX}
            y={thirdPlaceY}
            canSelect={canSelectThirdPlaceWinner(bracket)}
            thirdPlace={bracket.thirdPlace}
            onSelectThirdPlace={handleSelectThirdPlace}
          />
        )}
      </svg>
    </div>
  );
}

export default BracketVisualizer;
