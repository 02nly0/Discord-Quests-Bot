/**
 * Quest tasks Discord supports automating, and how each one progresses.
 *
 * Every supported task is measured in seconds of activity. Video tasks
 * (watching a quest trailer) report progress through the video-progress
 * endpoint; everything else is a game/desktop session driven through the
 * heartbeat endpoint.
 */

export const SUPPORTED_TASKS = [
	'PLAY_ACTIVITY',
	'PLAY_ON_DESKTOP',
	'PLAY_ON_PLAYSTATION',
	'PLAY_ON_XBOX',
	'STREAM_ON_DESKTOP',
	'WATCH_VIDEO',
	'WATCH_VIDEO_ON_MOBILE',
] as const;

export type SupportedTask = (typeof SUPPORTED_TASKS)[number];

export function isSupportedTask(taskId: string): taskId is SupportedTask {
	return SUPPORTED_TASKS.some((task) => task === taskId);
}

export function isVideoTask(taskId: string): boolean {
	return taskId === 'WATCH_VIDEO' || taskId === 'WATCH_VIDEO_ON_MOBILE';
}

export const GAME_HEARTBEAT_INTERVAL_MS = 30_000;
export const VIDEO_HEARTBEAT_INTERVAL_MS = 5_000;

/** Give up on a game quest when the API has reported no progress for this long. */
export const STALL_TIMEOUT_MS = 8 * 60_000;
