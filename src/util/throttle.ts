/**
 * Coalesces rapid update requests into edits spaced at least `minIntervalMs`
 * apart. While a run is pending, later requests are absorbed into it and the
 * run always reads the latest state, so no update is ever lost and no burst
 * ever produces more runs than the interval allows.
 */
export class ThrottledEditor {
	#lastRunAt = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inFlight: Promise<unknown> | null = null;
	#disposed = false;

	constructor(
		private readonly update: () => Promise<unknown>,
		private readonly minIntervalMs: number,
	) {}

	request(): void {
		if (this.#disposed || this.#timer) return;

		const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.#lastRunAt));
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.#run();
		}, wait);
	}

	/**
	 * Stops future updates, cancels any queued run, and resolves once an
	 * in-flight edit has settled. Await this before replacing the message so a
	 * late progress edit can never overwrite the terminal state.
	 */
	async dispose(): Promise<void> {
		this.#disposed = true;
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		await this.#inFlight;
	}

	async #run(): Promise<void> {
		this.#lastRunAt = Date.now();
		const update = this.update().catch(() => undefined);
		this.#inFlight = update;
		await update;
		if (this.#inFlight === update) this.#inFlight = null;
	}
}
