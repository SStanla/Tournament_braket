// Anonymous usage tracking for the admin dashboard.
//
// Each browser gets a random visitor id (localStorage) and each tab session a
// random session id (sessionStorage). Events are fire-and-forget: tracking
// must never slow down or break the app, so every failure is swallowed.

export const TRACK_ENDPOINT = '/api/track';

export type UsageEventType =
  | 'visit'
  | 'tournament_created'
  | 'tournament_started'
  | 'tournament_completed'
  | 'ai_suggestions';

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Reads (or creates) a random id in the given storage; in-memory fallback. */
function storedId(storage: () => Storage, key: string): string {
  try {
    const existing = storage().getItem(key);
    if (existing) return existing;
    const id = randomId();
    storage().setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

let ids: { visitorId: string; sessionId: string } | null = null;

function getIds() {
  ids ??= {
    visitorId: storedId(() => localStorage, 'tbc.visitorId'),
    sessionId: storedId(() => sessionStorage, 'tbc.sessionId'),
  };
  return ids;
}

/** Sends one usage event. Never throws. */
export function trackEvent(
  type: UsageEventType,
  extra: { mode?: string } = {},
): void {
  if (import.meta.env.MODE === 'test') return;
  try {
    const body = JSON.stringify({
      type,
      ...getIds(),
      path: window.location.pathname,
      referrer: type === 'visit' ? document.referrer : undefined,
      ...extra,
    });
    void fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Tracking is best-effort.
  }
}

let visitTracked = false;

/** Records the visit that opens this page load (once, StrictMode-safe). */
export function trackVisit(): void {
  if (visitTracked) return;
  visitTracked = true;
  trackEvent('visit');
}
