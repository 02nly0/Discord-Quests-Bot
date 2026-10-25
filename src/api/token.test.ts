import { describe, expect, it } from 'bun:test';
import type { DiscordApiClient } from './client';
import { cleanToken, fetchCurrentUser, isTokenShaped } from './token';

/** Builds a client stub whose GET resolves to whatever the factory returns. */
function clientReturning(get: () => unknown): DiscordApiClient {
	return { get: async () => get() } as unknown as DiscordApiClient;
}

describe('isTokenShaped', () => {
	it('accepts three non-empty dot-separated segments', () => {
		expect(isTokenShaped('abc.def.ghi')).toBe(true);
	});

	it('rejects the wrong segment count', () => {
		expect(isTokenShaped('abc.def')).toBe(false);
		expect(isTokenShaped('abc.def.ghi.jkl')).toBe(false);
		expect(isTokenShaped('')).toBe(false);
	});

	it('rejects empty segments', () => {
		expect(isTokenShaped('abc..ghi')).toBe(false);
		expect(isTokenShaped('.def.ghi')).toBe(false);
	});
});

describe('cleanToken', () => {
	it('strips surrounding quotes and whitespace users paste along', () => {
		expect(cleanToken('  "abc.def.ghi" ')).toBe('abc.def.ghi');
		expect(cleanToken("'abc.def.ghi'")).toBe('abc.def.ghi');
	});

	it('leaves clean tokens untouched', () => {
		expect(cleanToken('abc.def.ghi')).toBe('abc.def.ghi');
	});
});

describe('fetchCurrentUser', () => {
	it('returns the user when the API responds with an id', async () => {
		const client = clientReturning(() => ({ id: '123', username: 'tester' }));
		await expect(fetchCurrentUser(client)).resolves.toEqual({ id: '123', username: 'tester' });
	});

	it('returns null when the response is not user-shaped', async () => {
		const client = clientReturning(() => ({ message: 'You are rate limited' }));
		await expect(fetchCurrentUser(client)).resolves.toBeNull();
	});

	it('returns null when the request fails', async () => {
		const client = clientReturning(() => {
			throw new Error('401');
		});
		await expect(fetchCurrentUser(client)).resolves.toBeNull();
	});
});
