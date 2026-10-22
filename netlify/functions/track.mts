// Netlify Function — records an anonymous usage event at POST /api/track.
//
// The browser sends only the event name, its random visitor/session ids, the
// path and referrer. Location (country/city) comes from Netlify's geo lookup
// and device/browser/OS are derived from the User-Agent here on the server, so
// no IP address or personal data is ever stored.

import type { Config, Context } from '@netlify/functions';
import { db } from '../../db/index.js';
import { usageEvents } from '../../db/schema.js';
import { parseUserAgent } from '../../src/analytics/userAgent.ts';

const ALLOWED_TYPES = new Set([
  'visit',
  'tournament_created',
  'tournament_started',
  'tournament_completed',
  'ai_suggestions',
]);

/** Trims a client-supplied string to a bounded length, or null when absent. */
function clean(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Keeps only the referrer host, and drops self-referrals. */
function referrerHost(value: unknown, ownHost: string): string | null {
  const raw = clean(value, 500);
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host && host !== ownHost ? host : null;
  } catch {
    return null;
  }
}

export default async function track(
  request: Request,
  context: Context,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const type = clean(body.type, 40);
  const visitorId = clean(body.visitorId, 64);
  const sessionId = clean(body.sessionId, 64);
  if (!type || !ALLOWED_TYPES.has(type) || !visitorId || !sessionId) {
    return new Response('Bad request', { status: 400 });
  }

  const ua = parseUserAgent(request.headers.get('user-agent') ?? '');
  if (ua.device === 'Bot') return new Response(null, { status: 204 });

  const ownHost = new URL(request.url).hostname.replace(/^www\./, '');
  const mode = clean(body.mode, 20);

  await db.insert(usageEvents).values({
    type,
    visitorId,
    sessionId,
    path: clean(body.path),
    referrer: referrerHost(body.referrer, ownHost),
    country: context.geo?.country?.name ?? null,
    city: context.geo?.city ?? null,
    device: ua.device,
    browser: ua.browser,
    os: ua.os,
    mode: mode === 'classic' || mode === 'voteBased' ? mode : null,
  });

  return new Response(null, { status: 204 });
}

export const config: Config = {
  path: '/api/track',
};
