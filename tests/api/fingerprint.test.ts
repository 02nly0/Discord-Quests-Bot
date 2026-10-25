import { describe, expect, it } from 'bun:test';
import { buildHeaders } from '../../src/api/fingerprint';

describe('buildHeaders', () => {
	it('authenticates with the user token and identifies as the desktop client', () => {
		const headers = buildHeaders('abc.def.ghi', 649389);

		expect(headers.authorization).toBe('abc.def.ghi');
		expect(headers['user-agent']).toContain('discord/1.0.1281');
		expect(headers['user-agent']).toContain('Chrome/152.0.7977.167');
		expect(headers['user-agent']).toContain('Electron/44.9.3');
		expect(headers['sec-ch-ua']).toContain('v="152"');
		expect(headers.referer).toBe('https://discord.com/quests');
	});

	it('encodes a well-formed x-super-properties payload', () => {
		const headers = buildHeaders('abc.def.ghi', 654321);
		const encoded = headers['x-super-properties'];
		expect(encoded).toBeString();

		const properties: Record<string, unknown> = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
		expect(properties).toMatchObject({
			os: 'Windows',
			browser: 'Discord Client',
			release_channel: 'stable',
			client_app_state: 'focused',
			client_build_number: 654321,
			browser_version: '152.0.7977.167',
		});
		expect(typeof properties.client_build_number).toBe('number');
	});
});
