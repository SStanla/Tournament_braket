// AI Suggestion Endpoint — the single, thin server-side proxy for AI-based
// option suggestions (Task 15).
//
// Design ("AI Suggestion Endpoint"):
//   - Single HTTPS handler. Input: { category, existing, count }.
//     Output: { suggestions: string[] }.
//   - Reads the provider key from a server-side environment variable and
//     NEVER returns it (Req 9.10).
//   - If the key is not configured, responds with an explicit "not configured"
//     status so the client falls back cleanly to local lists (Req 9.11).
//   - Enforces its own upstream timeout (Req 9.3; the client also applies a
//     ~10s ceiling as the source of truth for the "failed" determination).
//
// Platform note: this handler is written against the standard Web Fetch API
// (`Request` -> `Response`), so it deploys unchanged on Netlify Functions,
// Vercel Edge Functions, Cloudflare Workers, Deno Deploy, or any Node runtime
// exposing undici's global `fetch`/`Request`/`Response`. No specific serverless
// platform is assumed; adapters below (`getProviderKey`, `callProvider`) isolate
// the environment- and provider-specific bits so they can be swapped or mocked.
//
// The default provider is Google Gemini via its `generateContent` REST endpoint
// (see `callGemini`), using the `gemini-flash-latest` alias — fast, low-latency
// and available on the free tier, which suits short on-topic name suggestions.
// The alias always resolves to the current stable Flash model, so the endpoint
// keeps working as Google retires older generations (e.g. `gemini-2.0-flash`,
// which was removed and previously caused every call to fail with a 502).

/** Request body accepted by the endpoint. */
export interface SuggestionRequestBody {
  /** The tournament category used as context (Req 9.2). */
  category: string;
  /** Names already present, so the provider avoids repeats (Req 9.2, 9.3). */
  existing: string[];
  /** How many suggestions to aim for (Req 9.2). */
  count: number;
}

/** Success response body. */
export interface SuggestionResponseBody {
  suggestions: string[];
}

/** Error/status response body. Never contains the provider credential. */
export interface SuggestionErrorBody {
  /** Machine-readable status the client branches on. */
  status: 'not_configured' | 'bad_request' | 'upstream_error';
  /** Human-readable, credential-free explanation. */
  message: string;
}

/**
 * The environment-variable name that holds the provider credential.
 * Kept server-side only; its value is never included in any response.
 */
export const PROVIDER_KEY_ENV_VAR = 'GEMINI_API_KEY';

/** Upstream timeout for the provider call (Req 9.3). */
export const UPSTREAM_TIMEOUT_MS = 9000;

/**
 * The Gemini model used for suggestions. `gemini-flash-lite-latest` is a moving
 * alias that always points at the current stable lightweight Flash model —
 * fast, low-latency, and available on the free tier, which fits short on-topic
 * name generation. Using an alias avoids hardcoding a specific generation (like
 * the retired `gemini-2.0-flash`) that Google can remove and break every
 * request. The lite alias was chosen because it responds reliably (200) where
 * heavier aliases were returning 404/503 for this project's key.
 */
export const GEMINI_MODEL = 'gemini-flash-lite-latest';

/** Base URL for the Gemini generateContent REST endpoint. */
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Maximum number of suggestions a single request may ask for. */
const MAX_COUNT = 1000;

/**
 * Read the provider key from a server-side environment variable.
 *
 * Uses `process.env` when available (Node/Netlify/Vercel Node runtime) and is
 * written defensively so it also works where `process` is undefined (some edge
 * runtimes inject env differently). Returns `undefined` when unset/blank.
 *
 * Overridable via `deps.getProviderKey` for testing without touching real env.
 */
export function getProviderKey(): string | undefined {
  // Access `process.env` without depending on @types/node: read `process` off
  // `globalThis` so this type-checks in a browser/bundler tsconfig while still
  // working at runtime on any Node-based serverless platform.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  const raw = proc?.env?.[PROVIDER_KEY_ENV_VAR];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Abstraction over the actual AI provider call. Given the credential and the
 * request context, returns a list of candidate suggestion strings.
 *
 * The default implementation is {@link callGemini}. It is injectable so the
 * handler wiring, env-var reading, "not configured" path and timeout stay
 * testable without a live provider. The credential stays inside this server
 * module and is never echoed back to the client (Req 9.10).
 */
export type ProviderCall = (
  apiKey: string,
  body: SuggestionRequestBody,
  signal: AbortSignal,
) => Promise<string[]>;

/**
 * Build the prompt asking Gemini for on-topic option names. It states the
 * category, the count, and the names to avoid, and requests a plain JSON array
 * of strings so the response is easy to parse.
 */
function buildPrompt(body: SuggestionRequestBody): string {
  const avoid =
    body.existing.length > 0
      ? ` Do not repeat any of these existing entries: ${body.existing.join(', ')}.`
      : '';
  return (
    `Suggest ${body.count} distinct, well-known options for a tournament bracket ` +
    `in the category "${body.category}".${avoid} ` +
    `Each option should be a short proper name or title (no descriptions). ` +
    `Respond with ONLY a JSON array of ${body.count} strings, nothing else.`
  );
}

/**
 * Extract an array of suggestion strings from a Gemini `generateContent`
 * response. Gemini returns the text under
 * `candidates[0].content.parts[0].text`; with `responseMimeType: application/json`
 * that text is a JSON array of strings. Falls back to line-splitting if the
 * text is not valid JSON, so a slightly off-format reply still yields names.
 */
function parseGeminiText(text: string): string[] {
  const trimmed = text.trim();

  // Preferred path: the model returned a JSON array of strings.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === 'string');
    }
  } catch {
    // Not JSON — fall through to a tolerant line/comma parse below.
  }

  // Tolerant fallback: strip code fences, split on newlines/commas, and drop
  // list bullets/numbering so a non-JSON reply still produces usable names.
  return trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .split(/[\n,]+/)
    .map((line) => line.replace(/^\s*[-*\d.)\]]+\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Default provider: call Google Gemini's `generateContent` REST endpoint.
 *
 * The credential is sent in the `x-goog-api-key` header (never in the URL, so
 * it does not leak into logs) and never returned to the client (Req 9.10). The
 * caller's `AbortSignal` enforces the upstream timeout (Req 9.3). Any non-OK
 * response or parse failure throws, which the handler maps to `upstream_error`
 * so the client falls back to local lists (Req 9.5).
 */
