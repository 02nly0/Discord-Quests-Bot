import { describe, expect, it } from 'bun:test';
import { sleep } from './time';
import { ThrottledEditor } from './throttle';

describe('ThrottledEditor', () => {
	it('coalesces a burst of requests into a single run that sees the latest state', async () => {
		const seen: string[] = [];
		let state = 'a';
		const editor = new ThrottledEditor(async () => {
			seen.push(state);
		}, 50);

		editor.request();
		editor.request();
		state = 'b';
		editor.request();
		await sleep(80);

		expect(seen).toEqual(['b']);
	});

	it('spaces runs at least minIntervalMs apart', async () => {
		const times: number[] = [];
		const editor = new ThrottledEditor(async () => {
			times.push(Date.now());
		}, 60);

		editor.request();
		await sleep(5);
		editor.request();
		await sleep(150);

		expect(times.length).toBe(2);
		expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(50);
	});

	it('runs a trailing update when requests arrive during a run', async () => {
		const seen: string[] = [];
		let state = 'initial';
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const editor = new ThrottledEditor(async () => {
			seen.push(state);
			if (seen.length === 1) await gate;
		}, 30);

		editor.request();
		await sleep(10);
		state = 'updated';
		editor.request();
		release?.();
		await sleep(100);

		expect(seen).toEqual(['initial', 'updated']);
	});

	it('drops queued runs on dispose', async () => {
		const runs: number[] = [];
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const editor = new ThrottledEditor(async () => {
			runs.push(Date.now());
			if (runs.length === 1) await gate;
		}, 30);

		editor.request();
		await sleep(10);
		editor.request();
		const disposal = editor.dispose();
		release?.();
		await disposal;
		await sleep(80);

		expect(runs.length).toBe(1);
	});

	it('waits for an in-flight edit before resolving dispose', async () => {
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let updateFinished = false;
		const editor = new ThrottledEditor(async () => {
			await gate;
			updateFinished = true;
		}, 0);

		editor.request();
		await sleep(10);

		let disposed = false;
		const disposal = editor.dispose().then(() => {
			disposed = true;
		});
		await sleep(10);
		expect(disposed).toBe(false);
		expect(updateFinished).toBe(false);

		release?.();
		await disposal;
		expect(updateFinished).toBe(true);
	});
});
