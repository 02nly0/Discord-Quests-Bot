import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { DiscordApiClient } from '../../src/api/client';
import { DiscordApiError } from '../../src/api/errors';

/**
 * The client is tested by stubbing globalThis.fetch with a scripted queue of
 * Response factories. Sleeps between retries are real, so tests use the
 * shortest retry paths available (retry_after: 0, reset-after: ~0), and only
 * the network-exhaustion case pays the full backoff chain.
 */

const realFetch = globalThis.fetch;
const BUILD_NUMBER_URL = 'https://discord.com/app';
let fetchCalls: Array<{ url: string; method?: string }> = [];
let responses: Array<() => Response | Promise<Response>> = [];

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

beforeEach(() => {
	fetchCalls = [];
	responses = [];
	globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		// Build-number resolution runs in the background whenever the cached
		// fingerprint is stale. Keep it out of the scripted API response queue.
		if (String(input) === BUILD_NUMBER_URL) {
			return new Response('<script>window.GLOBAL_ENV={"BUILD_NUMBER":"649389"}</script>');
		}

		fetchCalls.push({ url: String(input), method: init?.method });
		const next = responses.shift();
		if (!next) throw new Error(`unexpected fetch to ${String(input)}`);
		return next();
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe('DiscordApiClient', () => {
	it('parses JSON responses', async () => {
		const client = new DiscordApiClient('token');
		responses.push(() => jsonResponse({ quests: [] }));

		await expect(client.get('/quests/@me')).resolves.toEqual({ quests: [] });
		expect(fetchCalls.length).toBe(1);
		expect(fetchCalls[0]!.url).toBe('https://discord.com/api/v9/quests/@me');
	});

	it('returns undefined for 204 responses', async () => {
		const client = new DiscordApiClient('token');
		responses.push(() => new Response(null, { status: 204 }));

		await expect(client.post('/quests/q1/heartbeat', {})).resolves.toBeUndefined();
	});

	it('retries once after a network error and then succeeds', async () => {
		const client = new DiscordApiClient('token');
		responses.push(
			() => Promise.reject(new TypeError('fetch failed')),
			() => jsonResponse({ ok: true }),
		);

		await expect(client.get('/users/@me')).resolves.toEqual({ ok: true });
		expect(fetchCalls.length).toBe(2);
	});

	it('backs off on 429 and retries the request', async () => {
		const client = new DiscordApiClient('token');
		responses.push(
			() => jsonResponse({ retry_after: 0 }, 429),
			() => jsonResponse({ ok: true }),
		);

		await expect(client.post('/quests/q1/heartbeat', {})).resolves.toEqual({ ok: true });
		expect(fetchCalls.length).toBe(2);
	});

	it('stops retrying 429 responses instead of looping forever', async () => {
		const client = new DiscordApiClient('token');
		for (let attempt = 0; attempt < 4; attempt += 1) {
			responses.push(() => jsonResponse({ retry_after: 0 }, 429));
		}

		const error: DiscordApiError = await client.get('/users/@me').then(
			() => {
				throw new Error('expected the request to fail');
			},
			(caught) => caught,
		);

		expect(error).toBeInstanceOf(DiscordApiError);
		expect(error.status).toBe(429);
		expect(fetchCalls.length).toBe(4);
	});

	it('throws DiscordApiError with status and body for client errors', async () => {
		const client = new DiscordApiClient('token');
		responses.push(() => jsonResponse({ message: '401: Unauthorized' }, 401));

		const error: DiscordApiError = await client.get('/users/@me').then(
			() => {
				throw new Error('expected the request to fail');
			},
			(caught) => caught,
		);

		expect(error).toBeInstanceOf(DiscordApiError);
		expect(error.status).toBe(401);
		expect(error.detail()).toContain('401: Unauthorized');
	});

	it('retries 5xx responses before giving up', async () => {
		const client = new DiscordApiClient('token');
		responses.push(
			() => jsonResponse({ error: 'boom' }, 500),
			() => jsonResponse({ error: 'boom' }, 502),
			() => jsonResponse({ ok: true }),
		);

		await expect(client.get('/users/@me')).resolves.toEqual({ ok: true });
		expect(fetchCalls.length).toBe(3);
	});

	it('blocks a route after its rate limit is exhausted', async () => {
		const client = new DiscordApiClient('token');
		responses.push(
			() => jsonResponse({}, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '0.001' }),
			() => jsonResponse({ ok: true }),
		);

		await expect(client.get('/quests/@me')).resolves.toEqual({});
		await expect(client.get('/quests/@me')).resolves.toEqual({ ok: true });
		expect(fetchCalls.length).toBe(2);
	});

	// The full backoff chain (1s + 2s + 4s) needs a wider timeout than the
	// 5s default, which is also why this scenario is covered only once.
	it('gives up after repeated network errors', async () => {
		const client = new DiscordApiClient('token');
		responses.push(
			() => Promise.reject(new TypeError('down')),
			() => Promise.reject(new TypeError('down')),
			() => Promise.reject(new TypeError('down')),
			() => Promise.reject(new TypeError('down')),
		);

		const error: DiscordApiError = await client.get('/users/@me').then(
			() => {
				throw new Error('expected the request to fail');
			},
			(caught) => caught,
		);

		expect(error).toBeInstanceOf(DiscordApiError);
		expect(error.status).toBe(0);
		expect(fetchCalls.length).toBe(4);
	}, 20_000);
});
