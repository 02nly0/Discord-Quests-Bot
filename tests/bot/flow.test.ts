import { describe, expect, it } from 'bun:test';
import { isButtonOwner } from '../../src/bot/flow';

describe('isButtonOwner', () => {
	it('matches the user scoped into the button custom ID', () => {
		expect(isButtonOwner('quests:next:owner', 'owner')).toBe(true);
		expect(isButtonOwner('quests:next:owner', 'intruder')).toBe(false);
	});

	it('rejects another user stopping a run', () => {
		expect(isButtonOwner('quests:stop:owner', 'intruder')).toBe(false);
	});

	it('falls back to the message owner for buttons created before IDs were scoped', () => {
		expect(isButtonOwner('quests:next', 'owner', 'owner')).toBe(true);
		expect(isButtonOwner('quests:next', 'intruder', 'owner')).toBe(false);
	});

	it('allows buttons when no owner can be determined', () => {
		expect(isButtonOwner('quests:next', 'anyone')).toBe(true);
	});
});
