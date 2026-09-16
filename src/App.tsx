// UI layer — application shell and screen router (Task 25).
//
// This is the global chrome for the whole app: a header carrying the logo
// (Req 24.7) and an always-available "New tournament" control (Req 2.4), plus
// the phase-driven screen router. Everything is wrapped in the
// TournamentProvider so every screen shares the single reducer state.
//
// The router maps the tournament's phase to a screen (design.md "Screen Flow
// (State Machine)"):
//   - null / CREATE  -> CreateScreen
//   - FILLING        -> FillScreen + SuggestionReview (the review panel renders
//                       itself only while suggestions are pending)
//   - PLAYING        -> PlayScreen, whose matchup body is Classic or Vote by
//                       tournament.mode
//   - RESULTS        -> ResultsScreen
//
// The blue/white palette, spacing, grouping, and button focus-over-hover
// precedence come from the shared design tokens and App.module.css (Req 24.1,
// 24.2, 24.3, 24.4, 24.5, 24.6). All user-facing text is English (Req 24.8).

import logo from '/logo_app_tournament.svg';
import { TournamentProvider, useTournament } from './app/TournamentContext';
import CreateScreen from './components/CreateScreen';
import FillScreen from './components/FillScreen';
import SuggestionReview from './components/SuggestionReview';
import PlayScreen from './components/PlayScreen';
import ClassicMatchup from './components/ClassicMatchup';
import VoteMatchup from './components/VoteMatchup';
import ResultsScreen from './components/ResultsScreen';
import type { Matchup } from './domain/model';
import styles from './App.module.css';

/**
 * The phase-driven screen router. Reads the current tournament from context and
 * renders the screen for its phase. Before any tournament exists (`null`) and
 * in the CREATE phase the creation form is shown.
 *
 * In PLAYING the matchup body is chosen by the tournament's immutable `mode`
 * (Req 5.4, 25.7): classic mode uses {@link ClassicMatchup}, vote-based mode
 * uses {@link VoteMatchup}. It is passed to the PlayScreen shell through its
 * `renderMatchup` slot so the shell stays mode-agnostic.
 */
function ScreenRouter() {
  const { state } = useTournament();
  const tournament = state.tournament;

  // No tournament yet, or explicitly on the creation phase.
  if (!tournament || tournament.phase === 'CREATE') {
    return <CreateScreen />;
  }

  switch (tournament.phase) {
    case 'FILLING':
      return (
        <>
          <FillScreen />
          <SuggestionReview />
        </>
      );

    case 'PLAYING': {
      const renderMatchup = (matchup: Matchup) =>
        tournament.mode === 'voteBased' ? (
          <VoteMatchup matchup={matchup} />
        ) : (
          <ClassicMatchup matchup={matchup} />
        );
      return <PlayScreen renderMatchup={renderMatchup} />;
    }

    case 'RESULTS':
      return <ResultsScreen />;

    default:
      return <CreateScreen />;
  }
}

/**
 * The header chrome: the logo (Req 24.7) and the always-available "New
 * tournament" control (Req 2.4). The control dispatches NEW_TOURNAMENT, which
 * clears everything and returns to the creation screen (Req 2.5). It is rendered
 * in every phase so it is reachable at any time.
 */
function AppHeader() {
  const { dispatch } = useTournament();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img
          className={styles.logo}
          src={logo}
          alt="Tournament Bracket Creator logo"
          width={48}
          height={48}
        />
        <h1 className={styles.title}>Tournament Bracket Creator</h1>
      </div>
      <button
        type="button"
        className={styles.newTournament}
        onClick={() => dispatch({ type: 'NEW_TOURNAMENT' })}
      >
        New tournament
      </button>
    </header>
  );
}

/**
 * A non-blocking notice banner shown when persistence is degraded so the user
 * knows data might not be saved, without losing anything (Req 23.4).
 */
function NoticeBanner() {
  const { state } = useTournament();
  if (!state.notice) return null;
  return (
    <p className={styles.notice} role="status">
      {state.notice}
    </p>
  );
}

/**
 * The application root. Wraps the whole tree in the TournamentProvider so the
 * header and every screen share one reducer state, then renders the global
 * chrome and the routed screen.
 */
export default function App() {
  return (
    <TournamentProvider>
      <div className={styles.app}>
        <AppHeader />
        <NoticeBanner />
        <main className={styles.main}>
          <ScreenRouter />
        </main>
      </div>
    </TournamentProvider>
  );
}
