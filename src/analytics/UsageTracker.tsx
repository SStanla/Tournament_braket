// Watches the tournament state and reports the key usage milestones. Only
// transitions observed during this page load count, so restoring a persisted
// tournament on reload does not re-report it.

import { useEffect, useRef } from 'react';
import { useTournament } from '../app/TournamentContext';
import { trackEvent, trackVisit } from './tracker';

export default function UsageTracker() {
  const { state } = useTournament();
  const tournament = state.tournament;
  const phase = tournament?.phase ?? null;
  const pending =
    tournament?.suggestions.filter((s) => s.status === 'pending').length ?? 0;

  const prevPhase = useRef(phase);
  const prevPending = useRef(pending);

  useEffect(() => {
    trackVisit();
  }, []);

  useEffect(() => {
    const before = prevPhase.current;
    prevPhase.current = phase;
    if (phase === before || !tournament) return;
    const extra = { mode: tournament.mode };
    if (phase === 'FILLING' && (before === null || before === 'CREATE')) {
      trackEvent('tournament_created', extra);
    } else if (phase === 'PLAYING' && before === 'FILLING') {
      trackEvent('tournament_started', extra);
    } else if (phase === 'RESULTS' && before === 'PLAYING') {
      trackEvent('tournament_completed', extra);
    }
  }, [phase, tournament]);

  useEffect(() => {
    const before = prevPending.current;
    prevPending.current = pending;
    if (before === 0 && pending > 0) trackEvent('ai_suggestions');
  }, [pending]);

  return null;
}
