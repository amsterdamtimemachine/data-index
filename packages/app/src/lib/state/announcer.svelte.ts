/**
 * The app's one polite announcement for screen readers, read out by LiveRegion.
 * Calls close together collapse, the last one wins, so a timeline drag or quick
 * paging is spoken once, for where the user lands.
 */
const DELAY_MS = 500;

let message = $state('');
let timer: ReturnType<typeof setTimeout> | undefined;

export const announcer = {
	get message() {
		return message;
	},

	announce(text: string) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			message = text;
		}, DELAY_MS);
	}
};
