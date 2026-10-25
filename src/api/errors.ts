export class DiscordApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown,
	) {
		super(`Discord API request failed with status ${status}`);
		this.name = 'DiscordApiError';
	}

	detail(): string {
		if (this.body === null || this.body === undefined) return '';
		if (typeof this.body === 'string') return this.body;
		return JSON.stringify(this.body);
	}
}
