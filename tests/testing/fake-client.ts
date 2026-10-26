import { DiscordApiClient } from '../../src/api/client';

export type RouteHandler = (call: { path: string; body?: unknown }) => unknown;

/**
 * Scripted stand-in for DiscordApiClient. Each GET or POST consumes the next
 * handler from its method's script, in order. A handler that throws simulates
 * an API failure, and running past the end of a script fails the test with
 * "unexpected request", so unmocked calls cannot pass silently.
 */
class ScriptedApiClient extends DiscordApiClient {
	readonly calls: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [];

	constructor(private readonly script: { get?: RouteHandler[]; post?: RouteHandler[] }) {
		super('token');
	}

	override get<T>(path: string): Promise<T> {
		return this.#dispatch('GET', path, undefined, this.script.get);
	}

	override post<T>(path: string, body?: unknown): Promise<T> {
		return this.#dispatch('POST', path, body, this.script.post);
	}

	#dispatch<T>(method: 'GET' | 'POST', path: string, body: unknown, queue: RouteHandler[] | undefined): Promise<T> {
		this.calls.push({ method, path, body });
		const handler = queue?.shift();
		if (!handler) throw new Error(`unexpected ${method} ${path}: no scripted handler left`);
		return Promise.resolve(handler({ path, body }) as T);
	}
}

export function fakeApiClient(script: { get?: RouteHandler[]; post?: RouteHandler[] }): {
	client: DiscordApiClient;
	calls: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }>;
} {
	const client = new ScriptedApiClient(script);
	return { client, calls: client.calls };
}
