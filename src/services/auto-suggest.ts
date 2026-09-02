/**
 * Auto-Suggest Engine with hybrid fallback strategy.
 *
 * Cascade:
 * 1. Primary: AI-based suggestions via LLM API
 * 2. Fallback: Local curated category lists
 * 3. Last resort: Manual entry prompt (returns partial results with source: 'manual')
 */

import { v4 as uuidv4 } from 'uuid';
import { SUGGESTION_TIMEOUT_MS } from '../types/index';
import type {
  SuggestionParams,
  SuggestionResult,
  Suggestion,
  ReplacementParams,
} from '../types/suggestions';
import { queryLocalLists } from './local-category-lists';

// Re-export types for convenience
export type { SuggestionParams, SuggestionResult, Suggestion, ReplacementParams } from '../types/suggestions';

/**
 * Get the suggestion API endpoint.
 * In production, this points to our Netlify Function proxy.
 * In tests or local dev with direct OpenAI access, can be overridden via VITE_AI_API_ENDPOINT.
 */
function getAiApiEndpoint(): string {
  return import.meta.env?.VITE_AI_API_ENDPOINT || '/.netlify/functions/suggest';
}

/**
 * Check if we're using the proxy endpoint (Netlify Function).
 */
function isUsingProxy(): boolean {
  const endpoint = getAiApiEndpoint();
  return endpoint.includes('/.netlify/functions/') || endpoint === '/api/suggest';
}

// ---------------------------------------------------------------------------
// Exported helper functions
// ---------------------------------------------------------------------------

/**
 * Build the prompt for the AI to generate category-relevant suggestions.
 */
export function buildPrompt(category: string, existing: string[], count: number): string {
  let prompt = `Generate exactly ${count} unique participants for a "${category}" tournament bracket.`;

  if (existing.length > 0) {
    prompt += `\nThe following are already in the bracket — do NOT repeat these: ${existing.join(', ')}`;
  }

  prompt += `\nReturn ONLY a JSON array of strings, e.g. ["item1", "item2", ...].`;
  prompt += `\nNo explanation, no markdown, just the JSON array.`;

  return prompt;
}

/**
 * Parse the AI response content into an array of strings.
 * Handles plain JSON arrays, markdown code fences, and embedded arrays.
 */
export function parseAIResponse(content: string): string[] {
  const trimmed = content.trim();

  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      return [];
    }
  } catch {
    // Continue with other strategies
  }

  // Try stripping markdown code fences
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      const parsed = JSON.parse(codeFenceMatch[1].trim());
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed;
      }
    } catch {
      // Continue
    }
  }

  // Try to find a JSON array embedded in the text
  const arrayMatch = trimmed.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed;
      }
    } catch {
      // Continue
    }
  }

  return [];
}

/**
 * Deduplicate suggestions: remove entries that match existing participants or
 * are duplicates within the list. Trims whitespace and removes empty entries.
 *
 * Comparison is case-insensitive on the trimmed value (normalized key =
 * `value.trim().toLocaleLowerCase()`) to stay consistent with participant-entry
 * uniqueness rules (Req 4.2 / 3.7). The original trimmed display names are
 * returned unchanged.
 */
