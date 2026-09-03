import { TournamentProvider, useTournament } from './state/tournament-context';
import { TournamentCreator } from './components/TournamentCreator';
import { ParticipantManager } from './components/ParticipantManager';
import { SuggestionPanel } from './components/SuggestionPanel';
import { BracketVisualizer } from './components/BracketVisualizer';
import { CurrentRoundView } from './components/CurrentRoundView';
import { FinalStandings } from './components/FinalStandings';
import { getMode, isTournamentComplete } from './services/bracket-manager';

/**
 * Main application content that consumes TournamentProvider context.
 *
 * Application flow:
 * 1. No tournament -> show TournamentCreator form
 * 2. Tournament created, participants not full -> show ParticipantManager + SuggestionPanel
 * 3. Participants == bracketSize -> show "Generate Bracket" button
 * 4. Bracket generated (rounds exist) -> show BracketVisualizer
 * 5. "New Tournament" button resets everything
 *
 * Requirements: 7.1, 7.2, 7.3
 */
function AppContent() {
  const { state, dispatch } = useTournament();
  const { tournament, bracket } = state;

  const participantCount = bracket?.participants.length ?? 0;
  const bracketSize = bracket?.size ?? 0;
  const isFull = participantCount === bracketSize && bracketSize > 0;
  const bracketGenerated = bracket !== null && bracket.rounds.length > 0;

  const handleGenerateBracket = () => {
    dispatch({ type: 'GENERATE_BRACKET' });
  };

  const handleNewTournament = () => {
    dispatch({ type: 'RESET_TOURNAMENT' });
  };

  // Phase 1: No tournament exists -- show creation form
  if (!tournament) {
    return (
      <main className="app-main" style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
        <TournamentCreator />
      </main>
    );
  }

  const handleSelectWinner = (matchupId: string, winnerId: string) => {
    dispatch({ type: 'SELECT_WINNER', payload: { matchupId, winnerId } });
  };

  const handleEnterVotes = (matchupId: string, votes1: number, votes2: number) => {
    dispatch({ type: 'ENTER_VOTES', payload: { matchupId, votes1, votes2 } });
  };

  const handleResolveTie = (matchupId: string) => {
    dispatch({ type: 'RESOLVE_TIE', payload: { matchupId } });
  };

  const handleSelectThirdPlaceWinner = (winnerId: string) => {
    dispatch({ type: 'SELECT_THIRD_PLACE_WINNER', payload: { winnerId } });
  };

  const handleEnterThirdPlaceVotes = (votes1: number, votes2: number) => {
    dispatch({ type: 'ENTER_THIRD_PLACE_VOTES', payload: { votes1, votes2 } });
  };

  const handleResolveThirdPlaceTie = () => {
    dispatch({ type: 'RESOLVE_THIRD_PLACE_TIE' });
  };

  // Phase 4/5: Bracket has been generated.
  // While the champion is not yet decided, reveal only the Current_Round via
  // CurrentRoundView (Req 5.4, 14.1). Once complete, show the full SVG tree via
  // BracketVisualizer (Req 5.5, 14.4).
  if (bracketGenerated && bracket) {
    return (
      <main className="app-main" style={{ padding: '24px' }}>
        <header className="screen-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2>{tournament.category}</h2>
          <button type="button" className="btn btn-secondary" onClick={handleNewTournament}>
            New Tournament
          </button>
        </header>
        {isTournamentComplete(bracket) ? (
          <>
            <FinalStandings bracket={bracket} />
            <BracketVisualizer />
          </>
        ) : (
          <CurrentRoundView
            bracket={bracket}
            mode={getMode(tournament)}
            playerCount={tournament.playerCount}
            onSelectWinner={handleSelectWinner}
            onEnterVotes={handleEnterVotes}
            onResolveTie={handleResolveTie}
            onSelectThirdPlaceWinner={handleSelectThirdPlaceWinner}
            onEnterThirdPlaceVotes={handleEnterThirdPlaceVotes}
            onResolveThirdPlaceTie={handleResolveThirdPlaceTie}
          />
        )}
      </main>
    );
  }

  // Phase 2 & 3: Tournament exists, collecting participants
  return (
    <main className="app-main" style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      <header className="screen-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2>{tournament.category}</h2>
        <button type="button" className="btn btn-secondary" onClick={handleNewTournament}>
          New Tournament
        </button>
      </header>

      {state.ui.error && (
        <p className="error" role="alert" aria-live="assertive" style={{ color: 'red', marginBottom: '12px' }}>
          {state.ui.error}
        </p>
      )}

      <div className="panel-grid" style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 300px' }}>
          <ParticipantManager />
        </div>
        <div className="card" style={{ flex: '1 1 300px' }}>
          <SuggestionPanel />
        </div>
      </div>

      {isFull && (
        <div
          className="center-actions generate-bracket-bar"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
            marginTop: '24px',
            padding: '16px',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            borderTop: '1px solid #e5e7eb',
            boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={handleGenerateBracket}
            style={{ padding: '12px 24px', fontSize: '16px', fontWeight: 'bold' }}
          >
            Generate Bracket
          </button>
        </div>
      )}
    </main>
  );
}

/**
 * Root App component that wraps the application in TournamentProvider.
 * All features are accessible without login or payment.
 */
function App() {
  return (
    <TournamentProvider>
      <div className="app" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <header
          className="app-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <img
            src="/logo_app_tournament.svg"
            alt="Tournament Bracket Creator logo"
            style={{ height: '40px', width: 'auto', display: 'block' }}
          />
          <h1 className="app-title" style={{ margin: 0, fontSize: '24px' }}>Tournament Bracket Creator</h1>
        </header>
        <AppContent />
      </div>
    </TournamentProvider>
  );
}

export default App;
