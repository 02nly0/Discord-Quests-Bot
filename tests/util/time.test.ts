import { describe, expect, it } from 'bun:test';
import { formatDuration, formatElapsed, sleep } from '../../src/util/time';

describe('formatDuration', () => {
	it('formats hour spans without seconds', () => {
		expect(formatDuration(3725)).toBe('1h 2m');
	});

	it('formats minute spans with seconds', () => {
		expect(formatDuration(750)).toBe('12m 30s');
	});

	it('formats second-only spans', () => {
		expect(formatDuration(45)).toBe('45s');
		expect(formatDuration(0)).toBe('0s');
	});

	it('clamps negative input to zero', () => {
		expect(formatDuration(-5)).toBe('0s');
	});
});

describe('formatElapsed', () => {
	it('converts milliseconds to a duration string', () => {
		expect(formatElapsed(90_000)).toBe('1m 30s');
		expect(formatElapsed(0)).toBe('0s');
	});
});

describe('sleep', () => {
	it('resolves after the given duration', async () => {
		const start = Date.now();
		await sleep(30);
		expect(Date.now() - start).toBeGreaterThanOrEqual(20);
	});

	it('resolves immediately when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();

		const start = Date.now();
		await sleep(5000, controller.signal);
		expect(Date.now() - start).toBeLessThan(100);
	});

	it('resolves early when the signal is aborted mid-sleep', async () => {
		const controller = new AbortController();
		const start = Date.now();
		const pending = sleep(5000, controller.signal);

		setTimeout(() => controller.abort(), 20);
		await pending;

		expect(Date.now() - start).toBeLessThan(500);
	});
});
