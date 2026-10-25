import { describe, expect, it } from 'bun:test';
import {
	BuildNumberResolver,
	extractScriptUrls,
	parseBuildNumberFromAppHtml,
	parseBuildNumberFromBundle,
	selectCandidateScripts,
} from '../../src/api/build-number';

const APP_URL = 'https://discord.com/app';
const BUNDLE_URL = 'https://discord.com/assets/web.hash.js';
const DAY_MS = 24 * 60 * 60 * 1000;

function htmlWithBuild(buildNumber: number): string {
	return `<script>window.GLOBAL_ENV = {"BUILD_NUMBER":"${buildNumber}"};</script>`;
}

describe('parseBuildNumberFromAppHtml', () => {
	it('reads the BUILD_NUMBER value from GLOBAL_ENV', () => {
		expect(parseBuildNumberFromAppHtml(htmlWithBuild(649389))).toBe(649389);
	});

	it('accepts single quotes and ignores unrelated HTML', () => {
		const html = `<div data-build="1">release</div><script>GLOBAL_ENV = {'BUILD_NUMBER': '123456'}</script>`;
		expect(parseBuildNumberFromAppHtml(html)).toBe(123456);
	});

	it('rejects missing, zero, decimal, and comma-formatted values', () => {
		expect(parseBuildNumberFromAppHtml('<html></html>')).toBeNull();
		expect(parseBuildNumberFromAppHtml(htmlWithBuild(0))).toBeNull();
		expect(parseBuildNumberFromAppHtml('{"BUILD_NUMBER":"12.5"}')).toBeNull();
		expect(parseBuildNumberFromAppHtml('{"BUILD_NUMBER":"1,234"}')).toBeNull();
	});
});

describe('extractScriptUrls', () => {
	it('returns JavaScript URLs with either quote style and resolves them against the app URL', () => {
		const html = [
			'<script src="/assets/web.abc.js"></script>',
			"<script defer src='https://discord.com/assets/app.def.js?v=1'></script>",
			'<script src="/assets/styles.css"></script>',
			'<script>inline()</script>',
		].join('');

		expect(extractScriptUrls(html, APP_URL)).toEqual([
			'https://discord.com/assets/web.abc.js',
			'https://discord.com/assets/app.def.js?v=1',
		]);
	});
});

describe('selectCandidateScripts', () => {
	it('prefers web and app bundles over other scripts', () => {
		expect(
			selectCandidateScripts([
				'https://discord.com/assets/vendor.js',
				'https://discord.com/assets/web.abc.js',
				'https://discord.com/assets/app.def.js',
			]),
		).toEqual(['https://discord.com/assets/web.abc.js', 'https://discord.com/assets/app.def.js']);
	});

	it('falls back to the last script when neither bundle is present', () => {
		expect(selectCandidateScripts(['https://discord.com/assets/one.js', 'https://discord.com/assets/two.js'])).toEqual([
			'https://discord.com/assets/two.js',
		]);
	});

	it('returns no candidates for an empty list', () => {
		expect(selectCandidateScripts([])).toEqual([]);
	});
});

describe('parseBuildNumberFromBundle', () => {
	it('reads the build banner', () => {
		expect(parseBuildNumberFromBundle('[BUILD INFO] Release Channel: stable, Build Number: 649389,')).toBe(649389);
	});

	it('falls back to the build_number field', () => {
		expect(parseBuildNumberFromBundle('{build_number: "654321"}')).toBe(654321);
		expect(parseBuildNumberFromBundle("{build_number: '111222'}")).toBe(111222);
		expect(parseBuildNumberFromBundle('{build_number: 333444}')).toBe(333444);
	});

	it('returns null when no valid build number is present', () => {
		expect(parseBuildNumberFromBundle('const version = "1.0.1281";')).toBeNull();
		expect(parseBuildNumberFromBundle('Build Number: 12.5')).toBeNull();
		expect(parseBuildNumberFromBundle('build_number: "0"')).toBeNull();
	});
});