export const callGemini: ProviderCall = async (apiKey, body, signal) => {
  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(body) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 1.0,
      },
    }),
    signal,
  });

  if (!res.ok) {
    // Do not include the response body verbatim to avoid leaking any request
    // echo; a generic error is enough for the client's fallback decision.
    throw new Error(`Gemini request failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseGeminiText(text);
};

/** Injectable dependencies, primarily for testing. */
export interface SuggestionHandlerDeps {
  getProviderKey: () => string | undefined;
  callProvider: ProviderCall;
  timeoutMs: number;
}

const defaultDeps: SuggestionHandlerDeps = {
  getProviderKey,
  callProvider: callGemini,
  timeoutMs: UPSTREAM_TIMEOUT_MS,
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Validate and coerce an unknown parsed body into a `SuggestionRequestBody`.
 * Returns `null` when the shape is invalid.
 */
function parseBody(raw: unknown): SuggestionRequestBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const category = typeof obj.category === 'string' ? obj.category.trim() : '';
  if (category.length === 0) return null;

  const existing = Array.isArray(obj.existing)
    ? obj.existing.filter((e): e is string => typeof e === 'string')
    : [];

  const count =
    typeof obj.count === 'number' && Number.isInteger(obj.count) ? obj.count : NaN;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;

  return { category, existing, count };
}

/**
 * Core request handler using the standard Web Fetch API contract.
 *
 * @param request incoming HTTPS request with a JSON body `{ category, existing, count }`.
 * @param overrides optional dependency injection (env reader, provider call, timeout).
 */
export async function handleSuggestions(
  request: Request,
  overrides: Partial<SuggestionHandlerDeps> = {},
): Promise<Response> {
  const deps: SuggestionHandlerDeps = { ...defaultDeps, ...overrides };

  if (request.method !== 'POST') {
    const err: SuggestionErrorBody = {
      status: 'bad_request',
      message: 'Only POST is supported.',
    };
    return json(err, 405);
  }

  // Read the credential from the server-side env var. When absent, respond with
  // an explicit "not configured" status so the client falls back to local
  // lists and manual entry (Req 9.11). The credential value is never returned.
  const apiKey = deps.getProviderKey();
  if (!apiKey) {
    const body: SuggestionErrorBody = {
      status: 'not_configured',
      message:
        'AI suggestion provider is not configured. Falling back to local lists.',
    };
    // 501 Not Implemented: the capability is not configured on this server.
    return json(body, 501);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    const err: SuggestionErrorBody = {
      status: 'bad_request',
      message: 'Request body must be valid JSON.',
    };
    return json(err, 400);
  }

  const input = parseBody(parsed);
  if (!input) {
    const err: SuggestionErrorBody = {
      status: 'bad_request',
      message: 'Expected { category: string, existing: string[], count: 1..1000 }.',
    };
    return json(err, 400);
  }

  // Enforce an upstream timeout so a slow provider cannot hang the request
  // (Req 9.3). The credential is passed only to the provider call and is never
  // placed in the response.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const raw = await deps.callProvider(apiKey, input, controller.signal);
    const body: SuggestionResponseBody = { suggestions: sanitize(raw) };
    return json(body, 200);
  } catch {
    // Any upstream failure/timeout maps to a generic error. The client treats a
    // non-200 (or timeout) as "failed" and falls back to local lists (Req 9.5).
    const err: SuggestionErrorBody = {
      status: 'upstream_error',
      message: 'The suggestion provider failed or timed out.',
    };
    return json(err, 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalize provider output into a clean list of suggestion strings:
 * trims, drops empties, and de-duplicates case-insensitively. Final
 * de-duplication against already-present names happens client-side (Req 9.9),
 * but trimming here keeps the payload tidy.
 */
function sanitize(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (name.length === 0) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Default export as a Fetch-style handler `(Request) => Promise<Response>`,
 * the signature most edge/serverless platforms expect. Deployment adapters can
 * import this directly (e.g. a Netlify Function, a Vercel/Netlify edge function,
 * or `addEventListener('fetch', ...)` in a Worker).
 */
export default function handler(request: Request): Promise<Response> {
  return handleSuggestions(request);
}
