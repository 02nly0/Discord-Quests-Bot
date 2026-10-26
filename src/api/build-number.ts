import { log } from '../util/logger';

const APP_URL = 'https://discord.com/app';
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/**
 * Last-resort value when Discord's assets cannot be inspected. This is the
 * canary build number observed live on 2026-10-25; the resolver still reads the
 * stable app shell, so this is only a safety net for offline starts and never
 * the source of truth.
 */
const FALLBACK_BUILD_NUMBER = 650200;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BuildNumberResolverOptions {
	/** Injectable for tests; defaults to the global fetch. */
	fetch?: FetchLike;
	/** Injectable clock in milliseconds; defaults to Date.now. */
	now?: () => number;
	fallback?: number;
	appUrl?: string;
	timeoutMs?: number;
	/** Receives refresh failures once per outage; defaults to the project logger. */
	onError?: (message: string) => void;
}

function toBuildNumber(raw: string | undefined): number | null {
	if (raw === undefined) return null;

	const value = Number.parseInt(raw, 10);
	return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Reads the build number Discord embeds directly in the app shell. */
export function parseBuildNumberFromAppHtml(html: string): number | null {
	const match = html.match(/["']BUILD_NUMBER["']\s*:\s*(?:"(\d+)"|'(\d+)'|(\d+)(?![\w.]|,\d))/i);
	return toBuildNumber(match?.[1] ?? match?.[2] ?? match?.[3]);
}

/** Extracts same-page and absolute JavaScript URLs from the app HTML. */
export function extractScriptUrls(html: string, baseUrl: string = APP_URL): string[] {
	const urls: string[] = [];

	for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
		const source = match[1] ?? match[2];
		if (!source) continue;

		try {
			const url = new URL(source, baseUrl);
			if (url.pathname.endsWith('.js')) urls.push(url.toString());
		} catch {
			// Ignore malformed URLs in the page instead of failing resolution.
		}
	}

	return urls;
}

/**
 * Prefers the web/app bundles that carry the build banner. The last script is
 * only used as a fallback when neither of those bundles is present.
 */
export function selectCandidateScripts(scriptUrls: readonly string[]): string[] {
	const preferred = scriptUrls.filter((url) => {
		const pathname = new URL(url).pathname;
		return pathname.includes('/assets/web.') || pathname.includes('/assets/app.');
	});

	if (preferred.length > 0) return preferred;

	const last = scriptUrls.at(-1);
	return last ? [last] : [];
}

/** Reads the build banner from a JavaScript bundle, trying both known shapes. */
export function parseBuildNumberFromBundle(script: string): number | null {
	const banner = script.match(/Build Number:\s*(\d+)(?![\w.]|,\d)/i);
	if (banner) return toBuildNumber(banner[1]);

	const field = script.match(/build_number["']?\s*:\s*(?:"(\d+)"|'(\d+)'|(\d+)(?![\w.]|,\d))/i);
	return toBuildNumber(field?.[1] ?? field?.[2] ?? field?.[3]);
}

/**
 * Resolves Discord's current web/desktop client build number from its own app
 * assets, caching successful lookups for 24 hours. Failures never throw; the
 * resolver keeps the last known value (or the fallback) instead.
 */
export class BuildNumberResolver {
	readonly #fetch: FetchLike;
	readonly #now: () => number;
	readonly #fallback: number;
	readonly #appUrl: string;
	readonly #timeoutMs: number;
	readonly #onError: (message: string) => void;

	#cachedBuildNumber: number;
	#lastSuccessAt = 0;
	#inFlight: Promise<number> | null = null;
	#failureLogged = false;

	constructor(options: BuildNumberResolverOptions = {}) {
		this.#fetch = options.fetch ?? globalThis.fetch;
		this.#now = options.now ?? Date.now;
		this.#fallback = options.fallback ?? FALLBACK_BUILD_NUMBER;
		this.#appUrl = options.appUrl ?? APP_URL;
		this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
		this.#onError = options.onError ?? ((message) => log('fingerprint', message));
		this.#cachedBuildNumber = this.#fallback;
	}

	/** Awaits a fresh value when the cache is stale; never rejects. */
	async resolve(): Promise<number> {
		if (this.#isFresh()) return this.#cachedBuildNumber;
		if (this.#inFlight) return this.#inFlight;

		this.#inFlight = this.#refresh().finally(() => {
			this.#inFlight = null;
		});
		return this.#inFlight;
	}

	/** Returns the current value immediately, refreshing in the background when stale. */
	getCached(): number {
		if (!this.#isFresh()) void this.resolve();
		return this.#cachedBuildNumber;
	}

	#isFresh(): boolean {
		return this.#lastSuccessAt > 0 && this.#now() - this.#lastSuccessAt < CACHE_TTL_MS;
	}

	async #refresh(): Promise<number> {
		try {
			const html = await this.#getText(this.#appUrl);
			const htmlBuildNumber = parseBuildNumberFromAppHtml(html);

			// The app shell already carries the number, so skip the ~12 MB bundle.
			if (htmlBuildNumber !== null) {
				this.#remember(htmlBuildNumber);
				return this.#cachedBuildNumber;
			}

			for (const scriptUrl of selectCandidateScripts(extractScriptUrls(html, this.#appUrl))) {
				const script = await this.#getText(scriptUrl);
				const bundleBuildNumber = parseBuildNumberFromBundle(script);

				if (bundleBuildNumber !== null) {
					this.#remember(bundleBuildNumber);
					return this.#cachedBuildNumber;
				}
			}

			this.#logFailure('Discord app did not expose a build number');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.#logFailure(`could not refresh the Discord client build number: ${message}`);
		}

		return this.#cachedBuildNumber;
	}

	#remember(buildNumber: number): void {
		this.#cachedBuildNumber = buildNumber;
		this.#lastSuccessAt = this.#now();
		this.#failureLogged = false;
	}

	#logFailure(message: string): void {
		if (this.#failureLogged) return;

		this.#failureLogged = true;
		this.#onError(`${message}; using ${this.#cachedBuildNumber}`);
	}

	async #getText(url: string): Promise<string> {
		const response = await this.#fetch(url, {
			headers: { 'User-Agent': USER_AGENT },
			signal: AbortSignal.timeout(this.#timeoutMs),
		});

		if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
		return response.text();
	}
}

const resolver = new BuildNumberResolver();

/** Resolves a fresh build number when needed, falling back to the cached value. */
export function resolveBuildNumber(): Promise<number> {
	return resolver.resolve();
}

/** Synchronous access for hot paths such as request/IDENTIFY construction. */
export function getCachedBuildNumber(): number {
	return resolver.getCached();
}
