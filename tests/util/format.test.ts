import { describe, expect, it } from 'bun:test';
import { describeError, progressBar, truncate } from '../../src/util/format';

describe('progressBar', () => {
	it('fills proportionally to the percentage', () => {
		expect(progressBar(0)).toBe('░'.repeat(14));
		expect(progressBar(100)).toBe('█'.repeat(14));
		expect(progressBar(50, 4)).toBe('██░░');
	});

	it('rounds to the nearest block', () => {
		// 25% of 10 blocks is 2.5, which rounds up to 3 filled blocks.
		expect(progressBar(25, 10)).toBe('███░░░░░░░');
		expect(progressBar(33, 10)).toBe('███░░░░░░░');
	});

	it('clamps out-of-range percentages', () => {
		expect(progressBar(150, 2)).toBe('██');
		expect(progressBar(-10, 2)).toBe('░░');
	});
});

describe('truncate', () => {
	it('keeps strings that already fit', () => {
		expect(truncate('short', 10)).toBe('short');
		expect(truncate('exactly10', 10)).toBe('exactly10');
	});

	it('trims long strings to exactly max characters including the ellipsis', () => {
		const result = truncate('a very long string', 8);
		expect(result).toBe('a very …');
		expect(result.length).toBe(8);
	});
});

describe('describeError', () => {
	it('unwraps Error instances to their message', () => {
		expect(describeError(new Error('boom'))).toBe('boom');
	});

	it('stringifies non-error values', () => {
		expect(describeError('plain')).toBe('plain');
		expect(describeError(42)).toBe('42');
		expect(describeError(null)).toBe('null');
	});
});
