import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinalStandings } from '../../components/FinalStandings';
import type { Bracket, Round, Matchup, Participant } from '../../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipant(id: string, name: string, seed = 1): Participant {
  return { id, name, source: 'manual', seed };
}

/**
 * A completed size-4 bracket: the Final matchup has a decided winner (champion)
 * and the bracket records thirdPlace / fourthPlace. `getFinalStandings` derives
 * four ranked entries from this state.
 */
function makeCompletedSize4(): {
  bracket: Bracket;
  champion: Participant;
  runnerUp: Participant;
  third: Participant;
  fourth: Participant;
} {
  const champion = makeParticipant('p1', 'Alice', 1);
  const runnerUp = makeParticipant('p2', 'Bob', 2);
  const third = makeParticipant('p3', 'Charlie', 3);
  const fourth = makeParticipant('p4', 'Diana', 4);

  const finalMatchup: Matchup = {
    id: 'final',
    roundNumber: 2,
    position: 0,
    participant1: champion,
    participant2: runnerUp,
    winner: champion,
    nextMatchupId: null,
    votes1: null,
    votes2: null,
  };

  // A minimal Semifinal round so rounds[length-1] is the Final. The semifinal
  // details are irrelevant to getFinalStandings (it reads the final matchup and
  // the recorded third/fourth placements), so a single placeholder matchup is
  // enough to make the Final the last round.
  const semifinalRound: Round = {
    roundNumber: 1,
    label: 'Semifinal',
    matchups: [
      {
        id: 'sf1',
        roundNumber: 1,
        position: 0,
        participant1: champion,
        participant2: third,
        winner: champion,
        nextMatchupId: 'final',
        votes1: null,
        votes2: null,
      },
      {
        id: 'sf2',
        roundNumber: 1,
        position: 1,
        participant1: runnerUp,
        participant2: fourth,
        winner: runnerUp,
        nextMatchupId: 'final',
        votes1: null,
        votes2: null,
      },
    ],
  };

  const finalRound: Round = {
    roundNumber: 2,
    label: 'Final',
    matchups: [finalMatchup],
  };

  const thirdPlaceMatch: Matchup = {
    id: 'tpm',
    roundNumber: 3,
    position: 0,
    participant1: third,
    participant2: fourth,
    winner: third,
    nextMatchupId: null,
    votes1: null,
    votes2: null,
  };

  const bracket: Bracket = {
    tournamentId: 't4',
    size: 4,
    rounds: [semifinalRound, finalRound],
    participants: [champion, runnerUp, third, fourth],
    champion,
    currentRound: 2,
    thirdPlaceMatch,
    thirdPlace: third,
    fourthPlace: fourth,
  };

  return { bracket, champion, runnerUp, third, fourth };
}

/**
 * A completed size-2 bracket: a single Final matchup with a decided winner and
 * no third-place match. `getFinalStandings` yields only places 1 and 2.
 */
function makeCompletedSize2(): {
  bracket: Bracket;
  champion: Participant;
  runnerUp: Participant;
} {
  const champion = makeParticipant('p1', 'Alice', 1);
  const runnerUp = makeParticipant('p2', 'Bob', 2);

  const finalMatchup: Matchup = {
    id: 'final',
    roundNumber: 1,
    position: 0,
    participant1: champion,
    participant2: runnerUp,
    winner: champion,
    nextMatchupId: null,
    votes1: null,
    votes2: null,
  };

  const finalRound: Round = {
    roundNumber: 1,
    label: 'Final',
    matchups: [finalMatchup],
  };

  const bracket: Bracket = {
    tournamentId: 't2',
    size: 2,
    rounds: [finalRound],
    participants: [champion, runnerUp],
    champion,
    currentRound: 1,
    thirdPlaceMatch: null,
    thirdPlace: null,
    fourthPlace: null,
  };

  return { bracket, champion, runnerUp };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FinalStandings', () => {
  it('renders four ordered rows (🥇🥈🥉 + plain 4th) for a completed size-4 bracket with the champion at place 1', () => {
    const { bracket, champion, runnerUp, third, fourth } = makeCompletedSize4();
    render(<FinalStandings bracket={bracket} />);

    // Section heading present.
    expect(screen.getByRole('heading', { name: /final standings/i })).toBeInTheDocument();

    // Exactly four ranked rows in placement order.
    const list = screen.getByRole('list', { name: /final standings/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);

    // Row 1 → 🥇 + champion.
    expect(within(rows[0]).getByText('🥇')).toBeInTheDocument();
    expect(within(rows[0]).getByText(champion.name)).toBeInTheDocument();

    // Row 2 → 🥈 + runner-up.
    expect(within(rows[1]).getByText('🥈')).toBeInTheDocument();
    expect(within(rows[1]).getByText(runnerUp.name)).toBeInTheDocument();

    // Row 3 → 🥉 + third place.
    expect(within(rows[2]).getByText('🥉')).toBeInTheDocument();
    expect(within(rows[2]).getByText(third.name)).toBeInTheDocument();

    // Row 4 → plain "4th" (no medal) + fourth place.
    expect(within(rows[3]).getByText('4th')).toBeInTheDocument();
    expect(within(rows[3]).getByText(fourth.name)).toBeInTheDocument();

    // No medal emoji leaks into the 4th row.
    expect(within(rows[3]).queryByText('🥇')).not.toBeInTheDocument();
    expect(within(rows[3]).queryByText('🥈')).not.toBeInTheDocument();
    expect(within(rows[3]).queryByText('🥉')).not.toBeInTheDocument();
  });

  it('renders exactly two rows (🥇🥈) with no 3rd/4th for a completed size-2 bracket', () => {
    const { bracket, champion, runnerUp } = makeCompletedSize2();
    render(<FinalStandings bracket={bracket} />);

    const list = screen.getByRole('list', { name: /final standings/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    expect(within(rows[0]).getByText('🥇')).toBeInTheDocument();
    expect(within(rows[0]).getByText(champion.name)).toBeInTheDocument();

    expect(within(rows[1]).getByText('🥈')).toBeInTheDocument();
    expect(within(rows[1]).getByText(runnerUp.name)).toBeInTheDocument();

    // No bronze or 4th-place indicators for a size-2 bracket.
    expect(screen.queryByText('🥉')).not.toBeInTheDocument();
    expect(screen.queryByText('4th')).not.toBeInTheDocument();
  });
});
