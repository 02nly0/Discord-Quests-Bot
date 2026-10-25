import { describe, expect, it } from 'bun:test';
import { fakeApiClient } from '../testing/fake-client';
import { automatableQuests, fetchQuests } from '../../src/quest/facade';
import { Quest } from '../../src/quest/quest';
import type { QuestPayload } from '../../src/quest/types';

function payload(id: string, options?: { expired?: boolean; completed?: boolean; task?: string }): QuestPayload {
	return {
		id,
		config: {
			messages: { quest_name: `Quest ${id}`, game_title: 'Test Game' },
			task_config_v2: { tasks: { [options?.task ?? 'WATCH_VIDEO']: { target: 20 } } },
			...(options?.expired ? { expires_at: '2000-01-01T00:00:00.000Z' } : {}),
		},
		user_status: options?.completed
			? {
					completed_at: '2026-10-02T00:00:00.000Z',
					progress: { WATCH_VIDEO: { value: 20, completed_at: '2026-10-02T00:00:00.000Z' } },
				}
			: undefined,
	};
}

describe('fetchQuests', () => {
	it('wraps valid payloads and drops malformed or expired quests', async () => {
		const { client } = fakeApiClient({
			get: [
				() => ({
					quests: [
						payload('good'),
						{ config: payload('no-id').config },
						{ id: 'no-config' },
						payload('expired', { expired: true }),
					],
				}),
			],
		});

		const quests = await fetchQuests(client);
		expect(quests.map((quest) => quest.id)).toEqual(['good']);
		expect(quests[0]).toBeInstanceOf(Quest);
	});

	it('returns an empty list when the account has no quests', async () => {
		const { client } = fakeApiClient({ get: [() => ({})] });
		await expect(fetchQuests(client)).resolves.toEqual([]);
	});
});

describe('automatableQuests', () => {
	it('keeps incomplete quests with a runnable task', () => {
		const quests = [
			new Quest(payload('fresh')),
			new Quest(payload('done', { completed: true })),
			new Quest(payload('unsupported', { task: 'DO_THE_DISHES' })),
		];

		const result = automatableQuests(quests);
		expect(result.map((quest) => quest.id)).toEqual(['fresh']);
	});
});
