// Tests for the Gemini provider integration (callGemini) and its response
// parsing. The global `fetch` is stubbed so no real network call is made; these
// verify the request shape (credential in header, never the URL), JSON parsing,
// the tolerant non-JSON fallback, and error mapping to the handler's fallback.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callGemini,
  GEMINI_MODEL,
  handleSuggestions,
  type SuggestionResponseBody,
  type SuggestionErrorBody,
} from './suggestions';

const SECRET = 'gemini-secret-key';
const body = { category: 'Movies', existing: ['Alien'], count: 3 };

function geminiResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callGemini provider', () => {
  it('parses a JSON array of strings from the model text', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(geminiResponse('["Titanic", "Jaws", "Rocky"]'));

    const out = await callGemini(SECRET, body, new AbortController().signal);
    expect(out).toEqual(['Titanic', 'Jaws', 'Rocky']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends the credential in the x-goog-api-key header and never in the URL (Req 9.10)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(geminiResponse('["A", "B"]'));

    await callGemini(SECRET, body, new AbortController().signal);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(GEMINI_MODEL);
    expect(url).not.toContain(SECRET);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(SECRET);
  });

  it('falls back to line parsing when the text is not valid JSON', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(geminiResponse('1. Titanic\n2. Jaws\n- Rocky'));
    void fetchSpy;

    const out = await callGemini(SECRET, body, new AbortController().signal);
    expect(out).toEqual(['Titanic', 'Jaws', 'Rocky']);
  });

  it('throws on a non-OK upstream response so the handler falls back', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    await expect(
      callGemini(SECRET, body, new AbortController().signal),
    ).rejects.toThrow();
  });

  it('is used as the default provider by the handler (200 with parsed names)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      geminiResponse('["Titanic", "Jaws", "Rocky"]'),
    );

    const req = new Request('https://example.test/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Provide only the key; callProvider defaults to callGemini.
    const res = await handleSuggestions(req, { getProviderKey: () => SECRET });
    expect(res.status).toBe(200);
    const json = (await res.json()) as SuggestionResponseBody;
    expect(json.suggestions).toEqual(['Titanic', 'Jaws', 'Rocky']);
  });

  it('maps an upstream Gemini failure to upstream_error (Req 9.5)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const req = new Request('https://example.test/api/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await handleSuggestions(req, { getProviderKey: () => SECRET });
    expect(res.status).toBe(502);
    const json = (await res.json()) as SuggestionErrorBody;
    expect(json.status).toBe('upstream_error');
  });
});
