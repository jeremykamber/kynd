// @vitest-environment node
/**
 * The extraction call must ask for the caller's token cap. AI SDK v6 renamed
 * the call setting (`maxTokens` in v5, `maxOutputTokens` in v6); passing the
 * old name silently drops the cap, the provider reserves the model maximum
 * (131,072 tokens), and a credit-limited account is refused before the first
 * token. This test reads the actual outbound HTTP body instead of trusting the
 * option name.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LlmServiceImpl } from '../LlmServiceImpl';

const TOKEN_LIMIT = 2_000;

type Captured = { url: string; body: any };

describe('extractPersonaResponse - outbound token cap', () => {
  const captured: Captured[] = [];
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    captured.length = 0;
    globalThis.fetch = (async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      let body: any = null;
      try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
      if (body) captured.push({ url, body });
      // A provider error stops the call after the request is observable; the
      // assertion is about what we sent, not what came back.
      return new Response(JSON.stringify({ error: { message: 'stop after capture' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('sends the caller token limit, not the model maximum', async () => {
    const svc = LlmServiceImpl.createFromEnv('openrouter');
    const persona = {
      id: 'p1', name: 'Ada', age: 34, occupation: 'Product manager',
      backstory: 'Runs a small team.', goals: ['ship'], frustrations: ['slow'],
    } as any;

    await expect(
      svc.extractPersonaResponse(persona, 'I open the page and scan the headline.', 'Does it land?', {
        tokenLimit: TOKEN_LIMIT,
      }),
    ).rejects.toBeTruthy();

    const extraction = captured.find((c) => c.url.includes('/chat/completions'));
    expect(extraction, 'no chat/completions request was sent').toBeDefined();
    const sent = extraction!.body.max_tokens ?? extraction!.body.max_completion_tokens;
    expect(sent).toBe(TOKEN_LIMIT);
    expect(sent).not.toBe(131_072);
  }, 30_000);
});
