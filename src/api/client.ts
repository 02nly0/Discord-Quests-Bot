import { DiscordApiError } from './errors';
import { buildHeaders } from './fingerprint';
import { sleep } from '../util/time';

const API_BASE = 'https://discord.com/api/v9';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;

/**
 * A minimal REST client for the Discord API that authenticates with a user
 * token. Handles per-route rate limiting, 429 backoff and transient failure
 * retries. One instance holds one token; drop all references to it to let
 * the token be garbage-collected once a session is over.
 */
export class DiscordApiClient {
	readonly #token: string;
	readonly #rateLimitedUntil = new Map<string, number>();

	constructor(token: string) {
		this.#token = token;
	}

	get<T>(path: string): Promise<T> {
		return this.#request<T>('GET', path);
	}

	post<T>(path: string, body?: unknown): Promise<T> {
		return this.#request<T>('POST', path, body);
	}

	async #request<T>(method: 'GET' | 'POST', path: string, body?: unknown, attempt = 0): Promise<T> {
		const url = `${API_BASE}${path}`;
		const route = `${method} ${path}`;

		const blockedUntil = this.#rateLimitedUntil.get(route) ?? 0;
		if (blockedUntil > Date.now()) await sleep(blockedUntil - Date.now());

		let response: Response;
		try {
			response = await fetch(url, {
				method,
				// Rebuild per request so the cached client build number is re-read
				// instead of being frozen when the client is constructed.
				headers: buildHeaders(this.#token),
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			// Timeouts and connection drops are worth one more try.
			if (attempt + 1 < MAX_ATTEMPTS) {
				await sleep(1000 * 2 ** attempt);
				return this.#request<T>(method, path, body, attempt + 1);
			}
			throw new DiscordApiError(0, `network error: ${String(error)}`);
		}

		this.#trackRateLimit(route, response);

		if (response.status === 429) {
			const payload: unknown = await response.json().catch(() => null);
			// Retrying 429s is capped like every other failure mode. A route
			// that keeps rate-limiting (or reports retry_after: 0) must not
			// trap the client in an endless loop.
			if (attempt + 1 >= MAX_ATTEMPTS) throw new DiscordApiError(429, payload);
			await sleep(readRetryAfter(payload) * 1000);
			return this.#request<T>(method, path, body, attempt + 1);
		}

		if (response.status >= 500 && attempt + 1 < MAX_ATTEMPTS) {
			await sleep(1000 * 2 ** attempt);
			return this.#request<T>(method, path, body, attempt + 1);
		}

		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			throw new DiscordApiError(response.status, payload);
		}

		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	}

	#trackRateLimit(route: string, response: Response): void {
		const remaining = response.headers.get('x-ratelimit-remaining');
		const resetAfter = response.headers.get('x-ratelimit-reset-after');
		if (remaining === '0' && resetAfter !== null) {
			this.#rateLimitedUntil.set(route, Date.now() + Number(resetAfter) * 1000);
		}
	}
}

function readRetryAfter(payload: unknown): number {
	if (typeof payload !== 'object' || payload === null || !('retry_after' in payload)) return 1;
	return typeof payload.retry_after === 'number' ? payload.retry_after : 1;
}
