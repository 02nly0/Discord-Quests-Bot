import type { DiscordApiClient } from '../api/client';
import { sleep } from '../util/time';
import { resolveExecutablePath } from './executables';
import type { Quest } from './quest';
import { GAME_HEARTBEAT_INTERVAL_MS, STALL_TIMEOUT_MS, VIDEO_HEARTBEAT_INTERVAL_MS, isVideoTask } from './tasks';
import type { UserStatusPayload } from './types';

const MAX_CONSECUTIVE_ERRORS = 5;

export interface ProgressUpdate {
	current: number;
	target: number;
	percent: number;
}

export type QuestRunOutcome = 'completed' | 'aborted';

/**
 * Decides how a quest task is driven:
 * - video tasks: a timestamp that advances in wall-clock time, sent frequently
 * - game tasks: application identity + executable path, sent every 30 seconds
 */
interface HeartbeatPlan {
	video: boolean;
	endpoint: string;
	intervalMs: number;
	startedAtSeconds: number;
	applicationId?: string;
	executablePath?: string;
}

/** Enrolls the account into the quest, unless it is already enrolled. */
export async function enroll(client: DiscordApiClient, quest: Quest): Promise<void> {
	if (quest.isEnrolled) return;

	const status = await client.post<UserStatusPayload>(`/quests/${quest.id}/enroll`, {
		// 11 is the "quest home" enrollment source the desktop client sends.
		location: 11,
		is_targeted: false,
	});

	if (!status.enrolled_at) {
		throw new Error(`Discord refused enrollment for "${quest.displayName}"`);
	}
	quest.payload.user_status = { ...quest.payload.user_status, ...status };
}

/**
 * Drives a single quest from its current progress to 100% and resolves once
 * Discord marks it complete. Throws when the quest cannot be finished; an
 * aborted signal resolves with 'aborted' instead.
 */
export async function runQuest(options: {
	client: DiscordApiClient;
	quest: Quest;
	signal?: AbortSignal;
	onProgress?: (update: ProgressUpdate) => void;
}): Promise<QuestRunOutcome> {
	const { client, quest, signal, onProgress } = options;

	const task = quest.solvableTask;
	if (!task) throw new Error(`"${quest.displayName}" has no automatable task`);

	const target = task.target;
	const plan = await planHeartbeat(client, quest, task.id, task.current);
	let current = Math.min(task.current, target);
	let lastAdvanceAt = Date.now();
	let consecutiveErrors = 0;

	report();

	while (current < target) {
		if (signal?.aborted) return 'aborted';

		try {
			const response = await sendHeartbeat(client, quest, plan, false);
			const observed = readProgress(response, task.id, plan, target);

			if (observed.current > current) {
				current = observed.current;
				lastAdvanceAt = Date.now();
			}
			quest.markProgress(task.id, current, observed.completedAt ?? undefined);
			report();

			if (observed.completed || current >= target) break;

			if (!plan.video && Date.now() - lastAdvanceAt > STALL_TIMEOUT_MS) {
				throw new StallError();
			}

			consecutiveErrors = 0;
			await sleep(plan.intervalMs, signal);
		} catch (error) {
			if (signal?.aborted) return 'aborted';

			if (error instanceof StallError) {
				const minutes = Math.round(STALL_TIMEOUT_MS / 60_000);
				throw new Error(`"${quest.displayName}" made no progress for over ${minutes} minutes`);
			}

			consecutiveErrors += 1;
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw error;
			await sleep(plan.intervalMs, signal);
		}
	}

	// Game sessions need a final heartbeat with terminal: true so Discord
	// stops expecting the client to report. Video progress has no equivalent.
	if (!plan.video) {
		await sendHeartbeat(client, quest, plan, true).catch(() => undefined);
	}

	return 'completed';

	function report(): void {
		onProgress?.({
			current,
			target,
			percent: target > 0 ? Math.min(100, (current / target) * 100) : 100,
		});
	}
}

async function planHeartbeat(
	client: DiscordApiClient,
	quest: Quest,
	taskId: string,
	startingProgress: number,
): Promise<HeartbeatPlan> {
	const video = isVideoTask(taskId);
	const plan: HeartbeatPlan = {
		video,
		endpoint: video ? 'video-progress' : 'heartbeat',
		intervalMs: video ? VIDEO_HEARTBEAT_INTERVAL_MS : GAME_HEARTBEAT_INTERVAL_MS,
		// Video progress is reported as an absolute timestamp, so the quest's
		// existing progress is folded into the session's starting clock.
		startedAtSeconds: Math.floor(Date.now() / 1000) - startingProgress,
	};

	if (!video) {
		const applicationId = quest.applicationId;
		if (applicationId) {
			plan.applicationId = applicationId;
			plan.executablePath = await resolveExecutablePath(client, applicationId, quest.applicationName ?? quest.gameName);
		}
	}

	return plan;
}

async function sendHeartbeat(
	client: DiscordApiClient,
	quest: Quest,
	plan: HeartbeatPlan,
	terminal: boolean,
): Promise<unknown> {
	if (plan.video) {
		const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - plan.startedAtSeconds);
		return client.post(`/quests/${quest.id}/video-progress`, { timestamp: elapsed });
	}

	return client.post(`/quests/${quest.id}/heartbeat`, {
		application_id: plan.applicationId,
		terminal,
		executable_path: plan.executablePath ?? 'win64/game.exe',
	});
}

/**
 * Pulls the task's current value and completion state out of a heartbeat
 * response. Discord returns slightly different shapes per endpoint and per
 * quest type, so this stays deliberately forgiving.
 */
function readProgress(
	payload: unknown,
	taskId: string,
	plan: HeartbeatPlan,
	target: number,
): { current: number; completed: boolean; completedAt?: string } {
	const root = asRecord(payload) ?? {};
	const status = asRecord(root.user_status) ?? root;

	const progress = asRecord(status.progress) ?? asRecord(root.progress) ?? {};
	const entry = asRecord(progress[taskId]);

	const value = firstNumber(entry?.value, status.stream_progress_seconds, root.stream_progress_seconds);
	const completedAt = firstString(entry?.completed_at, status.completed_at, root.completed_at);

	// Video endpoints can respond without progress fields; the wall clock is
	// the source of truth there.
	const videoElapsed = plan.video
		? Math.min(target, Math.max(0, Math.floor(Date.now() / 1000) - plan.startedAtSeconds))
		: 0;

	return {
		current: Math.max(0, videoElapsed, value ?? 0),
		completed: completedAt !== undefined,
		completedAt,
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
	}
	return undefined;
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string') return value;
	}
	return undefined;
}

class StallError extends Error {
	constructor() {
		super('stall');
		this.name = 'StallError';
	}
}
