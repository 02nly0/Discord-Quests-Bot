import { describe, expect, it } from 'bun:test';
import { fakeApiClient } from '../testing/fake-client';
import { Quest } from '../../src/quest/quest';
import { runQuest } from '../../src/quest/runner';
import type { QuestPayload } from '../../src/quest/types';

/**
 * runQuest is exercised against the scripted fake client. Quests are built to
 * finish on the first heartbeat response, so no test waits on real heartbeat
 * intervals; the loop-exit paths under test are response parsing, task
 * selection, and abort handling.
 */

function questPayload(overrides?: {
	tasks?: Record<string, { target?: number }>;
	progress?: NonNullable<QuestPayload['user_status']>['progress'];
	enrolled?: boolean;
}): QuestPayload {
	return {
		id: 'q1',
		config: {
			application_id: 'app1',
			application: { id: 'app1', name: 'Test Game' },
			messages: { quest_name: 'Play for 10 minutes', game_title: 'Test Game' },
			task_config_v2: { tasks: overrides?.tasks ?? { WATCH_VIDEO: { target: 20 } } },
		},
		user_status: {
			...(overrides?.enrolled === false ? {} : { enrolled_at: '2026-10-01T00:00:00.000Z' }),
			progress: overrides?.progress,
		},
	};
}

describe('runQuest', () => {
	it('drives a video quest to completion and reports the posted progress', async () => {
		const { client, calls } = fakeApiClient({
			post: [
				() => ({
					user_status: {
						progress: { WATCH_VIDEO: { value: 20, completed_at: '2026-10-02T00:00:00.000Z' } },
					},
				}),
			],
		});
		const quest = new Quest(questPayload());
		const updates: Array<{ current: number; target: number }> = [];

		const outcome = await runQuest({ client, quest, onProgress: (u) => updates.push(u) });

		expect(outcome).toBe('completed');
		expect(calls).toEqual([
			{ method: 'POST', path: '/quests/q1/video-progress', body: { timestamp: expect.any(Number) } },
		]);
		expect(quest.payload.user_status?.progress?.WATCH_VIDEO?.value).toBe(20);
		expect(updates.at(-1)).toMatchObject({ current: 20, target: 20, percent: 100 });
	});

	it('resolves video progress from root-level fields when the response is minimal', async () => {
		const { client, calls } = fakeApiClient({
			post: [() => ({ stream_progress_seconds: 7, completed_at: '2026-10-02T00:00:00.000Z' })],
		});
		const quest = new Quest(questPayload());

		const outcome = await runQuest({ client, quest });

		expect(outcome).toBe('completed');
		expect(quest.payload.user_status?.progress?.WATCH_VIDEO?.value).toBe(7);
		expect(calls.length).toBe(1);
	});

	it('resolves the executable and sends a terminal heartbeat for game quests', async () => {
		const { client, calls } = fakeApiClient({
			get: [
				({ path }) => {
					expect(path).toBe('/applications/public?application_ids=app1');
					return [
						{
							id: 'app1',
							executables: [
								{ name: '>Launcher.exe', os: 'win32', is_launcher: true },
								{ name: 'Game.exe', os: 'win32' },
							],
						},
					];
				},
			],
			post: [
				() => ({
					user_status: {
						progress: { PLAY_ACTIVITY: { value: 600, completed_at: '2026-10-02T00:00:00.000Z' } },
					},
				}),
				() => ({}),
			],
		});
		const quest = new Quest(questPayload({ tasks: { PLAY_ACTIVITY: { target: 600 } } }));

		const outcome = await runQuest({ client, quest });

		expect(outcome).toBe('completed');
		expect(calls).toEqual([
			{ method: 'GET', path: '/applications/public?application_ids=app1', body: undefined },
			{
				method: 'POST',
				path: '/quests/q1/heartbeat',
				body: { application_id: 'app1', terminal: false, executable_path: 'Game.exe' },
			},
			{
				method: 'POST',
				path: '/quests/q1/heartbeat',
				body: { application_id: 'app1', terminal: true, executable_path: 'Game.exe' },
			},
		]);
	});

	it('throws when the quest has no automatable task', async () => {
		const { client } = fakeApiClient({});
		const quest = new Quest(questPayload({ tasks: { DO_THE_DISHES: { target: 5 } } }));

		await expect(runQuest({ client, quest })).rejects.toThrow('no automatable task');
	});

	it('returns aborted without touching the API when the signal is dead', async () => {
		const { client, calls } = fakeApiClient({});
		const controller = new AbortController();
		controller.abort();

		const outcome = await runQuest({ client, quest: new Quest(questPayload()), signal: controller.signal });

		expect(outcome).toBe('aborted');
		expect(calls.length).toBe(0);
	});
});
