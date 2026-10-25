/**
 * Headers that make requests to discord.com look like they come from the
 * desktop client. The `x-super-properties` blob is what Discord uses for
 * basic client fingerprinting, so it needs to be present and well-formed.
 */

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
	'discord/1.0.9171 Chrome/126.0.0.0 Electron/31.3.0 Safari/537.36';

function encodeSuperProperties(): string {
	const properties = {
		os: 'Windows',
		browser: 'Discord Client',
		device: '',
		system_locale: 'en-US',
		has_client_mods: false,
		browser_user_agent: USER_AGENT,
		browser_version: '126.0.0.0',
		os_version: '10',
		referrer: 'https://discord.com/',
		referring_domain: 'discord.com',
		referrer_current: 'https://discord.com/quests',
		referring_domain_current: 'discord.com',
		release_channel: 'stable',
		client_build_number: 351462,
		client_event_source: null,
		client_launch_id: crypto.randomUUID(),
		client_app_state: 'focused',
		client_heartbeat_session_id: crypto.randomUUID(),
	};

	return Buffer.from(JSON.stringify(properties)).toString('base64');
}

export function buildHeaders(token: string): Record<string, string> {
	return {
		accept: '*/*',
		'accept-language': 'en-US;q=0.9',
		authorization: token,
		'content-type': 'application/json',
		origin: 'https://discord.com',
		referer: 'https://discord.com/quests',
		'user-agent': USER_AGENT,
		'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
		'sec-ch-ua-mobile': '?0',
		'sec-ch-ua-platform': '"Windows"',
		'x-discord-locale': 'en-US',
		'x-discord-timezone': 'UTC',
		'x-super-properties': encodeSuperProperties(),
	};
}
