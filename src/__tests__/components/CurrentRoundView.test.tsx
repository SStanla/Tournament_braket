import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CurrentRoundView } from '../../components/CurrentRoundView';
import { generateBracket, advanceWinner } from '../../services/bracket-manager';
import type { Bracket, Round, Matchup, Participant } from '../../types/index';

// ---------------------------------------------------------------------------
// Helpers to build test data
// ---------------------------------------------------------------------------

function makeParticipant(id: string, name: string, seed = 1): Participant {
  return { id, name, source: 'manual', seed };
}

/**
 * A freshly-generated, undecided size-4 bracket (Semifinal is the current
 * round). Uses the real `generateBracket` so `currentRound`, `votes1/votes2`,
 * and the round structure match production.
 */
function makeFreshBracketSize4(): Bracket {
  const participants = [
    makeParticipant('p1', 'Alice', 1),
    makeParticipant('p2', 'Bob', 2),
    makeParticipant('p3', 'Charlie', 3),
    makeParticipant('p4', 'Diana', 4),
  ];
  return generateBracket(participants, 4);
}

/**
 * A hand-built size-2 bracket (a single Final matchup) for exercising the
 * vote-mode thumb / tie controls in isolation. `votes1`/`votes2` seed each
 * option's initial per-option counter (persisted votes).
 */
function makeBracketSize2(votes1: number | null, votes2: number | null): Bracket {
  const p1 = makeParticipant('p1', 'Alice', 1);
  const p2 = makeParticipant('p2', 'Bob', 2);

  // The persisted winner is derived from the seeded votes so a tied split
  // (votes1 === votes2) is treated as a persisted tie with winner === null,
  // matching how the production reducer would have left the matchup.
  const winner: Participant | null =
    votes1 !== null && votes2 !== null && votes1 !== votes2
      ? votes1 > votes2
        ? p1
        : p2
      : null;

  const matchup1: Matchup = {
    id: 'm1',
    roundNumber: 1,
    position: 0,
    participant1: p1,
    participant2: p2,
    winner,
    nextMatchupId: null,
    votes1,
    votes2,
  };

  const round1: Round = {
    roundNumber: 1,
    label: 'Final',
    matchups: [matchup1],
  };

  return {
    tournamentId: 't1',
    size: 2,
    rounds: [round1],
    participants: [p1, p2],
    champion: null,
    currentRound: 1,
    thirdPlaceMatch: null,
    thirdPlace: null,
    fourthPlace: null,
  };
}

const noop = () => {};

