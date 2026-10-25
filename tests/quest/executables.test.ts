import { describe, expect, it } from 'bun:test';
import { fakeApiClient } from '../testing/fake-client';
import { resolveExecutablePath } from '../../src/quest/executables';

/**
 * The executable cache is a module-level Map, so every test uses its own
 * application id to stay independent of cached results from other tests.
 */

describe('resolveExecutablePath', () => {
	it('prefers the non-launcher win32 executable and strips the > prefix', async () => {
		const { client } = fakeApiClient({
			get: [
				() => [
					{
						id: 'app-a',
						executables: [
							{ name: '>Launcher.exe', os: 'win32', is_launcher: true },
							{ name: '>Game.exe', os: 'win32' },
						],
					},
				],
			],
		});

		await expect(resolveExecutablePath(client, 'app-a', 'Test Game')).resolves.toBe('Game.exe');
	});

	it('falls back to any win32 executable when all are launchers', async () => {
		const { client } = fakeApiClient({
			get: [
				() => [
					{
						id: 'app-b',
						executables: [{ name: 'OnlyLauncher.exe', os: 'win32', is_launcher: true }],
					},
				],
			],
		});

		await expect(resolveExecutablePath(client, 'app-b', 'Test Game')).resolves.toBe('OnlyLauncher.exe');
	});

	it('derives a plausible path when the directory lookup fails', async () => {
		const { client } = fakeApiClient({
			get: [
				() => {
					throw new Error('404');
				},
			],
		});

		await expect(resolveExecutablePath(client, 'app-c', 'Test Game!')).resolves.toBe('win64/testgame.exe');
	});

	it('falls back to game.exe when the name slugs to nothing', async () => {
		const { client } = fakeApiClient({
			get: [
				() => {
					throw new Error('404');
				},
			],
		});

		await expect(resolveExecutablePath(client, 'app-d', '?!?')).resolves.toBe('win64/game.exe');
	});

	it('caches per application so repeated runs skip the lookup', async () => {
		const { client, calls } = fakeApiClient({
			get: [() => [{ id: 'app-e', executables: [{ name: 'Cached.exe', os: 'win32' }] }]],
		});

		await expect(resolveExecutablePath(client, 'app-e', 'Test Game')).resolves.toBe('Cached.exe');
		await expect(resolveExecutablePath(client, 'app-e', 'Test Game')).resolves.toBe('Cached.exe');
		expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
	});
});
