import { describe, expect, it } from 'bun:test';
import { isSupportedTask, isVideoTask, SUPPORTED_TASKS } from './tasks';

describe('isSupportedTask', () => {
	it('recognizes every task in SUPPORTED_TASKS', () => {
		for (const task of SUPPORTED_TASKS) {
			expect(isSupportedTask(task)).toBe(true);
		}
	});

	it('rejects unknown task ids', () => {
		expect(isSupportedTask('DO_THE_DISHES')).toBe(false);
		expect(isSupportedTask('')).toBe(false);
	});
});

describe('isVideoTask', () => {
	it('marks the two video-watching tasks', () => {
		expect(isVideoTask('WATCH_VIDEO')).toBe(true);
		expect(isVideoTask('WATCH_VIDEO_ON_MOBILE')).toBe(true);
	});

	it('does not mark game or streaming tasks', () => {
		expect(isVideoTask('PLAY_ACTIVITY')).toBe(false);
		expect(isVideoTask('STREAM_ON_DESKTOP')).toBe(false);
	});
});