describe('BuildNumberResolver', () => {
	it('resolves from the app HTML without downloading a bundle', async () => {
		const calls: string[] = [];
		const resolver = new BuildNumberResolver({
			fetch: async (url) => {
				calls.push(url);
				return new Response(htmlWithBuild(649389));
			},
			now: () => 1_000,
			onError: () => {
				throw new Error('unexpected refresh failure');
			},
		});

		await expect(resolver.resolve()).resolves.toBe(649389);
		expect(calls).toEqual([APP_URL]);
	});

	it('falls back to the web bundle when the app HTML has no build number', async () => {
		const calls: string[] = [];
		const resolver = new BuildNumberResolver({
			fetch: async (url) => {
				calls.push(url);
				if (url === APP_URL) return new Response('<script src="/assets/web.hash.js"></script>');
				if (url === BUNDLE_URL) return new Response('Build Number: 654321,');
				return new Response('not found', { status: 404 });
			},
			now: () => 1_000,
			onError: () => {
				throw new Error('unexpected refresh failure');
			},
		});

		await expect(resolver.resolve()).resolves.toBe(654321);
		expect(calls).toEqual([APP_URL, BUNDLE_URL]);
	});

	it('caches successful values for 24 hours', async () => {
		let now = 1_000;
		let calls = 0;
		const resolver = new BuildNumberResolver({
			fetch: async () => {
				calls += 1;
				return new Response(htmlWithBuild(111111));
			},
			now: () => now,
			onError: () => {},
		});

		await expect(resolver.resolve()).resolves.toBe(111111);
		now += DAY_MS - 1;
		await expect(resolver.resolve()).resolves.toBe(111111);
		expect(calls).toBe(1);

		now += 2;
		await expect(resolver.resolve()).resolves.toBe(111111);
		expect(calls).toBe(2);
	});

	it('keeps the last known value when a later refresh fails', async () => {
		let now = 1_000;
		let offline = false;
		const resolver = new BuildNumberResolver({
			fallback: 999999,
			fetch: async () => {
				if (offline) throw new Error('network down');
				return new Response(htmlWithBuild(222222));
			},
			now: () => now,
			onError: () => {},
		});

		await expect(resolver.resolve()).resolves.toBe(222222);

		offline = true;
		now += DAY_MS;
		await expect(resolver.resolve()).resolves.toBe(222222);
	});

	it('returns the fallback without throwing on a cold offline start', async () => {
		const resolver = new BuildNumberResolver({
			fallback: 987654,
			fetch: async () => {
				throw new Error('offline');
			},
			now: () => 1_000,
			onError: () => {},
		});

		await expect(resolver.resolve()).resolves.toBe(987654);
	});

	it('returns the fallback on an HTTP error without throwing', async () => {
		const resolver = new BuildNumberResolver({
			fallback: 987654,
			fetch: async () => new Response('nope', { status: 503 }),
			now: () => 1_000,
			onError: () => {},
		});

		await expect(resolver.resolve()).resolves.toBe(987654);
	});

	it('shares one in-flight refresh between concurrent callers', async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let calls = 0;
		const resolver = new BuildNumberResolver({
			fetch: async () => {
				calls += 1;
				await gate;
				return new Response(htmlWithBuild(444444));
			},
			now: () => 1_000,
			onError: () => {},
		});

		const first = resolver.resolve();
		const second = resolver.resolve();
		release();

		await expect(Promise.all([first, second])).resolves.toEqual([444444, 444444]);
		expect(calls).toBe(1);
	});

	it('returns the cached value immediately and refreshes in the background', async () => {
		let calls = 0;
		const resolver = new BuildNumberResolver({
			fallback: 111111,
			fetch: async () => {
				calls += 1;
				return new Response(htmlWithBuild(555555));
			},
			now: () => 1_000,
			onError: () => {},
		});

		expect(resolver.getCached()).toBe(111111);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(calls).toBe(1);
		expect(resolver.getCached()).toBe(555555);
	});
});
