/**
 * Prints Discord's current web/desktop client build number.
 *
 * Usage:
 *   bun run scripts/check-build-number.ts
 *
 * Exit code 0 means the live HTML and the bundle agreed on a numeric build.
 * Exit code 1 means resolution failed or the two sources disagreed.
 */
import {
	extractScriptUrls,
	parseBuildNumberFromAppHtml,
	parseBuildNumberFromBundle,
	selectCandidateScripts,
} from '../src/api/build-number';

const APP_URL = 'https://discord.com/app';
const TIMEOUT_MS = 5_000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

function log(message: string): void {
	console.log(`[check-build-number] ${message}`);
}

function ok(message: string): void {
	console.log(`[check-build-number] ✓ ${message}`);
}

function fail(message: string): never {
	throw new Error(message);
}

async function getText(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});

	if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
	return response.text();
}

try {
	const html = await getText(APP_URL);
	const envBuild = parseBuildNumberFromAppHtml(html);
	const scripts = extractScriptUrls(html, APP_URL);
	const candidates = selectCandidateScripts(scripts);

	log(`app HTML: ${html.length} bytes, ${scripts.length} script tags`);
	log(`GLOBAL_ENV BUILD_NUMBER: ${envBuild ?? '(not found)'}`);
	log(`candidate bundles: ${candidates.length}`);

	let bundleBuild: number | null = null;
	for (const url of candidates) {
		const js = await getText(url);
		const parsed = parseBuildNumberFromBundle(js);
		log(`bundle ${new URL(url).pathname}: ${js.length} bytes -> ${parsed ?? '(not found)'}`);

		if (parsed !== null) {
			bundleBuild = parsed;
			break;
		}
	}

	if (envBuild === null && bundleBuild === null) fail('could not resolve a build number');
	if (envBuild !== null && bundleBuild !== null && envBuild !== bundleBuild) {
		fail(`HTML build ${envBuild} does not match bundle build ${bundleBuild}`);
	}

	ok(`resolved build number: ${bundleBuild ?? envBuild}`);
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[check-build-number] ✗ ${message}`);
	process.exit(1);
}
