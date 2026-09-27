import { describe, it, expect, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { openRouterPlugin } from '../server/openrouter';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
async function adapter(env: Record<string, string>, provider: typeof fetch, job: (url: string) => Promise<void>) {
  let handler: Handler;
  const plugin = openRouterPlugin(env, provider);
  const configure = plugin.configureServer as (s: { middlewares: { use: (path: string, h: Handler) => void } }) => void;
  configure({ middlewares: { use: (_path, h) => { handler = h; } } });
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await job(`http://127.0.0.1:${(server.address() as { port: number }).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
}
const plan = { shapes: [{ type: 'box', center: [0, 0, 0], size: [1, 1, 1], color: '#123456' }] };
const post = (url: string, body: unknown, origin?: string) => fetch(`${url}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
const credentials = { OPENROUTER_API_KEY: 'test-secret-not-a-real-key', OPENROUTER_MODEL: 'test/vision-model' };

describe('local OpenRouter adapter', () => {
  it('reports unconfigured status and does not call a provider', async () => {
    const provider = vi.fn<typeof fetch>();
    await adapter({}, provider, async url => {
      expect(await (await fetch(`${url}/status`)).json()).toEqual({ ready: false });
      expect((await post(url, {})).status).toBe(503);
    });
    expect(provider).not.toHaveBeenCalled();
  });
  it('blocks cross-origin calls and malformed input before any billed request', async () => {
    const provider = vi.fn<typeof fetch>();
    await adapter(credentials, provider, async url => {
      expect((await post(url, {}, 'https://other.example')).status).toBe(403);
      expect((await post(url, { image: 'https://other.example/art.png' })).status).toBe(400);
    });
    expect(provider).not.toHaveBeenCalled();
  });
  it('keeps credentials server-side and returns only validated shape data', async () => {
    const provider = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] }));
    await adapter(credentials, provider, async url => {
      expect(await (await fetch(`${url}/status`)).json()).toEqual({ ready: true });
      const response = await post(url, { image: 'data:image/png;base64,AA==' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ plan });
    });
    const request = provider.mock.calls[0][1]!;
    expect(JSON.parse(String(request.body)).provider.require_parameters).toBe(true);
    expect(request.headers).toMatchObject({ Authorization: `Bearer ${credentials.OPENROUTER_API_KEY}` });
  });
  it('rejects invalid AI shapes and reports provider failures without leaking provider bodies', async () => {
    const provider = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"shapes":[]}' } }] }))
      .mockResolvedValueOnce(new Response('private provider error', { status: 401 }));
    await adapter(credentials, provider, async url => {
      expect((await post(url, { image: 'data:image/png;base64,AA==' })).status).toBe(400);
      const result = await post(url, { image: 'data:image/png;base64,AA==' });
      expect(result.status).toBe(502);
      expect(await result.text()).not.toContain('private provider error');
    });
  });
});
