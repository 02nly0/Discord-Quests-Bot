import type { DiscordApiClient } from '../api/client';

export type RouteHandler = (call: { path: string; body?: unknown }) => unknown;

/**
 * Scripted stand-in for DiscordApiClient. Each GET or POST consumes the next
 * handler from its method's script, in order. A handler that throws simulates
 * an API failure, and running past the end of a script fails the test with
 * "unexpected request", so unmocked calls cannot pass silently.
 */
export function fakeApiClient(script: { get?: RouteHandler[]; post?: RouteHandler[] }): {
	client: DiscordApiClient;
	calls: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }>;
} {
	const calls: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [];

	function dispatch(
		method: 'GET' | 'POST',
		path: string,
		body: unknown,
		queue: RouteHandler[] | undefined,
	): Promise<unknown> {
		calls.push({ method, path, body });
		const handler = queue?.shift();
		if (!handler) throw new Error(`unexpected ${method} ${path}: no scripted handler left`);
		return Promise.resolve(handler({ path, body }));
	}

	const client = {
		get: (path: string) => dispatch('GET', path, undefined, script.get),
		post: (path: string, body?: unknown) => dispatch('POST', path, body, script.post),
	} as unknown as DiscordApiClient;

	return { client, calls };
}
