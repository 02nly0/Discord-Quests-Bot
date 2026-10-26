/**
 * Coalesces rapid update requests into edits spaced at least `minIntervalMs`
 * apart. Ensures in-flight edits are never run concurrently, serializing trailing
 * updates and guaranteeing clean disposal.
 */
export class ThrottledEditor {
	#lastRunAt = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#inFlight: Promise<unknown> | null = null;
	#pending = false;
	#disposed = false;

	constructor(
		private readonly update: () => Promise<unknown>,
		private readonly minIntervalMs: number,
	) {}

	request(): void {
		if (this.#disposed) return;

		if (this.#inFlight || this.#timer) {
			this.#pending = true;
			return;
		}

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
		this.#pending = false;
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		await this.#inFlight;
	}

	async #run(): Promise<void> {
		this.#pending = false;
		this.#lastRunAt = Date.now();
		const update = this.update().catch(() => undefined);
		this.#inFlight = update;
		await update;
		if (this.#inFlight === update) this.#inFlight = null;

		if (this.#pending && !this.#disposed) {
			this.request();
		}
	}
}
