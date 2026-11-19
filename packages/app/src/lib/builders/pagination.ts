/**
 * A headless pagination: attributes to spread on the caller's own buttons, the way
 * the Melt builders do, with no state of its own. The parent's page is the truth; a
 * press reports the next page through onChange.
 *
 * The current page carries aria-current. Left and Right move focus along the enabled
 * buttons in order, Home and End to the first and last; every button also stays in
 * the Tab order. Labels are the caller's, so they come from its translations.
 */
import { clampPage } from '#lib/utils/pagination.js';

type Options = {
	page: () => number;
	totalPages: () => number;
	onChange: (page: number) => void;
};

const ITEM = 'data-pagination-item';

export class Pagination {
	constructor(private readonly options: Options) {}

	private get current(): number {
		return this.options.page();
	}

	private get total(): number {
		return this.options.totalPages();
	}

	get root() {
		return {
			onkeydown: (event: KeyboardEvent) => this.navigate(event)
		};
	}

	get prev() {
		return {
			type: 'button' as const,
			disabled: this.current <= 1,
			[ITEM]: '',
			onclick: () => this.goTo(this.current - 1)
		};
	}

	get next() {
		return {
			type: 'button' as const,
			disabled: this.current >= this.total,
			[ITEM]: '',
			onclick: () => this.goTo(this.current + 1)
		};
	}

	page(value: number) {
		const selected = value === this.current;
		let ariaCurrent: 'page' | undefined;
		let dataSelected: '' | undefined;
		if (selected) {
			ariaCurrent = 'page';
			dataSelected = '';
		}
		return {
			type: 'button' as const,
			'aria-current': ariaCurrent,
			'data-selected': dataSelected,
			[ITEM]: '',
			onclick: () => this.goTo(value)
		};
	}

	/** Go to a page, clamped to the range; staying on the current page reports nothing. */
	goTo(value: number) {
		const next = clampPage(value, this.total);
		if (next !== this.current) {
			this.options.onChange(next);
		}
	}

	private navigate(event: KeyboardEvent) {
		const root = event.currentTarget;
		const current = event.target;
		// only the strip's buttons: the page input keeps its arrow keys for the caret
		if (!(root instanceof HTMLElement) || !(current instanceof HTMLElement) || !current.hasAttribute(ITEM)) {
			return;
		}
		const items = Array.from(root.querySelectorAll<HTMLElement>(`[${ITEM}]:not([disabled])`));
		const index = items.indexOf(current);
		if (index === -1) {
			return;
		}
		let target: number | undefined;
		if (event.key === 'ArrowLeft' && index > 0) {
			target = index - 1;
		} else if (event.key === 'ArrowRight' && index < items.length - 1) {
			target = index + 1;
		} else if (event.key === 'Home') {
			target = 0;
		} else if (event.key === 'End') {
			target = items.length - 1;
		}
		if (target === undefined) {
			return;
		}
		event.preventDefault();
		items[target].focus();
	}
}
