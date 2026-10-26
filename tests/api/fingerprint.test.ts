import { describe, expect, it } from 'bun:test';
import { buildHeaders } from '../../src/api/fingerprint';

function decodeSuperProperties(headers: Record<string, string>): Record<string, unknown> {
	return JSON.parse(Buffer.from(headers['x-super-properties'], 'base64').toString('utf8'));
}

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
		const properties = decodeSuperProperties(buildHeaders('abc.def.ghi', 654321));

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

	it('reuses the client launch and heartbeat session IDs for the whole process', () => {
		const first = decodeSuperProperties(buildHeaders('token1', 654321));
		const second = decodeSuperProperties(buildHeaders('token2', 654321));

		expect(first.client_launch_id).toBe(second.client_launch_id);
		expect(first.client_heartbeat_session_id).toBe(second.client_heartbeat_session_id);
		expect(first.client_heartbeat_session_id).toBeString();
	});
});
