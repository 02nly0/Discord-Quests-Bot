/**
 * Sleeps for the given duration. Resolves early (without throwing) when the
 * signal is aborted, so loops can check `signal.aborted` on their next pass.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();

		const timer = setTimeout(finish, ms);
		function onAbort() {
			finish();
		}
		function finish() {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}

		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/** Formats a duration in seconds as a short human string, e.g. "1h 4m" or "12m 30s". */
export function formatDuration(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

/** Formats a wall-clock span in milliseconds for summaries. */
export function formatElapsed(ms: number): string {
	return formatDuration(ms / 1000);
}
