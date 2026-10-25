import { describe, expect, it } from 'bun:test';
import { Quest } from '../../src/quest/quest';
import type { QuestPayload } from '../../src/quest/types';

function questPayload(overrides?: {
	config?: Partial<QuestPayload['config']>;
	userStatus?: QuestPayload['user_status'];
	id?: string;
}): QuestPayload {
	return {
		id: overrides?.id ?? 'q1',
		config: {
			application_id: 'app1',
			application: { id: 'app1', name: 'Test Game' },
			messages: { quest_name: 'Play for 10 minutes', game_title: 'Test Game' },
			task_config_v2: { tasks: { PLAY_ACTIVITY: { target: 600 } } },
			expires_at: '2099-01-01T00:00:00.000Z',
			...overrides?.config,
		},
		user_status: overrides?.userStatus,
	};
}

describe('Quest display names', () => {
	it('combines game title and quest name', () => {
		expect(new Quest(questPayload()).displayName).toBe('Test Game: Play for 10 minutes');
	});

	it('falls back to the quest name alone when the game title is missing', () => {
		const payload = questPayload({ config: { messages: { quest_name: 'Just a quest' } } });
		expect(new Quest(payload).displayName).toBe('Just a quest');
	});

	it('substitutes a placeholder when the quest name is missing', () => {
		const payload = questPayload({ config: { messages: undefined } });
		expect(new Quest(payload).questName).toBe('Unknown quest');
	});
});

describe('Quest status flags', () => {
	it('derives enrollment and completion from user_status', () => {
		const payload = questPayload({
			userStatus: { enrolled_at: '2026-10-01T00:00:00.000Z', completed_at: '2026-10-02T00:00:00.000Z' },
		});
		const quest = new Quest(payload);

		expect(quest.isEnrolled).toBe(true);
		expect(quest.isCompleted).toBe(true);
	});

	it('treats missing user_status as not enrolled and not completed', () => {
		const quest = new Quest(questPayload());
		expect(quest.isEnrolled).toBe(false);
		expect(quest.isCompleted).toBe(false);
	});

	it('detects expiry from expires_at', () => {
		const expired = new Quest(questPayload({ config: { expires_at: '2000-01-01T00:00:00.000Z' } }));
		const active = new Quest(questPayload());
		const unparseable = new Quest(questPayload({ config: { expires_at: 'nonsense' } }));

		expect(expired.isExpired).toBe(true);
		expect(active.isExpired).toBe(false);
		expect(unparseable.expiresAt).toBeNull();
		expect(unparseable.isExpired).toBe(false);
	});
});

describe('Quest.tileUrl', () => {
	it('prefixes cdn.discordapp.com to quest-rooted paths', () => {
		const quest = new Quest(questPayload({ config: { assets: { game_tile: 'quests/abc.png' } } }));
		expect(quest.tileUrl).toBe('https://cdn.discordapp.com/quests/abc.png');
	});

	it('scopes bare paths under the quest id', () => {
		const quest = new Quest(questPayload({ config: { assets: { game_tile: 'abc.png' } } }));
		expect(quest.tileUrl).toBe('https://cdn.discordapp.com/quests/q1/abc.png');
	});

	it('returns null when there are no assets', () => {
		expect(new Quest(questPayload()).tileUrl).toBeNull();
	});
});

describe('Quest.tasks', () => {
	it('snapshots definitions merged with progress, sorted by percent', () => {
		const quest = new Quest(
			questPayload({
				config: { task_config_v2: { tasks: { PLAY_ACTIVITY: { target: 100 }, WATCH_VIDEO: { target: 50 } } } },
				userStatus: {
					progress: { PLAY_ACTIVITY: { value: 100, completed_at: '2026-10-02T00:00:00.000Z' }, WATCH_VIDEO: { value: 25 } },
				},
			}),
		);

		const tasks = quest.tasks;
		expect(tasks.map((task) => task.id)).toEqual(['PLAY_ACTIVITY', 'WATCH_VIDEO']);
		expect(tasks[0]).toMatchObject({ percent: 100, completed: true, supported: true });
		expect(tasks[1]).toMatchObject({ current: 25, target: 50, percent: 50, completed: false });
	});

	it('treats a reached target as completed even without completed_at', () => {
		const quest = new Quest(
			questPayload({
				userStatus: { progress: { PLAY_ACTIVITY: { value: 600 } } },
			}),
		);
		expect(quest.tasks[0].completed).toBe(true);
	});

	it('defaults a missing target to zero', () => {
		const quest = new Quest(questPayload({ config: { task_config_v2: { tasks: { PLAY_ACTIVITY: {} } } } }));
		expect(quest.tasks[0].target).toBe(0);
	});

	it('falls back to task_config when task_config_v2 is absent', () => {
		const quest = new Quest(
			questPayload({ config: { task_config_v2: undefined, task_config: { tasks: { WATCH_VIDEO: { target: 30 } } } } }),
		);
		expect(quest.tasks.map((task) => task.id)).toEqual(['WATCH_VIDEO']);
	});
});

describe('Quest.solvableTask', () => {
	it('picks the supported, incomplete task with the smallest target', () => {
		const quest = new Quest(
			questPayload({
				config: { task_config_v2: { tasks: { PLAY_ACTIVITY: { target: 600 }, WATCH_VIDEO: { target: 60 } } } },
			}),
		);

		expect(quest.solvableTask?.id).toBe('WATCH_VIDEO');
	});

	it('falls back to any supported task so finished quests still resolve', () => {
		const quest = new Quest(
			questPayload({
				userStatus: { progress: { PLAY_ACTIVITY: { value: 600, completed_at: '2026-10-02T00:00:00.000Z' } } },
			}),
		);

		expect(quest.solvableTask?.id).toBe('PLAY_ACTIVITY');
	});

	it('returns null when no task is supported', () => {
		const quest = new Quest(questPayload({ config: { task_config_v2: { tasks: { DO_THE_DISHES: { target: 5 } } } } }));
		expect(quest.solvableTask).toBeNull();
	});
});

describe('Quest.markProgress', () => {
	it('writes progress back into the payload, creating user_status on demand', () => {
		const quest = new Quest(questPayload());
		quest.markProgress('PLAY_ACTIVITY', 120);

		expect(quest.payload.user_status?.progress?.PLAY_ACTIVITY?.value).toBe(120);
	});

	it('records completion once and does not overwrite it', () => {
		const quest = new Quest(questPayload());
		quest.markProgress('PLAY_ACTIVITY', 600, '2026-10-02T00:00:00.000Z');
		quest.markProgress('PLAY_ACTIVITY', 600, '2026-10-03T00:00:00.000Z');

		expect(quest.payload.user_status?.completed_at).toBe('2026-10-02T00:00:00.000Z');
		expect(quest.isCompleted).toBe(true);
	});
});

describe('Quest.formatProgress', () => {
	it('renders a bar with the solvable task progress', () => {
		const quest = new Quest(
			questPayload({
				userStatus: { progress: { PLAY_ACTIVITY: { value: 300 } } },
			}),
		);

		const text = quest.formatProgress();
		expect(text).toContain('50%');
		expect(text).toContain('5m 0s / 10m 0s');
	});

	it('reports quests without a runnable task', () => {
		const quest = new Quest(questPayload({ config: { task_config_v2: { tasks: {} } } }));
		expect(quest.formatProgress()).toBe('Not automatable');
	});
});
