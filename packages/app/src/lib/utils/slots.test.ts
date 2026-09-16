import { describe, test, expect } from 'vitest';
import { splitSlots } from './slots';

describe('splitSlots', () => {
	test('a sentence without slots is one text part', () => {
		expect(splitSlots('Geen features gevonden.')).toEqual([{ kind: 'text', value: 'Geen features gevonden.' }]);
	});

	test('a slot splits the text around it, keeping the spaces', () => {
		expect(splitSlots('Klik op {button} rechtsonder.')).toEqual([
			{ kind: 'text', value: 'Klik op ' },
			{ kind: 'slot', name: 'button' },
			{ kind: 'text', value: ' rechtsonder.' }
		]);
	});

	test('adjacent slots and slots at the edges produce no empty text parts', () => {
		expect(splitSlots('{picture}{button} en {border}')).toEqual([
			{ kind: 'slot', name: 'picture' },
			{ kind: 'slot', name: 'button' },
			{ kind: 'text', value: ' en ' },
			{ kind: 'slot', name: 'border' }
		]);
	});

	test('braces that are not a single word stay text', () => {
		expect(splitSlots('a {two words} b {} c')).toEqual([{ kind: 'text', value: 'a {two words} b {} c' }]);
	});
});
