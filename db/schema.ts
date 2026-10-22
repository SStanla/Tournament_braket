// Database schema — anonymous usage analytics (Netlify Database / Drizzle).
//
// Every row is one usage event sent by the browser: the initial visit that
// opens a session, plus the key milestones of the tournament flow. No personal
// data is stored: visitors are identified only by random ids generated in the
// browser, and location comes from Netlify's coarse geo lookup (no IP).

import { index, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const usageEvents = pgTable(
  'usage_events',
  {
    id: serial().primaryKey(),
    /** Event name, e.g. `visit`, `tournament_created`, `tournament_completed`. */
    type: text().notNull(),
    /** Random id persisted in localStorage — one per browser. */
    visitorId: text('visitor_id').notNull(),
    /** Random id persisted in sessionStorage — one per tab session. */
    sessionId: text('session_id').notNull(),
    path: text(),
    referrer: text(),
    country: text(),
    city: text(),
    device: text(),
    browser: text(),
    os: text(),
    /** Tournament mode for tournament events (`classic` / `voteBased`). */
    mode: text(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('usage_events_created_at_idx').on(t.createdAt),
    index('usage_events_session_idx').on(t.sessionId),
  ],
);
