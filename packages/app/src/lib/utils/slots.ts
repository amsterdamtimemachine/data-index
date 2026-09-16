export type SlotPart = { kind: 'text'; value: string } | { kind: 'slot'; name: string };

/**
 * Split a translated sentence on its named slots: "Klik op {button} rechtsonder"
 * becomes text, the slot "button", text. Only {word} placeholders are slots;
 * other braces stay text.
 */
export function splitSlots(text: string): SlotPart[] {
	const parts: SlotPart[] = [];
	text.split(/\{(\w+)\}/).forEach((piece, i) => {
		if (i % 2 === 1) {
			parts.push({ kind: 'slot', name: piece });
		} else if (piece !== '') {
			parts.push({ kind: 'text', value: piece });
		}
	});
	return parts;
}
