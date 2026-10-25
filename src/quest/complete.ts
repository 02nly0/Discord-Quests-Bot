import type { DiscordApiClient } from '../api/client';
import { describeError } from '../util/format';
import type { Quest } from './quest';
import { enroll, runQuest, type ProgressUpdate } from './runner';

export interface QuestBatchHooks {
	onQuestStart?: (quest: Quest, index: number, total: number) => void;
	onQuestProgress?: (quest: Quest, update: ProgressUpdate) => void;
	onQuestCompleted?: (quest: Quest) => void;
	onQuestFailed?: (quest: Quest, reason: string) => void;
}

export interface QuestBatchResult {
	completed: Quest[];
	failed: Array<{ quest: Quest; reason: string }>;
	/** True when the run ended because the signal was aborted. */
	stopped: boolean;
}

/**
 * Completes a queue of quests one after another, reporting through hooks.
 * A failure in one quest never stops the batch; aborting does. Accepts a
 * single-element queue for the "run just this quest" flow.
 */
export async function completeQuests(options: {
	client: DiscordApiClient;
	quests: Quest[];
	signal?: AbortSignal;
	hooks?: QuestBatchHooks;
}): Promise<QuestBatchResult> {
	const { client, quests, signal, hooks = {} } = options;
	const result: QuestBatchResult = { completed: [], failed: [], stopped: false };

	for (const [index, quest] of quests.entries()) {
		if (signal?.aborted) break;

		try {
			hooks.onQuestStart?.(quest, index + 1, quests.length);
			await enroll(client, quest);

			const outcome = await runQuest({
				client,
				quest,
				signal,
				onProgress: (update) => hooks.onQuestProgress?.(quest, update),
			});

			if (outcome === 'aborted') break;

			result.completed.push(quest);
			hooks.onQuestCompleted?.(quest);
		} catch (error) {
			if (signal?.aborted) break;

			const reason = describeError(error);
			result.failed.push({ quest, reason });
			hooks.onQuestFailed?.(quest, reason);
		}
	}

	result.stopped = Boolean(signal?.aborted);
	return result;
}
