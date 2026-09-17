// Suggestion service (client) — the cascading strategy that produces on-topic
// option suggestions for the tournament (Req 9).
//
// This module lives in the application layer. It orchestrates three sources, in
// order, until it has enough unique suggestions:
//   1. The AI proxy endpoint (POST /api/suggestions), with a ~10s ceiling that
//      is the source of truth for the "failed" determination (Req 9.3, 9.4).
//   2. Curated local lists via fuzzy, case-insensitive category matching
//      (Req 9.5–9.7).
//   3. Whatever it managed to produce, flagging that the rest must be filled by
//      hand (Req 9.8).
//
// All produced suggestions are unique among themselves and against the
// already-present names, comparing with case/whitespace insensitivity (Req 9.9)
// via the shared `namesEqual` domain helper.
//
// The `fetch` used to reach the endpoint is injectable so the cascade can be
// unit-tested without a network (Task 16.1). The full test suite is Task 16.3.

import { namesEqual } from '../domain/validation';
import { fuzzyMatchCategory } from './curatedLists';

/** Result of a suggestion request. */
export interface SuggestionResult {
  /** Unique, on-topic suggestions (0..count). */
  suggestions: string[];
  /**
   * True when fewer than `count` suggestions could be produced, meaning the
   * remaining slots must be filled by hand (Req 9.8).
   */
  manualFillNeeded: boolean;
}

/** The endpoint the client posts to for AI-based suggestions. */
export const SUGGESTIONS_ENDPOINT = '/api/suggestions';

/** Client-side ceiling for the AI call — the source of truth for "failed" (Req 9.4). */
export const AI_TIMEOUT_MS = 10_000;

/** Minimal fetch signature so tests can inject a fake without DOM types. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Injectable dependencies, primarily for testing. */
export interface SuggestionServiceDeps {
  /** How to reach the endpoint. Defaults to the global `fetch`. */
  fetchImpl: FetchLike;
  /** AI call ceiling in ms. Defaults to {@link AI_TIMEOUT_MS}. */
  timeoutMs: number;
  /** Fuzzy category -> curated list. Defaults to {@link fuzzyMatchCategory}. */
  fuzzyMatch: (category: string) => string[] | null;
  /**
   * When true, and the endpoint yields no usable suggestions, return static
   * dev-only mock suggestions instead of falling through to curated lists.
   *
   * Defaults to `import.meta.env.DEV` ONLY when using the built-in default
   * fetch — i.e. the real browser flow under `npm run dev`, where no Netlify
   * Function is running. Any caller that injects its own `fetchImpl` (all
   * tests) gets `false`, so the mock never interferes with the tested cascade.
   * Always `false` in production builds, where Vite tree-shakes the mock out.
   */
  useDevMock: boolean;
}

function defaultFetch(): FetchLike {
  // Read `fetch` off globalThis so this type-checks under a browser tsconfig
  // and still works in any environment that provides a global fetch.
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (!f) {
    // No fetch available (e.g. some test runners without a polyfill): behave as
    // if the AI call failed so the cascade falls through to local lists.
    return async () => {
      throw new Error('fetch is not available in this environment');
    };
  }
  return f;
}

const buildDefaultDeps = (): SuggestionServiceDeps => ({
  fetchImpl: defaultFetch(),
  timeoutMs: AI_TIMEOUT_MS,
  fuzzyMatch: fuzzyMatchCategory,
  // Only the real browser flow (default fetch, dev build) opts into the mock.
  // Tests inject `fetchImpl`, which — combined with the merge logic in
  // requestSuggestions/regenerateOne — forces this back to false.
  useDevMock: import.meta.env.DEV,
});

/**
 * Merge caller overrides onto the defaults, but disable the dev mock whenever
 * the caller supplies its own `fetchImpl` (every test path) unless they also
 * explicitly opt in via `useDevMock`. This keeps the mock confined to the real
 * `npm run dev` browser flow and out of the tested cascade.
 */
