/** The next selection of a group of checkboxes after one is pressed; a required group keeps its last one. */
export function toggleSelection(selected: string[], item: string, requireOne: boolean): string[] {
	let next: string[];
	if (selected.includes(item)) {
		next = selected.filter((v) => v !== item);
	} else {
		next = [...selected, item];
	}
	if (requireOne && next.length === 0) {
		return selected;
	}
	return next;
}
