// Dev-only mock for the AI suggestion endpoint.
//
// In local development we run just Vite (`npm run dev`), so the real
// `/api/suggestions` Netlify Function is NOT running. Rather than rebuild that
// server locally (which needs the Netlify CLI + Deno for the Edge runtime),
// the suggestion service falls back to this static mock so the full UI flow
// (button -> pending suggestions -> accept/reject/replace) can be exercised.
//
// This module is imported behind an `import.meta.env.DEV` guard in
// `suggestionService.ts`, so Vite tree-shakes it out of the production bundle.
// In production the real server-side function handles suggestions and this
// code never runs.

/**
 * Produce a static list of mock suggestion strings for the given category.
 *
 * The names are intentionally generic and clearly synthetic (they include the
 * category text) so it is obvious, while testing, that these came from the mock
 * and not from a real provider. Returns up to `count` names, avoiding anything
 * already present (case-insensitive) so the caller's de-duplication has nothing
 * left to strip — though the service de-dupes again regardless.
 */
export function mockAiSuggestions(
  category: string,
  existing: string[],
  count: number,
): string[] {
  const label = category.trim() || 'Option';
  const takenLower = new Set(existing.map((e) => e.trim().toLocaleLowerCase()));

  const out: string[] = [];
  // Generate more candidates than needed, then filter, so we can still reach
  // `count` even after skipping ones that collide with existing names.
  for (let i = 1; out.length < count && i <= count + existing.length + 5; i += 1) {
    const name = `${label} Pick ${i}`;
    if (takenLower.has(name.toLocaleLowerCase())) continue;
    out.push(name);
  }
  return out;
}
