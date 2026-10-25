/**
 * Coalesces rapid update requests into edits spaced at least `minIntervalMs`
 * apart, always trailing with the latest state. Used to keep live progress
 * messages under Discord's rate limits without losing the final update.
 */
export class ThrottledEditor {
	#lastRunAt = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#queued = false;

	constructor(
		private readonly update: () => Promise<unknown>,
		private readonly minIntervalMs: number,
	) {}

	request(): void {
		if (this.#timer) {
			this.#queued = true;
			return;
		}

		const wait = this.minIntervalMs - (Date.now() - this.#lastRunAt);
		if (wait <= 0) {
			void this.#run();
			return;
		}

		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.#run();
		}, wait);
	}

	/** Cancels any pending throttled run without performing an update. */
	dispose(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		this.#queued = false;
	}

	async #run(): Promise<void> {
		this.#lastRunAt = Date.now();
		await this.update().catch(() => undefined);

		if (this.#queued) {
			this.#queued = false;
			this.request();
		}
	}
}
