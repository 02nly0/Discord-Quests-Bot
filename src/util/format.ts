/** Renders a filled/empty progress bar, e.g. "██████░░░░░░". */
export function progressBar(percent: number, width = 14): string {
	const clamped = Math.min(100, Math.max(0, percent));
	const filled = Math.round((clamped / 100) * width);
	return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Truncates a string to `max` characters so it fits Discord component limits. */
export function truncate(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