function resolveDeps(
  overrides: Partial<SuggestionServiceDeps>,
): SuggestionServiceDeps {
  const deps = { ...buildDefaultDeps(), ...overrides };
  if (overrides.fetchImpl && overrides.useDevMock === undefined) {
    deps.useDevMock = false;
  }
  return deps;
}

/**
 * Add candidate names to `acc`, skipping any that are blank, duplicate an
 * already-present name (`existingNames`), or duplicate one already accepted —
 * all comparisons ignoring case and edge whitespace (Req 9.7, 9.9). Stops once
 * `count` names are collected.
 */
function collectUnique(
  candidates: string[],
  existingNames: string[],
  acc: string[],
  count: number,
): void {
  for (const raw of candidates) {
    if (acc.length >= count) return;
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (name.length === 0) continue;

    const duplicatesExisting = existingNames.some((e) => namesEqual(e, name));
    if (duplicatesExisting) continue;

    const duplicatesAccepted = acc.some((a) => namesEqual(a, name));
    if (duplicatesAccepted) continue;

    acc.push(name);
  }
}

/**
 * Call the AI proxy endpoint with a ~10s ceiling (Req 9.3, 9.4). Returns the
 * raw suggestion strings on success, or an empty array on any failure, timeout,
 * or non-200 status (including the "not configured" case, Req 9.11) so callers
 * can fall through to local lists without special-casing.
 */
