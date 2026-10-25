import { describe, expect, it } from 'bun:test';
import { Quest } from '../quest';
import {
	errorEmbed,
	invalidTokenEmbed,
	progressEmbed,
	questListEmbed,
	summaryEmbed,
	type AutomationSnapshot,
} from './embeds';
import type { QuestBatchResult } from '../quest';

function quest(id: string): Quest {
	return new Quest({
		id,
		config: {
			messages: { quest_name: `Quest ${id}`, game_title: 'Test Game' },
			task_config_v2: { tasks: { WATCH_VIDEO: { target: 20 } } },
		},
	});
}

describe('questListEmbed', () => {
	it('summarizes how many quests are automatable', () => {
		const embed = questListEmbed([quest('a'), quest('b')]).toJSON();
		expect(embed.title).toBe('Your Discord Quests');
		expect(embed.description).toContain('2 of 2 active quests');
	});

	it('lists at most ten quests and footers the rest', () => {
		const quests = Array.from({ length: 12 }, (_, i) => quest(`q${i}`));
		const embed = questListEmbed(quests).toJSON();

		expect(embed.fields).toHaveLength(10);
		expect(embed.footer?.text).toContain('And 2 more quest(s)');
	});
});

describe('progressEmbed', () => {
	it('renders the current quest, its progress bar, and batch state', () => {
		const snapshot: AutomationSnapshot = {
			questName: 'Test Game: Quest a',
			index: 2,
			total: 5,
			completedCount: 1,
			current: 120,
			target: 300,
			percent: 40,
		};

		const embed = progressEmbed(snapshot).toJSON();
		const fields = embed.fields ?? [];

		expect(embed.title).toBe('Completing your quests');
		expect(fields[0]).toMatchObject({ name: 'Quest 2 of 5', value: 'Test Game: Quest a' });
		expect(fields[1]?.value).toContain('40%');
		expect(fields[1]?.value).toContain('2m 0s / 5m 0s');
		expect(fields[2]).toMatchObject({ name: 'Batch', value: '1 of 5 completed' });
	});
});

describe('summaryEmbed', () => {
	it('celebrates when quests finished', () => {
		const result: QuestBatchResult = { completed: [quest('a'), quest('b')], failed: [], stopped: false };
		const embed = summaryEmbed(result, 90_000).toJSON();

		expect(embed.title).toBe('All quests completed');
		expect(embed.description).toContain('**Completed:** 2');
		expect(embed.description).toContain('**Duration:** 1m 30s');
	});

	it('titles a stopped run differently', () => {
		const result: QuestBatchResult = { completed: [quest('a')], failed: [], stopped: true };
		expect(summaryEmbed(result, 1000).toJSON().title).toBe('Automation stopped');
	});

	it('lists up to three failure reasons', () => {
		const failed = [quest('a'), quest('b'), quest('c'), quest('d')].map((q) => ({
			quest: q,
			reason: 'Discord refused enrollment',
		}));
		const result: QuestBatchResult = { completed: [], failed, stopped: false };
		const embed = summaryEmbed(result, 1000).toJSON();

		expect(embed.title).toBe('Nothing was completed');
		const lines = (embed.description ?? '').split('\n').filter((line) => line.startsWith('- '));
		expect(lines).toHaveLength(3);
	});
});

describe('feedback embeds', () => {
	it('explains rejected tokens', () => {
		expect(invalidTokenEmbed().toJSON().title).toBe('Invalid token');
	});

	it('truncates long error messages', () => {
		const embed = errorEmbed('x'.repeat(2000)).toJSON();
		expect((embed.description ?? '').length).toBeLessThanOrEqual(1000);
	});
});
