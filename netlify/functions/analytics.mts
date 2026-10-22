// Netlify Function — usage statistics for the admin dashboard at
// GET /api/analytics?days=30.
//
// Restricted to Netlify Identity users holding the `admin` role: the browser
// session's `nf_jwt` cookie is validated by `getUser()`. Everything is
// aggregated in Postgres and returned in one payload the dashboard renders.

import type { Config } from '@netlify/functions';
import { getUser } from '@netlify/identity';
import { and, count, countDistinct, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { usageEvents as e } from '../../db/schema.js';

/** Days and hours are bucketed in the app owner's timezone. */
const TZ = 'Europe/Rome';
const ALLOWED_DAYS = new Set([1, 7, 30, 90, 365]);

/** Top-N breakdown of visits by one column, with unknown values grouped. */
function breakdown(column: typeof e.country, since: Date, limit = 8) {
  const label = sql<string>`coalesce(${column}, 'Sconosciuto')`;
  return db
    .select({ label, value: count() })
    .from(e)
    .where(and(eq(e.type, 'visit'), gte(e.createdAt, since)))
    .groupBy(label)
    .orderBy(desc(count()))
    .limit(limit);
}

export default async function analytics(request: Request): Promise<Response> {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.roles?.includes('admin')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const requested = Number(new URL(request.url).searchParams.get('days'));
  const days = ALLOWED_DAYS.has(requested) ? requested : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const inRange = gte(e.createdAt, since);
  const isVisit = and(eq(e.type, 'visit'), inRange);

  const day = sql<string>`to_char(${e.createdAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM-DD')`;
  const hour = sql<number>`extract(hour from ${e.createdAt} at time zone ${sql.raw(`'${TZ}'`)})::int`;

  // Per-session activity, used to annotate the recent-access log.
  const sessionStats = db
    .select({
      sessionId: e.sessionId,
      events: count().as('events'),
      lastSeen: sql<string>`max(${e.createdAt})`.as('last_seen'),
    })
    .from(e)
    .groupBy(e.sessionId)
    .as('session_stats');

  const [
    [totals],
    eventCounts,
    daily,
    hourly,
    countries,
    cities,
    devices,
    browsers,
    systems,
    referrers,
    modes,
    recent,
  ] = await Promise.all([
    db
      .select({
        visits: count(),
        visitors: countDistinct(e.visitorId),
        sessions: countDistinct(e.sessionId),
      })
      .from(e)
      .where(isVisit),
    db
      .select({ type: e.type, value: count() })
      .from(e)
      .where(inRange)
      .groupBy(e.type),
    db
      .select({
        day,
        visits: sql<number>`count(*) filter (where ${e.type} = 'visit')::int`,
        visitors: sql<number>`count(distinct ${e.visitorId}) filter (where ${e.type} = 'visit')::int`,
        tournaments: sql<number>`count(*) filter (where ${e.type} = 'tournament_created')::int`,
      })
      .from(e)
      .where(inRange)
      .groupBy(day)
      .orderBy(day),
    db
      .select({ hour, value: count() })
      .from(e)
      .where(isVisit)
      .groupBy(hour)
      .orderBy(hour),
    breakdown(e.country, since),
    breakdown(e.city, since),
    breakdown(e.device, since),
    breakdown(e.browser, since),
    breakdown(e.os, since),
    db
      .select({
        label: sql<string>`coalesce(${e.referrer}, 'Diretto')`,
        value: count(),
      })
      .from(e)
      .where(isVisit)
      .groupBy(sql`coalesce(${e.referrer}, 'Diretto')`)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({ label: sql<string>`coalesce(${e.mode}, 'Sconosciuto')`, value: count() })
      .from(e)
      .where(and(eq(e.type, 'tournament_created'), inRange))
      .groupBy(sql`coalesce(${e.mode}, 'Sconosciuto')`),
    db
      .select({
        id: e.id,
        at: e.createdAt,
        visitorId: e.visitorId,
        sessionId: e.sessionId,
        country: e.country,
        city: e.city,
        device: e.device,
        browser: e.browser,
        os: e.os,
        referrer: e.referrer,
        events: sessionStats.events,
        lastSeen: sessionStats.lastSeen,
      })
      .from(e)
      .leftJoin(sessionStats, eq(sessionStats.sessionId, e.sessionId))
      .where(isVisit)
      .orderBy(desc(e.createdAt))
      .limit(100),
  ]);

  // Returning visitors: in-range visitors whose first visit predates the range.
  const [returning] = await db
    .select({ value: countDistinct(e.visitorId) })
    .from(e)
    .where(
      and(
        isVisit,
        sql`${e.visitorId} in (select visitor_id from usage_events where type = 'visit' and created_at < ${since.toISOString()})`,
      ),
    );

  const byType = Object.fromEntries(eventCounts.map((r) => [r.type, r.value]));

  return Response.json({
    days,
    timezone: TZ,
    totals: {
      ...totals,
      returningVisitors: returning?.value ?? 0,
      tournamentsCreated: byType.tournament_created ?? 0,
      tournamentsStarted: byType.tournament_started ?? 0,
      tournamentsCompleted: byType.tournament_completed ?? 0,
      aiSuggestions: byType.ai_suggestions ?? 0,
    },
    daily,
    hourly,
    breakdowns: { countries, cities, devices, browsers, systems, referrers, modes },
    recent,
  });
}

export const config: Config = {
  path: '/api/analytics',
};
