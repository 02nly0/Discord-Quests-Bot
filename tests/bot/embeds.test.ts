import { describe, expect, it } from 'bun:test';
import { Quest } from '../../src/quest';
import {
	COLORS,
	errorEmbed,
	invalidTokenEmbed,
	progressEmbed,
	questEmbed,
	summaryEmbed,
	type AutomationSnapshot,
} from '../../src/bot/embeds';
import type { QuestBatchResult } from '../../src/quest';
import type { QuestPayload } from '../../src/quest/types';

function quest(id: string, config?: Partial<QuestPayload['config']>): Quest {
	return new Quest({
		id,
		config: {
			messages: { quest_name: `Quest ${id}`, game_title: 'Test Game' },
			task_config_v2: { tasks: { WATCH_VIDEO: { target: 20 } } },
			...config,
		},
	});
}

describe('questEmbed', () => {
	it('shows the game, quest name, and page position', () => {
		const embed = questEmbed(quest('a'), 0, 3).toJSON();

		expect(embed.author?.name).toBe('Test Game');
		expect(embed.title).toBe('Quest a');
		expect(embed.footer?.text).toBe('Quest 1 of 3');
		expect(embed.description).toBeUndefined();
	});

	it('shows progress for the task the bot will run', () => {
		const payload = quest('a').payload;
		payload.user_status = { progress: { WATCH_VIDEO: { value: 10 } } };

		const embed = questEmbed(new Quest(payload), 1, 2).toJSON();
		const progress = embed.fields?.find((field) => field.name === 'Progress');

		expect(progress?.value).toContain('50%');
		expect(progress?.value).toContain('10s of 20s');
	});

	it('lists orb and collectible rewards together', () => {
		const embed = questEmbed(
			quest('a', {
				rewards_config: {
					rewards: [
						{ type: 4, orb_quantity: 1000, premium_orb_quantity: 1200, messages: { name: '1,000 Orbs' } },
						{ type: 3, messages: { name: 'Wumpus in a Box' } },
					],
				},
			}),
			0,
			1,
		).toJSON();

		const reward = embed.fields?.find((field) => field.name === 'Reward');
		expect(reward?.value).toBe('1,000 Orbs (1,200 with Nitro)\nWumpus in a Box (Collectible)');
	});

	it('names the reward type when the reward name is specific', () => {
		const embed = questEmbed(
			quest('a', { rewards_config: { rewards: [{ type: 1, messages: { name: 'Cybernetic Headgear' } }] } }),
			0,
			1,
		).toJSON();

		const reward = embed.fields?.find((field) => field.name === 'Reward');
		expect(reward?.value).toBe('Cybernetic Headgear (Redeemable code)');
	});

	it('uses the quest art for the thumbnail and banner', () => {
		const embed = questEmbed(
			quest('a', { assets: { game_tile: 'quests/tile.png', hero: 'quests/hero.png' } }),
			0,
			1,
		).toJSON();

		expect(embed.thumbnail?.url).toBe('https://cdn.discordapp.com/quests/tile.png');
		expect(embed.image?.url).toBe('https://cdn.discordapp.com/quests/hero.png');
	});

	it('does not try to render a video hero as a banner', () => {
		const embed = questEmbed(quest('a', { assets: { hero: 'quests/hero.mp4' } }), 0, 1).toJSON();
		expect(embed.image).toBeUndefined();
	});

	it('uses the quest brand color and falls back to the default', () => {
		expect(questEmbed(quest('a', { colors: { primary: '#E944D4' } }), 0, 1).toJSON().color).toBe(0xe944d4);
		expect(questEmbed(quest('a'), 0, 1).toJSON().color).toBe(COLORS.primary);
	});

	it('marks a completed quest and its full bar', () => {
		const payload = quest('a').payload;
		payload.user_status = { completed_at: '2026-10-02T00:00:00.000Z', progress: { WATCH_VIDEO: { value: 20 } } };

		const embed = questEmbed(new Quest(payload), 0, 1).toJSON();
		const progress = embed.fields?.find((field) => field.name === 'Progress');

		expect(embed.description).toContain('Completed');
		expect(progress?.value).toContain('100%');
	});

	it('explains a quest the bot cannot run', () => {
		const embed = questEmbed(quest('a', { task_config_v2: { tasks: { DO_THE_DISHES: { target: 5 } } } }), 0, 1).toJSON();
		const progress = embed.fields?.find((field) => field.name === 'Progress');

		expect(embed.description).toBe('This quest cannot be completed automatically.');
		expect(progress?.value).toBe('Not supported by the bot');
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
