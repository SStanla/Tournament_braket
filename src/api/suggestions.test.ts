import { describe, it, expect, vi } from 'vitest';
import {
  handleSuggestions,
  PROVIDER_KEY_ENV_VAR,
  type SuggestionResponseBody,
  type SuggestionErrorBody,
} from './suggestions';

const SECRET = 'super-secret-provider-key';

function postRequest(body: unknown): Request {
  return new Request('https://example.test/api/suggestions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = { category: 'Movies', existing: ['Alien'], count: 3 };

describe('AI suggestion endpoint (server-side proxy)', () => {
  it('responds with an explicit "not configured" status when no key is set (Req 9.11)', async () => {
    const res = await handleSuggestions(postRequest(validBody), {
      getProviderKey: () => undefined,
    });

    expect(res.status).toBe(501);
    const json = (await res.json()) as SuggestionErrorBody;
    expect(json.status).toBe('not_configured');
    // The provider was never invoked because the key was absent.
  });

  it('reads the provider key from the server-side env var and passes it to the provider (Req 9.10)', async () => {
    const callProvider = vi
      .fn()
      .mockResolvedValue(['Titanic', 'Jaws', 'Rocky']);

    const res = await handleSuggestions(postRequest(validBody), {
      getProviderKey: () => SECRET,
      callProvider,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as SuggestionResponseBody;
    expect(json.suggestions).toEqual(['Titanic', 'Jaws', 'Rocky']);

    // The key reached the provider call...
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(callProvider.mock.calls[0][0]).toBe(SECRET);
  });

  it('never returns the provider credential in the response body (Req 9.10)', async () => {
    const callProvider = vi.fn().mockResolvedValue(['A', 'B']);
    const res = await handleSuggestions(postRequest(validBody), {
      getProviderKey: () => SECRET,
      callProvider,
    });

    const text = await res.text();
    expect(text).not.toContain(SECRET);
  });

  it('sanitizes provider output: trims, drops empties, de-duplicates case-insensitively', async () => {
    const callProvider = vi
      .fn()
      .mockResolvedValue(['  Jaws  ', 'jaws', '', 'Rocky']);

    const res = await handleSuggestions(postRequest(validBody), {
      getProviderKey: () => SECRET,
      callProvider,
    });

    const json = (await res.json()) as SuggestionResponseBody;
    expect(json.suggestions).toEqual(['Jaws', 'Rocky']);
  });

  it('enforces an upstream timeout and maps it to an error the client treats as failed (Req 9.3)', async () => {
    // Provider that rejects when its abort signal fires (as a real fetch would).
    const callProvider = vi.fn(
      (_key: string, _body: unknown, signal: AbortSignal) =>
        new Promise<string[]>((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const res = await handleSuggestions(postRequest(validBody), {
      getProviderKey: () => SECRET,
      callProvider,
      timeoutMs: 5,
    });

    expect(res.status).toBe(502);
    const json = (await res.json()) as SuggestionErrorBody;
    expect(json.status).toBe('upstream_error');
  });

  it('rejects non-POST methods', async () => {
    const req = new Request('https://example.test/api/suggestions', {
      method: 'GET',
    });
    const res = await handleSuggestions(req, { getProviderKey: () => SECRET });
    expect(res.status).toBe(405);
  });

  it('rejects a malformed body with a bad_request status', async () => {
    const res = await handleSuggestions(postRequest({ category: '', count: 0 }), {
      getProviderKey: () => SECRET,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as SuggestionErrorBody;
    expect(json.status).toBe('bad_request');
  });

  it('checks configuration before touching the request body', async () => {
    // A key-less server should short-circuit even with an unparseable body.
    const req = new Request('https://example.test/api/suggestions', {
      method: 'POST',
      body: 'not-json',
    });
    const res = await handleSuggestions(req, { getProviderKey: () => undefined });
    expect(res.status).toBe(501);
  });

  it('documents the env var name used for the credential', () => {
    expect(PROVIDER_KEY_ENV_VAR).toBe('GEMINI_API_KEY');
  });
});
