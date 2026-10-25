import { describe, expect, it } from 'bun:test';
import { fakeApiClient } from '../testing/fake-client';
import { completeQuests } from '../../src/quest/complete';
import { Quest } from '../../src/quest/quest';
import type { QuestBatchHooks, QuestBatchResult } from '../../src/quest/complete';
import type { QuestPayload } from '../../src/quest/types';

function questPayload(id: string, options?: { task?: string; target?: number; complete?: boolean }): QuestPayload {
	return {
		id,
		config: {
			messages: { quest_name: `Quest ${id}`, game_title: 'Test Game' },
			task_config_v2: { tasks: { [options?.task ?? 'WATCH_VIDEO']: { target: options?.target ?? 20 } } },
		},
		user_status: {
			enrolled_at: '2026-10-01T00:00:00.000Z',
			progress: options?.complete ? { WATCH_VIDEO: { value: 20, completed_at: '2026-10-02T00:00:00.000Z' } } : undefined,
		},
	};
}

function recordingHooks(): { hooks: QuestBatchHooks; events: string[] } {
	const events: string[] = [];
	return {
		events,
		hooks: {
			onQuestStart: (quest, index, total) => events.push(`start:${quest.id}:${index}/${total}`),
			onQuestProgress: (quest) => events.push(`progress:${quest.id}`),
			onQuestCompleted: (quest) => events.push(`completed:${quest.id}`),
			onQuestFailed: (quest, reason) => events.push(`failed:${quest.id}:${reason}`),
		},
	};
}

describe('completeQuests', () => {
	it('isolates failures: one broken quest never stops the batch', async () => {
		const { client, calls } = fakeApiClient({
			// The first quest is not enrolled, so enroll() hits the API and fails.
			post: [
				() => {
					throw new Error('Discord refused enrollment');
				},
			],
		});
		const failing = new Quest(questPayload('q1'));
		delete failing.payload.user_status?.enrolled_at;
		const done = new Quest(questPayload('q2', { complete: true }));
		const { hooks, events } = recordingHooks();

		const result = await completeQuests({ client, quests: [failing, done], hooks });

		expect(result.stopped).toBe(false);
		expect(result.completed.map((quest) => quest.id)).toEqual(['q2']);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]!.quest.id).toBe('q1');
		expect(result.failed[0]!.reason).toBe('Discord refused enrollment');
		expect(calls.length).toBe(1);

		expect(events).toEqual([
			'start:q1:1/2',
			'failed:q1:Discord refused enrollment',
			'start:q2:2/2',
			'progress:q2',
			'completed:q2',
		]);
	});

	it('reports progress through the hooks', async () => {
		const { client } = fakeApiClient({
			post: [
				() => ({
					user_status: { progress: { WATCH_VIDEO: { value: 20, completed_at: '2026-10-02T00:00:00.000Z' } } },
				}),
			],
		});
		const quest = new Quest(questPayload('q1'));
		const { hooks, events } = recordingHooks();

		const result = await completeQuests({ client, quests: [quest], hooks });

		expect(result.completed).toHaveLength(1);
		// runQuest reports once when the quest starts and once per heartbeat.
		expect(events).toEqual(['start:q1:1/1', 'progress:q1', 'progress:q1', 'completed:q1']);
	});

	it('stops before the first quest when the signal is already aborted', async () => {
		const { client, calls } = fakeApiClient({});
		const controller = new AbortController();
		controller.abort();
		const { hooks, events } = recordingHooks();

		const result: QuestBatchResult = await completeQuests({
			client,
			quests: [new Quest(questPayload('q1'))],
			signal: controller.signal,
			hooks,
		});

		expect(result.stopped).toBe(true);
		expect(result.completed).toEqual([]);
		expect(result.failed).toEqual([]);
		expect(calls.length).toBe(0);
		expect(events).toEqual([]);
	});
});
