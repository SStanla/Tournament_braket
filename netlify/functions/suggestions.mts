// Netlify Function — exposes the AI suggestion proxy at POST /api/suggestions.
//
// This is a thin deployment adapter. All logic (env-var reading, the Gemini
// call, timeout, sanitisation, and the "not configured" fallback path) lives in
// the platform-agnostic handler in `src/api/suggestions.ts`; here we only wire
// it to Netlify's modern function runtime, which speaks the standard Web
// `Request` -> `Response` contract the handler already implements.
//
// The Gemini credential is read server-side from the `GEMINI_API_KEY`
// environment variable (configured in the Netlify site settings) and is never
// returned to the client (Req 9.10). When the variable is unset the handler
// responds with a "not configured" status so the client falls back to its
// curated local lists (Req 9.11).
//
// `config.path` maps this function to `/api/suggestions`, matching the endpoint
// the client posts to (`SUGGESTIONS_ENDPOINT` in the suggestion service), so no
// extra redirect is required.

import type { Config, Context } from '@netlify/functions';
import { handleSuggestions } from '../../src/api/suggestions.ts';

export default async function suggestions(
  request: Request,
  _context: Context,
): Promise<Response> {
  return handleSuggestions(request);
}

export const config: Config = {
  path: '/api/suggestions',
};