function renderView(
  bracket: Bracket,
  mode: 'classic' | 'vote',
  playerCount: number | null,
  handlers: Partial<{
    onSelectWinner: (matchupId: string, winnerId: string) => void;
    onEnterVotes: (matchupId: string, votes1: number, votes2: number) => void;
    onResolveTie: (matchupId: string) => void;
    onSelectThirdPlaceWinner: (winnerId: string) => void;
    onEnterThirdPlaceVotes: (votes1: number, votes2: number) => void;
    onResolveThirdPlaceTie: () => void;
  }> = {}
) {
  return render(
    <CurrentRoundView
      bracket={bracket}
      mode={mode}
      playerCount={playerCount}
      onSelectWinner={handlers.onSelectWinner ?? noop}
      onEnterVotes={handlers.onEnterVotes ?? noop}
      onResolveTie={handlers.onResolveTie ?? noop}
      onSelectThirdPlaceWinner={handlers.onSelectThirdPlaceWinner ?? noop}
      onEnterThirdPlaceVotes={handlers.onEnterThirdPlaceVotes ?? noop}
      onResolveThirdPlaceTie={handlers.onResolveThirdPlaceTie ?? noop}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CurrentRoundView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Only the current round + Stage_Label render (Req 14.1, 14.2, 14.5)
  // -------------------------------------------------------------------------

  it('renders only the current round with its Stage_Label heading (size-4 → Semifinal) and not later rounds', () => {
    const bracket = makeFreshBracketSize4();
    renderView(bracket, 'classic', null);

    // The current round of a fresh size-4 bracket is the Semifinal.
    expect(screen.getByRole('heading', { name: 'Semifinal' })).toBeInTheDocument();

    // The later round ("Final") must not be rendered as a heading here.
    expect(screen.queryByRole('heading', { name: 'Final' })).not.toBeInTheDocument();

    // Only ONE matchup card is shown at a time (single-matchup pagination),
    // even though the Semifinal has two matchups.
    const matchups = screen.getAllByLabelText(/^Matchup:/);
    expect(matchups).toHaveLength(1);
    expect(screen.queryByLabelText('Matchup: TBD vs TBD')).not.toBeInTheDocument();

    // The counter reads "Matchup 1 of 2"; Prev disabled, Next enabled.
    expect(screen.getByText(/Matchup 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous matchup/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next matchup/i })).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // CLASSIC mode (Req 6.7, 11.6)
  // -------------------------------------------------------------------------

  it('CLASSIC: shows click-to-pick buttons and dispatches SELECT_WINNER on click; renders no vote thumb controls', () => {
    const onSelectWinner = vi.fn();
    const bracket = makeBracketSize2(null, null); // classic ⇒ votes null
    renderView(bracket, 'classic', null, { onSelectWinner });

    const pickAlice = screen.getByRole('button', { name: /select alice as winner/i });
    const pickBob = screen.getByRole('button', { name: /select bob as winner/i });
    expect(pickAlice).toBeInTheDocument();
    expect(pickBob).toBeInTheDocument();

    fireEvent.click(pickAlice);
    expect(onSelectWinner).toHaveBeenCalledWith('m1', 'p1');

    // No vote thumb controls in classic mode.
    expect(screen.queryByRole('button', { name: /add a vote for/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove a vote from/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // VOTE mode per-option thumb controls (Req 12.1, 12.2, 12.3)
  // -------------------------------------------------------------------------

  it('VOTE: renders a single Vote_Slider whose value splits votes between the two options', () => {
    const onEnterVotes = vi.fn();
    const playerCount = 10;
    // Fresh, un-voted matchup so the slider starts centered.
    const bracket = makeBracketSize2(null, null);
    renderView(bracket, 'vote', playerCount, { onEnterVotes });

    // A single range slider labelled for the two participants.
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(screen.getByLabelText(/vote split for alice versus bob/i)).toBe(slider);
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(playerCount));

    // The slider is oriented intuitively: its raw value is the RIGHT option's votes.
    // Sliding to 6 gives Bob (right) 6 and Alice (left) 4.
    fireEvent.change(slider, { target: { value: '6' } });

    const counts = document.querySelectorAll('.vote-option-count');
    expect(counts).toHaveLength(2);
    expect(counts[0].textContent).toBe('4'); // Alice (left) = playerCount - 6
    expect(counts[1].textContent).toBe('6'); // Bob (right) = raw slider value

    // This is the last (and only) matchup of the round, so releasing the slider does
    // NOT record straight away — the recorded split is committed via the Next button.
    fireEvent.pointerUp(slider);
    expect(onEnterVotes).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /next matchup/i }));
    expect(onEnterVotes).toHaveBeenCalledWith('m1', 4, 6);
  });

  it('VOTE: last pair — release reports the split and Next records ENTER_VOTES (no confirm button)', () => {
    const onEnterVotes = vi.fn();
    const playerCount = 10;
    const bracket = makeBracketSize2(null, null);
    renderView(bracket, 'vote', playerCount, { onEnterVotes });

    // There is no separate "Record result" button anymore.
    expect(screen.queryByRole('button', { name: /record result/i })).not.toBeInTheDocument();

    // On the last pair of a round the Next button stays available. Before releasing
    // the slider on an unequal split there is nothing pending, so Next is disabled.
    const nextBtn = screen.getByRole('button', { name: /next matchup/i });
    expect(nextBtn).toBeDisabled();

    // Committing the slider (release) to an unequal split records it as PENDING and
    // enables Next; the dispatch happens only when Next is clicked (which advances
    // the round). Raw value 6 → Bob (right) 6, Alice (left) 4.
    const slider = screen.getByLabelText(/vote split for alice versus bob/i);
    fireEvent.change(slider, { target: { value: '6' } });
    fireEvent.pointerUp(slider);
    expect(onEnterVotes).not.toHaveBeenCalled();
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);
    expect(onEnterVotes).toHaveBeenCalledWith('m1', 4, 6);
  });

  it('VOTE: multi-pair round — deciding pair 1 directly, then pair 2 via Next records the LAST matchup (advances the round)', () => {
    const onEnterVotes = vi.fn();
    const playerCount = 10;
    // Size-4 Semifinal: two matchups, shown one at a time.
    const bracket = makeFreshBracketSize4();
    const semifinal = bracket.rounds.find((r) => r.label === 'Semifinal')!;
    const [m0, m1] = semifinal.matchups;

    renderView(bracket, 'vote', playerCount, { onEnterVotes });

    // Matchup 1 of 2 (NOT the last): releasing the slider records it directly.
    expect(screen.getByText(/Matchup 1 of 2/i)).toBeInTheDocument();
    let slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '7' } });
    fireEvent.pointerUp(slider);
    expect(onEnterVotes).toHaveBeenCalledWith(m0.id, 3, 7);

    // Navigate to Matchup 2 of 2 (the LAST pair).
    fireEvent.click(screen.getByRole('button', { name: /next matchup/i }));
    expect(screen.getByText(/Matchup 2 of 2/i)).toBeInTheDocument();

    // Move the last pair's slider to a decisive split → Next enables.
    slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '7' } });
    const nextBtn = screen.getByRole('button', { name: /next matchup/i });
    expect(nextBtn).toBeEnabled();

    // Clicking Next records the LAST matchup (which is what advances the round).
    fireEvent.click(nextBtn);
    expect(onEnterVotes).toHaveBeenCalledWith(m1.id, 3, 7);
  });

  it('VOTE: an equal split (tie) does NOT auto-record a result', () => {
    const onEnterVotes = vi.fn();
    const playerCount = 10;
    const bracket = makeBracketSize2(null, null);
    renderView(bracket, 'vote', playerCount, { onEnterVotes });

    // An equal split (5 / 5 when playerCount is even) records no winner, even on release.
    const slider = screen.getByLabelText(/vote split for alice versus bob/i);
    fireEvent.change(slider, { target: { value: '5' } });
    fireEvent.pointerUp(slider);
    expect(onEnterVotes).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // VOTE mode tie-break (Req 12.4, 12.8, 12.10)
  // -------------------------------------------------------------------------

  it('VOTE: shows the tie-break draw control and dispatches RESOLVE_TIE for a persisted tied matchup', () => {
    const onResolveTie = vi.fn();
    const playerCount = 10;
    // Persisted tie: equal votes recorded (5/5) with winner === null.
    const bracket = makeBracketSize2(5, 5);
    renderView(bracket, 'vote', playerCount, { onResolveTie });

    const tieButton = screen.getByRole('button', {
      name: /break the tie with a random draw/i,
    });
    expect(tieButton).toBeInTheDocument();

    fireEvent.click(tieButton);
    expect(onResolveTie).toHaveBeenCalledWith('m1');
  });

  it('VOTE: does NOT show the tie-break control for a non-tied persisted matchup', () => {
    const playerCount = 10;
    // Fresh (0/0) matchup → not a persisted tie.
    const bracket = makeBracketSize2(null, null);
    renderView(bracket, 'vote', playerCount, {});

    expect(
      screen.queryByRole('button', { name: /break the tie with a random draw/i })
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Final-stage ordering: third-place match precedes the Final (size >= 4)
  // (Req 10.9, 10.10, 14.6, 14.7, 14.8)
  // -------------------------------------------------------------------------

  it('renders the Third-place match before the Final once both Semifinals are decided (size-4)', () => {
    // Build a real size-4 bracket and decide BOTH semifinals via advanceWinner,
    // which populates the third-place slots. The Final stays undecided.
    let bracket = makeFreshBracketSize4();
    const semifinalRound = bracket.rounds.find((r) => r.label === 'Semifinal')!;
    for (const matchup of semifinalRound.matchups) {
      bracket = advanceWinner(bracket, matchup.id, matchup.participant1!.id);
    }

    // The third-place match slots are now the two semifinal losers, winner null.
    expect(bracket.thirdPlaceMatch).not.toBeNull();
    expect(bracket.thirdPlaceMatch!.participant1).not.toBeNull();
    expect(bracket.thirdPlaceMatch!.participant2).not.toBeNull();
    expect(bracket.thirdPlaceMatch!.winner).toBeNull();

    renderView(bracket, 'classic', null);

    // The Third-place match is exposed first; the Final is NOT shown yet.
    expect(
      screen.getByRole('heading', { name: /third-place match/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Final$/i })).not.toBeInTheDocument();

    // The third-place participants' pick controls are present.
    const loser1 = bracket.thirdPlaceMatch!.participant1!;
    const loser2 = bracket.thirdPlaceMatch!.participant2!;
    expect(
      screen.getByRole('button', { name: new RegExp(`select ${loser1.name} as winner`, 'i') })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`select ${loser2.name} as winner`, 'i') })
    ).toBeInTheDocument();

    // Exactly one matchup card is exposed (the third-place match).
    expect(screen.getAllByLabelText(/^Matchup:/)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Complete tournament → renders nothing (Req 14 completion view is elsewhere)
  // -------------------------------------------------------------------------

  it('renders nothing when the tournament is complete (champion set)', () => {
    const bracket = makeBracketSize2(null, null);
    const champion = makeParticipant('p1', 'Alice', 1);
    bracket.rounds[0].matchups[0].winner = champion;
    bracket.champion = champion;

    const { container } = renderView(bracket, 'classic', null);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
