import { describe, expect, it } from 'bun:test';
import { buildHeaders } from './fingerprint';

describe('buildHeaders', () => {
	it('authenticates with the user token and identifies as the desktop client', () => {
		const headers = buildHeaders('abc.def.ghi');

		expect(headers.authorization).toBe('abc.def.ghi');
		expect(headers['user-agent']).toContain('discord/');
		expect(headers.referer).toBe('https://discord.com/quests');
	});

	it('encodes a well-formed x-super-properties payload', () => {
		const headers = buildHeaders('abc.def.ghi');
		const encoded = headers['x-super-properties'];
		expect(encoded).toBeString();

		const properties = JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8')) as Record<string, unknown>;
		expect(properties).toMatchObject({
			os: 'Windows',
			browser: 'Discord Client',
			release_channel: 'stable',
			client_app_state: 'focused',
		});
		expect(typeof properties.client_build_number).toBe('number');
	});
});
