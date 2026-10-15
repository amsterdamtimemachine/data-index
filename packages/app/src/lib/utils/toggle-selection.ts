/** The next selection of a toggle group after one item is pressed. */
export type ToggleType = 'single' | 'multiple';

export function toggleSelection(selected: string[], item: string, type: ToggleType, requireOne: boolean): string[] {
	const pressed = selected.includes(item);
	let next: string[];
	if (type === 'single') {
		if (pressed) {
			next = [];
		} else {
			next = [item];
		}
	} else if (pressed) {
		next = selected.filter((v) => v !== item);
	} else {
		next = [...selected, item];
	}
	if (requireOne && next.length === 0) {
		return selected;
	}
	return next;
}
