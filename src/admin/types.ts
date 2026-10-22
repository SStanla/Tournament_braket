// Response shape of GET /api/analytics (see netlify/functions/analytics.mts).

export interface Bucket {
  label: string;
  value: number;
}

export interface DailyPoint {
  day: string;
  visits: number;
  visitors: number;
  tournaments: number;
}

export interface AccessRow {
  id: number;
  at: string;
  visitorId: string;
  sessionId: string;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  events: number | null;
  lastSeen: string | null;
}

export interface AnalyticsData {
  days: number;
  timezone: string;
  totals: {
    visits: number;
    visitors: number;
    sessions: number;
    returningVisitors: number;
    tournamentsCreated: number;
    tournamentsStarted: number;
    tournamentsCompleted: number;
    aiSuggestions: number;
  };
  daily: DailyPoint[];
  hourly: { hour: number; value: number }[];
  breakdowns: Record<
    'countries' | 'cities' | 'devices' | 'browsers' | 'systems' | 'referrers' | 'modes',
    Bucket[]
  >;
  recent: AccessRow[];
}