export function deduplicateSuggestions(
  suggestions: string[],
  existing: string[]
): string[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase();

  const existingSet = new Set(existing.map(normalize));
  const seen = new Set<string>();
  const results: string[] = [];

  for (const item of suggestions) {
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLocaleLowerCase();
    if (existingSet.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(trimmed);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Core suggestion logic
// ---------------------------------------------------------------------------

/**
 * Create a Suggestion object from a name and source.
 */
function createSuggestion(name: string, source: 'ai' | 'fallback'): Suggestion {
  return {
    id: uuidv4(),
    name,
    source,
    status: 'pending',
  };
}

/**
 * Generate suggestions using the AI API only (primary strategy).
 * This function handles:
 * - Early return for count <= 0
 * - Timeout enforcement via AbortController
 * - Response parsing and deduplication
 * - Error reporting on failure
 *
 * @param params - Suggestion parameters
 * @returns SuggestionResult with source always 'ai'
 */
export async function generateSuggestions(
  params: SuggestionParams
): Promise<SuggestionResult> {
  const { category, existingParticipants, count, timeout = SUGGESTION_TIMEOUT_MS } = params;

  // Early return for count <= 0
  if (count <= 0) {
    return { suggestions: [], source: 'ai' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const endpoint = getAiApiEndpoint();
    const usingProxy = isUsingProxy();

    let response: Response;

    if (usingProxy) {
      // Call our Netlify Function proxy — it handles the OpenAI call server-side
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, existingParticipants, count }),
        signal: controller.signal,
      });
    } else {
      // Direct OpenAI call (for local dev with VITE_AI_API_ENDPOINT override)
      const apiKey = import.meta.env?.VITE_AI_API_KEY || '';
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that generates suggestions for tournament brackets. Respond only with a JSON array of strings.',
            },
            {
              role: 'user',
              content: buildPrompt(category, existingParticipants, count),
            },
          ],
          temperature: 0.8,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      return {
        suggestions: [],
        source: 'ai',
        error: `HTTP ${response.status}: ${await response.text()}`,
      };
    }

    const data = await response.json();

    // Proxy returns { content: "..." }, direct OpenAI returns { choices: [...] }
    const content = usingProxy
      ? data.content
      : data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        suggestions: [],
        source: 'ai',
        error: 'No content in response',
      };
    }

    const parsed = parseAIResponse(content);

    if (parsed.length === 0) {
      return {
        suggestions: [],
        source: 'ai',
        error: 'Could not parse suggestions from AI response',
      };
    }

    const deduplicated = deduplicateSuggestions(parsed, existingParticipants);
    const suggestions = deduplicated
      .slice(0, count)
      .map(name => createSuggestion(name, 'ai'));

    return { suggestions, source: 'ai' };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'Request timed out'
          : error.message
        : 'Unknown error';

    return {
      suggestions: [],
      source: 'ai',
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate suggestions using the full fallback cascade:
 * 1. Try AI-based suggestions (primary)
 * 2. On AI failure/timeout, try local curated lists (fallback)
 * 3. If local lists can't fill all slots, return what it has with source: 'manual'
 *
 * @param params - Suggestion parameters (category, existing, count, timeout)
 * @returns SuggestionResult indicating the source used
 */
export async function generateSuggestionsWithFallback(
  params: SuggestionParams
): Promise<SuggestionResult> {
  const { category, existingParticipants, count } = params;

  // Early return for count <= 0
  if (count <= 0) {
    return { suggestions: [], source: 'ai' };
  }

  // 1. Try AI-based suggestions (primary)
  const aiResult = await generateSuggestions(params);

  if (!aiResult.error && aiResult.suggestions.length >= count) {
    return aiResult;
  }

  // If AI returned some results but not enough, supplement with fallback
  if (!aiResult.error && aiResult.suggestions.length > 0 && aiResult.suggestions.length < count) {
    const aiNames = aiResult.suggestions.map(s => s.name);
    const allExisting = [...existingParticipants, ...aiNames];
    const remaining = count - aiResult.suggestions.length;
    const fallbackNames = queryLocalLists(category, allExisting, remaining);

    const combined = [
      ...aiResult.suggestions,
      ...fallbackNames.map(name => createSuggestion(name, 'fallback')),
    ];

    if (combined.length >= count) {
      return { suggestions: combined.slice(0, count), source: 'ai' };
    }

    return {
      suggestions: combined,
      source: 'manual',
      error: `Could only generate ${combined.length} of ${count} suggestions. Please enter the remaining participants manually.`,
    };
  }

  // 2. AI failed — try local curated lists (fallback)
  const fallbackNames = queryLocalLists(category, existingParticipants, count);

  if (fallbackNames.length >= count) {
    return {
      suggestions: fallbackNames.slice(0, count).map(name => createSuggestion(name, 'fallback')),
      source: 'fallback',
    };
  }

  if (fallbackNames.length > 0) {
    // 3. Partial fallback results — indicate manual entry for the rest
    return {
      suggestions: fallbackNames.map(name => createSuggestion(name, 'fallback')),
      source: 'manual',
      error: `Could only generate ${fallbackNames.length} of ${count} suggestions. Please enter the remaining participants manually.`,
    };
  }

  // 3. No local list match — prompt manual entry
  return {
    suggestions: [],
    source: 'manual',
    error: 'Unable to generate suggestions for this category. Please enter participants manually.',
  };
}

/**
 * Generate a single replacement suggestion after one is rejected.
 * Uses the same fallback cascade logic.
 *
 * @param params - Replacement parameters (category, existing, rejected)
 * @returns A new Suggestion, or null if none can be generated
 */
export async function generateReplacementSuggestion(
  params: ReplacementParams
): Promise<Suggestion | null> {
  const { category, existingParticipants, rejectedNames } = params;
  const allExcluded = [...existingParticipants, ...rejectedNames];

  // Try AI first
  const aiResult = await generateSuggestions({
    category,
    existingParticipants: allExcluded,
    count: 1,
  });

  if (!aiResult.error && aiResult.suggestions.length > 0) {
    return aiResult.suggestions[0];
  }

  // Fallback to local lists
  const fallbackResults = queryLocalLists(category, allExcluded, 1);
  if (fallbackResults.length > 0) {
    return createSuggestion(fallbackResults[0], 'fallback');
  }

  return null;
}
