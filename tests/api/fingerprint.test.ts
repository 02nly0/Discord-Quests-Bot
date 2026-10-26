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
		expect(typeof properties.client_launch_id).toBe('string');
	});

	it('maintains a consistent client launch ID and session ID across calls', () => {
		const sessionA = 'test-session-uuid-1';
		const headers1 = buildHeaders('token1', 654321, sessionA);
		const headers2 = buildHeaders('token2', 654321, sessionA);

		// Cached string should be identical
		expect(headers1['x-super-properties']).toBe(headers2['x-super-properties']);

		const prop1: Record<string, unknown> = JSON.parse(
			Buffer.from(headers1['x-super-properties'], 'base64').toString('utf8'),
		);
		const prop2: Record<string, unknown> = JSON.parse(
			Buffer.from(headers2['x-super-properties'], 'base64').toString('utf8'),
		);

		expect(prop1.client_launch_id).toBe(prop2.client_launch_id);
		expect(prop1.client_heartbeat_session_id).toBe(sessionA);
		expect(prop2.client_heartbeat_session_id).toBe(sessionA);
	});
});
