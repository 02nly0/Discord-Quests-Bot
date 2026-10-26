import { getCachedBuildNumber } from './build-number';

/**
 * Headers that make requests to discord.com look like they come from the
 * desktop client. The `x-super-properties` blob is what Discord uses for
 * basic client fingerprinting, so it needs to be present and well-formed.
 */

// Static compatibility snapshot from Discord Canary on 2026-10-25. These are
// desktop runtime values; the client build number is resolved at runtime
// because Discord's app assets do expose that. The values below are not
// available from the app shell and need a periodic refresh with the client.
const CLIENT_VERSION = '1.0.1281';
const CHROME_VERSION = '152.0.7977.167';
const ELECTRON_VERSION = '44.9.3';
const CHROME_MAJOR_VERSION = CHROME_VERSION.split('.')[0];

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
	`discord/${CLIENT_VERSION} Chrome/${CHROME_VERSION} Electron/${ELECTRON_VERSION} Safari/537.36`;

/** Consistent client launch ID representing this desktop process run. */
const APP_LAUNCH_ID = crypto.randomUUID();

const superPropertiesCache = new Map<string, string>();

export function encodeSuperProperties(buildNumber: number, sessionId: string = APP_LAUNCH_ID): string {
	const cacheKey = `${buildNumber}:${sessionId}`;
	const cached = superPropertiesCache.get(cacheKey);
	if (cached) return cached;

	const properties = {
		os: 'Windows',
		browser: 'Discord Client',
		device: '',
		system_locale: 'en-US',
		has_client_mods: false,
		browser_user_agent: USER_AGENT,
		browser_version: CHROME_VERSION,
		os_version: '10',
		referrer: 'https://discord.com/',
		referring_domain: 'discord.com',
		referrer_current: 'https://discord.com/quests',
		referring_domain_current: 'discord.com',
		release_channel: 'stable',
		client_build_number: buildNumber,
		client_event_source: null,
		client_launch_id: APP_LAUNCH_ID,
		client_app_state: 'focused',
		client_heartbeat_session_id: sessionId,
	};

	const encoded = Buffer.from(JSON.stringify(properties)).toString('base64');
	superPropertiesCache.set(cacheKey, encoded);
	return encoded;
}

export function buildHeaders(
	token: string,
	buildNumber = getCachedBuildNumber(),
	sessionId?: string,
): Record<string, string> {
	// The default reads the cache on every call so a long-running process picks
	// up a refreshed build number without restarting.
	return {
		accept: '*/*',
		'accept-language': 'en-US;q=0.9',
		authorization: token,
		'content-type': 'application/json',
		origin: 'https://discord.com',
		referer: 'https://discord.com/quests',
		'user-agent': USER_AGENT,
		'sec-ch-ua': `"Chromium";v="${CHROME_MAJOR_VERSION}", "Google Chrome";v="${CHROME_MAJOR_VERSION}", "Not-A.Brand";v="99"`,
		'sec-ch-ua-mobile': '?0',
		'sec-ch-ua-platform': '"Windows"',
		'x-discord-locale': 'en-US',
		'x-discord-timezone': 'UTC',
		'x-super-properties': encodeSuperProperties(buildNumber, sessionId),
	};
}