async function callAiEndpoint(
  category: string,
  existingNames: string[],
  count: number,
  deps: SuggestionServiceDeps,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetchImpl(SUGGESTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, existing: existingNames, count }),
      signal: controller.signal,
    });

    // Any non-200 (bad request, not configured, upstream error) => fall back.
    // In local dev the real Netlify Function is not running, so `/api/suggestions`
    // is served the SPA's index.html (a 200 with an HTML body) or errors; either
    // way there are no usable suggestions, so use the dev-only mock instead of
    // returning empty. Guarded by deps.useDevMock (which is false in tests and
    // stripped from production by Vite's tree-shaking of import.meta.env.DEV).
    if (!res.ok) {
      logSuggestionFallback(`endpoint returned HTTP ${res.status}`);
      return await devMockFallback(category, existingNames, count, deps);
    }

    const data = (await res.json()) as { suggestions?: unknown };
    if (!data || !Array.isArray(data.suggestions)) {
      logSuggestionFallback('endpoint 200 but body had no "suggestions" array');
      return await devMockFallback(category, existingNames, count, deps);
    }
    const strings = data.suggestions.filter((s): s is string => typeof s === 'string');
    // An empty/HTML-shaped 200 (e.g. Vite serving index.html) yields no strings;
    // use the dev mock so the local UI still gets suggestions.
    if (strings.length === 0) {
      logSuggestionFallback('endpoint 200 but "suggestions" array was empty');
      return await devMockFallback(category, existingNames, count, deps);
    }
    return strings;
  } catch (err) {
    // Network error or abort (timeout) => treat as failed (Req 9.4, 9.5).
    const reason = controller.signal.aborted
      ? `timed out after ${deps.timeoutMs}ms`
      : `network/fetch error: ${(err as Error)?.message ?? String(err)}`;
    logSuggestionFallback(reason);
    return await devMockFallback(category, existingNames, count, deps);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Surface WHY the AI cascade fell back to local lists. The AI path is otherwise
 * entirely silent, which makes production issues (a 501/502 from the endpoint,
 * a CORS/network error, a timeout, or a stale-cache HTML response) invisible and
 * indistinguishable from "the AI simply had nothing to add". This warns in the
 * browser console so the fallback reason is diagnosable without guessing.
 */
function logSuggestionFallback(reason: string): void {
  const warn = (globalThis as { console?: { warn?: (...args: unknown[]) => void } })
    .console?.warn;
  if (typeof warn === 'function') {
    warn(`[suggestions] AI endpoint unavailable, falling back to local lists — ${reason}`);
  }
}

/**
 * Dev-only fallback: return static mock suggestions so the UI flow is testable
 * with plain `npm run dev` (no Netlify Function running). Returns `[]` unless
 * `deps.useDevMock` is set, which only happens in the real dev browser flow;
 * in production the whole branch is tree-shaken out via `import.meta.env.DEV`.
 */
async function devMockFallback(
  category: string,
  existingNames: string[],
  count: number,
  deps: SuggestionServiceDeps,
): Promise<string[]> {
  if (!import.meta.env.DEV || !deps.useDevMock) return [];
  const { mockAiSuggestions } = await import('./mockSuggestions');
  return mockAiSuggestions(category, existingNames, count);
}

/**
 * Produce up to `count` unique, on-topic suggestions using the cascade.
 *
 * @param category the tournament category, used as generation context (Req 9.2).
 * @param existingNames names already present that suggestions must not repeat
 *   (Req 9.2, 9.7, 9.9).
 * @param count how many suggestions to aim for (Req 9.2).
 * @param overrides optional dependency injection (fetch, timeout, fuzzy match).
 */
export async function requestSuggestions(
  category: string,
  existingNames: string[],
  count: number,
  overrides: Partial<SuggestionServiceDeps> = {},
): Promise<SuggestionResult> {
  const deps: SuggestionServiceDeps = resolveDeps(overrides);

  if (!Number.isInteger(count) || count < 1) {
    return { suggestions: [], manualFillNeeded: count > 0 };
  }

  const collected: string[] = [];

  // 1. AI proxy first (Req 9.3, 9.4).
  const aiSuggestions = await callAiEndpoint(category, existingNames, count, deps);
  collectUnique(aiSuggestions, existingNames, collected, count);

  // 2. Curated local lists for the remainder (Req 9.5–9.7). Applies when the AI
  //    failed, timed out, was not configured, or returned too few.
  if (collected.length < count) {
    const local = deps.fuzzyMatch(category);
    if (local) {
      collectUnique(local, existingNames, collected, count);
    }
  }

  // 3. Return what we have; flag manual fill if still short (Req 9.8).
  return {
    suggestions: collected,
    manualFillNeeded: collected.length < count,
  };
}

/**
 * Produce a single unique replacement for a slot whose suggestion was rejected
 * (Req 10.3, 11.1). The replacement must be unique with respect to *both* the
 * current options (`existingNames`) and all currently pending suggestions
 * (`existingSuggestionNames`), comparing case/whitespace-insensitively via
 * `namesEqual` (Req 9.9).
 *
 * Reuses the same cascade as {@link requestSuggestions}: the AI proxy first
 * (with the ~10s ceiling), then curated local lists on failure/timeout/short
 * result. Returns the first candidate not already in use, or `null` when no
 * unique replacement can be produced — in which case the slot is left empty for
 * manual fill (Req 10.4).
 *
 * @param category the tournament category, used as generation context.
 * @param existingNames names already present as options.
 * @param existingSuggestionNames names of the currently pending suggestions
 *   (including any being kept), which the replacement must also avoid.
 * @param overrides optional dependency injection (fetch, timeout, fuzzy match).
 */
export async function regenerateOne(
  category: string,
  existingNames: string[],
  existingSuggestionNames: string[],
  overrides: Partial<SuggestionServiceDeps> = {},
): Promise<string | null> {
  const deps: SuggestionServiceDeps = resolveDeps(overrides);

  // Everything the replacement must be unique against (Req 10.3).
  const taken = [...existingNames, ...existingSuggestionNames];
  const collected: string[] = [];

  // 1. AI proxy first (Req 9.3, 9.4). Ask for a single replacement; passing the
  //    full set of taken names as `existing` also nudges the AI away from them.
  const aiSuggestions = await callAiEndpoint(category, taken, 1, deps);
  collectUnique(aiSuggestions, taken, collected, 1);

  // 2. Curated local lists if the AI failed, timed out, or produced nothing
  //    unique (Req 9.5–9.7).
  if (collected.length < 1) {
    const local = deps.fuzzyMatch(category);
    if (local) {
      collectUnique(local, taken, collected, 1);
    }
  }

  // 3. Return the replacement, or null when none is available (Req 10.4).
  return collected.length > 0 ? collected[0] : null;
}
