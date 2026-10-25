import type { QuestPayload, UserStatusPayload } from './types';
import { isSupportedTask } from './tasks';
import { formatDuration } from '../util/time';
import { progressBar } from '../util/format';

export interface TaskSnapshot {
	id: string;
	supported: boolean;
	target: number;
	current: number;
	percent: number;
	completed: boolean;
}

/**
 * Wraps a raw quest payload with the queries the automation needs:
 * which tasks are runnable, how far along they are, and where progress
 * should be written back after each heartbeat.
 */
export class Quest {
	constructor(readonly payload: QuestPayload) {}

	get id(): string {
		return this.payload.id;
	}

	get questName(): string {
		return this.payload.config.messages?.quest_name ?? 'Unknown quest';
	}

	get gameName(): string {
		return this.payload.config.messages?.game_title ?? '';
	}

	get displayName(): string {
		return this.gameName ? `${this.gameName}: ${this.questName}` : this.questName;
	}

	get rewardName(): string {
		return this.payload.config.rewards_config?.rewards?.[0]?.messages?.name ?? 'Unknown reward';
	}

	get applicationId(): string | null {
		return this.payload.config.application?.id ?? this.payload.config.application_id ?? null;
	}

	get applicationName(): string | null {
		return this.payload.config.application?.name ?? null;
	}

	get tileUrl(): string | null {
		const path = this.payload.config.assets?.game_tile;
		if (!path) return null;
		const base = 'https://cdn.discordapp.com';
		return path.startsWith('quests/') ? `${base}/${path}` : `${base}/quests/${this.id}/${path}`;
	}

	get expiresAt(): Date | null {
		const raw = this.payload.config.expires_at;
		if (!raw) return null;
		const date = new Date(raw);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	get isExpired(): boolean {
		const at = this.expiresAt;
		return at !== null && at.getTime() < Date.now();
	}

	get isCompleted(): boolean {
		return Boolean(this.payload.user_status?.completed_at);
	}

	get isEnrolled(): boolean {
		return Boolean(this.payload.user_status?.enrolled_at);
	}

	get tasks(): TaskSnapshot[] {
		const definitions = this.payload.config.task_config_v2?.tasks ?? this.payload.config.task_config?.tasks ?? {};
		const progress = this.payload.user_status?.progress ?? {};

		return Object.entries(definitions)
			.map(([id, definition]) => {
				const target = definition?.target ?? 0;
				const current = progress[id]?.value ?? 0;
				return {
					id,
					supported: isSupportedTask(id),
					target,
					current,
					percent: target > 0 ? Math.min(100, Math.floor((current / target) * 100)) : 0,
					completed: Boolean(progress[id]?.completed_at) || (target > 0 && current >= target),
				};
			})
			.sort((a, b) => b.percent - a.percent);
	}

	/**
	 * The task the automation should drive: the supported, incomplete task
	 * with the smallest target, falling back to any supported task so that
	 * quests already past their goal still resolve.
	 */
	get solvableTask(): TaskSnapshot | null {
		const runnable = this.tasks.filter((task) => task.supported && !task.completed).sort((a, b) => a.target - b.target);
		return runnable[0] ?? this.tasks.find((task) => task.supported) ?? null;
	}

	/** Writes heartbeat results back so embeds and re-runs see live state. */
	markProgress(taskId: string, current: number, completedAt?: string): void {
		if (!this.payload.user_status) {
			this.payload.user_status = { progress: {} };
		}
		const status: UserStatusPayload = this.payload.user_status;

		status.progress ??= {};
		const entry = status.progress[taskId] ?? {};
		entry.value = current;
		if (completedAt) {
			entry.completed_at = completedAt;
			status.completed_at ??= completedAt;
		}
		status.progress[taskId] = entry;
	}

	formatProgress(): string {
		const task = this.solvableTask;
		if (!task) return 'Not automatable';
		return `${progressBar(task.percent)} \`${formatDuration(task.current)} / ${formatDuration(task.target)}\` (${task.percent}%)`;
	}
}
